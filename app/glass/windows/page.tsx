'use client';

import '@root/global.scss';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import SidebarTabs from '@components/SidebarTabs';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import QuoteSheet from '@components/QuoteSheet';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';
import WindowCostingGlossary from '@components/WindowCostingGlossary';
import WindowCostingSheet, { WindowCostingSheetWindow } from '@components/WindowCostingSheet';

import { Customer, UserRole, formatCurrency, todayISODate } from '@utils/order-management';
import { defaultAdhocSpec } from '@utils/order-draft';
import { LineEditRequest, clearLineEditRequest, peekLineEditRequest, persistLineEditResult } from '@utils/line-editing';
import { createClient } from '@utils/db-client';
import {
  EMPTY_QUOTE_DRAFT,
  QuoteDraft,
  clearQuoteDraft,
  clearQuoteDraftIfUnchanged,
  describeQuoteProducts,
  quoteDraftKinds,
  quoteDraftLineCount,
  quoteDraftTotal,
  readQuoteDraft,
  replaceQuoteDraftLines,
  subscribeToQuoteDraft,
} from '@utils/quote-draft';
import { quoteEmailBody, quoteEmailTruncated, quoteMailtoHref } from '@utils/quote-email';
import { saveQuote } from '@utils/quote-store';
import { WindowQuoteLine, persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';
import {
  CostExtra,
  CostLine,
  FINISH_LABELS,
  Finish,
  GLASS_GROUP_LABELS,
  GLAZING_ORDER,
  LOCK_LABELS,
  LabourPart,
  LockType,
  MullionKind,
  Reinforcement,
  STRUT_LABELS,
  StayType,
  StrutKind,
  TRIM_LABELS,
  TrimMode,
  WINDOW_TYPES,
  WindowCostingInput,
  WindowTypeId,
  applyWindowOptions,
  costWindow,
  glazingFits,
  costWindowBatches,
  createWindowInput,
  describeWindow,
  switchWindowType,
  windowOptions,
} from '@utils/window-costing';
import { WINDOW_SERIES, WindowProduct, findProduct, productFullName, productLabel, productForInput, seriesOfProduct, visibleSeries } from '@utils/window-catalogue';
import { DEFAULT_WINDOW_RATES, GlazingId, WindowRates, mergeWindowRates } from '@utils/window-costing-rates';
import { loadWindowRates, loadWindowRatesVersion } from '@utils/window-costing-store';

const FINISH_ORDER: Finish[] = ['mill', 'etch', 'powder'];
const TRIM_ORDER: TrimMode[] = ['none', 'required', 'extra'];
const STRUT_ORDER: StrutKind[] = ['none', 'gas', 'manual'];
const BATCH_SIZES = [1, 2, 5, 10];
const LABOUR_LABELS: Record<LabourPart, string> = {
  window: 'Window',
  trim: 'Trim',
  welding: 'Welding',
  develop: 'Development',
  sundry: 'Sundry',
  mullion: 'Mullion / reo',
  sillFlat: 'Sill flat',
  fittings: 'Fittings',
  wipeBars: 'Wipe bars',
};
const LABOUR_ORDER: LabourPart[] = ['window', 'trim', 'welding', 'develop', 'sillFlat', 'fittings', 'wipeBars', 'mullion', 'sundry'];

interface QuoteItem {
  localId: string;
  name: string;
  quantity: number;
  input: WindowCostingInput;
  /**
   * The price this line came back from the quote at, and the rates it was calculated on. Null for a
   * window priced on this visit. A quote holds the number the customer was given, so a rate changed
   * since is not allowed to move it.
   */
  quoted: { unitPrice: number; ratesUpdatedAt: string | null } | null;
}

function numberOrFallback(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatQty(line: CostLine): string {
  const qty = Number.isInteger(line.qty) ? String(line.qty) : line.qty.toFixed(2);
  return `${qty} ${line.unit}`;
}

function formatRate(rate: number | null): string {
  return rate == null ? 'not priced' : formatCurrency(rate);
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

function formatExtra(extra: CostExtra): string {
  return extra.total == null ? 'not priced' : formatCurrency(extra.total);
}

/** The lines this page does not price, counted for a sentence: "2 glass lines and 1 awning line". */
function describeOtherLines(draft: QuoteDraft): string {
  return [
    { count: draft.glassLines.length, noun: 'glass line' },
    { count: draft.awningLines.length, noun: 'awning line' },
  ]
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.noun}${entry.count === 1 ? '' : 's'}`)
    .join(' and ');
}

function formatStamp(stamp: string | null): string {
  if (!stamp) {
    return 'code defaults';
  }
  const parsed = new Date(stamp);
  return Number.isNaN(parsed.getTime()) ? stamp : `saved ${parsed.toLocaleDateString()}`;
}

export default function WindowCostingPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('readonly');
  const [canSaveQuotes, setCanSaveQuotes] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'warning'; message: string } | null>(null);

  const [rates, setRates] = useState<WindowRates>(DEFAULT_WINDOW_RATES);
  const [ratesSource, setRatesSource] = useState<'saved' | 'default'>('default');
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [input, setInput] = useState<WindowCostingInput>(() => ({ ...createWindowInput('T5573'), productId: '500-5573' }));
  const [seriesId, setSeriesId] = useState<string>('500');
  const [metreDrafts, setMetreDrafts] = useState<{ flatSmoothM?: string; flatGroundM?: string }>({});
  const [windowName, setWindowName] = useState('');
  // Set when the calculator was opened to price one line of a purchase order.
  const [lineEdit, setLineEdit] = useState<LineEditRequest | null>(null);
  const [quoteName, setQuoteName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [quoteDate, setQuoteDate] = useState(todayISODate());
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  // The whole quote, windows and the other two calculators' products alike. This page owns the
  // window lines and mirrors them in; it reads the rest.
  const [workingDraft, setWorkingDraft] = useState<QuoteDraft>(EMPTY_QUOTE_DRAFT);
  const [isDraftRead, setIsDraftRead] = useState(false);
  // Customer by default, so a browser Cmd+P prints the safe document. The internal button raises it
  // for one print and `afterprint` puts it back.
  const [sheetAudience, setSheetAudience] = useState<'internal' | 'customer'>('customer');
  const [comparison, setComparison] = useState<{ id: string; quoted: number | null; today: number | null; onOriginal: number | null; stamp: string | null } | null>(null);

  const cfg = WINDOW_TYPES[input.type];
  const options = windowOptions(cfg);
  const series = WINDOW_SERIES.find((entry) => entry.id === seriesId) || WINDOW_SERIES[0];
  const seriesOptions = visibleSeries(series.id);
  const product = productForInput(input);
  const describe = useCallback((forInput: WindowCostingInput) => describeWindow(forInput, rates, productFullName(forInput.productId)), [rates]);
  const result = useMemo(() => costWindow(input, rates), [input, rates]);
  const batches = useMemo(() => (result.errors.length ? [] : costWindowBatches(input, rates, BATCH_SIZES)), [input, rates, result.errors.length]);
  const glazingOption = input.glazingId ? rates.glass.options[input.glazingId] : null;
  const derivedGlazingQty = Boolean(cfg.glazingQty);
  // How many windows the batch makes. The costing already divides setup minutes across it, so the
  // order line and the price come from the same number.
  const orderQuantity = Math.max(1, Math.floor(input.qtyToSize) + Math.floor(input.qtyShaped));
  const currentTotal = result.price == null ? null : result.price * orderQuantity;
  const extrasList = [result.extras.trims, result.extras.secondGlazing].filter(Boolean) as CostExtra[];
  const ratesLabel = ratesSource === 'saved' ? formatStamp(ratesUpdatedAt) : 'code defaults';

  const quoteLines = useMemo(
    () =>
      quoteItems.map((item) => {
        const itemResult = costWindow(item.input, rates);
        const unitPrice = item.quoted ? item.quoted.unitPrice : itemResult.price;
        return {
          item,
          result: itemResult,
          unitPrice,
          total: unitPrice == null ? null : unitPrice * item.quantity,
        };
      }),
    [quoteItems, rates]
  );

  // The costing sheet prints the windows the quote holds; a quote with none prints the window on
  // screen. The customer's quotation is the quote itself and is refused when it holds nothing.
  const sheetWindows: WindowCostingSheetWindow[] = quoteLines.length ? quoteLines.map((line) => ({ id: line.item.localId, name: line.item.name, quantity: line.item.quantity, input: line.item.input, result: line.result })) : [{ id: 'current', name: windowName, quantity: orderQuantity, input, result }];

  /** This page's lines in the shape the shared quote stores. An unpriced window is not a line. */
  const draftWindowLines: WindowQuoteLine[] = useMemo(
    () =>
      quoteLines
        .filter((line) => line.unitPrice != null)
        .map((line) => ({
          description: line.item.name || describe(line.item.input),
          quantity: line.item.quantity,
          unitPrice: line.unitPrice as number,
          windowSpec: line.item.input,
          ratesUpdatedAt: line.item.quoted ? line.item.quoted.ratesUpdatedAt : ratesUpdatedAt,
        })),
    [describe, quoteLines, ratesUpdatedAt]
  );

  const draftLineCount = quoteDraftLineCount(workingDraft);
  const draftTotal = quoteDraftTotal(workingDraft);
  const draftProducts = describeQuoteProducts(quoteDraftKinds(workingDraft));
  const otherLineCount = workingDraft.glassLines.length + workingDraft.awningLines.length;
  const otherLinesTotal = quoteDraftTotal({ ...workingDraft, windowLines: [] });

  // The quote another calculator started, read before the mirror below is allowed to write. Writing
  // first would replace that quote's window lines with this page's empty list.
  useEffect(() => {
    // Pricing an order line is not quoting, so it neither reads nor writes the shared quote. The
    // parameter is read here rather than from lineEdit because that state arrives one load later,
    // by which time the mirror below would already have emptied the quote's window lines.
    if (new URLSearchParams(window.location.search).get('editLine') === '1') {
      return;
    }

    const draft = readQuoteDraft();
    setWorkingDraft(draft);
    setQuoteName((previous) => previous || draft.name);
    setCustomerName((previous) => previous || draft.customer);
    setCustomerId((previous) => previous || draft.customerId || '');
    setQuoteDate((previous) => draft.date || previous);
    setQuoteNotes((previous) => previous || draft.notes);
    // The windows the quote already holds come back as quote items, because the mirror below
    // writes this list over them and an unread quote would leave the estimator with nothing.
    setQuoteItems(draft.windowLines.map((line, index) => ({ localId: `window-held-${index}`, name: line.description, quantity: Math.max(1, line.quantity), input: { ...line.windowSpec }, quoted: { unitPrice: line.unitPrice, ratesUpdatedAt: line.ratesUpdatedAt } })));
    setIsDraftRead(true);
  }, []);

  // Mirrors the window lines into the shared quote, leaving the glass and awning lines alone. The
  // saved rates arrive with the rest of the page, and a window priced on the code defaults before
  // then is not the price the shop quotes.
  useEffect(() => {
    if (!isDraftRead || isLoading) {
      return;
    }

    setWorkingDraft(replaceQuoteDraftLines('window', draftWindowLines, { name: quoteName, customer: customerName, customerId: customerId || null, date: quoteDate, notes: quoteNotes }));
  }, [customerId, customerName, draftWindowLines, isDraftRead, isLoading, quoteDate, quoteName, quoteNotes]);

  // A second tab writing the quote leaves this page holding an older heading, which the mirror
  // above would put back over it.
  useEffect(() => {
    if (!isDraftRead) {
      return;
    }

    return subscribeToQuoteDraft((draft) => {
      setWorkingDraft(draft);
      setQuoteName(draft.name);
      setCustomerName(draft.customer);
      setCustomerId(draft.customerId || '');
      setQuoteNotes(draft.notes);
      if (draft.date) {
        setQuoteDate(draft.date);
      }
    });
  }, [isDraftRead]);

  // Put the sheet back to the customer copy once a print finishes, so the next Cmd+P is safe.
  useEffect(() => {
    const restore = () => setSheetAudience('customer');
    window.addEventListener('afterprint', restore);
    return () => window.removeEventListener('afterprint', restore);
  }, []);


  const selectedCustomer = customers.find((entry) => entry.id === customerId) || null;

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const user = await fetchCurrentSessionUser();
        if (!user) {
          router.push('/login');
          return;
        }

        setRole(user.effectiveRole as UserRole);
        setCanSaveQuotes(userCan(user, 'quotes:write'));

        // Opened from an order to price one of its lines: load that line into the form.
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        if (params?.get('editLine') === '1') {
          const request = peekLineEditRequest();
          const line = request?.order.lineDrafts.find((entry) => entry.localId === request.localId);
          if (request && line) {
            setLineEdit(request);
            if (line.windowSpec) {
              setInput({ ...line.windowSpec });
            }
            setWindowName(line.lineNote);
            setCustomerId(request.order.orderForm.customerId);
          }
        }

        const { data: customerData } = await createClient().from('customers').select('*').order('name', { ascending: true });
        setCustomers((customerData as Customer[]) || []);

        const loaded = await loadWindowRates();
        setRates(loaded.rates);
        setRatesSource(loaded.source);
        setRatesUpdatedAt(loaded.updatedAt);
        setRatesError(loaded.error);

      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load window costing.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  function selectProduct(next: WindowProduct) {
    if (!next.type) {
      setStatus({ tone: 'warning', message: `${productLabel(next)} has no costing yet. ${next.note || ''}`.trim() });
      return;
    }

    setInput((prev) => {
      const base = prev.type === next.type ? prev : switchWindowType(prev, next.type as WindowTypeId);
      return applyWindowOptions({ ...base, type: next.type as WindowTypeId, variant: next.variant ?? 0, productId: next.id }, rates);
    });
    setMetreDrafts({});
    setStatus(null);
  }

  function selectSeries(nextSeriesId: string) {
    setSeriesId(nextSeriesId);
    const nextSeries = WINDOW_SERIES.find((entry) => entry.id === nextSeriesId);
    const firstCostable = nextSeries?.products.find((entry) => entry.type);
    if (firstCostable) {
      selectProduct(firstCostable);
    }
  }

  function update(patch: Partial<WindowCostingInput>) {
    setInput((prev) => applyWindowOptions({ ...prev, ...patch }, rates));
  }

  function updateNumber(field: keyof WindowCostingInput, value: string, minimum = 0) {
    update({ [field]: Math.max(minimum, numberOrFallback(value, minimum)) } as Partial<WindowCostingInput>);
  }

  function updateMetres(field: 'flatSmoothM' | 'flatGroundM', value: string) {
    setMetreDrafts((prev) => ({ ...prev, [field]: value }));
    updateNumber(field, value);
  }

  /** Hands the priced line back to the order it came from. */
  function saveLineToOrder() {
    if (!lineEdit) {
      return;
    }
    if (result.price == null) {
      setStatus({ tone: 'warning', message: 'This line is not priced yet, so there is nothing to send back.' });
      return;
    }

    persistLineEditResult({
      order: lineEdit.order,
      localId: lineEdit.localId,
      line: {
        quantityOrdered: Math.max(1, orderQuantity),
        unitPriceAtOrder: result.price,
        lineNote: windowName.trim(),
        markupPercent: 0,
        adhocSpec: lineEdit.order.lineDrafts.find((entry) => entry.localId === lineEdit.localId)?.adhocSpec ?? defaultAdhocSpec,
        windowSpec: { ...input },
        windowRatesUpdatedAt: ratesUpdatedAt,
        awningSpec: null,
        awningRatesUpdatedAt: null,
      },
    });
    router.push(lineEdit.returnTo);
  }

  /** Leaves the line as the order had it. */
  function cancelLineEdit() {
    if (!lineEdit) {
      return;
    }
    clearLineEditRequest();
    router.push(lineEdit.returnTo);
  }

  /** The window in the form. The quote it is being added to is left alone. */
  function resetCalculator() {
    setInput({ ...createWindowInput('T5573'), productId: '500-5573' });
    setSeriesId('500');
    setMetreDrafts({});
    setWindowName('');
    setStatus(null);
  }

  /** Empties the whole quote: this page's windows, its heading, and the other calculators' lines. */
  function clearQuote() {
    setQuoteName('');
    setCustomerName('');
    setCustomerId('');
    setQuoteDate(todayISODate());
    setQuoteNotes('');
    setQuoteItems([]);
    setWorkingDraft(EMPTY_QUOTE_DRAFT);
    clearQuoteDraft();
  }

  function addToQuote() {
    if (result.price == null) {
      return;
    }

    const item: QuoteItem = {
      localId: `window-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: windowName.trim() || describe(input),
      quantity: orderQuantity,
      input: { ...input },
      quoted: null,
    };

    setQuoteItems((prev) => [...prev, item]);
    setStatus({ tone: 'success', message: 'Added to the quote.' });
  }

  function editQuoteItem(localId: string) {
    const item = quoteItems.find((entry) => entry.localId === localId);
    if (!item) {
      return;
    }

    setInput({ ...item.input });
    const itemSeries = seriesOfProduct(item.input.productId ?? null);
    if (itemSeries) {
      setSeriesId(itemSeries.id);
    }
    setMetreDrafts({});
    setWindowName(item.name);
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
    setStatus({ tone: 'success', message: 'Loaded into the form.' });
  }

  function removeQuoteItem(localId: string) {
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
  }

  async function copySummary() {
    if (!draftLineCount) {
      setStatus({ tone: 'warning', message: 'Nothing on this quote to copy.' });
      return;
    }

    try {
      await navigator.clipboard.writeText(quoteEmailBody(workingDraft));
      setStatus({ tone: 'success', message: 'Copied. Prices only, safe to send to a customer.' });
    } catch {
      setStatus({ tone: 'warning', message: 'Clipboard copy failed.' });
    }
  }

  /** The cost build-up, for Alfab only. Never paste this to a customer. */
  async function copyCostBreakdown() {
    if (result.price == null) {
      return;
    }

    const text = [`INTERNAL — ${quoteName.trim() || 'Window costing'} — do not send to a customer`, `Window: ${describe(input)}`, `Rates: ${ratesLabel}`, `Subtotal: ${formatCurrency(result.subtotal)} | Margin ${formatPercent(result.marginRate)}: ${formatCurrency(result.margin)} | Packing: ${formatCurrency(result.packing)} | Uplift ${formatPercent(result.upliftRate)}: ${formatCurrency(result.uplift)}`, `Price (${result.unitLabel.toLowerCase()}): ${formatCurrency(result.price)}`, result.unpriced.length ? `Not priced (charged as nil): ${result.unpriced.map((entry) => entry.label).join(', ')}` : ''].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setStatus({ tone: 'warning', message: 'Copied the cost build-up (internal).' });
    } catch {
      setStatus({ tone: 'warning', message: 'Clipboard copy failed.' });
    }
  }

  function printSheet(audience: 'internal' | 'customer') {
    if (audience === 'customer' && !draftLineCount) {
      setStatus({ tone: 'warning', message: 'Nothing on this quote to print.' });
      return;
    }

    setSheetAudience(audience);
    if (typeof window !== 'undefined') {
      // Let the sheet re-render for the chosen audience before the print dialog reads the page.
      window.setTimeout(() => window.print(), 50);
    }
  }

  /** Opens the estimator's own mail client with the whole quote already written. */
  function emailQuote() {
    if (typeof window === 'undefined') {
      return;
    }

    if (!draftLineCount) {
      setStatus({ tone: 'warning', message: 'Nothing on this quote to send.' });
      return;
    }

    if (quoteEmailTruncated(workingDraft)) {
      setStatus({ tone: 'warning', message: 'The quote is longer than the message body holds. Attach the printed quote.' });
    }

    window.location.href = quoteMailtoHref(workingDraft, selectedCustomer?.contact_email || '');
  }

  /** Saves every product on the quote as one row, then leaves the working quote empty. */
  async function handleSaveQuote() {
    if (!canSaveQuotes) {
      return;
    }

    // What is stored rather than this page's copy of it: a line another calculator wrote after the
    // last mirror belongs on the quote that is filed.
    const stored = readQuoteDraft();
    if (!quoteDraftLineCount(stored)) {
      setStatus({ tone: 'warning', message: 'Nothing on this quote to save.' });
      return;
    }

    try {
      await saveQuote({
        name: stored.name.trim() || windowName.trim() || describe(input),
        customer: stored.customer,
        customerId: stored.customerId,
        date: stored.date,
        notes: stored.notes,
        glassLines: stored.glassLines,
        windowLines: stored.windowLines,
        awningLines: stored.awningLines,
        total: quoteDraftTotal(stored),
        ratesUpdatedAt,
      });

      if (clearQuoteDraftIfUnchanged(stored)) {
        clearQuote();
        resetCalculator();
        setStatus({ tone: 'success', message: 'Quote saved.' });
      } else {
        setWorkingDraft(readQuoteDraft());
        setStatus({ tone: 'success', message: 'Quote saved. The working quote changed while it saved and was kept.' });
      }
    } catch (saveError: any) {
      setStatus({ tone: 'warning', message: saveError?.message || 'Unable to save the quote.' });
    }
  }

  /** The whole quote goes on the order; a quote with nothing on it sends the window on screen. */
  function handleCreatePurchaseOrder() {
    const windowLines: WindowQuoteLine[] = workingDraft.windowLines.length
      ? workingDraft.windowLines
      : draftLineCount || result.price == null
        ? []
        : [
            {
              description: windowName.trim() || describe(input),
              quantity: orderQuantity,
              unitPrice: result.price,
              windowSpec: input,
              ratesUpdatedAt,
            },
          ];

    if (!windowLines.length && !workingDraft.glassLines.length && !workingDraft.awningLines.length) {
      router.push('/glass/new');
      return;
    }

    persistQuoteToOrderDraft({
      quoteName,
      customerName: selectedCustomer?.name || customerName,
      customerId: customerId || null,
      quoteDate,
      quoteNotes,
      glassLines: workingDraft.glassLines,
      windowLines,
      awningLines: workingDraft.awningLines,
    });
    router.push('/glass/new?fromQuote=1');
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navRight={<ActionButton onClick={() => router.push('/glass')}>ORDER DASHBOARD</ActionButton>}
      heading={lineEdit ? `PRICING A LINE OF ${(lineEdit.order.orderForm.poNumber || 'A NEW ORDER').toUpperCase()}` : 'WINDOW COSTING'}
      badge={isLoading ? 'LOADING' : `${role.toUpperCase()} SESSION`}
      sidebarWidthCh={48}
      sidebarMobileOrder="top"
      sidebar={
        <>
          {/* Actions are on the toolbar. */}
          {status ? (
            <Card title="LAST ACTION">
              <Text>
                <span className={status.tone === 'success' ? 'status-success' : 'status-warning'}>{status.message}</span>
              </Text>
            </Card>
          ) : null}

          <Card title="PRICE">
            {result.errors.length ? (
              result.errors.map((message) => (
                <Text key={message}>
                  <span className="status-error">{message}</span>
                </Text>
              ))
            ) : (
              <>
                <RowSpaceBetween>
                  <Text>SUBTOTAL</Text>
                  <Text>{formatCurrency(result.subtotal)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>MARGIN ({formatPercent(result.marginRate)} OF COST)</Text>
                  <Text>{formatCurrency(result.margin)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>{result.reinforcement ? `${result.reinforcement.label} x ${result.reinforcement.count}` : 'PACKING'}</Text>
                  <Text>{formatCurrency(result.packing)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>{result.unitLabel === 'Per Pair' ? 'PER PAIR (BEFORE UPLIFT)' : 'PER EACH (BEFORE UPLIFT)'}</Text>
                  <Text>{formatCurrency(result.beforeUplift)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>UPLIFT ({formatPercent(result.upliftRate)} OF THE ABOVE)</Text>
                  <Text>{formatCurrency(result.uplift)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>PRICE {result.unitLabel.toUpperCase()}</Text>
                  <Text>
                    <span className="status-pill status-pill-success">{formatCurrency(result.price)}</span>
                  </Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>THIS WINDOW ({orderQuantity} x)</Text>
                  <Text>{formatCurrency(currentTotal)}</Text>
                </RowSpaceBetween>
              </>
            )}

            {result.warnings.map((message) => (
              <Text key={message}>
                <span className="status-warning">{message}</span>
              </Text>
            ))}

          </Card>

          <Card title={draftLineCount ? `QUOTE SUMMARY (${draftLineCount} LINE${draftLineCount === 1 ? '' : 'S'})` : 'QUOTE SUMMARY'}>
            {draftLineCount ? (
              <>
                <RowSpaceBetween>
                  <Text>PRODUCTS</Text>
                  <Text>{draftProducts}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>QUOTE TOTAL</Text>
                  <Text>
                    <span className="status-pill status-pill-success">{formatCurrency(draftTotal)}</span>
                  </Text>
                </RowSpaceBetween>
              </>
            ) : (
              <Text>Nothing on this quote yet.</Text>
            )}
          </Card>

          {result.unpriced.length ? (
            <Card title="NOT PRICED">
              <Text>
                <span className="status-warning">No rate; charged as nil.</span>
              </Text>
              <Table>
                {result.unpriced.map((entry) => (
                  <TableRow key={entry.label}>
                    <TableColumn style={{ width: '28ch' }}>{entry.label}</TableColumn>
                    <TableColumn>{entry.path ? <ActionButton onClick={() => router.push(`/settings/windows#rate-${entry.path}`)}>Set Rate</ActionButton> : null}</TableColumn>
                  </TableRow>
                ))}
              </Table>
            </Card>
          ) : null}







          {/* Analysis cards are tabbed; only the open panel is rendered. */}
          <SidebarTabs
            aria-label="Costing detail"
            tabs={[
              {
                id: 'breakdown',
                label: 'Breakdown',
                content: (
                  <>
                    <Card title="BREAKDOWN">
                      <Table>
                        <TableRow>
                          <TableColumn style={{ width: '26ch' }}>COMPONENT</TableColumn>
                          <TableColumn style={{ width: '10ch' }}>QTY</TableColumn>
                          <TableColumn style={{ width: '10ch' }}>RATE</TableColumn>
                          <TableColumn>COST</TableColumn>
                        </TableRow>
                        {result.lines.map((line) => (
                          <TableRow key={line.key}>
                            <TableColumn>{line.label}</TableColumn>
                            <TableColumn>{formatQty(line)}</TableColumn>
                            <TableColumn>{formatRate(line.rate)}</TableColumn>
                            <TableColumn>{formatCurrency(line.cost)}</TableColumn>
                          </TableRow>
                        ))}
                      </Table>
                      <br />
                      <Text>LABOUR MINUTES</Text>
                      <Table>
                        {LABOUR_ORDER.filter((part) => result.minutes[part] !== 0).map((part) => (
                          <TableRow key={part}>
                            <TableColumn style={{ width: '26ch' }}>{LABOUR_LABELS[part]}</TableColumn>
                            <TableColumn>{result.minutes[part].toFixed(1)}</TableColumn>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableColumn>Total charged</TableColumn>
                          <TableColumn>{result.minutes.total.toFixed(1)}</TableColumn>
                        </TableRow>
                      </Table>
                    </Card>
                    <Card title="GLAZING">
                      {result.glazing.length ? (
                        <Table>
                          <TableRow>
                            <TableColumn style={{ width: '26ch' }}>ITEM</TableColumn>
                            <TableColumn style={{ width: '10ch' }}>QTY</TableColumn>
                            <TableColumn style={{ width: '10ch' }}>RATE</TableColumn>
                            <TableColumn>COST</TableColumn>
                          </TableRow>
                          {result.glazing.map((line) => (
                            <TableRow key={line.key}>
                              <TableColumn>{line.label}</TableColumn>
                              <TableColumn>{formatQty(line)}</TableColumn>
                              <TableColumn>{formatRate(line.rate)}</TableColumn>
                              <TableColumn>{formatCurrency(line.cost)}</TableColumn>
                            </TableRow>
                          ))}
                        </Table>
                      ) : (
                        <Text>No glazing selected.</Text>
                      )}
                    </Card>
                    {result.reinforcement ? (
                      <Card title={`${result.reinforcement.label} (PER BAR)`}>
                        <Table>
                          {result.reinforcement.lines.map((line) => (
                            <TableRow key={line.key}>
                              <TableColumn style={{ width: '26ch' }}>{line.label}</TableColumn>
                              <TableColumn style={{ width: '10ch' }}>{formatQty(line)}</TableColumn>
                              <TableColumn>{formatCurrency(line.cost)}</TableColumn>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableColumn>Per bar incl. margin</TableColumn>
                            <TableColumn>x {result.reinforcement.count}</TableColumn>
                            <TableColumn>{formatCurrency(result.reinforcement.perBar)}</TableColumn>
                          </TableRow>
                        </Table>
                      </Card>
                    ) : null}
                  </>
                ),
              },
              {
                id: 'batch',
                label: 'Batch',
                content: (
                  <>
                    {batches.length ? (
                      <Card title="BATCH PRICE">
                        <Text>Setup labour is divided across the batch.</Text>
                        <Table>
                          <TableRow>
                            <TableColumn style={{ width: '12ch' }}>BATCH</TableColumn>
                            <TableColumn style={{ width: '16ch' }}>{result.unitLabel.toUpperCase()}</TableColumn>
                            <TableColumn>SAVING</TableColumn>
                          </TableRow>
                          {batches.map((batch) => (
                            <TableRow key={batch.batchSize}>
                              <TableColumn>{batch.batchSize}</TableColumn>
                              <TableColumn>{formatCurrency(batch.pricePerUnit)}</TableColumn>
                              <TableColumn>{batch.batchSize === 1 ? '—' : formatCurrency(batch.saving)}</TableColumn>
                            </TableRow>
                          ))}
                        </Table>
                      </Card>
                    ) : null}
                    {extrasList.length ? (
                      <Card title="ADD FOR">
                        {extrasList.map((extra) => (
                          <RowSpaceBetween key={extra.label}>
                            <Text>{extra.label.toUpperCase()}</Text>
                            <Text>{formatExtra(extra)}</Text>
                          </RowSpaceBetween>
                        ))}
                      </Card>
                    ) : null}
                  </>
                ),
              },
              {
                id: 'rates',
                label: 'Rates',
                content: (
                  <>
                    <Card title="RATES">
                      <Text>{ratesSource === 'saved' ? `Using window rates ${ratesLabel}.` : 'Using the default window rates.'}</Text>
                      {ratesError ? (
                        <Text>
                          <span className="status-warning">{ratesError}</span>
                        </Text>
                      ) : null}
                      <br />
                      <ActionButton onClick={() => router.push('/settings/windows')}>Open Window Rates</ActionButton>
                    </Card>
                  </>
                ),
              },
            ]}
          />


        </>
      }
      actionItems={[
        {
          body: 'Add',
          items: [
            { icon: '⊹', children: 'Add To Quote', onClick: addToQuote },
            { icon: '⊹', children: 'Create Purchase Order', onClick: handleCreatePurchaseOrder },
          ],
        },
        {
          body: 'Print',
          items: [
            { icon: '⊹', children: 'Quote For Customer', onClick: () => printSheet('customer') },
            { icon: '⊹', children: 'Costing Sheet (Internal)', onClick: () => printSheet('internal') },
          ],
        },
        {
          body: 'Send',
          items: [{ icon: '⊹', children: 'Electronic Mail To Customer', onClick: emailQuote }],
        },
        {
          body: 'Copy',
          items: [
            { icon: '⊹', children: 'Prices For Customer', onClick: copySummary },
            { icon: '⊹', children: 'Cost Build-up (Internal)', onClick: copyCostBreakdown },
          ],
        },
        { body: canSaveQuotes ? 'Save Quote' : 'Saving Needs Access', onClick: canSaveQuotes ? handleSaveQuote : undefined },
        { body: 'Reset', onClick: resetCalculator },
      ]}
    >
      {error && (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      )}

      {/* Opened from an order. The quote below is not what is being edited, so the way back is the
          first thing on the page. */}
      {lineEdit ? (
        <CardDouble title="EDITING AN ORDER LINE">
          <Text>
            Line {(lineEdit.order.lineDrafts.findIndex((line) => line.localId === lineEdit.localId) + 1) || 1} of {lineEdit.order.orderForm.poNumber || 'a new order'}. Changing the window below changes that line.
          </Text>
          <br />
          <ActionButton onClick={saveLineToOrder}>Save To Order</ActionButton> <ActionButton onClick={cancelLineEdit}>Cancel</ActionButton>
        </CardDouble>
      ) : null}

      <CardDouble title="WINDOW">
        <Text>SERIES</Text>
        <select value={series.id} onChange={(event) => selectSeries(event.target.value)}>
          {seriesOptions.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
        <br />

        <Text>WINDOW</Text>
        <select
          value={product && series.products.some((entry) => entry.id === product.id) ? product.id : ''}
          onChange={(event) => {
            const next = findProduct(event.target.value);
            if (next) {
              selectProduct(next);
            }
          }}
        >
          {series.products.map((entry) => (
            <option key={entry.id} value={entry.id} disabled={!entry.type}>
              {productLabel(entry)}
              {entry.type ? '' : ' (no costing yet)'}
            </option>
          ))}
        </select>
        <Text>
          Priced on the {cfg.variantLabels ? cfg.variantLabels[input.variant] : cfg.label} costing.
          {product?.note ? ` ${product.note}` : ''}
        </Text>
        <br />

        <Input label="HEIGHT (MM)" type="number" name="window_height" value={String(input.heightMm)} onChange={(event) => updateNumber('heightMm', event.target.value)} min="0" />
        <Input label="LENGTH (MM)" type="number" name="window_length" value={String(input.lengthMm)} onChange={(event) => updateNumber('lengthMm', event.target.value)} min="0" />
        <Input label="QTY MADE TO SIZE (SQUARE)" type="number" name="window_qty_to_size" value={String(input.qtyToSize)} onChange={(event) => updateNumber('qtyToSize', event.target.value)} min="0" />
        <Input label="QTY SHAPED (OFF SQUARE)" type="number" name="window_qty_shaped" value={String(input.qtyShaped)} onChange={(event) => updateNumber('qtyShaped', event.target.value)} min="0" />
        <Text style={{ opacity: 0.7 }}>
          These two are the order: {orderQuantity} window{orderQuantity === 1 ? '' : 's'}. Setup minutes divide across them, so the price for each falls as the run grows.
        </Text>

        {cfg.pairsSupported ? (
          <label>
            <input type="checkbox" checked={input.pairs} onChange={(event) => update({ pairs: event.target.checked })} /> Price per pair
          </label>
        ) : null}

        {cfg.fields.includes('welds') ? <Input label={input.type === 'T5836' ? 'WELDED CORNERS' : 'WELDS PER FRAME'} type="number" name="window_welds" value={String(input.welds)} onChange={(event) => updateNumber('welds', event.target.value)} min="0" /> : null}

        {cfg.fields.includes('reinforcement') ? (
          <>
            <Text>REINFORCEMENT</Text>
            <select value={input.reinforcement} onChange={(event) => update({ reinforcement: event.target.value as Reinforcement })}>
              <option value="none">None</option>
              <option value="reo">Reinforcing bar</option>
              <option value="mullion">Mullion</option>
            </select>
            <br />
            <Input label="NUMBER OF BARS" type="number" name="window_reinforcement_count" value={String(input.reinforcementCount)} onChange={(event) => updateNumber('reinforcementCount', event.target.value)} min="0" disabled={input.reinforcement === 'none'} />
          </>
        ) : null}

        {cfg.fields.includes('sillFlat') ? (
          <label>
            <input type="checkbox" checked={input.sillFlat} onChange={(event) => update({ sillFlat: event.target.checked })} /> Sill flat
          </label>
        ) : null}

        {cfg.fields.includes('lockType') && options.lockTypes.length > 0 ? (
          <>
            <Text>LOCK</Text>
            <select value={input.lockType} onChange={(event) => update({ lockType: event.target.value as LockType })}>
              {options.lockTypes.map((lockType) => (
                <option key={lockType} value={lockType}>
                  {LOCK_LABELS[lockType]}
                </option>
              ))}
            </select>
            <br />
          </>
        ) : null}

        {cfg.fields.includes('locks') ? <Input label="NUMBER OF LOCKS" type="number" name="window_locks" value={String(input.locks)} onChange={(event) => updateNumber('locks', event.target.value)} min="0" disabled={cfg.fields.includes('lockType') && input.lockType === 'none'} /> : null}

        {cfg.fields.includes('wipeBars') ? (
          <>
            <Text>WIPE BARS</Text>
            <select value={String(input.wipeBars)} onChange={(event) => update({ wipeBars: Number(event.target.value) as 0 | 1 | 2 })}>
              <option value="0">No bars</option>
              <option value="1">Single wipe</option>
              <option value="2">Double bars</option>
            </select>
            <br />
          </>
        ) : null}

        {cfg.fields.includes('sliderStop') ? (
          <label>
            <input type="checkbox" checked={input.sliderStop} onChange={(event) => update({ sliderStop: event.target.checked })} /> Fit P78/98 slider stop
          </label>
        ) : null}

        {cfg.fields.includes('mullions') ? (
          <>
            <Text>TRANSOMS / MULLIONS</Text>
            <select value={input.mullionKind} onChange={(event) => update({ mullionKind: event.target.value as MullionKind })}>
              <option value="mullion">Vertical mullions</option>
              <option value="transom">Horizontal transoms</option>
            </select>
            <br />
            <Input label={input.mullionKind === 'mullion' ? 'NUMBER OF MULLIONS' : 'NUMBER OF TRANSOMS'} type="number" name="window_mullion_count" value={String(input.mullionCount)} onChange={(event) => updateNumber('mullionCount', event.target.value)} min="0" />
            {cfg.fields.includes('mullionRiviera') ? (
              <label>
                <input type="checkbox" checked={input.mullionRiviera} onChange={(event) => update({ mullionRiviera: event.target.checked })} /> Riviera mullion (AFB006)
              </label>
            ) : null}
          </>
        ) : null}

        {cfg.fields.includes('hopper') ? (
          <>
            <Text>HOPPER SERIES</Text>
            <select value={String(input.hopper)} onChange={(event) => update({ hopper: event.target.value === '600' ? 600 : 500 })}>
              <option value="500">500 series (T5573)</option>
              <option value="600">600 series (U6567)</option>
            </select>
            <br />
          </>
        ) : null}

        {cfg.fields.includes('hinges') ? (
          <Input
            label={cfg.id === 'AFB035' ? 'STAINLESS STEEL HINGES' : 'NYLON PIVOT HINGES'}
            type="number"
            name="window_hinges"
            value={String(input.hinges)}
            onChange={(event) => updateNumber('hinges', event.target.value)}
            min="0"
          />
        ) : null}

        {cfg.fields.includes('strutKind') ? (
          <>
            <Text>STRUTS</Text>
            <select value={input.strutKind} onChange={(event) => update({ strutKind: event.target.value as StrutKind })}>
              {STRUT_ORDER.map((kind) => (
                <option key={kind} value={kind}>
                  {STRUT_LABELS[kind]}
                </option>
              ))}
            </select>
            <br />
          </>
        ) : null}

        {cfg.fields.includes('struts') && input.strutKind !== 'none' ? (
          <Input label="NUMBER OF STRUTS" type="number" name="window_struts" value={String(input.struts)} onChange={(event) => updateNumber('struts', event.target.value)} min="0" />
        ) : null}

        {cfg.fields.includes('handles') ? (
          <Input label="VITUS HANDLES" type="number" name="window_handles" value={String(input.handles)} onChange={(event) => updateNumber('handles', event.target.value)} min="0" />
        ) : null}

        {cfg.fields.includes('stays') ? (
          <>
            <Input label="PAIRS OF STAYS" type="number" name="window_stays" value={String(input.stays)} onChange={(event) => updateNumber('stays', event.target.value)} min="0" />
            <Text>STAY TYPE</Text>
            <select value={input.stayType} onChange={(event) => update({ stayType: event.target.value as StayType })}>
              <option value="flat">015-03 flat</option>
              <option value="medium">015-07 medium</option>
              <option value="heavy">015-08 heavy duty</option>
            </select>
            <br />
          </>
        ) : null}

        {cfg.fields.includes('boltSets') ? <Input label="SETS OF S/BOLTS & KEEPERS" type="number" name="window_bolt_sets" value={String(input.boltSets)} onChange={(event) => updateNumber('boltSets', event.target.value)} min="0" /> : null}

        {cfg.fields.includes('caravanStays') ? <Input label="PAIRS OF CARAVAN STAYS" type="number" name="window_caravan_stays" value={String(input.caravanStays)} onChange={(event) => updateNumber('caravanStays', event.target.value)} min="0" /> : null}
      </CardDouble>

      <CardDouble title="FINISH & LABOUR">
        <Text>FINISH</Text>
        <select value={input.finish} onChange={(event) => update({ finish: event.target.value as Finish })}>
          {FINISH_ORDER.map((finish) => (
            <option key={finish} value={finish}>
              {FINISH_LABELS[finish]}
            </option>
          ))}
        </select>
        <br />

        {options.trimsSupported ? (
          <>
            <Text>TRIMS</Text>
            <select value={input.trims} onChange={(event) => update({ trims: event.target.value as TrimMode })}>
              {TRIM_ORDER.map((trims) => (
                <option key={trims} value={trims}>
                  {TRIM_LABELS[trims]}
                </option>
              ))}
            </select>
            <br />
          </>
        ) : null}

        <label>
          <input type="checkbox" checked={input.develop} onChange={(event) => update({ develop: event.target.checked })} /> Include development labour
        </label>
        <br />
        <label>
          <input type="checkbox" checked={input.mws} onChange={(event) => update({ mws: event.target.checked })} /> Marine Window Service pricing
        </label>

        <Input label="SUNDRY LABOUR (MINUTES)" type="number" name="window_sundry" value={String(input.sundryMinutes)} onChange={(event) => updateNumber('sundryMinutes', event.target.value)} min="0" />
      </CardDouble>

      <CardDouble title="GLAZING">
        <Text>GLAZING MATERIAL ({options.glassNote})</Text>
        <select value={input.glazingId || ''} onChange={(event) => update({ glazingId: (event.target.value || null) as GlazingId | null })}>
          <option value="">Select glazing...</option>
          {options.glassGroups.map((group) => (
            <optgroup key={group} label={GLASS_GROUP_LABELS[group]}>
              {GLAZING_ORDER.filter((id) => rates.glass.options[id].group === group && glazingFits(options, rates.glass.options[id])).map((id) => (
                <option key={id} value={id}>
                  {rates.glass.options[id].label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <br />

        <Text>SECOND CHOICE GLAZING (PRICED AS AN EXTRA)</Text>
        <select value={input.secondGlazingId || ''} onChange={(event) => update({ secondGlazingId: (event.target.value || null) as GlazingId | null })}>
          <option value="">None</option>
          {GLAZING_ORDER.filter((id) => glazingFits(options, rates.glass.options[id])).map((id) => (
            <option key={id} value={id}>
              {rates.glass.options[id].label}
            </option>
          ))}
        </select>
        <br />

        {derivedGlazingQty ? (
          <Text>Derived from the locks and mullions for this window type.</Text>
        ) : (
          <>
            <Input label="HOLES" type="number" name="glazing_holes" value={String(input.holes)} onChange={(event) => updateNumber('holes', event.target.value)} min="0" />
            <Input label="C/VIEW HOLES" type="number" name="glazing_cview" value={String(input.cviewHoles)} onChange={(event) => updateNumber('cviewHoles', event.target.value)} min="0" />
            <Input label={glazingOption?.group === 'laminate' ? 'METRES ROUGH ARRIS' : 'METRES FLAT SMOOTH'} type="number" name="glazing_flat_smooth" value={metreDrafts.flatSmoothM ?? String(input.flatSmoothM)} onChange={(event) => updateMetres('flatSmoothM', event.target.value)} min="0" step="0.01" />
          </>
        )}
        {glazingOption?.group === 'laminate' ? <Input label="METRES FLAT GROUND" type="number" name="glazing_flat_ground" value={metreDrafts.flatGroundM ?? String(input.flatGroundM)} onChange={(event) => updateMetres('flatGroundM', event.target.value)} min="0" step="0.01" /> : null}
        <br />
        <Input label="WINDOW NAME (OPTIONAL)" name="window_name" value={windowName} onChange={(event) => setWindowName(event.target.value)} placeholder="Kitchen hopper" />
        <br />
        <ActionButton onClick={addToQuote}>Add To Quote</ActionButton>
      </CardDouble>

      {lineEdit ? null : (
        <CardDouble title="QUOTE">
          <Input label="QUOTE NAME" name="quote_name" value={quoteName} onChange={(event) => setQuoteName(event.target.value)} placeholder="Job reference" />
          <Text>CUSTOMER</Text>
          <select
            value={customerId}
            onChange={(event) => {
              const nextId = event.target.value;
              setCustomerId(nextId);
              const picked = customers.find((entry) => entry.id === nextId);
              if (picked) {
                setCustomerName(picked.name);
              }
            }}
          >
            <option value="">Walk-in / not on file</option>
            {customers
              .filter((customer) => customer.is_active !== false)
              .map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
          </select>
          {selectedCustomer ? <Text style={{ opacity: 0.7 }}>{[selectedCustomer.contact_name, selectedCustomer.phone].filter(Boolean).join(' · ') || 'No phone on this customer yet.'}</Text> : <Input label="CUSTOMER NAME" name="quote_customer" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in / company name" />}
          <br />
          <Input label="QUOTE DATE" type="date" name="quote_date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} />
          <Input label="QUOTE NOTES" name="quote_notes" value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} />
        </CardDouble>
      )}

      {lineEdit ? null : (
        <CardDouble title={`QUOTE LINES (${draftLineCount})`}>
          {quoteLines.length ? (
            <Table>
              <TableRow>
                <TableColumn>WINDOW</TableColumn>
                <TableColumn style={{ width: '8ch' }}>QTY</TableColumn>
                <TableColumn style={{ width: '14ch' }}>UNIT</TableColumn>
                <TableColumn style={{ width: '14ch' }}>TOTAL</TableColumn>
                <TableColumn style={{ width: '18ch' }}>ACTIONS</TableColumn>
              </TableRow>
              {quoteLines.map((line) => (
                <TableRow key={line.item.localId}>
                  <TableColumn>{line.item.name}</TableColumn>
                  <TableColumn>{line.item.quantity}</TableColumn>
                  <TableColumn>{formatCurrency(line.unitPrice)}</TableColumn>
                  <TableColumn>{formatCurrency(line.total)}</TableColumn>
                  <TableColumn style={{ whiteSpace: 'nowrap' }}>
                    <ActionButton onClick={() => editQuoteItem(line.item.localId)}>Edit</ActionButton> <ActionButton onClick={() => removeQuoteItem(line.item.localId)}>Remove</ActionButton>
                  </TableColumn>
                </TableRow>
              ))}
            </Table>
          ) : (
            <Text>No window lines on this quote.</Text>
          )}

          {otherLineCount ? (
            <Text>
              {describeOtherLines(workingDraft)} on this quote. {formatCurrency(otherLinesTotal)}.
            </Text>
          ) : null}

          {draftLineCount ? (
            <>
              <br />
              <RowSpaceBetween>
                <Text>QUOTE TOTAL</Text>
                <Text>
                  <span className="status-pill status-pill-success">{formatCurrency(draftTotal)}</span>
                </Text>
              </RowSpaceBetween>
              <br />
              <ActionButton onClick={clearQuote}>Clear Quote</ActionButton>
            </>
          ) : null}
        </CardDouble>
      )}

      <CardDouble title="WHAT THESE TERMS MEAN">
        <Text>Terms used by the legacy costing sheet.</Text>
        <br />
        <WindowCostingGlossary />
      </CardDouble>

      {/* One sheet at a time: both portal into the body, and the print stylesheet shows whatever is
          mounted. */}
      {sheetAudience === 'internal' ? <WindowCostingSheet quoteName={quoteName} customerName={customerName} quoteDate={quoteDate} notes={quoteNotes} ratesLabel={ratesLabel} rates={rates} windows={sheetWindows} /> : <QuoteSheet quote={workingDraft} />}
    </AppFrame>
  );
}
