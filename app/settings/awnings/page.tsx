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
import Text from '@components/Text';
import { RateAgeBadge, RateReviewCard } from '@components/RateAgeNotice';

import { APP_ACCOUNT_SECTION_ITEMS, APP_NAVIGATION_ITEMS } from '@utils/app-navigation';
import { formatCurrency } from '@utils/order-management';
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';
import { AwningRates, DEFAULT_AWNING_RATES, GLAZING_ORDER, mergeAwningRates } from '@utils/awning-costing-rates';
import { loadAwningRates, resetAwningRates, saveAwningRates } from '@utils/awning-costing-store';
import { costAwning, createAwningInput } from '@utils/awning-costing';
import EstimateAccuracyCard from '@components/EstimateAccuracyCard';
import { AccuracySummary, measureAccuracy } from '@utils/estimate-accuracy';
import { loadMeasuredLines } from '@utils/estimate-accuracy-store';
import { DEFAULT_WINDOW_RATES } from '@utils/window-costing-rates';

const navigationItems = APP_NAVIGATION_ITEMS;

const SECTION_TITLES: Record<string, string> = {
  parts: 'Parts',
  quantities: 'Fixed quantities',
  labour: 'Labour',
  glass: 'Glass',
  marginRate: 'Margin',
};

/** One editable rate: where it lives in the document, what to call it and what it is measured in. */
interface RateField {
  path: string;
  label: string;
  unit: string;
}

const PARTS: RateField[] = [
  { path: 'parts.frame', label: 'AFB035 frame', unit: '$ per m' },
  { path: 'parts.anchorPlate', label: 'Anchor plate', unit: '$ per m' },
  { path: 'parts.rubberSeal', label: 'Silicone rubber seal', unit: '$ per m' },
  { path: 'parts.trackInfill', label: 'T81 track infill', unit: '$ per m' },
  { path: 'parts.winder', label: 'Window winder', unit: '$ each' },
  { path: 'parts.hinges', label: 'Heavy duty hinges', unit: '$ per pair' },
  { path: 'parts.winderMountPlate', label: 'Winder mount plate', unit: '$ each' },
  { path: 'parts.glassWinderPlate', label: 'Glass winder plate', unit: '$ each' },
  { path: 'parts.fixingSet', label: 'M5 screw and lock nut', unit: '$ per set' },
  { path: 'parts.sealant', label: 'Sealant', unit: '$ each' },
  { path: 'parts.flyscreen', label: 'Flyscreen and clips', unit: '$ each' },
];

const QUANTITIES: RateField[] = [
  { path: 'quantities.anchorPlateM', label: 'Anchor plate per awning', unit: 'm' },
  { path: 'quantities.fixingSets', label: 'Fixing sets per awning', unit: 'sets' },
];

const LABOUR: RateField[] = [
  { path: 'labour.setupMinutes', label: 'Setup, shared across the run', unit: 'minutes' },
  { path: 'labour.eachMinutes', label: 'Per awning', unit: 'minutes' },
  { path: 'labour.perHour', label: 'Labour rate', unit: '$ per hour' },
];

const GLASS_EXTRAS: RateField[] = [
  { path: 'glass.bandingSet', label: 'Ceramic banding', unit: '$ per awning' },
  { path: 'glass.flatPolishPerM', label: 'Flat polish', unit: '$ per m' },
];

/**
 * Rates the whole costing leans on. A blank or zero here is not reported as "not priced": it reaches
 * arithmetic as zero and the quote still prints a confident price that is too low.
 */
const SPINE = new Set(['labour.perHour', 'labour.eachMinutes', 'marginRate', 'quantities.anchorPlateM', 'quantities.fixingSets']);

