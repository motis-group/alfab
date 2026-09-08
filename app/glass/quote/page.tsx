'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import CadImportPanel from '@components/CadImportPanel';
import Card from '@components/Card';
import GlassVisualizer from '@components/GlassVisualizer';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { usePricing } from '@components/PricingProvider';
import { GlassSpecification, calculateCost, describeGlassSpecification, getAvailableGlassTypes, getAvailableThicknesses, getEffectiveArea, getEffectivePerimeter, usesMeasuredGeometry } from '@utils/calculations';
import { APP_NAVIGATION_ITEMS } from '@utils/app-navigation';
import { Customer, UserRole, formatCurrency, todayISODate } from '@utils/order-management';
import { GlassQuoteLine, persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { SavedGlassQuote, deleteGlassQuote, listGlassQuotes, saveGlassQuote } from '@utils/glass-quote-store';
import { createClient } from '@utils/db-client';
import { fetchCurrentSessionUser } from '@utils/session-client';

const navigationItems = APP_NAVIGATION_ITEMS;
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
const EDGEWORK_OPTIONS: GlassSpecification['edgework'][] = ['ROUGH ARRIS', 'FLAT GRIND - STRAIGHT', 'FLAT GRIND - CURVED', 'FLAT POLISH - STRAIGHT', 'FLAT POLISH - CURVED'];

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
  const [savedQuotes, setSavedQuotes] = useState<SavedGlassQuote[]>([]);
  const [status, setStatus] = useState<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null);

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

  const quoteSummary = useMemo(() => {
    if (calculation.error) {
      return '';
    }

    const header = [`Quote: ${quoteName.trim() || 'Ad Hoc Quote'}`, `Customer: ${customerName.trim() || 'Walk-in / Phone'}`, `Date: ${quoteDate}`];

    if (quoteLines.length) {
      return [
        ...header,
        ...quoteLines.map((line, index) => `${index + 1}. ${line.item.name || describeGlassSpecification(line.item.spec)} | ${line.item.quantity} x ${formatCurrency(line.unitPrice)} = ${formatCurrency(line.total)}`),
        `Quote total: ${formatCurrency(quoteTotal)}`,
        quoteNotes.trim() ? `Notes: ${quoteNotes.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      ...header,
      `Spec: ${describeGlassSpecification(spec)}`,
      spec.cadOutline ? `CAD: ${spec.cadOutline.fileName} | ${spec.cadOutline.shapeLabel} | ${spec.cadOutline.areaSqM.toFixed(3)} m² | ${spec.cadOutline.perimeterM.toFixed(2)} m edge${usesMeasuredGeometry(spec) ? ' (priced on measured outline)' : ''}` : '',
      `Qty: ${Math.max(1, quantity)}`,
      `Unit Price: ${formatCurrency(calculation.unitPrice)}`,
      `Total: ${formatCurrency(calculation.totalPrice)}`,
      quoteNotes.trim() ? `Notes: ${quoteNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
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

        const db = createClient();
        const { data: customerData } = await db.from(TABLE_CUSTOMERS).select('*').order('name', { ascending: true });
        setCustomers((customerData as Customer[]) || []);
        setSavedQuotes(await listGlassQuotes());
      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load quote calculator.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

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
        markupPercent,
        useRecommendedPrice,
        manualUnitPrice,
      },
    ]);
    setItemName('');
    setStatus({ tone: 'success', message: `Added. ${quoteItems.length + 1} piece${quoteItems.length ? 's' : ''} on this quote.` });
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
    setStatus({ tone: 'success', message: 'Loaded back into the form. Add it to the quote when you are done.' });
  }

  function removeQuoteItem(localId: string) {
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
  }

  async function handleSaveQuote() {
    if (!quoteLines.length) {
      setStatus({ tone: 'warning', message: 'Add at least one piece to the quote before saving it.' });
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
          markupPercent: line.item.markupPercent,
          unitPrice: line.unitPrice,
          breakdown: line.breakdown,
        })),
        total: quoteTotal,
        ratesUpdatedAt: updatedAt,
      });
      setSavedQuotes(await listGlassQuotes());
      setStatus({ tone: 'success', message: 'Quote saved. Load it back to re-quote the same job.' });
    } catch (saveError: any) {
      setStatus({ tone: 'error', message: saveError?.message || 'Unable to save the quote.' });
    }
  }

  /** Reopen a saved quote at the prices it was given, not at today's. */
  function loadSavedQuote(quote: SavedGlassQuote) {
    setQuoteName(quote.name);
    setCustomerName(quote.customer);
    setCustomerId(quote.customerId || '');
    setQuoteDate(quote.date ? quote.date.slice(0, 10) : todayISODate());
    setQuoteNotes(quote.notes);
    setQuoteItems(
      quote.items.map((item, index) => ({
        localId: `saved-${quote.id}-${index}`,
        name: item.name,
        spec: item.spec,
        quantity: item.quantity,
        markupPercent: item.markupPercent,
        useRecommendedPrice: false,
        manualUnitPrice: item.unitPrice,
      }))
    );
    // Null counts: a quote priced before any rates were saved is on different numbers from one
    // priced after, and that is exactly the case someone would miss.
    const moved = (quote.ratesUpdatedAt || null) !== (updatedAt || null);
    setStatus({
      tone: moved ? 'warning' : 'success',
      message: moved
        ? 'Loaded at the prices it was quoted at. The glass rates have changed since, so a fresh price would differ.'
        : 'Loaded at the prices it was quoted at.',
    });
  }

  async function handleDeleteSavedQuote(id: string) {
    try {
      await deleteGlassQuote(id);
      setSavedQuotes(await listGlassQuotes());
    } catch (deleteError: any) {
      setStatus({ tone: 'error', message: deleteError?.message || 'Unable to delete the quote.' });
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
          markupPercent: line.item.markupPercent,
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
      navigationItems={navigationItems}
      navLabel="AD HOC QUOTE"
      navRight={<ActionButton onClick={() => router.push('/glass')}>ORDER DASHBOARD</ActionButton>}
      heading="AD HOC PRICING CALCULATOR"
      badge={isLoading ? 'LOADING' : `${role.toUpperCase()} SESSION`}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
          <Card title="QUICK ACTIONS">
            <ActionButton onClick={addToQuote}>Add To Quote</ActionButton>
            <br />
            <ActionButton onClick={handleCreatePurchaseOrder}>Create Purchase Order</ActionButton>
            <br />
            <ActionButton
              onClick={() => {
                setUseRecommendedPrice(false);
                setManualUnitPrice(Number(calculation.recommendedUnitPrice.toFixed(2)));
              }}
            >
              Use Recommended as Manual
            </ActionButton>
            <br />
            <ActionButton onClick={resetCalculator}>Reset Calculator</ActionButton>
          </Card>

          <Card title="QUOTE SUMMARY">
            {calculation.error ? (
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
                  <Text>TOTAL QUOTE</Text>
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

          <Card title="PRICE BREAKDOWN">
            {calculation.error ? (
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
                    <TableColumn>Quote Total ({Math.max(1, quantity)} units)</TableColumn>
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
        { body: 'Reset', onClick: resetCalculator },
        { body: 'Add To Quote', onClick: addToQuote },
        { body: 'Copy Quote', onClick: copyQuoteToClipboard },
        { body: 'New PO', onClick: handleCreatePurchaseOrder },
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

      <CardDouble title="QUOTE DETAILS">
        <Input label="QUOTE NAME" name="quote_name" value={quoteName} onChange={(event) => setQuoteName(event.target.value)} />
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
        {selectedCustomer ? (
          <Text style={{ opacity: 0.7 }}>{[selectedCustomer.contact_name, selectedCustomer.phone].filter(Boolean).join(' · ') || 'No phone on this customer yet.'}</Text>
        ) : (
          <Input label="CUSTOMER NAME" name="quote_customer" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in / company name" />
        )}
        <br />
        <Input label="QUOTE DATE" type="date" name="quote_date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} />
        <Input
          label="QUANTITY"
          type="number"
          name="quote_quantity"
          value={String(quantity)}
          onChange={(event) => setQuantity(Math.max(1, numberOrFallback(event.target.value, 1)))}
          min="1"
        />
        <Input
          label="MARKUP (%)"
          type="number"
          name="quote_markup"
          value={String(markupPercent)}
          onChange={(event) => setMarkupPercent(Math.max(0, numberOrFallback(event.target.value, 0)))}
          min="0"
        />

        <label>
          <input type="checkbox" checked={useRecommendedPrice} onChange={(event) => setUseRecommendedPrice(event.target.checked)} /> Use recommended unit price
        </label>

        {!useRecommendedPrice && (
          <Input
            label="MANUAL UNIT PRICE ($)"
            type="number"
            name="manual_unit_price"
            value={String(manualUnitPrice)}
            onChange={(event) => setManualUnitPrice(Math.max(0, numberOrFallback(event.target.value, 0)))}
            min="0"
          />
        )}

        <Input label="QUOTE NOTES" name="quote_notes" value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} />
        <Input label="THIS PIECE IS FOR (OPTIONAL)" name="item_name" value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Front window, side panel..." />
        <br />
        <ActionButton onClick={addToQuote}>Add This Piece To The Quote</ActionButton>
      </CardDouble>

      <CardDouble title={`QUOTE (${quoteLines.length} PIECE${quoteLines.length === 1 ? '' : 'S'})`}>
        {quoteLines.length ? (
          <>
            <Table>
              <TableRow>
                <TableColumn style={{ width: '38ch' }}>PIECE</TableColumn>
                <TableColumn style={{ width: '6ch' }}>QTY</TableColumn>
                <TableColumn style={{ width: '12ch' }}>UNIT</TableColumn>
                <TableColumn style={{ width: '12ch' }}>TOTAL</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
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
                  <TableColumn>
                    <RowSpaceBetween>
                      <ActionButton onClick={() => editQuoteItem(line.item.localId)}>Edit</ActionButton>
                      <ActionButton onClick={() => removeQuoteItem(line.item.localId)}>Remove</ActionButton>
                    </RowSpaceBetween>
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
          <Text>No pieces yet. Price one above and add it. A job with several sizes is one quote, not several.</Text>
        )}
      </CardDouble>

      <CardDouble title={`SAVED QUOTES (${savedQuotes.length})`}>
        {savedQuotes.length ? (
          <Table>
            <TableRow>
              <TableColumn style={{ width: '26ch' }}>QUOTE</TableColumn>
              <TableColumn style={{ width: '22ch' }}>CUSTOMER</TableColumn>
              <TableColumn style={{ width: '13ch' }}>DATE</TableColumn>
              <TableColumn style={{ width: '8ch' }}>PIECES</TableColumn>
              <TableColumn style={{ width: '12ch' }}>TOTAL</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>
            {savedQuotes.map((quote) => (
              <TableRow key={quote.id}>
                <TableColumn>{quote.name}</TableColumn>
                <TableColumn>{quote.customer}</TableColumn>
                <TableColumn>{quote.date ? quote.date.slice(0, 10) : '—'}</TableColumn>
                <TableColumn>{quote.items.length}</TableColumn>
                <TableColumn>{formatCurrency(quote.total)}</TableColumn>
                <TableColumn>
                  <RowSpaceBetween>
                    <ActionButton onClick={() => loadSavedQuote(quote)}>Load</ActionButton>
                    <ActionButton onClick={() => handleDeleteSavedQuote(quote.id)}>Delete</ActionButton>
                  </RowSpaceBetween>
                </TableColumn>
              </TableRow>
            ))}
          </Table>
        ) : (
          <Text>Nothing saved yet. A saved quote keeps the prices it was given, so a customer who rings back gets the same number.</Text>
        )}
      </CardDouble>

      <CardDouble title="CAD FILE IMPORT">
        <CadImportPanel key={cadPanelKey} spec={spec} onApply={(result) => setSpec(result.spec)} onClear={() => setSpec((prev) => ({ ...prev, cadOutline: null }))} />
      </CardDouble>

      <CardDouble title="GLASS SPECIFICATION">
        <Text>GLASS THICKNESS (MM)</Text>
        <select
          value={String(spec.thickness)}
          onChange={(event) => {
            const nextThickness = Number(event.target.value) as GlassSpecification['thickness'];
            const nextAvailableTypes = getAvailableGlassTypes(nextThickness);
            const nextGlassType = nextAvailableTypes.includes(spec.glassType) ? spec.glassType : nextAvailableTypes[0];
            setSpec((prev) => ({
              ...prev,
              thickness: nextThickness,
              glassType: nextGlassType,
            }));
          }}
        >
          {getAvailableThicknesses(spec.glassType, pricingData.basePrices).map((thickness) => (
            <option key={thickness} value={thickness}>
              {thickness}
            </option>
          ))}
        </select>
        <br />

        <Text>GLASS TYPE</Text>
        <select
          value={spec.glassType}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              glassType: event.target.value as GlassSpecification['glassType'],
            }))
          }
        >
          {getAvailableGlassTypes(spec.thickness).map((glassType) => (
            <option key={glassType} value={glassType}>
              {glassType}
            </option>
          ))}
        </select>
        <br />

        <Input
          label="WIDTH (MM)"
          type="number"
          name="spec_width"
          value={String(spec.width)}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              width: Math.max(0, numberOrFallback(event.target.value, 0)),
            }))
          }
          min="0"
        />
        <Input
          label="HEIGHT (MM)"
          type="number"
          name="spec_height"
          value={String(spec.height)}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              height: Math.max(0, numberOrFallback(event.target.value, 0)),
            }))
          }
          min="0"
        />
        {spec.cadOutline ? (
          <Text>
            <span className="status-success">
              Read from {spec.cadOutline.fileName}: {spec.cadOutline.widthMm} × {spec.cadOutline.heightMm} mm, {spec.cadOutline.shapeLabel}.
            </span>
          </Text>
        ) : null}

        <Text>SHAPE</Text>
        <select
          value={spec.shape}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              shape: event.target.value as GlassSpecification['shape'],
            }))
          }
        >
          <option value="RECTANGLE">Rectangle</option>
          <option value="TRIANGLE">Triangle</option>
          <option value="SIMPLE">Simple Shape</option>
          <option value="COMPLEX">Complex Shape</option>
        </select>
        <br />

        <Text>EDGEWORK</Text>
        <select
          value={spec.edgework}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              edgework: event.target.value as GlassSpecification['edgework'],
            }))
          }
        >
          {EDGEWORK_OPTIONS.map((edgework) => (
            <option key={edgework} value={edgework}>
              {edgework}
            </option>
          ))}
        </select>
        <br />

        <Text>ADDITIONAL OPTIONS</Text>
        <label>
          <input
            type="checkbox"
            checked={spec.ceramicBand}
            onChange={(event) =>
              setSpec((prev) => ({
                ...prev,
                ceramicBand: event.target.checked,
              }))
            }
          />{' '}
          Ceramic Banding
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={spec.holes}
            onChange={(event) =>
              setSpec((prev) => ({
                ...prev,
                holes: event.target.checked,
                numHoles: event.target.checked ? Math.max(1, prev.numHoles || 4) : 0,
              }))
            }
          />{' '}
          Include Holes
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={spec.scanning}
            onChange={(event) =>
              setSpec((prev) => ({
                ...prev,
                scanning: event.target.checked,
              }))
            }
          />{' '}
          Scanning
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={spec.radiusCorners}
            onChange={(event) =>
              setSpec((prev) => ({
                ...prev,
                radiusCorners: event.target.checked,
              }))
            }
          />{' '}
          Radius Corners
        </label>

        <Input
          label="NUMBER OF HOLES"
          type="number"
          name="spec_holes"
          value={String(spec.numHoles)}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              numHoles: Math.max(0, numberOrFallback(event.target.value, 0)),
            }))
          }
          min="0"
          disabled={!spec.holes}
        />
      </CardDouble>
    </AppFrame>
  );
}
