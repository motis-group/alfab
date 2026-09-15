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
import NoLineToPrice from '@components/page/NoLineToPrice';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';
import WindowCostingGlossary from '@components/WindowCostingGlossary';
import WindowCostingSheet from '@components/WindowCostingSheet';

import { UserRole, formatCurrency } from '@utils/order-management';
import { defaultAdhocSpec } from '@utils/order-draft';
import { LineEditRequest, clearLineEditRequest, peekLineEditRequest, persistLineEditResult } from '@utils/line-editing';
import { fetchCurrentSessionUser } from '@utils/session-client';
import { CostExtra, CostLine, FINISH_LABELS, Finish, GLASS_GROUP_LABELS, GLAZING_ORDER, LOCK_LABELS, LabourPart, LockType, MullionKind, Reinforcement, STRUT_LABELS, StayType, StrutKind, TRIM_LABELS, TrimMode, WINDOW_TYPES, WindowCostingInput, WindowTypeId, applyWindowOptions, costWindow, glazingFits, costWindowBatches, createWindowInput, describeWindow, switchWindowType, windowOptions } from '@utils/window-costing';
import { WINDOW_SERIES, WindowProduct, findProduct, productFullName, productLabel, productForInput, seriesOfProduct, visibleSeries } from '@utils/window-catalogue';
import { DEFAULT_WINDOW_RATES, GlazingId, WindowRates, mergeWindowRates, withoutMargins } from '@utils/window-costing-rates';
import { loadWindowRates } from '@utils/window-costing-store';

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

/**
 * The window costing. It prices one window line that a quote or an order sends.
 *
 * The calculator keeps no quote of its own. Without a line, it prices nothing, and the page shows the
 * way to a quote.
 */