function valueAt(rates: AwningRates, path: string): number | null {
  let node: unknown = rates;
  for (const segment of path.split('.')) {
    if (node == null || typeof node !== 'object') {
      return null;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'number' ? node : null;
}

function setAt(rates: AwningRates, path: string, value: number | null): AwningRates {
  const next = JSON.parse(JSON.stringify(rates)) as AwningRates;
  const segments = path.split('.');
  let node = next as unknown as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    node = node[segment] as Record<string, unknown>;
  }
  node[segments[segments.length - 1]] = value;
  return next;
}

/** One sentence a fabricator can act on, or null when the value is fine. */
function issueFor(path: string, value: number | null): string | null {
  const fallback = valueAt(DEFAULT_AWNING_RATES, path);

  if (value == null) {
    if (SPINE.has(path)) {
      return 'Blank. This is read as zero, so every awning quotes short without saying so.';
    }
    // A rate the sheet never held is a gap, not a mistake: the line is charged as nil and reported.
    return fallback == null ? null : 'Blank, but this rate had a price. Type it back or the line is charged as nil.';
  }
  if (value < 0) {
    return 'Below zero, which turns a cost line into a credit.';
  }
  if (value === 0 && SPINE.has(path)) {
    return 'Zero. Zero is never reported as not priced, so the quote comes out short and looks right.';
  }
  if (path === 'marginRate' && value > 1) {
    return 'A margin above 1 is a percentage typed as a whole number: 40 instead of 0.4 multiplies the price by 41.';
  }
  return null;
}

export default function AwningRatesSettings() {
  const router = useRouter();

  const [rates, setRates] = useState<AwningRates>(DEFAULT_AWNING_RATES);
  const [savedRates, setSavedRates] = useState<AwningRates>(DEFAULT_AWNING_RATES);
  const [source, setSource] = useState<'saved' | 'default'>('default');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [accuracy, setAccuracy] = useState<AccuracySummary | null>(null);

  const allFields = useMemo(() => [...PARTS, ...QUANTITIES, ...LABOUR, ...GLASS_EXTRAS, ...GLAZING_ORDER.map((id) => ({ path: `glass.options.${id}.list`, label: DEFAULT_AWNING_RATES.glass.options[id].label, unit: '$ per m²' })), { path: 'marginRate', label: 'Margin on cost', unit: 'fraction, 0.4 is 40 percent' }], []);

  const issues = useMemo(() => allFields.map((field) => ({ field, message: issueFor(field.path, valueAt(rates, field.path)) })).filter((entry) => entry.message), [allFields, rates]);
  const blocking = issues.filter((entry) => SPINE.has(entry.field.path) || (entry.message || '').startsWith('Below zero') || (entry.message || '').startsWith('A margin'));
  const hasChanges = useMemo(() => JSON.stringify(rates) !== JSON.stringify(savedRates), [rates, savedRates]);

  // What the edit does to a real price, before it is saved. The sheet's own example is the reference.
  const impact = useMemo(() => {
    const example = createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 6 });
    return { before: costAwning(example, savedRates).price, after: costAwning(example, rates).price };
  }, [rates, savedRates]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const user = await fetchCurrentSessionUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCanWrite(userCan(user, 'pricing:write'));

      const loaded = await loadAwningRates();
      setRates(loaded.rates);
      setSavedRates(loaded.rates);
      setSource(loaded.source);
      setUpdatedAt(loaded.updatedAt);
      if (loaded.error) {
        setStatus({ tone: 'error', message: loaded.error });
      }
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // The shop floor's answer to "is 330 minutes right", read once and shown beside that number.
  useEffect(() => {
    (async () => {
      try {
        const measured = await loadMeasuredLines();
        setAccuracy(measureAccuracy(measured, DEFAULT_WINDOW_RATES, rates).find((entry) => entry.kind === 'awning') || null);
      } catch {
        setAccuracy(null);
      }
    })();
  }, [rates]);

  function updateField(path: string, raw: string) {
    const trimmed = raw.trim();
    setRates((prev) => setAt(prev, path, trimmed === '' ? null : Number(trimmed)));
  }

  function updateAsAt(key: keyof AwningRates['asAt'], value: string) {
    setRates((prev) => ({ ...prev, asAt: { ...prev.asAt, [key]: value } }));
  }

  async function handleSave() {
    if (!canWrite || blocking.length) {
      return;
    }
    try {
      await saveAwningRates(rates, updatedAt);
      const loaded = await loadAwningRates();
      setRates(loaded.rates);
      setSavedRates(loaded.rates);
      setSource(loaded.source);
      setUpdatedAt(loaded.updatedAt);
      setStatus({ tone: 'success', message: 'Awning rates saved for everyone. The rates they replaced are kept, so an old price can still be reproduced.' });
    } catch (saveError: any) {
      setStatus({ tone: 'error', message: saveError?.message || 'Unable to save the awning rates.' });
    }
  }

  async function handleReset() {
    if (!canWrite) {
      return;
    }
    if (source === 'saved' && !window.confirm('Reset throws away the whole company awning price list and goes back to the code defaults. The list being dropped is kept as an archive row, but every price typed since then is gone from the editor. Reset?')) {
      return;
    }
    try {
      await resetAwningRates();
      const fresh = mergeAwningRates(null);
      setRates(fresh);
      setSavedRates(fresh);
      setSource('default');
      setUpdatedAt(null);
      setStatus({ tone: 'success', message: 'Awning rates reset to the defaults.' });
    } catch (resetError: any) {
      setStatus({ tone: 'error', message: resetError?.message || 'Unable to reset the awning rates.' });
    }
  }

  function renderField(field: RateField) {
    const value = valueAt(rates, field.path);
    const message = issueFor(field.path, value);
    const tone = message ? (SPINE.has(field.path) || message.startsWith('Below zero') || message.startsWith('A margin') ? 'status-error' : 'status-warning') : null;

    return (
      <div key={field.path} id={`rate-${field.path}`}>
        <Input label={`${field.label.toUpperCase()} (${field.unit})`} type="number" name={field.path} value={value == null ? '' : String(value)} onChange={(event) => updateField(field.path, event.target.value)} step="0.01" placeholder="blank = not priced" />
        {message ? (
          <Text>
            <span className={tone as string}>{message}</span>
          </Text>
        ) : null}
      </div>
    );
  }

  const columns = { display: 'grid', gap: 'calc(var(--font-size) * var(--theme-line-height-base))', gridTemplateColumns: 'repeat(auto-fit, minmax(32ch, 1fr))', alignItems: 'start' } as const;

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⚙"
      navigationItems={navigationItems}
      navLabel="COSTING"
      navRight={<ActionButton onClick={() => router.push('/glass/awnings')}>BACK TO AWNING COSTING</ActionButton>}
      heading="AWNING RATES"
      sectionNavigationItems={APP_ACCOUNT_SECTION_ITEMS}
      badge={isLoading ? 'LOADING' : hasChanges ? 'UNSAVED CHANGES' : source === 'saved' ? 'SAVED RATES' : 'DEFAULT RATES'}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
          <Card title="ACTIONS">
            <ActionButton onClick={canWrite && hasChanges && !blocking.length ? handleSave : undefined}>{!canWrite ? 'Saving Needs Access' : blocking.length ? 'Fix The Red Rates First' : hasChanges ? 'Save Changes' : 'No Changes To Save'}</ActionButton>
            <br />
            <ActionButton onClick={canWrite ? handleReset : undefined}>Reset To Defaults</ActionButton>
            {status ? (
              <>
                <br />
                <Text>
                  <span className={status.tone === 'success' ? 'status-success' : 'status-error'}>{status.message}</span>
                </Text>
              </>
            ) : null}
          </Card>

          {hasChanges ? (
            <Card title="WHAT THIS CHANGES">
              <Text>The sheet&apos;s own example awning, 1220 x 1100 glass, six off.</Text>
              <RowSpaceBetween>
                <Text>NOW</Text>
                <Text>{formatCurrency(impact.before)}</Text>
              </RowSpaceBetween>
              <RowSpaceBetween>
                <Text>ON THIS EDIT</Text>
                <Text>{formatCurrency(impact.after)}</Text>
              </RowSpaceBetween>
              {impact.before != null && impact.after != null && impact.before !== 0 ? (
                <Text>
                  <span className={Math.abs((impact.after - impact.before) / impact.before) >= 0.1 ? 'status-warning' : undefined}>{(((impact.after - impact.before) / impact.before) * 100).toFixed(1)}% move.</span>
                </Text>
              ) : null}
            </Card>
          ) : null}

          {issues.length ? (
            <Card title={blocking.length ? 'RATES TO FIX' : 'RATES NOT PRICED'}>
              {blocking.length ? <Text>Saving is blocked until the red rates are fixed.</Text> : <Text>These lines are charged as nil and reported on the costing.</Text>}
              {issues.map((entry) => (
                <Text key={entry.field.path}>
                  <span className={SPINE.has(entry.field.path) || (entry.message || '').startsWith('Below zero') || (entry.message || '').startsWith('A margin') ? 'status-error' : 'status-warning'}>
                    {entry.field.label}: {entry.message}
                  </span>
                </Text>
              ))}
            </Card>
          ) : null}

          {accuracy ? <EstimateAccuracyCard summary={accuracy} /> : null}

          <RateReviewCard asAt={rates.asAt} label={(key) => SECTION_TITLES[key] || key} />

          <Card title="THESE RATES">
            <Text>{source === 'saved' && updatedAt ? `Company awning rates, saved ${new Date(updatedAt).toLocaleString()}.` : 'No saved awning rates yet, so the defaults are in use.'}</Text>
            <Text>They apply to everyone, not only this computer.</Text>
            <Text style={{ opacity: 0.7 }}>Saving keeps the rates it replaces, so a costing priced on them can still be reproduced.</Text>
          </Card>
        </>
      }
      actionItems={[
        { hotkey: '⌘+S', body: 'Save', onClick: handleSave },
        { hotkey: '⌘+B', body: 'Back', onClick: () => router.push('/glass/awnings') },
      ]}
    >
      <CardDouble title="PARTS">
        <Text>Prices from the sheet&apos;s parts list. That list was headed &quot;PARTS LIST &amp; COST + 10%&quot;, so the ten percent is already inside these numbers rather than added by the costing.</Text>
        <Input label="THESE PRICES LAST KNOWN GOOD" name="asat_parts" value={rates.asAt.parts} onChange={(event) => updateAsAt('parts', event.target.value)} />
        <RateAgeBadge text={rates.asAt.parts} />
        <br />
        <div style={columns}>{PARTS.map(renderField)}</div>
      </CardDouble>

      <CardDouble title="FIXED QUANTITIES">
        <Text>The sheet fixed these rather than deriving them from the size. Everything else is cut to the glass.</Text>
        <Input label="THESE LAST KNOWN GOOD" name="asat_quantities" value={rates.asAt.quantities} onChange={(event) => updateAsAt('quantities', event.target.value)} />
        <RateAgeBadge text={rates.asAt.quantities} />
        <br />
        <div style={columns}>{QUANTITIES.map(renderField)}</div>
      </CardDouble>

      <CardDouble title="LABOUR">
        <Text>Setup is divided across the run, so a batch of six costs less each than a one-off. The sheet costed labour at $1.25 a minute, which is $75 an hour. The window costing uses $85.</Text>
        <Input label="THESE LAST KNOWN GOOD" name="asat_labour" value={rates.asAt.labour} onChange={(event) => updateAsAt('labour', event.target.value)} />
        <RateAgeBadge text={rates.asAt.labour} />
        <br />
        <div style={columns}>{LABOUR.map(renderField)}</div>
      </CardDouble>

      <CardDouble title="GLASS">
        <Text>The sheet quoted Super Grey toughened only. The other two are on the menu and blank until the shop says what they cost; blank is reported on the costing rather than quoted off the Super Grey price.</Text>
        <Input label="THESE PRICES LAST KNOWN GOOD" name="asat_glass" value={rates.asAt.glass} onChange={(event) => updateAsAt('glass', event.target.value)} />
        <RateAgeBadge text={rates.asAt.glass} />
        <br />
        <div style={columns}>
          {GLAZING_ORDER.map((id) => renderField({ path: `glass.options.${id}.list`, label: DEFAULT_AWNING_RATES.glass.options[id].label, unit: '$ per m²' }))}
          {GLASS_EXTRAS.map(renderField)}
        </div>
      </CardDouble>

      <CardDouble title="MARGIN">
        <Text>The sheet&apos;s margin is a markup on cost, not a gross margin: 0.4 means the price is the cost times 1.4.</Text>
        <Input label="THIS LAST KNOWN GOOD" name="asat_margin" value={rates.asAt.marginRate} onChange={(event) => updateAsAt('marginRate', event.target.value)} />
        <RateAgeBadge text={rates.asAt.marginRate} />
        <br />
        <div style={columns}>{renderField({ path: 'marginRate', label: 'Margin on cost', unit: 'fraction, 0.4 is 40 percent' })}</div>
      </CardDouble>
    </AppFrame>
  );
}
