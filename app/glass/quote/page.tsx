'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import ImportPanel from '@components/ImportPanel';
import Card from '@components/Card';
import GlassCostingSheet, { GlassCostingSheetPiece } from '@components/GlassCostingSheet';
import GlassSpecificationFields from '@components/GlassSpecificationFields';
import GlassVisualizer from '@components/GlassVisualizer';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import QuoteSheet from '@components/QuoteSheet';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { usePricing } from '@components/PricingProvider';
import { GlassSpecification, calculateCost, describeGlassSpecification, getEffectiveArea, getEffectivePerimeter, usesMeasuredGeometry } from '@utils/calculations';
import { Customer, UserRole, formatCurrency, todayISODate } from '@utils/order-management';
import { GlassQuoteLine, persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { EMPTY_QUOTE_DRAFT, QuoteDraft, clearQuoteDraft, clearQuoteDraftIfUnchanged, describeQuoteProducts, quoteDraftKinds, quoteDraftLineCount, quoteDraftTotal, readQuoteDraft, replaceQuoteDraftLines, subscribeToQuoteDraft } from '@utils/quote-draft';
import { quoteEmailBody, quoteEmailTruncated, quoteMailtoHref } from '@utils/quote-email';
import { ExtractedPiece } from '@utils/import/model';
import { LineEditRequest, clearLineEditRequest, peekLineEditRequest, persistLineEditResult } from '@utils/line-editing';
import { saveQuote } from '@utils/quote-store';
import { createClient } from '@utils/db-client';
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';

const TABLE_CUSTOMERS = 'customers';

/** One piece on the quote. A job is usually several sizes, not one. */
interface QuoteItem {
  localId: string;
  name: string;
  spec: GlassSpecification;
  quantity: number;
  markupPercent: number;
  useRecommendedPrice: boolean;
  manualUnitPrice: number;
}

const defaultQuoteSpec: GlassSpecification = {
  width: 1000,
  height: 1000,
  thickness: 4,
  glassType: 'Clear',
  edgework: 'ROUGH ARRIS',
  ceramicBand: false,
  shape: 'RECTANGLE',
  holes: false,
  numHoles: 0,
  radiusCorners: false,
  scanning: false,
};

function numberOrFallback(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatStamp(stamp: string | null): string {
  if (!stamp) {
    return 'code defaults';
  }
  const parsed = new Date(stamp);
  return Number.isNaN(parsed.getTime()) ? stamp : `saved ${parsed.toLocaleDateString()}`;
}

export default function AdhocQuotePage() {
  const router = useRouter();
  const { pricingData, source, updatedAt } = usePricing();

  const [role, setRole] = useState<UserRole>('readonly');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quoteName, setQuoteName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [quoteDate, setQuoteDate] = useState(todayISODate());
  const [quantity, setQuantity] = useState(1);
  const [markupPercent, setMarkupPercent] = useState(20);
  const [useRecommendedPrice, setUseRecommendedPrice] = useState(true);
  const [manualUnitPrice, setManualUnitPrice] = useState(0);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [spec, setSpec] = useState<GlassSpecification>({ ...defaultQuoteSpec });
  const [copyState, setCopyState] = useState('');
  const [cadPanelKey, setCadPanelKey] = useState(0);

  const [itemName, setItemName] = useState('');
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null);
  // Set when the calculator was opened to price one line of a purchase order.
  const [lineEdit, setLineEdit] = useState<LineEditRequest | null>(null);
  const [canSaveQuotes, setCanSaveQuotes] = useState(false);
  // The quote all three calculators share, holding the windows and awnings priced on their pages.
  const [workingDraft, setWorkingDraft] = useState<QuoteDraft>(EMPTY_QUOTE_DRAFT);
  // Raised once the shared quote has been read. Mirroring before that would write this page's empty
  // line list over a draft another calculator left.
  const [draftLoaded, setDraftLoaded] = useState(false);
  // Customer by default, so a browser Cmd+P prints the safe document. The internal button raises it
  // for one print and `afterprint` puts it back.
  const [sheetAudience, setSheetAudience] = useState<'internal' | 'customer'>('customer');

  const ratesLabel = source === 'saved' ? formatStamp(updatedAt) : 'code defaults';

  const calculation = useMemo(() => {
    try {
      const breakdown = calculateCost(spec, pricingData);
      const recommendedUnitPrice = breakdown.total * (1 + markupPercent / 100);
      const unitPrice = useRecommendedPrice ? recommendedUnitPrice : Math.max(0, manualUnitPrice);
      const totalPrice = unitPrice * Math.max(1, quantity);

      return {
        breakdown,
        recommendedUnitPrice,
        unitPrice,
        totalPrice,
        error: null as string | null,
      };
    } catch (costError: any) {
      return {
        breakdown: null,
        recommendedUnitPrice: 0,
        unitPrice: 0,
        totalPrice: 0,
        error: costError?.message || 'Unable to calculate quote.',
      };
    }
  }, [manualUnitPrice, markupPercent, pricingData, quantity, spec, useRecommendedPrice]);

  const selectedCustomer = customers.find((entry) => entry.id === customerId) || null;

  // Every piece on the quote, priced on today's rates. One line each on the order.
  const quoteLines = useMemo(() => {
    return quoteItems.map((item) => {
      try {
        const breakdown = calculateCost(item.spec, pricingData);
        const recommended = breakdown.total * (1 + item.markupPercent / 100);
        const unitPrice = item.useRecommendedPrice ? recommended : Math.max(0, item.manualUnitPrice);
        return { item, breakdown, unitPrice, total: unitPrice * Math.max(1, item.quantity), error: null as string | null };
      } catch (costError: any) {
        return { item, breakdown: null, unitPrice: 0, total: 0, error: costError?.message || 'Unable to price this piece.' };
      }
    });
  }, [pricingData, quoteItems]);

  const quoteTotal = quoteLines.reduce((sum, line) => sum + line.total, 0);
  const quotePieceCount = quoteLines.reduce((sum, line) => sum + Math.max(1, line.item.quantity), 0);
  const quoteArea = quoteLines.reduce((sum, line) => sum + getEffectiveArea(line.item.spec) * Math.max(1, line.item.quantity), 0);
  const quoteEdge = quoteLines.reduce((sum, line) => sum + getEffectivePerimeter(line.item.spec) * Math.max(1, line.item.quantity), 0);

  // The whole quote, not this page's product alone: a total that omits the windows already on it is
  // not the number the customer is given.
  const draftLineCount = quoteDraftLineCount(workingDraft);
  const draftTotal = quoteDraftTotal(workingDraft);
  const draftProducts = describeQuoteProducts(quoteDraftKinds(workingDraft));
  const otherLines = [...workingDraft.windowLines, ...workingDraft.awningLines];
  const otherTotal = otherLines.reduce((sum, line) => sum + line.unitPrice * Math.max(1, line.quantity), 0);
  const otherLineCounts = [workingDraft.windowLines.length ? `${workingDraft.windowLines.length} window line${workingDraft.windowLines.length === 1 ? '' : 's'}` : '', workingDraft.awningLines.length ? `${workingDraft.awningLines.length} awning line${workingDraft.awningLines.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');

  // The costing sheet prints the pieces the quote holds; a quote with none prints the piece on
  // screen. The customer's quotation is the quote itself and is refused when it holds nothing.
  const sheetPieces: GlassCostingSheetPiece[] = quoteLines.length
    ? quoteLines.map((line) => ({ id: line.item.localId, name: line.item.name, quantity: line.item.quantity, spec: line.item.spec, unitPrice: line.unitPrice, breakdown: line.breakdown }))
    : [{ id: 'current', name: itemName, quantity: Math.max(1, quantity), spec, unitPrice: calculation.unitPrice, breakdown: calculation.breakdown }];

  // The cost build-up for the whole quote: every line's breakdown, times how many of that piece.
  const quoteBreakdown = useMemo(() => {
    const totals = { baseGlass: 0, edgework: 0, holes: 0, shape: 0, ceramic: 0, scanning: 0, minimumTopUp: 0, cost: 0 };
    for (const line of quoteLines) {
      if (!line.breakdown) {
        continue;
      }
      const qty = Math.max(1, line.item.quantity);
      totals.baseGlass += line.breakdown.baseGlass * qty;
      totals.edgework += line.breakdown.edgework * qty;
      totals.holes += line.breakdown.holes * qty;
      totals.shape += line.breakdown.shape * qty;
      totals.ceramic += line.breakdown.ceramic * qty;
      totals.scanning += line.breakdown.scanning * qty;
      totals.minimumTopUp += line.breakdown.minimumTopUp * qty;
      totals.cost += line.breakdown.total * qty;
    }
    return totals;
  }, [quoteLines]);

  const quoteSummary = useMemo(() => {
    if (calculation.error) {
      return '';
    }

    const header = [`Quote: ${quoteName.trim() || 'Ad Hoc Quote'}`, `Customer: ${customerName.trim() || 'Walk-in / Phone'}`, `Date: ${quoteDate}`];

    if (quoteLines.length) {
      return [...header, ...quoteLines.map((line, index) => `${index + 1}. ${line.item.name || describeGlassSpecification(line.item.spec)} | ${line.item.quantity} x ${formatCurrency(line.unitPrice)} = ${formatCurrency(line.total)}`), `Quote total: ${formatCurrency(quoteTotal)}`, quoteNotes.trim() ? `Notes: ${quoteNotes.trim()}` : ''].filter(Boolean).join('\n');
    }

    return [...header, `Spec: ${describeGlassSpecification(spec)}`, spec.cadOutline ? `CAD: ${spec.cadOutline.fileName} | ${spec.cadOutline.shapeLabel} | ${spec.cadOutline.areaSqM.toFixed(3)} m² | ${spec.cadOutline.perimeterM.toFixed(2)} m edge${usesMeasuredGeometry(spec) ? ' (priced on measured outline)' : ''}` : '', `Qty: ${Math.max(1, quantity)}`, `Unit Price: ${formatCurrency(calculation.unitPrice)}`, `Total: ${formatCurrency(calculation.totalPrice)}`, quoteNotes.trim() ? `Notes: ${quoteNotes.trim()}` : ''].filter(Boolean).join('\n');
  }, [calculation.error, calculation.totalPrice, calculation.unitPrice, customerName, quantity, quoteDate, quoteLines, quoteName, quoteNotes, quoteTotal, spec]);

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
        let editingOrderLine = false;
        if (params?.get('editLine') === '1') {
          const request = peekLineEditRequest();
          const line = request?.order.lineDrafts.find((entry) => entry.localId === request.localId);
          if (request && line) {
            editingOrderLine = true;
            setLineEdit(request);
            setSpec({ ...line.adhocSpec });
            setQuantity(Math.max(1, line.quantityOrdered));
            setMarkupPercent(line.markupPercent);
            setItemName(line.lineNote);
            setUseRecommendedPrice(false);
            setManualUnitPrice(line.unitPriceAtOrder);
            setCustomerName(request.order.orderForm.customerId ? '' : '');
            setCustomerId(request.order.orderForm.customerId);
          }
        }

        // Pricing an order line is not quoting, so it neither reads nor writes the shared quote.
        if (!editingOrderLine) {
          const draft = readQuoteDraft();
          setWorkingDraft(draft);
          setQuoteName(draft.name);
          setCustomerName(draft.customer);
          setCustomerId(draft.customerId || '');
          if (draft.date) {
            setQuoteDate(draft.date);
          }
          setQuoteNotes(draft.notes);
          // The prices come back as they were quoted rather than repriced on today's rates.
          setQuoteItems(
            draft.glassLines.map((line, index) => ({
              localId: `glass-${index}-${Math.random().toString(36).slice(2, 8)}`,
              name: line.description,
              spec: line.spec,
              quantity: line.quantity,
              markupPercent: line.markupPercent,
              useRecommendedPrice: false,
              manualUnitPrice: line.unitPrice,
            }))
          );
          setDraftLoaded(true);
        }

        const db = createClient();
        const { data: customerData } = await db.from(TABLE_CUSTOMERS).select('*').order('name', { ascending: true });
        setCustomers((customerData as Customer[]) || []);
      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load quote calculator.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  // This page owns the glass lines of the shared quote and nothing else, so mirroring them leaves
  // the windows and awnings another calculator put there untouched. A piece that could not be
  // priced is not a line: the customer would be offered it at nothing.
  useEffect(() => {
    if (!draftLoaded) {
      return;
    }

    setWorkingDraft(
      replaceQuoteDraftLines(
        'glass',
        quoteLines
          .filter((line) => !line.error)
          .map((line) => ({
            description: line.item.name,
            quantity: line.item.quantity,
            unitPrice: line.unitPrice,
            markupPercent: line.item.markupPercent,
            spec: line.item.spec,
          })),
        { name: quoteName, customer: selectedCustomer?.name || customerName, customerId: customerId || null, date: quoteDate, notes: quoteNotes }
      )
    );
  }, [customerId, customerName, draftLoaded, quoteDate, quoteLines, quoteName, quoteNotes, selectedCustomer]);

  // A second tab writing the quote leaves this page holding an older heading, which the mirror
  // above would put back over it.
  useEffect(() => {
    if (!draftLoaded) {
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
  }, [draftLoaded]);

  // Put the sheet back to the customer copy once a print finishes, so the next Cmd+P is safe.
  useEffect(() => {
    const restore = () => setSheetAudience('customer');
    window.addEventListener('afterprint', restore);
    return () => window.removeEventListener('afterprint', restore);
  }, []);

  /** Hands the priced line back to the order it came from. */
  function saveLineToOrder() {
    if (!lineEdit) {
      return;
    }
    if (calculation.error) {
      setStatus({ tone: 'error', message: calculation.error });
      return;
    }

    persistLineEditResult({
      order: lineEdit.order,
      localId: lineEdit.localId,
      line: {
        quantityOrdered: Math.max(1, quantity),
        unitPriceAtOrder: calculation.unitPrice,
        lineNote: itemName.trim(),
        markupPercent,
        adhocSpec: { ...spec },
        windowSpec: null,
        windowRatesUpdatedAt: null,
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

  /** Empties the whole quote: this page's pieces, its heading, and the other calculators' lines. */
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

  /** The piece in the form. The quote it is being added to is left alone. */
  function resetCalculator() {
    setQuantity(1);
    setMarkupPercent(20);
    setUseRecommendedPrice(true);
    setManualUnitPrice(0);
    setSpec({ ...defaultQuoteSpec });
    setItemName('');
    setCopyState('');
    setStatus(null);
    setCadPanelKey((key) => key + 1);
  }

  function addToQuote() {
    if (calculation.error) {
      setStatus({ tone: 'error', message: calculation.error });
      return;
    }

    setQuoteItems((prev) => [
      ...prev,
      {
        localId: `glass-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: itemName.trim(),
        spec: { ...spec },
        quantity: Math.max(1, quantity),
        markupPercent,
        useRecommendedPrice,
        manualUnitPrice,
      },
    ]);
    setItemName('');
    setStatus({ tone: 'success', message: `Added. ${quoteItems.length + 1} piece${quoteItems.length ? 's' : ''} on this quote.` });
  }

  /** Pieces from an imported order. Each takes the markup currently on the form. */
  function addImportedPieces(pieces: ExtractedPiece[]) {
    if (!pieces.length) {
      return;
    }

    const stamp = Date.now();
    setQuoteItems((prev) => [
      ...prev,
      ...pieces.map((piece, index) => ({
        localId: `glass-${stamp}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        name: piece.name,
        spec: { ...piece.spec },
        quantity: Math.max(1, piece.quantity),
        markupPercent,
        useRecommendedPrice: true,
        manualUnitPrice: 0,
      })),
    ]);
    setStatus({ tone: 'success', message: `Added ${pieces.length} piece${pieces.length === 1 ? '' : 's'} from the order.` });
  }

  /** Put a piece back in the form to change it. It leaves the list until it is added again. */
  function editQuoteItem(localId: string) {
    const item = quoteItems.find((entry) => entry.localId === localId);
    if (!item) {
      return;
    }

    setSpec({ ...item.spec });
    setItemName(item.name);
    setQuantity(item.quantity);
    setMarkupPercent(item.markupPercent);
    setUseRecommendedPrice(item.useRecommendedPrice);
    setManualUnitPrice(item.manualUnitPrice);
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
    setCadPanelKey((key) => key + 1);
    setStatus({ tone: 'success', message: 'Loaded into the form.' });
  }

  function removeQuoteItem(localId: string) {
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
  }

  /** Saves every product on the quote, so the customer is given one document and one number. */
  async function handleSaveQuote() {
    if (!canSaveQuotes) {
      setStatus({ tone: 'warning', message: 'This session cannot save quotes.' });
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
        ratesUpdatedAt: updatedAt,
      });

      if (clearQuoteDraftIfUnchanged(stored)) {
        clearQuote();
        setStatus({ tone: 'success', message: 'Quote saved.' });
      } else {
        setWorkingDraft(readQuoteDraft());
        setStatus({ tone: 'success', message: 'Quote saved. The working quote changed while it saved and was kept.' });
      }
    } catch (saveError: any) {
      setStatus({ tone: 'error', message: saveError?.message || 'Unable to save the quote.' });
    }
  }

  /** The figures the customer is given. Holds no cost build-up. */
  async function copySummary() {
    const text = draftLineCount ? quoteEmailBody(workingDraft) : quoteSummary;
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyState('Copied the prices for the customer.');
    } catch {
      setCopyState('Clipboard copy failed.');
    }
  }

  /** What the glass costs to make, against what it is priced at. Stays inside the shop. */
  async function copyCostBreakdown() {
    const priced = quoteLines.length;
    const cost = priced ? quoteBreakdown.cost : calculation.breakdown?.total || 0;
    const price = priced ? quoteTotal : calculation.totalPrice;
    const text = [
      `INTERNAL — ${quoteName.trim() || 'Ad hoc quote'} — do not send to a customer`,
      `Rates: ${ratesLabel}`,
      `Glass: ${formatCurrency(priced ? quoteBreakdown.baseGlass : calculation.breakdown?.baseGlass)}`,
      `Edgework: ${formatCurrency(priced ? quoteBreakdown.edgework : calculation.breakdown?.edgework)}`,
      `Holes: ${formatCurrency(priced ? quoteBreakdown.holes : calculation.breakdown?.holes)}`,
      `Shape: ${formatCurrency(priced ? quoteBreakdown.shape : calculation.breakdown?.shape)}`,
      `Ceramic band: ${formatCurrency(priced ? quoteBreakdown.ceramic : calculation.breakdown?.ceramic)}`,
      `Scanning: ${formatCurrency(priced ? quoteBreakdown.scanning : calculation.breakdown?.scanning)}`,
      `Minimum charge top-up: ${formatCurrency(priced ? quoteBreakdown.minimumTopUp : calculation.breakdown?.minimumTopUp)}`,
      `Total cost: ${formatCurrency(cost)}`,
      `Margin: ${formatCurrency(price - cost)}`,
      `Glass price: ${formatCurrency(price)}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopyState('Copied the cost build-up (internal).');
    } catch {
      setCopyState('Clipboard copy failed.');
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

  /** Opens the estimator's own mail client with the quotation already written. */
  function emailQuote() {
    if (!draftLineCount) {
      setStatus({ tone: 'warning', message: 'Nothing on this quote to send.' });
      return;
    }

    if (quoteEmailTruncated(workingDraft)) {
      setStatus({ tone: 'warning', message: 'The quote is longer than the message body holds. Attach the printed quote.' });
    }
    window.location.href = quoteMailtoHref(workingDraft, selectedCustomer?.contact_email || '');
  }

  /** The whole quote goes on the order; a quote with nothing on it sends the piece on screen. */
  function handleCreatePurchaseOrder() {
    const glassLines: GlassQuoteLine[] = workingDraft.glassLines.length
      ? workingDraft.glassLines
      : draftLineCount || calculation.error
        ? []
        : [{ description: '', quantity: Math.max(1, quantity), unitPrice: calculation.unitPrice, markupPercent, spec }];

    if (!glassLines.length && !workingDraft.windowLines.length && !workingDraft.awningLines.length) {
      router.push('/glass/new');
      return;
    }

    persistQuoteToOrderDraft({
      quoteName,
      customerName: selectedCustomer?.name || customerName,
      customerId: customerId || null,
      quoteDate,
      quoteNotes,
      glassLines,
      windowLines: workingDraft.windowLines,
      awningLines: workingDraft.awningLines,
    });
    router.push('/glass/new?fromQuote=1');
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navRight={<ActionButton onClick={() => router.push('/glass')}>ORDER DASHBOARD</ActionButton>}
      heading={lineEdit ? `PRICING A LINE OF ${(lineEdit.order.orderForm.poNumber || 'A NEW ORDER').toUpperCase()}` : 'AD HOC PRICING CALCULATOR'}
      badge={isLoading ? 'LOADING' : `${role.toUpperCase()} SESSION`}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
          {/* Actions are on the toolbar. */}
          {/* With lines on the quote, this summarises the whole quote; otherwise the piece in the form. */}
          <Card title={draftLineCount ? `QUOTE SUMMARY (${draftLineCount} LINE${draftLineCount === 1 ? '' : 'S'})` : 'THIS PIECE'}>
            {draftLineCount ? (
              <>
                <RowSpaceBetween>
                  <Text>PRODUCTS</Text>
                  <Text>{draftProducts}</Text>
                </RowSpaceBetween>
                {quoteLines.length ? (
                  <>
                    <RowSpaceBetween>
                      <Text>GLASS PIECES</Text>
                      <Text>{quotePieceCount}</Text>
                    </RowSpaceBetween>
                    <RowSpaceBetween>
                      <Text>GLASS AREA</Text>
                      <Text>{quoteArea.toFixed(3)} m²</Text>
                    </RowSpaceBetween>
                    <RowSpaceBetween>
                      <Text>GLASS EDGE LENGTH</Text>
                      <Text>{quoteEdge.toFixed(2)} m</Text>
                    </RowSpaceBetween>
                  </>
                ) : null}
                {quoteLines.some((line) => line.error) ? (
                  <Text>
                    <span className="status-error">
                      {quoteLines.filter((line) => line.error).length} line{quoteLines.filter((line) => line.error).length === 1 ? '' : 's'} not priced; excluded from the total.
                    </span>
                  </Text>
                ) : null}
                <RowSpaceBetween>
                  <Text>QUOTE TOTAL</Text>
                  <Text>
                    <span className="status-pill status-pill-success">{formatCurrency(draftTotal)}</span>
                  </Text>
                </RowSpaceBetween>
              </>
            ) : calculation.error ? (
              <Text>
                <span className="status-error">{calculation.error}</span>
              </Text>
            ) : (
              <>
                <RowSpaceBetween>
                  <Text>AREA</Text>
                  <Text>
                    {getEffectiveArea(spec).toFixed(3)} m²{usesMeasuredGeometry(spec) ? ' (CAD)' : ''}
                  </Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>EDGE LENGTH</Text>
                  <Text>
                    {getEffectivePerimeter(spec).toFixed(2)} m{usesMeasuredGeometry(spec) ? ' (CAD)' : ''}
                  </Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>RECOMMENDED UNIT</Text>
                  <Text>{formatCurrency(calculation.recommendedUnitPrice)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>QUOTED UNIT</Text>
                  <Text>{formatCurrency(calculation.unitPrice)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>QTY</Text>
                  <Text>{Math.max(1, quantity)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>PIECE TOTAL</Text>
                  <Text>
                    <span className="status-pill status-pill-success">{formatCurrency(calculation.totalPrice)}</span>
                  </Text>
                </RowSpaceBetween>
              </>
            )}

            {copyState ? (
              <>
                <br />
                <Text>
                  <span className={copyState.startsWith('Copied') ? 'status-success' : 'status-warning'}>{copyState}</span>
                </Text>
              </>
            ) : null}
          </Card>

          {/* Cost build-up of the glass on the quote; otherwise of the piece in the form. */}
          <Card title={quoteLines.length ? 'PRICE BREAKDOWN (ALL GLASS)' : 'PRICE BREAKDOWN'}>
            {quoteLines.length ? (
              <Table>
                <TableRow>
                  <TableColumn style={{ width: '24ch' }}>COMPONENT</TableColumn>
                  <TableColumn>COST</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Base Glass</TableColumn>
                  <TableColumn>{formatCurrency(quoteBreakdown.baseGlass)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Edgework</TableColumn>
                  <TableColumn>{formatCurrency(quoteBreakdown.edgework)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Holes</TableColumn>
                  <TableColumn>{formatCurrency(quoteBreakdown.holes)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Shape</TableColumn>
                  <TableColumn>{formatCurrency(quoteBreakdown.shape)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Ceramic</TableColumn>
                  <TableColumn>{formatCurrency(quoteBreakdown.ceramic)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Scanning</TableColumn>
                  <TableColumn>{formatCurrency(quoteBreakdown.scanning)}</TableColumn>
                </TableRow>
                {quoteBreakdown.minimumTopUp ? (
                  <TableRow>
                    <TableColumn>Minimum charge top-up</TableColumn>
                    <TableColumn>{formatCurrency(quoteBreakdown.minimumTopUp)}</TableColumn>
                  </TableRow>
                ) : null}
                <TableRow>
                  <TableColumn>Cost</TableColumn>
                  <TableColumn>{formatCurrency(quoteBreakdown.cost)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Markup</TableColumn>
                  <TableColumn>{formatCurrency(quoteTotal - quoteBreakdown.cost)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Glass Total ({quotePieceCount} pieces)</TableColumn>
                  <TableColumn>{formatCurrency(quoteTotal)}</TableColumn>
                </TableRow>
              </Table>
            ) : calculation.error ? (
              <Text>
                <span className="status-error">{calculation.error}</span>
              </Text>
            ) : (
              <>
                <Table>
                  <TableRow>
                    <TableColumn style={{ width: '24ch' }}>COMPONENT</TableColumn>
                    <TableColumn>COST</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Base Glass</TableColumn>
                    <TableColumn>{formatCurrency(calculation.breakdown?.baseGlass)}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Edgework</TableColumn>
                    <TableColumn>{formatCurrency(calculation.breakdown?.edgework)}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Holes</TableColumn>
                    <TableColumn>{formatCurrency(calculation.breakdown?.holes)}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Shape</TableColumn>
                    <TableColumn>{formatCurrency(calculation.breakdown?.shape)}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Ceramic</TableColumn>
                    <TableColumn>{formatCurrency(calculation.breakdown?.ceramic)}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Scanning</TableColumn>
                    <TableColumn>{formatCurrency(calculation.breakdown?.scanning)}</TableColumn>
                  </TableRow>
                  {calculation.breakdown?.minimumTopUp ? (
                    <TableRow>
                      <TableColumn>Minimum charge top-up</TableColumn>
                      <TableColumn>{formatCurrency(calculation.breakdown.minimumTopUp)}</TableColumn>
                    </TableRow>
                  ) : null}
                  <TableRow>
                    <TableColumn>Subtotal</TableColumn>
                    <TableColumn>{formatCurrency(calculation.breakdown?.total)}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Markup ({markupPercent}%)</TableColumn>
                    <TableColumn>{formatCurrency((calculation.breakdown?.total || 0) * (markupPercent / 100))}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Unit Price Used</TableColumn>
                    <TableColumn>{formatCurrency(calculation.unitPrice)}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Piece Total ({Math.max(1, quantity)} units)</TableColumn>
                    <TableColumn>{formatCurrency(calculation.totalPrice)}</TableColumn>
                  </TableRow>
                </Table>
              </>
            )}
          </Card>

          <Card title="GLASS VISUALIZER">
            <GlassVisualizer spec={spec} />
          </Card>
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
        {
          body: 'Set Manual Price To Recommended',
          onClick: () => {
            setUseRecommendedPrice(false);
            setManualUnitPrice(Number(calculation.recommendedUnitPrice.toFixed(2)));
          },
        },
        { body: canSaveQuotes ? 'Save Quote' : 'Saving Needs Access', onClick: canSaveQuotes ? handleSaveQuote : undefined },
        { body: 'Reset', onClick: resetCalculator },
      ]}
    >
      {/* Step one of the estimator's job: the customer's document arrives and is read into lines. */}
      <CardDouble title="IMPORT A CUSTOMER ORDER OR DRAWING">
        <ImportPanel
          spec={spec}
          cadPanelKey={cadPanelKey}
          disabled={role === 'readonly'}
          onApplyCad={(result) => setSpec(result.spec)}
          onClearCad={() => setSpec((prev) => ({ ...prev, cadOutline: null }))}
          onAddPieces={addImportedPieces}
        />
      </CardDouble>

      {error && (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      )}

      {status ? (
        <Card title="STATUS">
          <Text>
            <span className={`status-${status.tone}`}>{status.message}</span>
          </Text>
        </Card>
      ) : null}

      {/* Opened from an order. The quote below is not what is being edited, so the way back is the
          first thing on the page. */}
      {lineEdit ? (
        <CardDouble title="EDITING AN ORDER LINE">
          <Text>
            Line {(lineEdit.order.lineDrafts.findIndex((line) => line.localId === lineEdit.localId) + 1) || 1} of {lineEdit.order.orderForm.poNumber || 'a new order'}. Changing the piece below changes that line.
          </Text>
          <br />
          <ActionButton onClick={saveLineToOrder}>Save To Order</ActionButton> <ActionButton onClick={cancelLineEdit}>Cancel</ActionButton>
        </CardDouble>
      ) : null}

      <CardDouble title={lineEdit ? 'THE LINE' : 'PIECE'}>
        <GlassSpecificationFields spec={spec} onChange={setSpec} basePrices={pricingData.basePrices} />
        <br />
        <Input label="QUANTITY" type="number" name="quote_quantity" value={String(quantity)} onChange={(event) => setQuantity(Math.max(1, numberOrFallback(event.target.value, 1)))} min="1" />
        <Input label="MARKUP (%)" type="number" name="quote_markup" value={String(markupPercent)} onChange={(event) => setMarkupPercent(Math.max(0, numberOrFallback(event.target.value, 0)))} min="0" />

        <label>
          <input type="checkbox" checked={useRecommendedPrice} onChange={(event) => setUseRecommendedPrice(event.target.checked)} /> Use recommended unit price
        </label>

        {!useRecommendedPrice && <Input label="MANUAL UNIT PRICE ($)" type="number" name="manual_unit_price" value={String(manualUnitPrice)} onChange={(event) => setManualUnitPrice(Math.max(0, numberOrFallback(event.target.value, 0)))} min="0" />}

        <Input label="PIECE NAME (OPTIONAL)" name="item_name" value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Front window, side panel..." />
        <br />
        {lineEdit ? null : <ActionButton onClick={addToQuote}>Add To Quote</ActionButton>}
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
            <>
              <Table>
                <TableRow>
                  <TableColumn>PIECE</TableColumn>
                  <TableColumn style={{ width: '6ch' }}>QTY</TableColumn>
                  <TableColumn style={{ width: '12ch' }}>UNIT</TableColumn>
                  <TableColumn style={{ width: '12ch' }}>TOTAL</TableColumn>
                  <TableColumn style={{ width: '18ch' }}>ACTIONS</TableColumn>
                </TableRow>
                {quoteLines.map((line) => (
                  <TableRow key={line.item.localId}>
                    <TableColumn>
                      {line.item.name ? `${line.item.name}: ` : ''}
                      {describeGlassSpecification(line.item.spec)}
                      {line.error ? (
                        <>
                          <br />
                          <span className="status-error">{line.error}</span>
                        </>
                      ) : null}
                    </TableColumn>
                    <TableColumn>{line.item.quantity}</TableColumn>
                    <TableColumn>{formatCurrency(line.unitPrice)}</TableColumn>
                    <TableColumn>{formatCurrency(line.total)}</TableColumn>
                    <TableColumn style={{ whiteSpace: 'nowrap' }}>
                      <ActionButton onClick={() => editQuoteItem(line.item.localId)}>Edit</ActionButton> <ActionButton onClick={() => removeQuoteItem(line.item.localId)}>Remove</ActionButton>
                    </TableColumn>
                  </TableRow>
                ))}
              </Table>
              <br />
            </>
          ) : (
            <Text>No glass lines on this quote.</Text>
          )}

          {otherLineCounts ? (
            <Text>
              {otherLineCounts} on this quote. {formatCurrency(otherTotal)}.
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

      {/* Both sheets print everything portalled into the page, so only one is ever mounted. */}
      {sheetAudience === 'customer' ? <QuoteSheet quote={workingDraft} /> : <GlassCostingSheet quoteName={quoteName} customerName={selectedCustomer?.name || customerName} quoteDate={quoteDate} notes={quoteNotes} ratesLabel={ratesLabel} pieces={sheetPieces} />}
    </AppFrame>
  );
}