export default function WindowCostingPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('readonly');
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
  // The line that a quote or an order sent to be priced.
  const [lineEdit, setLineEdit] = useState<LineEditRequest | null>(null);

  const cfg = WINDOW_TYPES[input.type];
  const options = windowOptions(cfg);
  const series = WINDOW_SERIES.find((entry) => entry.id === seriesId) || WINDOW_SERIES[0];
  const seriesOptions = visibleSeries(series.id);
  const product = productForInput(input);
  const describe = useCallback((forInput: WindowCostingInput) => describeWindow(forInput, rates, productFullName(forInput.productId)), [rates]);
  // A quote line is priced at cost, because the quote sets the margin.
  const quoteLine = lineEdit?.origin.kind === 'quote';
  const pricingRates = useMemo(() => (quoteLine ? withoutMargins(rates) : rates), [quoteLine, rates]);
  const result = useMemo(() => costWindow(input, pricingRates), [input, pricingRates]);
  const batches = useMemo(() => (result.errors.length ? [] : costWindowBatches(input, pricingRates, BATCH_SIZES)), [input, pricingRates, result.errors.length]);
  const glazingOption = input.glazingId ? rates.glass.options[input.glazingId] : null;
  const derivedGlazingQty = Boolean(cfg.glazingQty);
  // How many windows the batch makes. The costing already divides setup minutes across it, so the
  // order line and the price come from the same number.
  const orderQuantity = Math.max(1, Math.floor(input.qtyToSize) + Math.floor(input.qtyShaped));
  const currentTotal = result.price == null ? null : result.price * orderQuantity;
  const extrasList = [result.extras.trims, result.extras.secondGlazing].filter(Boolean) as CostExtra[];
  const ratesLabel = ratesSource === 'saved' ? formatStamp(ratesUpdatedAt) : 'code defaults';

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

        // An order or a quote sent one line to be priced. Load that line into the form.
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        if (params?.get('editLine') === '1') {
          const request = peekLineEditRequest();
          const line = request?.line;
          if (request && line) {
            setLineEdit(request);
            if (line.windowSpec) {
              setInput({ ...line.windowSpec });
              // The menu shows the series of the window on the line, not the first series.
              const lineSeries = seriesOfProduct(line.windowSpec.productId ?? null);
              if (lineSeries) {
                setSeriesId(lineSeries.id);
              }
            }
            setWindowName(line.lineNote);
          }
        }

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

  /** Returns the priced line to the order or the quote that sent it. */
  function saveLineToDocument() {
    if (!lineEdit) {
      return;
    }
    if (result.price == null) {
      setStatus({ tone: 'warning', message: 'This line is not priced yet, so there is nothing to send back.' });
      return;
    }

    persistLineEditResult({
      origin: lineEdit.origin,
      localId: lineEdit.localId,
      line: {
        quantityOrdered: Math.max(1, orderQuantity),
        unitPriceAtOrder: result.price,
        lineNote: windowName.trim(),
        markupPercent: 0,
        adhocSpec: lineEdit.line.adhocSpec,
        windowSpec: { ...input },
        windowRatesUpdatedAt: ratesUpdatedAt,
        awningSpec: null,
        awningRatesUpdatedAt: null,
      },
      spec: describe(input),
      extras: extrasList.map((extra) => ({ label: extra.label, total: extra.total })),
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

  if (!lineEdit) {
    return <NoLineToPrice heading="WINDOW COSTING" isLoading={isLoading} error={error} />;
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navRight={<ActionButton onClick={() => router.push('/glass')}>ORDER DASHBOARD</ActionButton>}
      heading={`PRICING A LINE OF ${lineEdit.origin.label.toUpperCase()}`}
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
                {/* The card shows a margin or an uplift only when its rate is not zero. A quote line has no margin and no uplift. */}
                {result.marginRate ? (
                  <RowSpaceBetween>
                    <Text>{`MARGIN (${formatPercent(result.marginRate)} OF COST)`}</Text>
                    <Text>{formatCurrency(result.margin)}</Text>
                  </RowSpaceBetween>
                ) : null}
                <RowSpaceBetween>
                  <Text>{result.reinforcement ? `${result.reinforcement.label} x ${result.reinforcement.count}` : 'PACKING'}</Text>
                  <Text>{formatCurrency(result.packing)}</Text>
                </RowSpaceBetween>
                {result.upliftRate ? (
                  <>
                    <RowSpaceBetween>
                      <Text>{result.unitLabel === 'Per Pair' ? 'PER PAIR (BEFORE UPLIFT)' : 'PER EACH (BEFORE UPLIFT)'}</Text>
                      <Text>{formatCurrency(result.beforeUplift)}</Text>
                    </RowSpaceBetween>
                    <RowSpaceBetween>
                      <Text>UPLIFT ({formatPercent(result.upliftRate)} OF THE ABOVE)</Text>
                      <Text>{formatCurrency(result.uplift)}</Text>
                    </RowSpaceBetween>
                  </>
                ) : null}
                <RowSpaceBetween>
                  <Text>
                    {quoteLine ? 'COST' : 'PRICE'} {result.unitLabel.toUpperCase()}
                  </Text>
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
                            <TableColumn>{quoteLine ? 'Per bar' : 'Per bar incl. margin'}</TableColumn>
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
      // The line belongs to the quote or the order that sent it, so the bar offers only the way back.
      actionItems={[
        { body: quoteLine ? 'Save To Quote' : 'Save To Order', onClick: saveLineToDocument },
        { body: 'Cancel', onClick: cancelLineEdit },
      ]}
    >
      {error && (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      )}

      {/* The form below is the line that the quote or the order sent. The way back is in the bar at the top. */}
      <CardDouble title={lineEdit.origin.kind === 'order' ? 'EDITING AN ORDER LINE' : 'EDITING A QUOTE LINE'}>
        <Text>
          {lineEdit.lineLabel} of {lineEdit.origin.label}. Changing the window below changes that line.
        </Text>
      </CardDouble>

      <CardDouble title="WINDOW">
        <Input label="WINDOW NAME (OPTIONAL)" name="window_name" value={windowName} onChange={(event) => setWindowName(event.target.value)} placeholder="Kitchen hopper" />
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

        {cfg.fields.includes('hinges') ? <Input label={cfg.id === 'AFB035' ? 'STAINLESS STEEL HINGES' : 'NYLON PIVOT HINGES'} type="number" name="window_hinges" value={String(input.hinges)} onChange={(event) => updateNumber('hinges', event.target.value)} min="0" /> : null}

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

        {cfg.fields.includes('struts') && input.strutKind !== 'none' ? <Input label="NUMBER OF STRUTS" type="number" name="window_struts" value={String(input.struts)} onChange={(event) => updateNumber('struts', event.target.value)} min="0" /> : null}

        {cfg.fields.includes('handles') ? <Input label="VITUS HANDLES" type="number" name="window_handles" value={String(input.handles)} onChange={(event) => updateNumber('handles', event.target.value)} min="0" /> : null}

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
      </CardDouble>

      <CardDouble title="WHAT THESE TERMS MEAN">
        <Text>Terms used by the legacy costing sheet.</Text>
        <br />
        <WindowCostingGlossary />
      </CardDouble>

      {/* Cmd+P prints the internal costing sheet of this line. The customer's copy prints from the quote page. */}
      <WindowCostingSheet title={`${lineEdit.lineLabel} of ${lineEdit.origin.label}`} ratesLabel={ratesLabel} rates={rates} windows={[{ id: lineEdit.localId, name: windowName, quantity: orderQuantity, input, result }]} />
    </AppFrame>
  );
}
