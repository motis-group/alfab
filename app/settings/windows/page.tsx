'use client';

import '@root/global.scss';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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

import { APP_ACCOUNT_SECTION_ITEMS, APP_NAVIGATION_ITEMS } from '@utils/app-navigation';
import { formatCurrency } from '@utils/order-management';
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';
import WindowCostingGlossary from '@components/WindowCostingGlossary';
import { WindowCostingInput, costWindow, extrusionRate } from '@utils/window-costing';
import { WindowRates, mergeWindowRates } from '@utils/window-costing-rates';
import { loadWindowRates, resetWindowRates, saveWindowRates } from '@utils/window-costing-store';
import { RateIssue, checkRateValue } from '@utils/window-rate-health';
import { listWindowCostings } from '@utils/window-quote-store';

const navigationItems = APP_NAVIGATION_ITEMS;

const SECTION_TITLES: Record<string, string> = {
  labourPerHour: 'LABOUR RATE',
  suppliers: 'ALUMINIUM SUPPLIERS',
  extrusions: 'EXTRUSIONS',
  anodising: 'ANODISING & POWDER COAT',
  perMetre: 'MATERIALS BY THE METRE',
  each: 'FIXINGS & FITTINGS',
  glass: 'GLAZING',
  packingPerSqm: 'PACKING',
  labour: 'LABOUR MINUTES',
  margins: 'MARGIN & UPLIFT',
};

const SECTION_NOTES: Record<string, string> = {
  extrusions: 'Price per metre = kg per metre x supplier $ per kg x (1 + loading) x (1 + offcut). Bar stock is priced per bar.',
  anodising: 'Price per metre = etch $ per square metre x the section factor. The minimum charge applies per window.',
  glass: 'A loaded price carries the glass loading (20%, or 15% under Marine Window Service). Blank means not priced.',
  labour: 'Minutes per window: setup is divided by the batch quantity, then per each, then the area factor times the glass area.',
  margins: 'Fractions, so 0.4 is 40%.',
};

/** Structural numbers that are not rates. */
const SKIP_LEAVES = new Set(['mm']);

interface RateField {
  path: string;
  segments: string[];
  group: string;
  label: string;
  unit: string;
  value: number | null;
  issue: RateIssue | null;
}

interface RateSection {
  key: string;
  title: string;
  note: string;
  asAt: string;
  fields: RateField[];
  errors: number;
  warnings: number;
}

function humanise(segment: string): string {
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

/** The unit a rate is measured in, so the editor does not need one column of bare numbers. */
function unitFor(segments: string[]): string {
  const [section, ...rest] = segments;
  const leaf = segments[segments.length - 1];

  if (leaf === 'loading' || leaf === 'loadingMws' || leaf === 'offcut' || leaf === 'margin' || leaf === 'marginMws' || leaf === 'uplift' || leaf === 'areaK') {
    return 'fraction';
  }

  switch (section) {
    case 'labourPerHour':
      return '$ per hour';
    case 'packingPerSqm':
      return '$ per sqm';
    case 'suppliers':
      return '$ per kg';
    case 'extrusions':
      if (leaf === 'kgPerM') return 'kg per metre';
      if (leaf === 'barPrice') return '$ per bar';
      if (leaf === 'barLength') return 'metres';
      return '';
    case 'anodising':
      if (rest[0] === 'factor') return 'sqm per metre';
      if (rest[0] === 'trimEtch' || rest[0] === 'trimBlack') return '$ per metre';
      if (leaf === 'etchPerSqm') return '$ per sqm';
      if (leaf === 'etchMin') return '$ minimum';
      if (leaf === 'powderPerM') return '$ per metre';
      return '';
    case 'perMetre':
      return '$ per metre';
    case 'each':
      return '$ each';
    case 'glass':
      if (rest[0] === 'options') return '$ per sqm';
      if (rest[0] === 'processing') return leaf === 'flatSmooth' || leaf === 'flatGround' ? '$ per metre' : '$ each';
      return '';
    case 'labour':
      return leaf === 'perSqm' ? 'minutes per sqm' : 'minutes';
    default:
      return '';
  }
}

function collectFields(value: unknown, segments: string[], out: RateField[]): void {
  if (typeof value === 'number' || value === null) {
    const leaf = segments[segments.length - 1];
    if (SKIP_LEAVES.has(leaf)) {
      return;
    }
    const path = segments.join('.');
    out.push({
      path,
      segments,
      group: segments.length > 2 ? segments[1] : '',
      label: segments.length > 2 ? segments.slice(2).map(humanise).join(' / ') : humanise(leaf),
      unit: unitFor(segments),
      value,
      issue: checkRateValue(path, value),
    });
    return;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectFields(child, [...segments, key], out);
    }
  }
}

