'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
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

import { APP_NAVIGATION_ITEMS } from '@utils/app-navigation';
import { UserRole, formatCurrency, todayISODate } from '@utils/order-management';
import { persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { fetchCurrentSessionUser } from '@utils/session-client';
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
  WINDOW_TYPE_ORDER,
  WindowCostingInput,
  WindowTypeId,
  costWindow,
  createWindowInput,
  describeWindow,
  switchWindowType,
} from '@utils/window-costing';
import { DEFAULT_WINDOW_RATES, GlazingId, WindowRates } from '@utils/window-costing-rates';
import { loadWindowRates } from '@utils/window-costing-store';

const navigationItems = APP_NAVIGATION_ITEMS;
const GLASS_GROUPS: GlassGroup[] = ['ap5-6', 'ap8-12', 'laminate', 'acrylic'];
const FINISH_ORDER: Finish[] = ['mill', 'etch', 'blackExtra', 'black', 'powder'];
const TRIM_ORDER: TrimMode[] = ['none', 'required', 'extra'];
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

export default function WindowCostingPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('readonly');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rates, setRates] = useState<WindowRates>(DEFAULT_WINDOW_RATES);
  const [ratesSource, setRatesSource] = useState<'saved' | 'default'>('default');
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [input, setInput] = useState<WindowCostingInput>(() => createWindowInput('T5573'));
  const [quoteName, setQuoteName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [quoteDate, setQuoteDate] = useState(todayISODate());
  const [quantity, setQuantity] = useState(1);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [copyState, setCopyState] = useState('');
  // Raw text for decimal fields while typing, so "0.5" is not reformatted under the cursor.
  const [metreDrafts, setMetreDrafts] = useState<{ flatSmoothM?: string; flatGroundM?: string }>({});

  const cfg = WINDOW_TYPES[input.type];
  const result = useMemo(() => costWindow(input, rates), [input, rates]);
  const glazingOption = input.glazingId ? rates.glass.options[input.glazingId] : null;
  const derivedGlazingQty = Boolean(cfg.glazingQty);
  const orderQuantity = Math.max(1, quantity);
  const quoteTotal = result.price == null ? null : result.price * orderQuantity;
  const extrasList = [result.extras.trims, result.extras.blackAnodising, result.extras.secondGlazing].filter(Boolean) as CostExtra[];

  const summary = useMemo(() => {
    if (result.price == null) {
      return '';
    }
    return [
      `Window costing: ${quoteName.trim() || 'Ad Hoc'}`,
      `Customer: ${customerName.trim() || 'Walk-in / Phone'}`,
      `Date: ${quoteDate}`,
      `Window: ${describeWindow(input, rates)}`,
      `Subtotal: ${formatCurrency(result.subtotal)} | Margin ${formatPercent(result.marginRate)}: ${formatCurrency(result.margin)} | Packing: ${formatCurrency(result.packing)} | Uplift ${formatPercent(result.upliftRate)}: ${formatCurrency(result.uplift)}`,
      `Price (${result.unitLabel.toLowerCase()}): ${formatCurrency(result.price)}`,
      `Qty: ${orderQuantity} | Total: ${formatCurrency(quoteTotal)}`,
      ...extrasList.map((extra) => `${extra.label}: ${formatExtra(extra)}`),
      result.unpriced.length ? `Not priced (treated as $0): ${result.unpriced.join(', ')}` : '',
      quoteNotes.trim() ? `Notes: ${quoteNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }, [customerName, extrasList, input, orderQuantity, quoteDate, quoteName, quoteNotes, quoteTotal, rates, result]);

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

        const loaded = await loadWindowRates();
        setRates(loaded.rates);
        setRatesSource(loaded.source);
        setRatesError(loaded.error);
      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load window costing.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

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
    setInput(createWindowInput('T5573'));
    setMetreDrafts({});
    setQuoteName('');
    setCustomerName('');
    setQuoteDate(todayISODate());
    setQuantity(1);
    setQuoteNotes('');
    setCopyState('');
  }

  async function copySummary() {
    if (!summary) {
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setCopyState('Copied costing summary.');
    } catch {
      setCopyState('Clipboard copy failed.');
    }
  }

  function handleCreatePurchaseOrder() {
    if (result.price != null) {
      persistQuoteToOrderDraft({
        kind: 'window',
        quoteName,
        customerName,
        quoteDate,
        quantity: orderQuantity,
        unitPrice: result.price,
        markupPercent: 0,
        quoteNotes,
        spec: null,
        windowSpec: input,
        description: describeWindow(input, rates),
      });
      router.push('/glass/new?fromQuote=1');
      return;
    }

    router.push('/glass/new');
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
            <ActionButton onClick={handleCreatePurchaseOrder}>Create Purchase Order</ActionButton>
            <br />
            <ActionButton onClick={copySummary}>Copy Costing Summary</ActionButton>
            <br />
            <ActionButton onClick={resetCalculator}>Reset</ActionButton>
            {copyState ? (
              <>
                <br />
                <Text>
                  <span className={copyState === 'Copied costing summary.' ? 'status-success' : 'status-warning'}>{copyState}</span>
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
                  <Text>MARGIN ({formatPercent(result.marginRate)})</Text>
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
                  <Text>UPLIFT ({formatPercent(result.upliftRate)})</Text>
                  <Text>{formatCurrency(result.uplift)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>PRICE {result.unitLabel.toUpperCase()}</Text>
                  <Text>
                    <span className="status-pill status-pill-success">{formatCurrency(result.price)}</span>
                  </Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>QUOTE TOTAL ({orderQuantity} x)</Text>
                  <Text>{formatCurrency(quoteTotal)}</Text>
                </RowSpaceBetween>
              </>
            )}

            {result.warnings.map((message) => (
              <Text key={message}>
                <span className="status-warning">{message}</span>
              </Text>
            ))}
            {result.unpriced.length ? (
              <Text>
                <span className="status-warning">Not priced (treated as $0): {result.unpriced.join(', ')}. Enter the rates under Window Rates.</span>
              </Text>
            ) : null}
          </Card>

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
            <Text>{ratesSource === 'saved' ? 'Using saved window rates.' : 'Using default window rates.'}</Text>
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
        <Text>WINDOW TYPE</Text>
        <select value={input.type} onChange={(event) => setInput((prev) => switchWindowType(prev, event.target.value as WindowTypeId))}>
          {WINDOW_TYPE_ORDER.map((type) => (
            <option key={type} value={type}>
              {WINDOW_TYPES[type].label}
            </option>
          ))}
        </select>
        <br />

        {cfg.variantLabels && cfg.fields.includes('variant') ? (
          <>
            <Text>SECTION</Text>
            <select value={String(input.variant)} onChange={(event) => update({ variant: event.target.value === '1' ? 1 : 0 })}>
              <option value="0">{cfg.variantLabels[0]}</option>
              <option value="1">{cfg.variantLabels[1]}</option>
            </select>
            <br />
          </>
        ) : null}

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
        <Input label="QUOTE NAME" name="quote_name" value={quoteName} onChange={(event) => setQuoteName(event.target.value)} />
        <Input label="CUSTOMER" name="quote_customer" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in / company name" />
        <Input label="QUOTE DATE" type="date" name="quote_date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} />
        <Input label="ORDER QUANTITY" type="number" name="quote_quantity" value={String(quantity)} onChange={(event) => setQuantity(Math.max(1, numberOrFallback(event.target.value, 1)))} min="1" />
        <Input label="NOTES" name="quote_notes" value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} />
      </CardDouble>
    </AppFrame>
  );
}
