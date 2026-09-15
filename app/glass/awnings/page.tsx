'use client';

import '@root/global.scss';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import AwningCostingSheet from '@components/AwningCostingSheet';
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

import { UserRole, formatCurrency } from '@utils/order-management';
import { defaultAdhocSpec } from '@utils/order-draft';
import { LineEditRequest, clearLineEditRequest, peekLineEditRequest, persistLineEditResult } from '@utils/line-editing';
import { fetchCurrentSessionUser } from '@utils/session-client';
import { AwningCostingInput, CostLine, GLAZING_ORDER, costAwning, costAwningBatches, createAwningInput, describeAwning } from '@utils/awning-costing';
import { AwningRates, DEFAULT_AWNING_RATES, GlazingId, mergeAwningRates } from '@utils/awning-costing-rates';
import { loadAwningRates } from '@utils/awning-costing-store';

const BATCH_SIZES = [1, 2, 5, 10];

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

/**
 * The awning costing. It prices one awning line that a quote or an order sends.
 *
 * The calculator keeps no quote of its own. Without a line, it prices nothing, and the page shows the
 * way to a quote.
 */
export default function AwningCostingPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('readonly');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'warning'; message: string } | null>(null);

  const [rates, setRates] = useState<AwningRates>(DEFAULT_AWNING_RATES);
  const [ratesSource, setRatesSource] = useState<'saved' | 'default'>('default');
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [input, setInput] = useState<AwningCostingInput>(() => createAwningInput());
  const [awningName, setAwningName] = useState('');
  // The line that a quote or an order sent to be priced.
  const [lineEdit, setLineEdit] = useState<LineEditRequest | null>(null);

  const describe = useCallback((forInput: AwningCostingInput) => describeAwning(forInput, rates), [rates]);
  // A quote line is priced at cost, because the quote sets the margin.
  const quoteLine = lineEdit?.origin.kind === 'quote';
  const pricingRates = useMemo(() => (quoteLine ? { ...rates, marginRate: 0 } : rates), [quoteLine, rates]);
  const result = useMemo(() => costAwning(input, pricingRates), [input, pricingRates]);
  const batches = useMemo(() => (result.errors.length ? [] : costAwningBatches(input, pricingRates, BATCH_SIZES)), [input, pricingRates, result.errors.length]);
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
            if (line.awningSpec) {
              setInput({ ...line.awningSpec });
            }
            setAwningName(line.lineNote);
          }
        }

        const loaded = await loadAwningRates();
        setRates(loaded.rates);
        setRatesSource(loaded.source);
        setRatesUpdatedAt(loaded.updatedAt);
        setRatesError(loaded.error);
      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load awning costing.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  function update(patch: Partial<AwningCostingInput>) {
    setInput((prev) => ({ ...prev, ...patch }));
  }

  function updateNumber(field: keyof AwningCostingInput, value: string, minimum = 0) {
    update({ [field]: Math.max(minimum, numberOrFallback(value, minimum)) } as Partial<AwningCostingInput>);
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
        quantityOrdered: Math.max(1, result.qty),
        unitPriceAtOrder: result.price,
        lineNote: awningName.trim(),
        markupPercent: 0,
        adhocSpec: lineEdit.line.adhocSpec,
        awningSpec: { ...input },
        awningRatesUpdatedAt: ratesUpdatedAt,
        windowSpec: null,
        windowRatesUpdatedAt: null,
      },
      spec: describe(input),
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

  if (!lineEdit) {
    return <NoLineToPrice heading="AWNING COSTING" isLoading={isLoading} error={error} />;
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
                  <Text>TOTAL COST</Text>
                  <Text>{formatCurrency(result.subtotal)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>{quoteLine ? 'MARGIN' : `MARGIN (${formatPercent(result.marginRate)} OF COST)`}</Text>
                  <Text>{quoteLine ? 'SET ON THE QUOTE' : formatCurrency(result.margin)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>{quoteLine ? 'COST EACH' : 'PRICE EACH'}</Text>
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
          {lineEdit.lineLabel} of {lineEdit.origin.label}. Changing the awning below changes that line.
        </Text>
      </CardDouble>

      <CardDouble title="AWNING">
        <Input label="AWNING NAME (OPTIONAL)" name="awning_name" value={awningName} onChange={(event) => setAwningName(event.target.value)} placeholder="Port side, cabin window..." />
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
      </CardDouble>

      {/* Cmd+P prints the internal costing sheet of this line. The customer's copy prints from the quote page. */}
      <AwningCostingSheet title={`${lineEdit.lineLabel} of ${lineEdit.origin.label}`} ratesLabel={ratesLabel} rates={rates} awnings={[{ id: lineEdit.localId, name: awningName, quantity: result.qty, input, result }]} />
    </AppFrame>
  );
}