function buildSections(rates: WindowRates): RateSection[] {
  return Object.entries(rates)
    // A blanked top-level rate is null, which is still a field to show. Without the explicit null the
    // section would disappear and the value could not be typed back in.
    .filter(([key, value]) => key !== 'asAt' && (typeof value === 'number' || value === null || (value && typeof value === 'object')))
    .map(([key, value]) => {
      const fields: RateField[] = [];
      collectFields(value, [key], fields);
      return {
        key,
        title: SECTION_TITLES[key] || key.toUpperCase(),
        note: SECTION_NOTES[key] || '',
        asAt: rates.asAt?.[key] || '',
        fields,
        errors: fields.filter((field) => field.issue?.tone === 'error').length,
        warnings: fields.filter((field) => field.issue?.tone === 'warning').length,
      };
    })
    .filter((section) => section.fields.length > 0);
}

function setAtPath(rates: WindowRates, segments: string[], value: number | string | null): WindowRates {
  const next = JSON.parse(JSON.stringify(rates)) as WindowRates;
  let cursor = next as unknown as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
  return next;
}

export default function WindowRatesSettings() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [rates, setRates] = useState<WindowRates>(() => mergeWindowRates(null));
  const [savedRates, setSavedRates] = useState<WindowRates>(() => mergeWindowRates(null));
  const [source, setSource] = useState<'saved' | 'default'>('default');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  // Raw text per field while editing, so a partly typed decimal is not reformatted under the cursor.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Real saved costings, repriced on the edit, so the effect of a rate change is visible before saving.
  const [samples, setSamples] = useState<Array<{ id: string; name: string; input: WindowCostingInput }>>([]);

  const sections = useMemo(() => buildSections(rates), [rates]);
  const hasChanges = useMemo(() => JSON.stringify(rates) !== JSON.stringify(savedRates), [rates, savedRates]);

  const allIssues = useMemo(() => sections.flatMap((section) => section.fields.map((field) => field.issue).filter(Boolean) as RateIssue[]), [sections]);
  const errorCount = allIssues.filter((issue) => issue.tone === 'error').length;
  const warningCount = allIssues.length - errorCount;
  const issueLabel = (field: RateField) => `${field.group ? `${humanise(field.group)} / ` : ''}${field.label}`;

  // What this edit does to real quotes. The golden windows would barely move; saved costings do.
  const impact = useMemo(() => {
    if (!hasChanges || !samples.length) {
      return [];
    }
    return samples
      .map((sample) => {
        const before = costWindow(sample.input, savedRates).price;
        const after = costWindow(sample.input, rates).price;
        const delta = before == null || after == null ? null : after - before;
        return { ...sample, before, after, delta, percent: delta == null || !before ? null : (delta / before) * 100 };
      })
      .filter((row) => row.delta === null || Math.abs(row.delta) >= 0.01)
      .sort((a, b) => Math.abs(b.percent ?? 0) - Math.abs(a.percent ?? 0));
  }, [hasChanges, rates, samples, savedRates]);

  const query = search.trim().toLowerCase();
  const visibleSections = useMemo(() => {
    if (!query) {
      return sections;
    }
    return sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => `${section.title} ${field.group} ${field.label} ${field.path}`.toLowerCase().includes(query)),
      }))
      .filter((section) => section.fields.length > 0);
  }, [query, sections]);
  const matchCount = visibleSections.reduce((sum, section) => sum + section.fields.length, 0);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const user = await fetchCurrentSessionUser();
        if (!user) {
          router.push('/login');
          return;
        }
        setCanEdit(userCan(user, 'pricing:write'));

        listWindowCostings()
          .then((costings) => setSamples(costings.slice(0, 20).map((costing) => ({ id: costing.id, name: costing.name, input: costing.input }))))
          .catch(() => setSamples([]));

        const loaded = await loadWindowRates();
        setRates(loaded.rates);
        setSavedRates(loaded.rates);
        setSource(loaded.source);
        setUpdatedAt(loaded.updatedAt);
        if (loaded.error) {
          setStatus({ tone: 'warning', message: `Could not read the saved rates (${loaded.error}). Showing the defaults.` });
        }
      } catch (loadError: any) {
        setStatus({ tone: 'error', message: loadError?.message || 'Unable to load the window rates.' });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  // The costing page links straight to the rate behind an unpriced line.
  useEffect(() => {
    if (isLoading || typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash.replace('#', '');
    if (!hash.startsWith('rate-')) {
      return;
    }
    const path = hash.slice('rate-'.length);
    setHighlight(path);
    setSearch(path.split('.').pop() || '');
    window.setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: 'center' }), 60);
  }, [isLoading]);

  const updateField = useCallback((field: RateField, raw: string) => {
    setDrafts((prev) => ({ ...prev, [field.path]: raw }));
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && !Number.isFinite(parsed)) {
      return;
    }
    setRates((prev) => setAtPath(prev, field.segments, parsed));
  }, []);

  function updateAsAt(sectionKey: string, value: string) {
    setRates((prev) => ({ ...prev, asAt: { ...prev.asAt, [sectionKey]: value } }));
  }

  async function handleSave() {
    if (!canEdit || !hasChanges) {
      return;
    }
    if (errorCount > 0) {
      setStatus({ tone: 'error', message: `Fix the ${errorCount} rate${errorCount === 1 ? '' : 's'} marked in red first. Saved as they are, every quote would come out too low without any warning.` });
      return;
    }
    try {
      await saveWindowRates(rates, updatedAt);
      const loaded = await loadWindowRates();
      setRates(loaded.rates);
      setSavedRates(loaded.rates);
      setSource(loaded.source);
      setUpdatedAt(loaded.updatedAt);
      setDrafts({});
      setStatus({ tone: 'success', message: 'Window rates saved. The rates they replaced are kept, so earlier costings can still be recalculated.' });
    } catch (saveError: any) {
      setStatus({ tone: 'error', message: saveError?.message || 'Unable to save the window rates.' });
    }
  }

  async function handleReset() {
    if (!canEdit) {
      return;
    }
    if (source === 'saved' && !window.confirm('Reset throws away the whole company price list and goes back to the numbers the legacy sheet shipped with. The list being dropped is kept as an archive row, but every price typed since then is gone from the editor. Reset?')) {
      return;
    }
    try {
      await resetWindowRates();
      const defaults = mergeWindowRates(null);
      setRates(defaults);
      setSavedRates(defaults);
      setDrafts({});
      setSource('default');
      setUpdatedAt(null);
      setStatus({ tone: 'success', message: 'Window rates reset to the code defaults.' });
    } catch (resetError: any) {
      setStatus({ tone: 'error', message: resetError?.message || 'Unable to reset the window rates.' });
    }
  }

  function groupNote(sectionKey: string, group: string): string {
    if (sectionKey !== 'extrusions' || !group) {
      return '';
    }
    const rate = extrusionRate(rates, group);
    return rate == null ? 'not priced' : `${formatCurrency(rate)} per metre`;
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⚙"
      navigationItems={navigationItems}
      navLabel="WINDOW RATES"
      navRight={<ActionButton onClick={() => router.push('/glass/windows')}>WINDOW COSTING</ActionButton>}
      heading="WINDOW RATES"
      sectionNavigationItems={APP_ACCOUNT_SECTION_ITEMS}
      badge={isLoading ? 'LOADING' : hasChanges ? 'UNSAVED CHANGES' : source === 'saved' ? 'SAVED RATES' : 'DEFAULT RATES'}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
          <Card title="ACTIONS">
            {canEdit ? (
              <>
                <ActionButton onClick={hasChanges ? handleSave : undefined}>{errorCount ? `Fix ${errorCount} Rate${errorCount === 1 ? '' : 's'} To Save` : hasChanges ? 'Save Changes' : 'No Changes to Save'}</ActionButton>
                <br />
                <ActionButton onClick={handleReset}>Reset to Defaults</ActionButton>
              </>
            ) : (
              <Text>Read only. An admin can change these rates.</Text>
            )}
            {status ? (
              <>
                <br />
                <Text>
                  <span className={status.tone === 'success' ? 'status-success' : status.tone === 'warning' ? 'status-warning' : 'status-error'}>{status.message}</span>
                </Text>
              </>
            ) : null}
          </Card>

          {hasChanges ? (
            <Card title="WHAT THIS CHANGES">
              {impact.length ? (
                <>
                  <Text>
                    {impact.length} of the last {samples.length} saved costing{samples.length === 1 ? '' : 's'} move{impact.length === 1 ? 's' : ''}.
                  </Text>
                  <Table>
                    <TableRow>
                      <TableColumn style={{ width: '24ch' }}>COSTING</TableColumn>
                      <TableColumn style={{ width: '12ch' }}>NOW</TableColumn>
                      <TableColumn style={{ width: '12ch' }}>AFTER</TableColumn>
                      <TableColumn>CHANGE</TableColumn>
                    </TableRow>
                    {impact.map((row) => (
                      <TableRow key={row.id}>
                        <TableColumn>{row.name}</TableColumn>
                        <TableColumn>{formatCurrency(row.before)}</TableColumn>
                        <TableColumn>{formatCurrency(row.after)}</TableColumn>
                        <TableColumn>
                          <span className={Math.abs(row.percent ?? 0) >= 10 ? 'status-warning' : undefined}>
                            {row.percent == null ? 'not priced' : `${row.percent > 0 ? '+' : ''}${row.percent.toFixed(1)}%`}
                          </span>
                        </TableColumn>
                      </TableRow>
                    ))}
                  </Table>
                </>
              ) : (
                <Text>{samples.length ? 'No saved costing changes price.' : 'No saved costings to price against. Save one from the costing page.'}</Text>
              )}
            </Card>
          ) : null}

          {allIssues.length ? (
            <Card title={errorCount ? 'RATES TO FIX' : 'RATES NOT PRICED'}>
              {errorCount ? (
                <Text>
                  <span className="status-error">
                    {errorCount} rate{errorCount === 1 ? '' : 's'} would make every quote wrong. Saving is blocked until they are fixed.
                  </span>
                </Text>
              ) : null}
              {warningCount ? (
                <Text>
                  <span className="status-warning">
                    {warningCount} rate{warningCount === 1 ? '' : 's'} not priced. Those lines are charged as nil.
                  </span>
                </Text>
              ) : null}
              <br />
              <Table>
                {allIssues
                  .slice()
                  .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'error' ? -1 : 1))
                  .slice(0, 12)
                  .map((issue) => (
                    <TableRow key={issue.path}>
                      <TableColumn style={{ width: '32ch' }}>
                        {issue.path}
                        <br />
                        <span className={issue.tone === 'error' ? 'status-error' : 'status-warning'}>{issue.badge.toUpperCase()}</span>
                      </TableColumn>
                      <TableColumn>
                        <ActionButton
                          onClick={() => {
                            setSearch(issue.path.split('.').pop() || '');
                            setHighlight(issue.path);
                            if (typeof window !== 'undefined') {
                              window.setTimeout(() => document.getElementById(`rate-${issue.path}`)?.scrollIntoView({ block: 'center' }), 60);
                            }
                          }}
                        >
                          Show
                        </ActionButton>
                      </TableColumn>
                    </TableRow>
                  ))}
              </Table>
              {allIssues.length > 12 ? <Text>and {allIssues.length - 12} more.</Text> : null}
            </Card>
          ) : null}

          <Card title="FIND A RATE">
            <Input label="SEARCH" name="rate_search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="stays, anodising, T5573" />
            {query ? <Text>{matchCount} rate{matchCount === 1 ? '' : 's'} match.</Text> : null}
            {query ? (
              <>
                <br />
                <ActionButton
                  onClick={() => {
                    setSearch('');
                    setHighlight(null);
                  }}
                >
                  Clear Search
                </ActionButton>
              </>
            ) : null}
          </Card>

          <Card title="ABOUT">
            <Text>Rates behind the Window Costing page, taken from the legacy costing sheet on the Victorian basis.</Text>
            <br />
            <Text>Blank means not priced: the costing warns and charges the line as nil.</Text>
            <br />
            <Text>{source === 'saved' && updatedAt ? `Saved ${new Date(updatedAt).toLocaleString()}.` : 'No saved rates yet, so the code defaults are in use.'}</Text>
          </Card>
        </>
      }
      actionItems={[
        {
          hotkey: '⌘+S',
          body: 'Save',
          onClick: handleSave,
        },
        {
          hotkey: '⌘+B',
          body: 'Back',
          onClick: () => router.push('/glass/windows'),
        },
      ]}
    >
      {visibleSections.length === 0 ? (
        <Card title="NO MATCHES">
          <Text>No rate matches “{search.trim()}”.</Text>
        </Card>
      ) : null}

      {query ? null : (
        <CardDouble title="WHAT THESE TERMS MEAN">
          <Text>The costing keeps the legacy sheet's words. These are what they mean.</Text>
          <br />
          <WindowCostingGlossary groups={['price']} openGroup="price" />
        </CardDouble>
      )}

      {visibleSections.map((section) => (
        <CardDouble key={section.key} title={`${section.title}${section.errors ? ` — ${section.errors} TO FIX` : ''}${section.warnings ? ` — ${section.warnings} NOT PRICED` : ''}`}>
          {section.note ? (
            <>
              <Text>{section.note}</Text>
              <br />
            </>
          ) : null}

          {canEdit ? (
            <Input label="PRICES AS AT" name={`asat-${section.key}`} value={section.asAt} onChange={(event) => updateAsAt(section.key, event.target.value)} placeholder="unknown" />
          ) : (
            <Text>Prices as at: {section.asAt || 'unknown'}</Text>
          )}

          <Table>
            <TableRow>
              <TableColumn style={{ width: '34ch' }}>RATE</TableColumn>
              <TableColumn style={{ width: '18ch' }}>UNIT</TableColumn>
              <TableColumn>VALUE</TableColumn>
            </TableRow>
            {section.fields.map((field, index) => {
              const showGroup = field.group && (index === 0 || section.fields[index - 1].group !== field.group);
              const isHighlighted = highlight === field.path;
              const cellClass = field.issue ? (field.issue.tone === 'error' ? 'rate-cell-error' : 'rate-cell-warning') : undefined;

              return (
                <Fragment key={field.path}>
                  {showGroup ? (
                    <TableRow>
                      <TableColumn>
                        <strong>{humanise(field.group)}</strong>
                      </TableColumn>
                      <TableColumn />
                      <TableColumn>{groupNote(section.key, field.group)}</TableColumn>
                    </TableRow>
                  ) : null}
                  <TableRow>
                    <TableColumn id={`rate-${field.path}`} className={cellClass}>
                      {isHighlighted ? <span className="status-pill status-pill-warning">{field.label}</span> : field.label}
                      {field.issue ? (
                        <>
                          {' '}
                          <span className={`status-pill ${field.issue.tone === 'error' ? 'status-pill-error' : 'status-pill-warning'}`}>{field.issue.badge}</span>
                        </>
                      ) : null}
                    </TableColumn>
                    <TableColumn className={cellClass}>{field.unit}</TableColumn>
                    <TableColumn className={cellClass}>
                      <Input
                        type="number"
                        name={field.path}
                        value={drafts[field.path] ?? (field.value == null ? '' : String(field.value))}
                        onChange={(event) => updateField(field, event.target.value)}
                        placeholder="not priced"
                        step="0.001"
                        disabled={!canEdit}
                      />
                    </TableColumn>
                  </TableRow>
                  {field.issue ? (
                    <TableRow>
                      <TableColumn className={cellClass} colSpan={3}>
                        <span className={field.issue.tone === 'error' ? 'status-error' : 'status-warning'}>{field.issue.message}</span>
                      </TableColumn>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </Table>
        </CardDouble>
      ))}
    </AppFrame>
  );
}
