'use client';

import '@root/global.scss';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import AwningCostingSheet, { AwningCostingSheetAwning } from '@components/AwningCostingSheet';
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

import { Customer, UserRole, formatCurrency, todayISODate } from '@utils/order-management';
import { defaultAdhocSpec } from '@utils/order-draft';
import { LineEditRequest, clearLineEditRequest, peekLineEditRequest, persistLineEditResult } from '@utils/line-editing';
import { createClient } from '@utils/db-client';
import { AwningQuoteLine, persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';
import { AwningCostingInput, CostLine, GLAZING_ORDER, costAwning, costAwningBatches, createAwningInput, describeAwning } from '@utils/awning-costing';
import { AwningRates, DEFAULT_AWNING_RATES, GlazingId } from '@utils/awning-costing-rates';
import { loadAwningRates } from '@utils/awning-costing-store';
import { EMPTY_QUOTE_DRAFT, QuoteDraft, clearQuoteDraft, clearQuoteDraftIfUnchanged, describeQuoteProducts, quoteDraftKinds, quoteDraftLineCount, quoteDraftTotal, readQuoteDraft, replaceQuoteDraftLines, subscribeToQuoteDraft } from '@utils/quote-draft';
import { quoteEmailBody, quoteEmailTruncated, quoteMailtoHref } from '@utils/quote-email';
import { saveQuote } from '@utils/quote-store';

const BATCH_SIZES = [1, 2, 5, 10];

interface QuoteItem {
  localId: string;
  name: string;
  input: AwningCostingInput;
  /**
   * The price this line came back from the quote at, and the rates it was calculated on. Null for an
   * awning priced on this visit. A quote holds the number the customer was given, so a rate changed
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

function formatStamp(stamp: string | null): string {
  if (!stamp) {
    return 'code defaults';
  }
  const parsed = new Date(stamp);
  return Number.isNaN(parsed.getTime()) ? stamp : `saved ${parsed.toLocaleDateString()}`;
}

export default function AwningCostingPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('readonly');
  const [canSaveQuotes, setCanSaveQuotes] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'warning'; message: string } | null>(null);

  const [rates, setRates] = useState<AwningRates>(DEFAULT_AWNING_RATES);
  const [ratesSource, setRatesSource] = useState<'saved' | 'default'>('default');
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [input, setInput] = useState<AwningCostingInput>(() => createAwningInput());
  const [awningName, setAwningName] = useState('');
  // Set when the calculator was opened to price one line of a purchase order.
  const [lineEdit, setLineEdit] = useState<LineEditRequest | null>(null);
  const [quoteName, setQuoteName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [quoteDate, setQuoteDate] = useState(todayISODate());
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  // Customer by default, so a browser Cmd+P prints the safe document. The internal button raises it
  // for one print and `afterprint` puts it back.
  const [sheetAudience, setSheetAudience] = useState<'internal' | 'customer'>('customer');
  // The quote being worked on, holding whatever the other two calculators have already priced.
  const [workingDraft, setWorkingDraft] = useState<QuoteDraft>(EMPTY_QUOTE_DRAFT);
  // Mirroring begins only once the stored draft has been read, or the first render overwrites it.
  const [draftLoaded, setDraftLoaded] = useState(false);

  const describe = useCallback((forInput: AwningCostingInput) => describeAwning(forInput, rates), [rates]);
  const result = useMemo(() => costAwning(input, rates), [input, rates]);
  const batches = useMemo(() => (result.errors.length ? [] : costAwningBatches(input, rates, BATCH_SIZES)), [input, rates, result.errors.length]);
  const ratesLabel = ratesSource === 'saved' ? formatStamp(ratesUpdatedAt) : 'code defaults';

  const quoteLines = useMemo(
    () =>
      quoteItems.map((item) => {
        const itemResult = costAwning(item.input, rates);
        const unitPrice = item.quoted ? item.quoted.unitPrice : itemResult.price;
        return { item, result: itemResult, unitPrice, total: unitPrice == null ? null : unitPrice * itemResult.qty };
      }),
    [quoteItems, rates]
  );

  // The costing sheet prints the awnings the quote holds; a quote with none prints the awning on
  // screen. The customer's quotation is the quote itself and is refused when it holds nothing.
  const sheetAwnings: AwningCostingSheetAwning[] = quoteLines.length ? quoteLines.map((line) => ({ id: line.item.localId, name: line.item.name, quantity: line.result.qty, input: line.item.input, result: line.result })) : [{ id: 'current', name: awningName, quantity: result.qty, input, result }];

  /** This page's lines as the shared quote holds them. */
  const awningQuoteLines = useMemo<AwningQuoteLine[]>(
    () =>
      quoteLines
        .filter((line) => line.unitPrice != null)
        .map((line) => ({
          description: line.item.name || describe(line.item.input),
          quantity: line.result.qty,
          unitPrice: line.unitPrice as number,
          awningSpec: line.item.input,
          ratesUpdatedAt: line.item.quoted ? line.item.quoted.ratesUpdatedAt : ratesUpdatedAt,
        })),
    [describe, quoteLines, ratesUpdatedAt]
  );

  const workingQuoteLineCount = quoteDraftLineCount(workingDraft);
  const workingQuoteTotal = quoteDraftTotal(workingDraft);
  const workingQuoteProducts = describeQuoteProducts(quoteDraftKinds(workingDraft));

  /** What the other calculators have put on this quote. */
  const otherProducts = useMemo(() => {
    const withoutAwnings: QuoteDraft = { ...workingDraft, awningLines: [] };
    const counted = [
      { count: withoutAwnings.glassLines.length, noun: 'glass line' },
      { count: withoutAwnings.windowLines.length, noun: 'window line' },
    ].filter((entry) => entry.count > 0);

    if (!counted.length) {
      return null;
    }

    const listed = counted.map((entry) => `${entry.count} ${entry.noun}${entry.count === 1 ? '' : 's'}`).join(' and ');
    return `${listed} on this quote. ${formatCurrency(quoteDraftTotal(withoutAwnings))}.`;
  }, [workingDraft]);

  // Put the sheet back to the customer copy once a print finishes, so the next Cmd+P is safe.
  useEffect(() => {
    const restore = () => setSheetAudience('customer');
    window.addEventListener('afterprint', restore);
    return () => window.removeEventListener('afterprint', restore);
  }, []);

  const selectedCustomer = customers.find((entry) => entry.id === customerId) || null;

  // A second tab writing the quote leaves this page holding an older heading, which the mirror
  // below would put back over it.
  useEffect(() => {
    if (!draftLoaded || lineEdit) {
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
  }, [draftLoaded, lineEdit]);

  // Awnings are this page's to write; the glass and windows on the quote belong to the other two.
  useEffect(() => {
    if (!draftLoaded || lineEdit) {
      return;
    }

    setWorkingDraft(
      replaceQuoteDraftLines('awning', awningQuoteLines, {
        name: quoteName,
        customer: selectedCustomer?.name || customerName,
        customerId: customerId || null,
        date: quoteDate,
        notes: quoteNotes,
      })
    );
  }, [awningQuoteLines, customerId, customerName, draftLoaded, lineEdit, quoteDate, quoteName, quoteNotes, selectedCustomer]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError(null);

      // Read before writing: the quote may already hold glass or windows priced elsewhere, and the
      // awnings on it were put there by this page on an earlier visit. The parameter is read here
      // rather than from lineEdit because that state arrives one load later, by which time the quote
      // would already be on screen. Pricing an order line is not quoting.
      if (new URLSearchParams(window.location.search).get('editLine') !== '1') {
        const draft = readQuoteDraft();
        setWorkingDraft(draft);
        setQuoteName(draft.name);
        setCustomerName(draft.customer);
        setCustomerId(draft.customerId || '');
        setQuoteNotes(draft.notes);
        if (draft.date) {
          setQuoteDate(draft.date);
        }
        setQuoteItems(draft.awningLines.map((line, index) => ({ localId: `awning-held-${index}`, name: line.description, input: { ...line.awningSpec }, quoted: { unitPrice: line.unitPrice, ratesUpdatedAt: line.ratesUpdatedAt } })));
      }

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
            if (line.awningSpec) {
              setInput({ ...line.awningSpec });
            }
            setAwningName(line.lineNote);
            setCustomerId(request.order.orderForm.customerId);
          }
        }

        const { data: customerData } = await createClient().from('customers').select('*').order('name', { ascending: true });
        setCustomers((customerData as Customer[]) || []);

        const loaded = await loadAwningRates();
        setRates(loaded.rates);
        setRatesSource(loaded.source);
        setRatesUpdatedAt(loaded.updatedAt);
        setRatesError(loaded.error);
      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load awning costing.');
      } finally {
        setIsLoading(false);
        setDraftLoaded(true);
      }
    })();
  }, [router]);

  function update(patch: Partial<AwningCostingInput>) {
    setInput((prev) => ({ ...prev, ...patch }));
  }

  function updateNumber(field: keyof AwningCostingInput, value: string, minimum = 0) {
    update({ [field]: Math.max(minimum, numberOrFallback(value, minimum)) } as Partial<AwningCostingInput>);
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
        quantityOrdered: Math.max(1, result.qty),
        unitPriceAtOrder: result.price,
        lineNote: awningName.trim(),
        markupPercent: 0,
        adhocSpec: lineEdit.order.lineDrafts.find((entry) => entry.localId === lineEdit.localId)?.adhocSpec ?? defaultAdhocSpec,
        awningSpec: { ...input },
        awningRatesUpdatedAt: ratesUpdatedAt,
        windowSpec: null,
        windowRatesUpdatedAt: null,
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

  /** The awning in the form. The quote it is being added to is left alone. */
  function resetCalculator() {
    setInput(createAwningInput());
    setAwningName('');
    setStatus(null);
  }

  /** Empties the whole quote: this page's awnings, its heading, and the other calculators' lines. */
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

    setQuoteItems((prev) => [
      ...prev,
      {
        localId: `awning-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: awningName.trim() || describe(input),
        input: { ...input },
        quoted: null,
      },
    ]);
    setStatus({ tone: 'success', message: 'Added to the quote.' });
  }

  function editQuoteItem(localId: string) {
    const item = quoteItems.find((entry) => entry.localId === localId);
    if (!item) {
      return;
    }

    setInput({ ...item.input });
    setAwningName(item.name);
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
    setStatus({ tone: 'success', message: 'Loaded into the form.' });
  }

  function removeQuoteItem(localId: string) {
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
  }

  async function copySummary() {
    if (!workingQuoteLineCount) {
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

    const text = [`INTERNAL — ${quoteName.trim() || 'Awning costing'} — do not send to a customer`, `Awning: ${describe(input)}`, `Rates: ${ratesLabel}`, `Total cost: ${formatCurrency(result.subtotal)} | Margin ${formatPercent(result.marginRate)}: ${formatCurrency(result.margin)}`, `Price each: ${formatCurrency(result.price)} | ${result.qty} off: ${formatCurrency(result.runTotal)}`, result.unpriced.length ? `Not priced (charged as nil): ${result.unpriced.map((entry) => entry.label).join(', ')}` : ''].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setStatus({ tone: 'warning', message: 'Copied the cost build-up (internal).' });
    } catch {
      setStatus({ tone: 'warning', message: 'Clipboard copy failed.' });
    }
  }

  function printSheet(audience: 'internal' | 'customer') {
    if (audience === 'customer' && !workingQuoteLineCount) {
      setStatus({ tone: 'warning', message: 'Nothing on this quote to print.' });
      return;
    }

    setSheetAudience(audience);
    if (typeof window !== 'undefined') {
      // Let the sheet re-render for the chosen audience before the print dialog reads the page.
      window.setTimeout(() => window.print(), 50);
    }
  }

  /** Saves the whole quote, not the awnings alone. */
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
        name: stored.name,
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
        resetCalculator();
        clearQuote();
        setStatus({ tone: 'success', message: 'Quote saved.' });
      } else {
        setWorkingDraft(readQuoteDraft());
        setStatus({ tone: 'success', message: 'Quote saved. The working quote changed while it saved and was kept.' });
      }
    } catch (saveError: any) {
      setStatus({ tone: 'warning', message: saveError?.message || 'Unable to save the quote.' });
    }
  }

  function emailQuote() {
    if (!workingQuoteLineCount) {
      setStatus({ tone: 'warning', message: 'Nothing on this quote to send.' });
      return;
    }

    if (quoteEmailTruncated(workingDraft)) {
      setStatus({ tone: 'warning', message: 'The quote is longer than the message body holds. Attach the printed quote.' });
    }

    if (typeof window !== 'undefined') {
      window.location.href = quoteMailtoHref(workingDraft, selectedCustomer?.contact_email || '');
    }
  }

  /** The whole quote goes on the order; a quote with nothing on it sends the awning on screen. */
  function handleCreatePurchaseOrder() {
    const awningLines: AwningQuoteLine[] = workingDraft.awningLines.length
      ? workingDraft.awningLines
      : workingQuoteLineCount || result.price == null
        ? []
        : [
            {
              description: awningName.trim() || describe(input),
              quantity: result.qty,
              unitPrice: result.price,
              awningSpec: input,
              ratesUpdatedAt,
            },
          ];

    if (!awningLines.length && !workingDraft.glassLines.length && !workingDraft.windowLines.length) {
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
      windowLines: workingDraft.windowLines,
      awningLines,
    });
    router.push('/glass/new?fromQuote=1');
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navRight={<ActionButton onClick={() => router.push('/glass')}>ORDER DASHBOARD</ActionButton>}
      heading={lineEdit ? `PRICING A LINE OF ${(lineEdit.order.orderForm.poNumber || 'A NEW ORDER').toUpperCase()}` : 'AWNING COSTING'}
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
                  <Text>TOTAL COST</Text>
                  <Text>{formatCurrency(result.subtotal)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>MARGIN ({formatPercent(result.marginRate)} OF COST)</Text>
                  <Text>{formatCurrency(result.margin)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>PRICE EACH</Text>
                  <Text>
                    <span className="status-pill status-pill-success">{formatCurrency(result.price)}</span>
                  </Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>THIS RUN ({result.qty} x)</Text>
                  <Text>{formatCurrency(result.runTotal)}</Text>
                </RowSpaceBetween>
              </>
            )}

            {result.warnings.map((message) => (
              <Text key={message}>
                <span className="status-warning">{message}</span>
              </Text>
            ))}

          </Card>

          <Card title={workingQuoteLineCount ? `QUOTE SUMMARY (${workingQuoteLineCount} LINE${workingQuoteLineCount === 1 ? '' : 'S'})` : 'QUOTE SUMMARY'}>
            {workingQuoteLineCount ? (
              <>
                <RowSpaceBetween>
                  <Text>PRODUCTS</Text>
                  <Text>{workingQuoteProducts}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>QUOTE TOTAL</Text>
                  <Text>
                    <span className="status-pill status-pill-success">{formatCurrency(workingQuoteTotal)}</span>
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
                    <TableColumn>{entry.path ? <ActionButton onClick={() => router.push(`/settings/awnings#rate-${entry.path}`)}>Set Rate</ActionButton> : null}</TableColumn>
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

                      {result.glazing.length ? (
                        <>
                          <br />
                          <Text>GLAZING</Text>
                          <Table>
                            {result.glazing.map((line) => (
                              <TableRow key={line.key}>
                                <TableColumn style={{ width: '26ch' }}>{line.label}</TableColumn>
                                <TableColumn style={{ width: '10ch' }}>{formatQty(line)}</TableColumn>
                                <TableColumn style={{ width: '10ch' }}>{formatRate(line.rate)}</TableColumn>
                                <TableColumn>{formatCurrency(line.cost)}</TableColumn>
                              </TableRow>
                            ))}
                          </Table>
                        </>
                      ) : null}

                      <br />
                      <Text>LABOUR MINUTES</Text>
                      <Table>
                        <TableRow>
                          <TableColumn style={{ width: '26ch' }}>SETUP, SHARED ACROSS {result.qty}</TableColumn>
                          <TableColumn>{result.minutes.setup.toFixed(1)}</TableColumn>
                        </TableRow>
                        <TableRow>
                          <TableColumn>PER AWNING</TableColumn>
                          <TableColumn>{result.minutes.each.toFixed(1)}</TableColumn>
                        </TableRow>
                        {result.minutes.sundry ? (
                          <TableRow>
                            <TableColumn>SUNDRY</TableColumn>
                            <TableColumn>{result.minutes.sundry.toFixed(1)}</TableColumn>
                          </TableRow>
                        ) : null}
                        <TableRow>
                          <TableColumn>TOTAL EACH</TableColumn>
                          <TableColumn>{result.minutes.total.toFixed(1)}</TableColumn>
                        </TableRow>
                      </Table>
                    </Card>
                    <Card title="SIZE">
                      <RowSpaceBetween>
                        <Text>GLASS AREA</Text>
                        <Text>{result.areaSqm.toFixed(3)} m²</Text>
                      </RowSpaceBetween>
                      <RowSpaceBetween>
                        <Text>PERIMETER</Text>
                        <Text>{result.perimeterM.toFixed(3)} m</Text>
                      </RowSpaceBetween>
                      <Text style={{ opacity: 0.7 }}>Frame, seal, track infill and flat polish are priced on the glass perimeter.</Text>
                    </Card>
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
                        <Text>Setup labour is divided across the run.</Text>
                        <Table>
                          <TableRow>
                            <TableColumn style={{ width: '12ch' }}>RUN</TableColumn>
                            <TableColumn style={{ width: '16ch' }}>PER EACH</TableColumn>
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
                  </>
                ),
              },
              {
                id: 'rates',
                label: 'Rates',
                content: (
                  <>
                    <Card title="RATES">
                      <Text>{ratesSource === 'saved' ? `Using awning rates ${ratesLabel}.` : 'Using the default awning rates.'}</Text>
                      {ratesError ? (
                        <Text>
                          <span className="status-warning">{ratesError}</span>
                        </Text>
                      ) : null}
                      <br />
                      <ActionButton onClick={() => router.push('/settings/awnings')}>Open Awning Rates</ActionButton>
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
            Line {lineEdit.order.lineDrafts.findIndex((line) => line.localId === lineEdit.localId) + 1 || 1} of {lineEdit.order.orderForm.poNumber || 'a new order'}. Changing the awning below changes that line.
          </Text>
          <br />
          <ActionButton onClick={saveLineToOrder}>Save To Order</ActionButton> <ActionButton onClick={cancelLineEdit}>Cancel</ActionButton>
        </CardDouble>
      ) : null}

      <CardDouble title="AWNING">
        <Text style={{ opacity: 0.7 }}>Glass size, not opening size.</Text>
        <br />
        <Input label="GLASS HEIGHT (MM)" type="number" name="awning_height" value={String(input.heightMm)} onChange={(event) => updateNumber('heightMm', event.target.value)} min="0" />
        <Input label="GLASS WIDTH (MM)" type="number" name="awning_width" value={String(input.widthMm)} onChange={(event) => updateNumber('widthMm', event.target.value)} min="0" />
        <Input label="QTY OF THIS SIZE" type="number" name="awning_qty" value={String(input.qty)} onChange={(event) => updateNumber('qty', event.target.value, 1)} min="1" />
        <Text style={{ opacity: 0.7 }}>
          Setup labour divides across the run, so the price for each falls as the quantity grows. {result.qty} off shares {rates.labour.setupMinutes} minutes of setup.
        </Text>
        <br />

        <Input label="SUNDRY LABOUR (MINUTES)" type="number" name="awning_sundry" value={String(input.sundryMinutes)} onChange={(event) => updateNumber('sundryMinutes', event.target.value)} min="0" />
      </CardDouble>

      <CardDouble title="GLAZING & OPTIONS">
        <Text>GLASS</Text>
        <select value={input.glazingId ?? ''} onChange={(event) => update({ glazingId: (event.target.value || null) as GlazingId | null })}>
          <option value="">No glass</option>
          {GLAZING_ORDER.map((id) => (
            <option key={id} value={id}>
              {rates.glass.options[id].label}
              {rates.glass.options[id].list == null ? ' (no rate yet)' : ''}
            </option>
          ))}
        </select>
        <br />

        <label>
          <input type="checkbox" checked={input.banding} onChange={(event) => update({ banding: event.target.checked })} /> Ceramic banding (fixed price)
        </label>
        <br />
        <label>
          <input type="checkbox" checked={input.flatPolish} onChange={(event) => update({ flatPolish: event.target.checked })} /> Flat polish on the glass perimeter
        </label>
        <br />
        <label>
          <input type="checkbox" checked={input.flyscreen} onChange={(event) => update({ flyscreen: event.target.checked })} /> Flyscreen and clips
        </label>
        <Text style={{ opacity: 0.7 }}>Flyscreen is a selling price in the source sheet and is marked up again. Kept as the sheet had it.</Text>
        <br />
        <Input label="AWNING NAME (OPTIONAL)" name="awning_name" value={awningName} onChange={(event) => setAwningName(event.target.value)} placeholder="Port side, cabin window..." />
        <br />
        <ActionButton onClick={addToQuote}>Add To Quote</ActionButton>
      </CardDouble>

      {lineEdit ? null : (
        <CardDouble title="QUOTE">
          <Input label="QUOTE NAME" name="quote_name" value={quoteName} onChange={(event) => setQuoteName(event.target.value)} placeholder="Job reference" />
          <br />
          <Text>CUSTOMER</Text>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
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
        <CardDouble title={`QUOTE LINES (${workingQuoteLineCount})`}>
          {quoteLines.length ? (
            <Table>
              <TableRow>
                <TableColumn>AWNING</TableColumn>
                <TableColumn style={{ width: '8ch' }}>QTY</TableColumn>
                <TableColumn style={{ width: '14ch' }}>EACH</TableColumn>
                <TableColumn style={{ width: '14ch' }}>TOTAL</TableColumn>
                <TableColumn style={{ width: '18ch' }}>ACTIONS</TableColumn>
              </TableRow>
              {quoteLines.map((line) => (
                <TableRow key={line.item.localId}>
                  <TableColumn>{line.item.name}</TableColumn>
                  <TableColumn>{line.result.qty}</TableColumn>
                  <TableColumn>{formatCurrency(line.unitPrice)}</TableColumn>
                  <TableColumn>{formatCurrency(line.total)}</TableColumn>
                  <TableColumn style={{ whiteSpace: 'nowrap' }}>
                    <ActionButton onClick={() => editQuoteItem(line.item.localId)}>Edit</ActionButton> <ActionButton onClick={() => removeQuoteItem(line.item.localId)}>Remove</ActionButton>
                  </TableColumn>
                </TableRow>
              ))}
            </Table>
          ) : (
            <Text>No awning lines on this quote.</Text>
          )}

          {otherProducts ? (
            <>
              <br />
              <Text>{otherProducts}</Text>
            </>
          ) : null}

          {workingQuoteLineCount ? (
            <>
              <br />
              <RowSpaceBetween>
                <Text>QUOTE TOTAL</Text>
                <Text>
                  <span className="status-pill status-pill-success">{formatCurrency(workingQuoteTotal)}</span>
                </Text>
              </RowSpaceBetween>
              <br />
              <ActionButton onClick={clearQuote}>Clear Quote</ActionButton>
            </>
          ) : null}
        </CardDouble>
      )}

      {/* Both sheets print themselves into the page, so only the chosen one is mounted. */}
      {sheetAudience === 'internal' ? <AwningCostingSheet quoteName={quoteName} customerName={selectedCustomer?.name || customerName} quoteDate={quoteDate} notes={quoteNotes} ratesLabel={ratesLabel} rates={rates} awnings={sheetAwnings} /> : <QuoteSheet quote={workingDraft} />}
    </AppFrame>
  );
}
