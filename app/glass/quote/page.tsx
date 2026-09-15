'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import CustomerPicker from '@components/CustomerPicker';
import ImportPanel from '@components/ImportPanel';
import Card from '@components/Card';
import GlassSpecificationFields from '@components/GlassSpecificationFields';
import GlassVisualizer from '@components/GlassVisualizer';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import PrintedQuote from '@components/PrintedQuote';
import Text from '@components/Text';

import { usePricing } from '@components/PricingProvider';
import { GlassSpecification, calculateCost, describeGlassSpecification, getEffectiveArea, getEffectivePerimeter, usesMeasuredGeometry } from '@utils/calculations';
import { Customer, UserRole, formatCurrency, todayISODate } from '@utils/order-management';
import { GlassQuoteLine, persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { ExtractedPiece } from '@utils/import/model';
import { LineEditRequest, clearLineEditRequest, peekLineEditRequest, persistLineEditResult } from '@utils/line-editing';
import { QuoteLine } from '@utils/customer-quote-store';
import { SavedQuoteLine, createQuote, quoteReference } from '@utils/quote-store';
import { createLineDraft } from '@utils/order-draft';
import { userCan } from '@utils/session-client';
import { saveGlassQuote } from '@utils/glass-quote-store';
import { createClient } from '@utils/db-client';
import { fetchCurrentSessionUser } from '@utils/session-client';

const TABLE_CUSTOMERS = 'customers';

/** One piece on the quote. A job is usually several sizes, not one. Its markup is the quote's. */
interface QuoteItem {
  localId: string;
  name: string;
  spec: GlassSpecification;
  quantity: number;
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

export default function AdhocQuotePage() {
  const router = useRouter();
  const { pricingData, updatedAt } = usePricing();

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
  // The quote last issued for the customer, and the content it was issued with.
  const [issued, setIssued] = useState<{ id: string; fingerprint: string } | null>(null);
  const [canIssue, setCanIssue] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null);
  // Set when the calculator was opened to price one line of a purchase order.
  const [lineEdit, setLineEdit] = useState<LineEditRequest | null>(null);

  // A quote line is priced at cost, because the quote sets the margin. An order line has no quote
  // around it, so it carries its own markup.
  const quoteLine = lineEdit?.origin.kind === 'quote';

  const calculation = useMemo(() => {
    try {
      const breakdown = calculateCost(spec, pricingData);
      const recommendedUnitPrice = breakdown.total * (1 + (quoteLine ? 0 : markupPercent) / 100);
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
  }, [manualUnitPrice, markupPercent, pricingData, quantity, quoteLine, spec, useRecommendedPrice]);

  const selectedCustomer = customers.find((entry) => entry.id === customerId) || null;

  // Every piece on the quote, priced on today's rates at the quote's markup. One line each on the order.
  const quoteLines = useMemo(() => {
    return quoteItems.map((item) => {
      try {
        const breakdown = calculateCost(item.spec, pricingData);
        const recommended = breakdown.total * (1 + markupPercent / 100);
        const unitPrice = item.useRecommendedPrice ? recommended : Math.max(0, item.manualUnitPrice);
        return { item, breakdown, unitPrice, total: unitPrice * Math.max(1, item.quantity), error: null as string | null };
      } catch (costError: any) {
        return { item, breakdown: null, unitPrice: 0, total: 0, error: costError?.message || 'Unable to price this piece.' };
      }
    });
  }, [markupPercent, pricingData, quoteItems]);

  const quoteTotal = quoteLines.reduce((sum, line) => sum + line.total, 0);
  const quotePieceCount = quoteLines.reduce((sum, line) => sum + Math.max(1, line.item.quantity), 0);
  const quoteArea = quoteLines.reduce((sum, line) => sum + getEffectiveArea(line.item.spec) * Math.max(1, line.item.quantity), 0);
  const quoteEdge = quoteLines.reduce((sum, line) => sum + getEffectivePerimeter(line.item.spec) * Math.max(1, line.item.quantity), 0);

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
        setCanIssue(userCan(user, 'quotes:write'));
        setUsername(user.username);

        // An order or a quote sent one line to be priced. Load that line into the form.
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        if (params?.get('editLine') === '1') {
          const request = peekLineEditRequest();
          const line = request?.line;
          if (request && line) {
            setLineEdit(request);
            setSpec({ ...line.adhocSpec });
            setQuantity(Math.max(1, line.quantityOrdered));
            setMarkupPercent(line.markupPercent);
            setItemName(line.lineNote);
            // An order line keeps its price until the operator asks for the recommended one. A quote
            // line with no cost yet is priced from its specification.
            setUseRecommendedPrice(request.origin.kind === 'quote' && !line.unitPriceAtOrder);
            setManualUnitPrice(line.unitPriceAtOrder);
            setCustomerId(request.customerId);
          }
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

  /** Returns the priced line to the order or the quote that sent it. */
  function saveLineToDocument() {
    if (!lineEdit) {
      return;
    }
    if (calculation.error) {
      setStatus({ tone: 'error', message: calculation.error });
      return;
    }

    persistLineEditResult({
      origin: lineEdit.origin,
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
      spec: describeGlassSpecification(spec),
      extras: [],
    });
    router.push(lineEdit.returnTo);
  }

  /** Leaves the line as the order or the quote holds it. */
  function cancelLineEdit() {
    if (!lineEdit) {
      return;
    }
    clearLineEditRequest();
    router.push(lineEdit.returnTo);
  }

  function resetCalculator() {
    setQuoteName('');
    setCustomerName('');
    setCustomerId('');
    setQuoteDate(todayISODate());
    setQuantity(1);
    setMarkupPercent(20);
    setUseRecommendedPrice(true);
    setManualUnitPrice(0);
    setQuoteNotes('');
    setSpec({ ...defaultQuoteSpec });
    setItemName('');
    setQuoteItems([]);
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
        useRecommendedPrice,
        manualUnitPrice,
      },
    ]);
    setItemName('');
    setStatus({ tone: 'success', message: `Added. ${quoteItems.length + 1} piece${quoteItems.length ? 's' : ''} on this quote.` });
  }

  /** Pieces from an imported order, priced at the quote's markup like every other piece. */
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
    setUseRecommendedPrice(item.useRecommendedPrice);
    setManualUnitPrice(item.manualUnitPrice);
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
    setCadPanelKey((key) => key + 1);
    setStatus({ tone: 'success', message: 'Loaded into the form.' });
  }

  function removeQuoteItem(localId: string) {
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
  }

  // The customer's copy of what is on the quote.
  //
  // A piece the calculator could not price carries no price. It must not print as $0.00, because a
  // customer reads that as free. quoteTotals excludes a line with no price from the total.
  const paperLines: QuoteLine[] = quoteLines.map((line, index) => ({
    description: line.item.name || `Piece ${index + 1}`,
    spec: describeGlassSpecification(line.item.spec),
    quantity: Math.max(1, line.item.quantity),
    unitPrice: line.error ? null : line.unitPrice,
  }));

  const paperCustomer = selectedCustomer?.name || customerName;
  // Two prints of the same content are one offer. A change is a different offer and needs a number
  // of its own, so the print issues a new quote.
  const paperFingerprint = JSON.stringify({ quoteName, paperCustomer, customerId, quoteDate, quoteNotes, paperLines });
  const reference = issued && issued.fingerprint === paperFingerprint ? quoteReference(issued.id) : null;

  /** Saves the customer copy so the print carries a number. False, with the reason on screen, when it cannot. */
  async function issueQuote(): Promise<boolean> {
    if (!canIssue) {
      setStatus({ tone: 'warning', message: 'A numbered quote is saved as it prints, and saving quotes needs access. Cmd+P prints a draft.' });
      return false;
    }
    if (!paperLines.some((line) => line.unitPrice != null)) {
      setStatus({ tone: 'warning', message: 'Nothing on this quote has a price, so there is no offer to print.' });
      return false;
    }

    // The same shape a quote page line has, so the issued quote opens there for editing.
    const lines: SavedQuoteLine[] = quoteLines.map((line, index) => ({
      draft: createLineDraft({
        pricingSource: 'adhoc_calculator',
        adhocSpec: line.item.spec,
        quantityOrdered: Math.max(1, line.item.quantity),
        unitPriceAtOrder: line.error ? 0 : line.unitPrice,
        lineNote: line.item.name || `Piece ${index + 1}`,
        markupPercent,
      }),
      // A piece on the recommended price follows the margin of the quote there. A manual price stays as typed.
      unitCost: line.item.useRecommendedPrice && line.breakdown ? line.breakdown.total : null,
      spec: describeGlassSpecification(line.item.spec),
      extras: [],
    }));

    try {
      const id = await createQuote({ name: quoteName, customer: paperCustomer, customerId: customerId || null, date: quoteDate, notes: quoteNotes, marginPercent: markupPercent, lines, issuedBy: username, ratesUpdatedAt: updatedAt });
      setIssued({ id, fingerprint: paperFingerprint });
      setStatus({ tone: 'success', message: `Quote ${quoteReference(id)} saved. It is in the quote list.` });
      return true;
    } catch (saveError: any) {
      setStatus({ tone: 'warning', message: `The quote was not saved, so it was not printed. ${saveError?.message || ''}`.trim() });
      return false;
    }
  }

  /** Prints the customer's copy. A quote with no number is issued first, so the customer can quote it back. */
  async function printQuote() {
    if (!paperLines.length) {
      setStatus({ tone: 'warning', message: 'Add a piece before printing.' });
      return;
    }
    if (!reference && !(await issueQuote())) {
      return;
    }
    if (typeof window !== 'undefined') {
      // Let the sheet re-render with the new number before the print dialog reads the page.
      window.setTimeout(() => window.print(), 50);
    }
  }

  async function handleSaveQuote() {
    if (!quoteLines.length) {
      setStatus({ tone: 'warning', message: 'Add a piece before saving.' });
      return;
    }

    try {
      await saveGlassQuote({
        name: quoteName,
        customer: selectedCustomer?.name || customerName,
        customerId: customerId || null,
        notes: quoteNotes,
        items: quoteLines.map((line) => ({
          name: line.item.name,
          spec: line.item.spec,
          quantity: line.item.quantity,
          markupPercent,
          unitPrice: line.unitPrice,
          breakdown: line.breakdown,
        })),
        total: quoteTotal,
        ratesUpdatedAt: updatedAt,
      });
      setStatus({ tone: 'success', message: 'Quote saved.' });
    } catch (saveError: any) {
      setStatus({ tone: 'error', message: saveError?.message || 'Unable to save the quote.' });
    }
  }

  async function copyQuoteToClipboard() {
    if (!quoteSummary) {
      return;
    }

    try {
      await navigator.clipboard.writeText(quoteSummary);
      setCopyState('Copied quote summary.');
    } catch {
      setCopyState('Clipboard copy failed.');
    }
  }

  function handleCreatePurchaseOrder() {
    // The quote list when there is one, otherwise the piece on screen.
    const glassLines: GlassQuoteLine[] = quoteLines.length
      ? quoteLines.map((line) => ({
          description: line.item.name,
          quantity: line.item.quantity,
          unitPrice: line.unitPrice,
          markupPercent,
          spec: line.item.spec,
        }))
      : calculation.error
        ? []
        : [{ description: '', quantity: Math.max(1, quantity), unitPrice: calculation.unitPrice, markupPercent, spec }];

    if (!glassLines.length) {
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
    });
    router.push('/glass/new?fromQuote=1');
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navRight={<ActionButton onClick={() => router.push('/glass')}>ORDER DASHBOARD</ActionButton>}
      heading={lineEdit ? `PRICING A LINE OF ${lineEdit.origin.label.toUpperCase()}` : 'AD HOC PRICING CALCULATOR'}
      badge={isLoading ? 'LOADING' : `${role.toUpperCase()} SESSION`}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
          {/* Actions are on the toolbar. */}
          {/* With pieces on the quote, this summarises the quote; otherwise the piece in the form. */}
          <Card title={quoteLines.length ? `QUOTE SUMMARY (${quoteLines.length} LINE${quoteLines.length === 1 ? '' : 'S'})` : 'THIS PIECE'}>
            {quoteLines.length ? (
              <>
                <RowSpaceBetween>
                  <Text>PIECES</Text>
                  <Text>{quotePieceCount}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>AREA</Text>
                  <Text>{quoteArea.toFixed(3)} m²</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>EDGE LENGTH</Text>
                  <Text>{quoteEdge.toFixed(2)} m</Text>
                </RowSpaceBetween>
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
                    <span className="status-pill status-pill-success">{formatCurrency(quoteTotal)}</span>
                  </Text>
                </RowSpaceBetween>
                <br />
                <ActionButton onClick={copyQuoteToClipboard}>Copy Quote Summary</ActionButton>
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
                  <Text>{quoteLine ? 'UNIT COST FROM RATES' : 'RECOMMENDED UNIT'}</Text>
                  <Text>{formatCurrency(calculation.recommendedUnitPrice)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>{quoteLine ? 'UNIT COST' : 'QUOTED UNIT'}</Text>
                  <Text>{formatCurrency(calculation.unitPrice)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>QTY</Text>
                  <Text>{Math.max(1, quantity)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>{quoteLine ? 'LINE COST' : 'TOTAL QUOTE'}</Text>
                  <Text>
                    <span className="status-pill status-pill-success">{formatCurrency(calculation.totalPrice)}</span>
                  </Text>
                </RowSpaceBetween>
                <br />
                <ActionButton onClick={copyQuoteToClipboard}>Copy Quote Summary</ActionButton>
              </>
            )}

            {copyState ? (
              <>
                <br />
                <Text>
                  <span className={copyState === 'Copied quote summary.' ? 'status-success' : 'status-warning'}>{copyState}</span>
                </Text>
              </>
            ) : null}
          </Card>

          {/* Cost build-up of the quote when it has pieces; otherwise of the piece in the form. */}
          <Card title={quoteLines.length ? 'PRICE BREAKDOWN (WHOLE QUOTE)' : 'PRICE BREAKDOWN'}>
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
                  <TableColumn>Quote Total ({quotePieceCount} pieces)</TableColumn>
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
                    <TableColumn>{quoteLine ? 'Margin' : `Markup (${markupPercent}%)`}</TableColumn>
                    <TableColumn>{quoteLine ? 'Set on the quote' : formatCurrency((calculation.breakdown?.total || 0) * (markupPercent / 100))}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>{quoteLine ? 'Unit Cost Used' : 'Unit Price Used'}</TableColumn>
                    <TableColumn>{formatCurrency(calculation.unitPrice)}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>
                      {quoteLine ? 'Line Cost' : 'Quote Total'} ({Math.max(1, quantity)} units)
                    </TableColumn>
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
      // A quote line is priced at cost. The calculator's own quote, order, print and copy would carry
      // that cost to a customer, so a quote line offers only the way back.
      actionItems={quoteLine ? [{ body: 'Save To Quote', onClick: saveLineToDocument }, { body: 'Cancel', onClick: cancelLineEdit }] : [
        { body: 'Create Purchase Order', onClick: handleCreatePurchaseOrder },
        { body: 'Print Quote', onClick: printQuote },
        { body: 'Copy Quote', onClick: copyQuoteToClipboard },
        {
          body: 'Use Recommended Price',
          onClick: () => {
            setUseRecommendedPrice(false);
            setManualUnitPrice(Number(calculation.recommendedUnitPrice.toFixed(2)));
          },
        },
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

      {status ? (
        <Card title="STATUS">
          <Text>
            <span className={`status-${status.tone}`}>{status.message}</span>
          </Text>
        </Card>
      ) : null}

      {/* An order or a quote sent this line. The form below is that line. It is not the quote of
          this calculator. The way back is therefore at the top of the page: in the bar for a quote
          line, and here for an order line, whose bar keeps the actions of the calculator. */}
      {lineEdit ? (
        <CardDouble title={lineEdit.origin.kind === 'order' ? 'EDITING AN ORDER LINE' : 'EDITING A QUOTE LINE'}>
          <Text>
            {lineEdit.lineLabel} of {lineEdit.origin.label}. Changing the piece below changes that line.
          </Text>
          {quoteLine ? null : (
            <>
              <br />
              <ActionButton onClick={saveLineToDocument}>Save To Order</ActionButton> <ActionButton onClick={cancelLineEdit}>Cancel</ActionButton>
            </>
          )}
        </CardDouble>
      ) : null}

      <CardDouble title={lineEdit ? 'THE LINE' : 'PIECE'}>
        <GlassSpecificationFields spec={spec} onChange={setSpec} basePrices={pricingData.basePrices} />
        <br />
        <Input label="QUANTITY" type="number" name="quote_quantity" value={String(quantity)} onChange={(event) => setQuantity(Math.max(1, numberOrFallback(event.target.value, 1)))} min="1" />
        {/* An order line has no quote around it, so its markup is set here. A quote sets one margin for every line. */}
        {lineEdit && !quoteLine ? <Input label="MARKUP (%)" type="number" name="line_markup" value={String(markupPercent)} onChange={(event) => setMarkupPercent(Math.max(0, numberOrFallback(event.target.value, 0)))} min="0" /> : null}
        {quoteLine ? <Text style={{ opacity: 0.7 }}>Priced at cost. The quote sets the margin.</Text> : null}

        <label>
          <input type="checkbox" checked={useRecommendedPrice} onChange={(event) => setUseRecommendedPrice(event.target.checked)} /> {quoteLine ? 'Use the unit cost from the rates' : 'Use recommended unit price'}
        </label>

        {!useRecommendedPrice && <Input label={quoteLine ? 'MANUAL UNIT COST ($)' : 'MANUAL UNIT PRICE ($)'} type="number" name="manual_unit_price" value={String(manualUnitPrice)} onChange={(event) => setManualUnitPrice(Math.max(0, numberOrFallback(event.target.value, 0)))} min="0" />}

        <Input label="PIECE NAME (OPTIONAL)" name="item_name" value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Front window, side panel..." />
      </CardDouble>

      {lineEdit ? null : (
        <CardDouble title="QUOTE">
          <Input label="QUOTE NAME" name="quote_name" value={quoteName} onChange={(event) => setQuoteName(event.target.value)} placeholder="Job reference" />
          <CustomerPicker
            label="CUSTOMER"
            customers={customers}
            activeOnly
            value={customerId}
            onChange={(nextId, picked) => {
              setCustomerId(nextId);
              if (picked) {
                setCustomerName(picked.name);
              }
            }}
          />
          {selectedCustomer ? <Text style={{ opacity: 0.7 }}>{[selectedCustomer.contact_name, selectedCustomer.phone].filter(Boolean).join(' · ') || 'No phone on this customer yet.'}</Text> : <Input label="CUSTOMER NAME" name="quote_customer" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in / company name" />}
          <br />
          <Input label="QUOTE DATE" type="date" name="quote_date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} />
          <Input label="QUOTE NOTES" name="quote_notes" value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} />
          <Input label="MARKUP (%)" type="number" name="quote_markup" value={String(markupPercent)} onChange={(event) => setMarkupPercent(Math.max(0, numberOrFallback(event.target.value, 0)))} min="0" />
        </CardDouble>
      )}

      {lineEdit ? null : (
        <CardDouble title={`QUOTE LINES (${quoteLines.length})`}>
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
              <RowSpaceBetween>
                <Text>QUOTE TOTAL</Text>
                <Text>
                  <span className="status-pill status-pill-success">{formatCurrency(quoteTotal)}</span>
                </Text>
              </RowSpaceBetween>
              <br />
              <RowSpaceBetween>
                <ActionButton onClick={handleSaveQuote}>Save Quote</ActionButton>
                <ActionButton onClick={() => setQuoteItems([])}>Clear Quote</ActionButton>
              </RowSpaceBetween>
            </>
          ) : (
            <Text>No pieces on this quote.</Text>
          )}
          <br />
          <ActionButton onClick={addToQuote}>Add Piece To Quote</ActionButton>
        </CardDouble>
      )}

      <CardDouble title="READ A CUSTOMER'S ORDER OR DRAWING">
        <ImportPanel spec={spec} cadPanelKey={cadPanelKey} disabled={role === 'readonly'} onApplyCad={(result) => setSpec(result.spec)} onClearCad={() => setSpec((prev) => ({ ...prev, cadOutline: null }))} onAddPieces={addImportedPieces} />
      </CardDouble>

      {/* The copy for the printer. It is hidden on screen. Printing hides the app around it. */}
      {paperLines.length ? <PrintedQuote reference={reference} quoteName={quoteName} customerName={paperCustomer} quoteDate={quoteDate} notes={quoteNotes} lines={paperLines} /> : null}
    </AppFrame>
  );
}
