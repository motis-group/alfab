'use client';

import '@root/global.scss';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';
import WindowCostingGlossary from '@components/WindowCostingGlossary';
import WindowCostingSheet, { WindowCostingSheetWindow } from '@components/WindowCostingSheet';

import { APP_NAVIGATION_ITEMS } from '@utils/app-navigation';
import { UserRole, formatCurrency, todayISODate } from '@utils/order-management';
import { WindowQuoteLine, persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';
import {
  CostExtra,
  CostLine,
  FINISH_LABELS,
  Finish,
  GLASS_GROUP_LABELS,
  GLAZING_ORDER,
  GlassGroup,
  LOCK_LABELS,
  LabourPart,
  LockType,
  MullionKind,
  Reinforcement,
  StayType,
  TRIM_LABELS,
  TrimMode,
  WINDOW_TYPES,
  WindowCostingInput,
  WindowTypeId,
  costWindow,
  costWindowBatches,
  createWindowInput,
  describeWindow,
  switchWindowType,
} from '@utils/window-costing';
import { WINDOW_SERIES, WindowProduct, findProduct, productFullName, productLabel, productForInput, seriesOfProduct, visibleSeries } from '@utils/window-catalogue';
import { DEFAULT_WINDOW_RATES, GlazingId, WindowRates } from '@utils/window-costing-rates';
import { loadWindowRates, loadWindowRatesVersion } from '@utils/window-costing-store';
import { SavedWindowCosting, deleteWindowCosting, listWindowCostings, saveWindowCosting } from '@utils/window-quote-store';

const navigationItems = APP_NAVIGATION_ITEMS;
const GLASS_GROUPS: GlassGroup[] = ['ap5-6', 'ap8-12', 'laminate', 'acrylic'];
const FINISH_ORDER: Finish[] = ['mill', 'etch', 'blackExtra', 'black', 'powder'];
const TRIM_ORDER: TrimMode[] = ['none', 'required', 'extra'];
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
  const [canSaveCostings, setCanSaveCostings] = useState(false);
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
  const [quoteName, setQuoteName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [quoteDate, setQuoteDate] = useState(todayISODate());
  const [quantity, setQuantity] = useState(1);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [savedCostings, setSavedCostings] = useState<SavedWindowCosting[]>([]);
  const [comparison, setComparison] = useState<{ id: string; quoted: number | null; today: number | null; onOriginal: number | null; stamp: string | null } | null>(null);

  const cfg = WINDOW_TYPES[input.type];
  const series = WINDOW_SERIES.find((entry) => entry.id === seriesId) || WINDOW_SERIES[0];
  const seriesOptions = visibleSeries(series.id);
  const product = productForInput(input);
  const describe = useCallback((forInput: WindowCostingInput) => describeWindow(forInput, rates, productFullName(forInput.productId)), [rates]);
  const result = useMemo(() => costWindow(input, rates), [input, rates]);
  const batches = useMemo(() => (result.errors.length ? [] : costWindowBatches(input, rates, BATCH_SIZES)), [input, rates, result.errors.length]);
  const glazingOption = input.glazingId ? rates.glass.options[input.glazingId] : null;
  const derivedGlazingQty = Boolean(cfg.glazingQty);
  const orderQuantity = Math.max(1, quantity);
  const currentTotal = result.price == null ? null : result.price * orderQuantity;
  const extrasList = [result.extras.trims, result.extras.blackAnodising, result.extras.secondGlazing].filter(Boolean) as CostExtra[];
  const ratesLabel = ratesSource === 'saved' ? formatStamp(ratesUpdatedAt) : 'code defaults';

  const quoteLines = useMemo(
    () =>
      quoteItems.map((item) => {
        const itemResult = costWindow(item.input, rates);
        return {
          item,
          result: itemResult,
          total: itemResult.price == null ? null : itemResult.price * item.quantity,
        };
      }),
    [quoteItems, rates]
  );
  const quoteTotal = quoteLines.reduce((sum, line) => sum + (line.total ?? 0), 0);

  // The quote prints the windows it holds; a quote with none prints the window on screen.
  const sheetWindows: WindowCostingSheetWindow[] = quoteLines.length
    ? quoteLines.map((line) => ({ id: line.item.localId, name: line.item.name, quantity: line.item.quantity, input: line.item.input, result: line.result }))
    : [{ id: 'current', name: windowName, quantity: orderQuantity, input, result }];

  const summary = useMemo(() => {
    if (result.price == null) {
      return '';
    }

    const header = [
      `Window costing: ${quoteName.trim() || 'Ad Hoc'}`,
      `Customer: ${customerName.trim() || 'Walk-in / Phone'}`,
      `Date: ${quoteDate}`,
      `Rates: ${ratesLabel}`,
    ];

    if (quoteLines.length) {
      return [
        ...header,
        ...quoteLines.map((line, index) => `${index + 1}. ${line.item.name || describe(line.item.input)} | ${line.item.quantity} x ${formatCurrency(line.result.price)} = ${formatCurrency(line.total)}`),
        `Quote total: ${formatCurrency(quoteTotal)}`,
        quoteNotes.trim() ? `Notes: ${quoteNotes.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      ...header,
      `Window: ${describe(input)}`,
      `Subtotal: ${formatCurrency(result.subtotal)} | Margin ${formatPercent(result.marginRate)}: ${formatCurrency(result.margin)} | Packing: ${formatCurrency(result.packing)} | Uplift ${formatPercent(result.upliftRate)}: ${formatCurrency(result.uplift)}`,
      `Price (${result.unitLabel.toLowerCase()}): ${formatCurrency(result.price)}`,
      `Qty: ${orderQuantity} | Total: ${formatCurrency(currentTotal)}`,
      ...extrasList.map((extra) => `${extra.label}: ${formatExtra(extra)}`),
      result.unpriced.length ? `Not priced (charged as nil): ${result.unpriced.map((entry) => entry.label).join(', ')}` : '',
      quoteNotes.trim() ? `Notes: ${quoteNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }, [currentTotal, customerName, extrasList, input, orderQuantity, quoteDate, quoteLines, quoteName, quoteNotes, quoteTotal, rates, ratesLabel, result]);

  const refreshSavedCostings = useCallback(async () => {
    try {
      setSavedCostings(await listWindowCostings());
    } catch (loadError: any) {
      setStatus({ tone: 'warning', message: loadError?.message || 'Unable to load saved costings.' });
    }
  }, []);

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
        setCanSaveCostings(userCan(user, 'quotes:write'));

        const loaded = await loadWindowRates();
        setRates(loaded.rates);
        setRatesSource(loaded.source);
        setRatesUpdatedAt(loaded.updatedAt);
        setRatesError(loaded.error);

        await refreshSavedCostings();
      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load window costing.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshSavedCostings, router]);

  function selectProduct(next: WindowProduct) {
    if (!next.type) {
      setStatus({ tone: 'warning', message: `${productLabel(next)} has no costing recipe yet. ${next.note || ''}`.trim() });
      return;
    }

    setInput((prev) => {
      const base = prev.type === next.type ? prev : switchWindowType(prev, next.type as WindowTypeId);
      return { ...base, type: next.type as WindowTypeId, variant: next.variant ?? 0, productId: next.id };
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
    setInput((prev) => ({ ...prev, ...patch }));
  }

  function updateNumber(field: keyof WindowCostingInput, value: string, minimum = 0) {
    update({ [field]: Math.max(minimum, numberOrFallback(value, minimum)) } as Partial<WindowCostingInput>);
  }

  function updateMetres(field: 'flatSmoothM' | 'flatGroundM', value: string) {
    setMetreDrafts((prev) => ({ ...prev, [field]: value }));
    updateNumber(field, value);
  }

  function resetCalculator() {
    setInput({ ...createWindowInput('T5573'), productId: '500-5573' });
    setSeriesId('500');
    setMetreDrafts({});
    setWindowName('');
    setQuoteName('');
    setCustomerName('');
    setQuoteDate(todayISODate());
    setQuantity(1);
    setQuoteNotes('');
    setQuoteItems([]);
    setStatus(null);
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
    };

    setQuoteItems((prev) => [...prev, item]);
    setStatus({ tone: 'success', message: `Added to the quote. ${quoteItems.length + 1} window${quoteItems.length ? 's' : ''} on this quote.` });
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
    setQuantity(item.quantity);
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
    setStatus({ tone: 'success', message: 'Loaded back into the form. Add it to the quote when you are done.' });
  }

  function removeQuoteItem(localId: string) {
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
  }

  async function copySummary() {
    if (!summary) {
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setStatus({ tone: 'success', message: 'Copied the costing summary.' });
    } catch {
      setStatus({ tone: 'warning', message: 'Clipboard copy failed.' });
    }
  }

  function printCostingSheet() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  async function handleSaveCosting() {
    if (!canSaveCostings || result.price == null) {
      return;
    }

    try {
      await saveWindowCosting({
        name: windowName.trim() || quoteName.trim() || describe(input),
        customer: customerName,
        input,
        result,
        ratesUpdatedAt,
      });
      await refreshSavedCostings();
      setStatus({ tone: 'success', message: 'Costing saved. Load it again from Saved costings.' });
    } catch (saveError: any) {
      setStatus({ tone: 'warning', message: saveError?.message || 'Unable to save the costing.' });
    }
  }

  /** What was quoted, what it costs today, and what it recomputes to on the rates that priced it. */
  async function compareCosting(costing: SavedWindowCosting) {
    const original = costing.ratesUpdatedAt ? await loadWindowRatesVersion(costing.ratesUpdatedAt).catch(() => null) : null;
    setComparison({
      id: costing.id,
      quoted: costing.price,
      today: costWindow(costing.input, rates).price,
      onOriginal: original ? costWindow(costing.input, original).price : null,
      stamp: costing.ratesUpdatedAt,
    });
  }

  function loadSavedCosting(costing: SavedWindowCosting) {
    setInput({ ...costing.input });
    const savedSeries = seriesOfProduct(costing.input.productId ?? null) || (productForInput(costing.input) ? seriesOfProduct(productForInput(costing.input)!.id) : null);
    if (savedSeries) {
      setSeriesId(savedSeries.id);
    }
    setMetreDrafts({});
    setWindowName(costing.name);
    if (costing.customer) {
      setCustomerName(costing.customer);
    }
    setStatus({
      tone: costing.ratesUpdatedAt === ratesUpdatedAt ? 'success' : 'warning',
      message:
        costing.ratesUpdatedAt === ratesUpdatedAt
          ? `Loaded "${costing.name}".`
          : `Loaded "${costing.name}". It was priced on older rates, so the price here may differ from ${formatCurrency(costing.price)}.`,
    });
  }

  async function removeSavedCosting(costing: SavedWindowCosting) {
    try {
      await deleteWindowCosting(costing.id);
      await refreshSavedCostings();
    } catch (deleteError: any) {
      setStatus({ tone: 'warning', message: deleteError?.message || 'Unable to delete the costing.' });
    }
  }

  function handleCreatePurchaseOrder() {
    const lines: WindowQuoteLine[] = quoteLines.length
      ? quoteLines
          .filter((line) => line.result.price != null)
          .map((line) => ({
            description: line.item.name || describe(line.item.input),
            quantity: line.item.quantity,
            unitPrice: line.result.price as number,
            windowSpec: line.item.input,
            ratesUpdatedAt,
          }))
      : result.price == null
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

    if (!lines.length) {
      router.push('/glass/new');
      return;
    }

    persistQuoteToOrderDraft({
      kind: 'window',
      quoteName,
      customerName,
      quoteDate,
      markupPercent: 0,
      quoteNotes,
      windowLines: lines,
    });
    router.push('/glass/new?fromQuote=1');
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navigationItems={navigationItems}
      navLabel="WINDOW COSTING"
      navRight={<ActionButton onClick={() => router.push('/glass')}>ORDER DASHBOARD</ActionButton>}
      heading="WINDOW COSTING"
      badge={isLoading ? 'LOADING' : `${role.toUpperCase()} SESSION`}
      sidebarWidthCh={48}
      sidebarMobileOrder="top"
      sidebar={
        <>
          <Card title="QUICK ACTIONS">
            <ActionButton onClick={addToQuote}>Add Window To Quote</ActionButton>
            <br />
            <ActionButton onClick={handleCreatePurchaseOrder}>Create Purchase Order</ActionButton>
            <br />
            <ActionButton onClick={printCostingSheet}>Print Costing Sheet</ActionButton>
            <br />
            <ActionButton onClick={copySummary}>Copy Costing Summary</ActionButton>
            <br />
            <ActionButton onClick={canSaveCostings ? handleSaveCosting : undefined}>{canSaveCostings ? 'Save Costing' : 'Saving Needs Access'}</ActionButton>
            <br />
            <ActionButton onClick={resetCalculator}>Reset</ActionButton>
            {status ? (
              <>
                <br />
                <Text>
                  <span className={status.tone === 'success' ? 'status-success' : 'status-warning'}>{status.message}</span>
                </Text>
              </>
            ) : null}
          </Card>

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

          {result.unpriced.length ? (
            <Card title="NOT PRICED">
              <Text>
                <span className="status-warning">These lines have no rate and are charged as nil.</span>
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

          {batches.length ? (
            <Card title="BATCH PRICE">
              <Text>Setup labour is shared across a batch, so a larger run costs less each.</Text>
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
      }
      actionItems={[
        {
          hotkey: '⌘+R',
          body: 'Reset',
          onClick: resetCalculator,
        },
        {
          hotkey: '⌘+D',
          body: 'Add To Quote',
          onClick: addToQuote,
        },
        {
          hotkey: '⌘+P',
          body: 'Print',
          onClick: printCostingSheet,
        },
        {
          hotkey: '⌘+C',
          body: 'Copy Summary',
          onClick: copySummary,
        },
        {
          hotkey: '⌘+N',
          body: 'New PO',
          onClick: handleCreatePurchaseOrder,
        },
      ]}
    >
      {error && (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      )}

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

        {cfg.fields.includes('lockType') && cfg.lockTypes ? (
          <>
            <Text>LOCK</Text>
            <select value={input.lockType} onChange={(event) => update({ lockType: event.target.value as LockType })}>
              {cfg.lockTypes.map((lockType) => (
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

        {cfg.fields.includes('hinges') ? <Input label="NYLON PIVOT HINGES" type="number" name="window_hinges" value={String(input.hinges)} onChange={(event) => updateNumber('hinges', event.target.value)} min="0" /> : null}

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

        {cfg.trimsSupported ? (
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
        <Text>GLAZING MATERIAL ({cfg.glassNote})</Text>
        <select value={input.glazingId || ''} onChange={(event) => update({ glazingId: (event.target.value || null) as GlazingId | null })}>
          <option value="">Select glazing...</option>
          {GLASS_GROUPS.map((group) => (
            <optgroup key={group} label={GLASS_GROUP_LABELS[group]}>
              {GLAZING_ORDER.filter((id) => rates.glass.options[id].group === group).map((id) => (
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
          {GLAZING_ORDER.map((id) => (
            <option key={id} value={id}>
              {rates.glass.options[id].label}
            </option>
          ))}
        </select>
        <br />

        {derivedGlazingQty ? (
          <Text>Holes, shape cutting and flat smooth edging are derived from the locks and mullions for this window type.</Text>
        ) : (
          <>
            <Input label="HOLES" type="number" name="glazing_holes" value={String(input.holes)} onChange={(event) => updateNumber('holes', event.target.value)} min="0" />
            <Input label="C/VIEW HOLES" type="number" name="glazing_cview" value={String(input.cviewHoles)} onChange={(event) => updateNumber('cviewHoles', event.target.value)} min="0" />
            <Input label={glazingOption?.group === 'laminate' ? 'METRES ROUGH ARRIS' : 'METRES FLAT SMOOTH'} type="number" name="glazing_flat_smooth" value={metreDrafts.flatSmoothM ?? String(input.flatSmoothM)} onChange={(event) => updateMetres('flatSmoothM', event.target.value)} min="0" step="0.01" />
          </>
        )}
        {glazingOption?.group === 'laminate' ? <Input label="METRES FLAT GROUND" type="number" name="glazing_flat_ground" value={metreDrafts.flatGroundM ?? String(input.flatGroundM)} onChange={(event) => updateMetres('flatGroundM', event.target.value)} min="0" step="0.01" /> : null}
      </CardDouble>

      <CardDouble title="QUOTE DETAILS">
        <Input label="WINDOW NAME" name="window_name" value={windowName} onChange={(event) => setWindowName(event.target.value)} placeholder="Kitchen hopper" />
        <Input label="QUOTE NAME" name="quote_name" value={quoteName} onChange={(event) => setQuoteName(event.target.value)} />
        <Input label="CUSTOMER" name="quote_customer" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in / company name" />
        <Input label="QUOTE DATE" type="date" name="quote_date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} />
        <Input label="ORDER QUANTITY" type="number" name="quote_quantity" value={String(quantity)} onChange={(event) => setQuantity(Math.max(1, numberOrFallback(event.target.value, 1)))} min="1" />
        <Input label="NOTES" name="quote_notes" value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} />
      </CardDouble>

      <CardDouble title={`QUOTE (${quoteLines.length} WINDOW${quoteLines.length === 1 ? '' : 'S'})`}>
        {quoteLines.length ? (
          <>
            <Table>
              <TableRow>
                <TableColumn style={{ width: '34ch' }}>WINDOW</TableColumn>
                <TableColumn style={{ width: '8ch' }}>QTY</TableColumn>
                <TableColumn style={{ width: '14ch' }}>UNIT</TableColumn>
                <TableColumn style={{ width: '14ch' }}>TOTAL</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableRow>
              {quoteLines.map((line) => (
                <TableRow key={line.item.localId}>
                  <TableColumn>{line.item.name}</TableColumn>
                  <TableColumn>{line.item.quantity}</TableColumn>
                  <TableColumn>{formatCurrency(line.result.price)}</TableColumn>
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
          </>
        ) : (
          <Text>No windows on this quote yet. Add the window above to build a quote with several windows; one purchase order line is created for each.</Text>
        )}
      </CardDouble>

      <CardDouble title="SAVED COSTINGS">
        {savedCostings.length ? (
          <Table>
            <TableRow>
              <TableColumn style={{ width: '30ch' }}>NAME</TableColumn>
              <TableColumn style={{ width: '20ch' }}>CUSTOMER</TableColumn>
              <TableColumn style={{ width: '14ch' }}>PRICE</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>
            {savedCostings.map((costing) => (
              <TableRow key={costing.id}>
                <TableColumn>{costing.name}</TableColumn>
                <TableColumn>{costing.customer || '—'}</TableColumn>
                <TableColumn>{formatCurrency(costing.price)}</TableColumn>
                <TableColumn>
                  <RowSpaceBetween>
                    <ActionButton onClick={() => loadSavedCosting(costing)}>Load</ActionButton>
                    <ActionButton onClick={() => compareCosting(costing)}>Compare</ActionButton>
                    <ActionButton onClick={canSaveCostings ? () => removeSavedCosting(costing) : undefined}>Delete</ActionButton>
                  </RowSpaceBetween>
                </TableColumn>
              </TableRow>
            ))}
          </Table>
        ) : (
          <Text>No saved costings. Save one to reuse it as a template for a repeat customer.</Text>
        )}

        {comparison ? (
          <>
            <br />
            <Text>
              <strong>{savedCostings.find((costing) => costing.id === comparison.id)?.name}</strong>
            </Text>
            <RowSpaceBetween>
              <Text>QUOTED</Text>
              <Text>{formatCurrency(comparison.quoted)}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>ON TODAY&apos;S RATES</Text>
              <Text>{formatCurrency(comparison.today)}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>ON THE RATES THAT PRICED IT</Text>
              <Text>{comparison.onOriginal == null ? 'those rates are not kept' : formatCurrency(comparison.onOriginal)}</Text>
            </RowSpaceBetween>
            {comparison.onOriginal != null && comparison.quoted != null && Math.abs(comparison.onOriginal - comparison.quoted) > 0.01 ? (
              <Text>
                <span className="status-warning">The recalculation does not match what was quoted, so the costing itself changed, not just the rates.</span>
              </Text>
            ) : null}
          </>
        ) : null}
      </CardDouble>

      <CardDouble title="WHAT THESE TERMS MEAN">
        <Text>The costing keeps the words the legacy sheet used. These are what they mean, and where each one is applied.</Text>
        <br />
        <WindowCostingGlossary openGroup="price" />
      </CardDouble>

      <WindowCostingSheet quoteName={quoteName} customerName={customerName} quoteDate={quoteDate} notes={quoteNotes} ratesLabel={ratesLabel} rates={rates} windows={sheetWindows} />
    </AppFrame>
  );
}
