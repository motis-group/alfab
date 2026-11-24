'use client';

import { Fragment, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
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
import { RateAgeBadge, RateReviewCard } from '@components/RateAgeNotice';

import { APP_ACCOUNT_SECTION_ITEMS } from '@utils/app-navigation';
import { formatCurrency } from '@utils/order-management';
import { gradeAsAt, needsReview } from '@utils/rate-age';
import { RateCatalogue, RateEntry, RateIssue, RateSection, blockingIssues, findRates, formatRate, listIssues, parseRate, rateAt, sharedByList, summariseSections, withRate } from '@utils/rate-catalogue';
import { LoadedRates } from '@utils/rates-store';
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';

interface RatesDocument {
  asAt: Record<string, string>;
}

interface RatesEditorProps<T extends RatesDocument> {
  catalogue: RateCatalogue;
  heading: string;
  listName: string;
  back: { label: string; href: string };
  defaults: T;
  load: () => Promise<LoadedRates<T>>;
  save: (rates: T, expectedUpdatedAt: string | null) => Promise<LoadedRates<T>>;
  reset: () => Promise<T>;
  impact?: (saved: T, edited: T) => ReactNode;
  groupNote?: (rates: T, entry: RateEntry) => string;
  sidebarExtra?: (rates: T) => ReactNode;
  intro?: ReactNode;
}

export function ExampleImpact({ example, before, after }: { example: string; before: number | null; after: number | null }) {
  const move = before && after != null ? ((after - before) / before) * 100 : null;

  return (
    <>
      <Text>Example: {example}.</Text>
      <RowSpaceBetween>
        <Text>NOW</Text>
        <Text>{before == null ? 'not priced' : formatCurrency(before)}</Text>
      </RowSpaceBetween>
      <RowSpaceBetween>
        <Text>ON THIS EDIT</Text>
        <Text>{after == null ? 'not priced' : formatCurrency(after)}</Text>
      </RowSpaceBetween>
      {move != null ? (
        <Text>
          <span className={Math.abs(move) >= 10 ? 'status-warning' : undefined}>
            {move > 0 ? '+' : ''}
            {move.toFixed(1)}% move.
          </span>
        </Text>
      ) : null}
    </>
  );
}

type Status = { tone: 'success' | 'warning' | 'error'; message: string } | null;

const ISSUES_SHOWN = 12;

type Detail = 'issues' | 'age' | 'terms' | null;

export default function RatesEditor<T extends RatesDocument>({ catalogue, heading, listName, back, defaults, load, save, reset, impact, groupNote, sidebarExtra, intro }: RatesEditorProps<T>) {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [rates, setRates] = useState<T>(defaults);
  const [savedRates, setSavedRates] = useState<T>(defaults);
  const [source, setSource] = useState<'saved' | 'default'>('default');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [sharedShown, setSharedShown] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<Detail>(null);

  const issues = useMemo(() => listIssues(catalogue, rates), [catalogue, rates]);
  const issueAt = useMemo(() => new Map(issues.map((issue) => [issue.path, issue])), [issues]);
  const blocking = blockingIssues(issues);
  const hasChanges = useMemo(() => JSON.stringify(rates) !== JSON.stringify(savedRates), [rates, savedRates]);
  const query = search.trim();
  const found = useMemo(() => findRates(catalogue, query), [catalogue, query]);

  const show = useCallback((loaded: LoadedRates<T>) => {
    setRates(loaded.rates);
    setSavedRates(loaded.rates);
    setSource(loaded.source);
    setUpdatedAt(loaded.updatedAt);
    setDrafts({});
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const user = await fetchCurrentSessionUser();
        if (!user) {
          router.push('/login');
          return;
        }
        setCanWrite(userCan(user, 'pricing:write'));

        const loaded = await load();
        show(loaded);
        if (loaded.error) {
          setStatus({ tone: 'warning', message: `Could not read the saved rates (${loaded.error}). Showing the defaults.` });
        }
      } catch (loadError: any) {
        setStatus({ tone: 'error', message: loadError?.message || `Unable to load the ${listName}.` });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [listName, load, router, show]);

  const jumpTo = useCallback(
    (path: string) => {
      const section = catalogue.entries.find((entry) => entry.path === path)?.section;
      setSearch('');
      setHighlight(path);
      if (section) {
        setOpened((prev) => ({ ...prev, [section]: true }));
      }
      window.setTimeout(() => document.getElementById(`rate-${path}`)?.scrollIntoView({ block: 'center' }), 120);
    },
    [catalogue]
  );

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const hash = decodeURIComponent(window.location.hash.replace('#', ''));
    if (hash.startsWith('rate-')) {
      jumpTo(hash.slice('rate-'.length));
    }
  }, [isLoading, jumpTo]);

  function updateRate(entry: RateEntry, text: string) {
    setDrafts((prev) => ({ ...prev, [entry.path]: text }));
    const parsed = parseRate(entry, text);
    if (parsed !== undefined) {
      setRates((prev) => withRate(prev, entry.path, parsed));
    }
  }

  function updateAsAt(sectionKey: string, value: string) {
    setRates((prev) => ({ ...prev, asAt: { ...prev.asAt, [sectionKey]: value } }));
  }

  async function handleSave() {
    if (!canWrite || !hasChanges) {
      return;
    }
    if (blocking.length) {
      setStatus({ tone: 'error', message: `Fix the ${blocking.length} rate${blocking.length === 1 ? '' : 's'} marked in red.` });
      return;
    }
    try {
      show(await save(rates, updatedAt));
      setStatus({ tone: 'success', message: `Saved the ${listName}.` });
    } catch (saveError: any) {
      setStatus({ tone: 'error', message: saveError?.message || `Unable to save the ${listName}.` });
    }
  }

  async function handleReset() {
    if (!canWrite) {
      return;
    }
    if (source === 'saved' && !window.confirm(`Reset all ${listName} to the defaults? The current rates are archived.`)) {
      return;
    }
    try {
      show({ rates: await reset(), source: 'default', updatedAt: null, error: null });
      setStatus({ tone: 'success', message: `Reset the ${listName} to the defaults.` });
    } catch (resetError: any) {
      setStatus({ tone: 'error', message: resetError?.message || `Unable to reset the ${listName}.` });
    }
  }

  function rateInput(entry: RateEntry) {
    const stored = formatRate(entry, rateAt(rates, entry.path));
    if (entry.shared) {
      return <Input type="number" name={entry.path} aria-label={entry.label} value={stored} readOnly disabled />;
    }
    return <Input type="number" name={entry.path} aria-label={entry.label} value={drafts[entry.path] ?? stored} onChange={(event) => updateRate(entry, event.target.value)} placeholder="blank" step="any" disabled={!canWrite} />;
  }

  function issueText(issue: RateIssue) {
    return <span className={issue.tone === 'error' ? 'status-error' : 'status-warning'}>{issue.message}</span>;
  }

  function renderGrid(section: RateSection, entries: RateEntry[]) {
    const rows = Array.from(new Set(entries.map((entry) => entry.cell?.row ?? '')));
    const flagged = entries.filter((entry) => issueAt.has(entry.path));

    return (
      <>
        <Table>
          <TableRow>
            <TableColumn style={{ width: '26ch' }}>{section.grid?.corner}</TableColumn>
            {section.grid?.columns.map((column) => (
              <TableColumn key={column} style={{ width: '12ch' }}>
                {column} mm
              </TableColumn>
            ))}
          </TableRow>
          {rows.map((row) => (
            <TableRow key={row}>
              <TableColumn>
                <strong>{row}</strong>
              </TableColumn>
              {section.grid?.columns.map((column) => {
                const entry = entries.find((candidate) => candidate.cell?.row === row && candidate.cell?.column === column);
                const issue = entry ? issueAt.get(entry.path) : undefined;
                return (
                  <TableColumn key={column} id={entry ? `rate-${entry.path}` : undefined} className={issue ? (issue.tone === 'error' ? 'rate-cell-error' : 'rate-cell-warning') : highlight === entry?.path ? 'rate-cell-warning' : undefined}>
                    {entry ? rateInput(entry) : <span style={{ opacity: 0.5 }}>—</span>}
                  </TableColumn>
                );
              })}
            </TableRow>
          ))}
        </Table>
        {flagged.map((entry) => (
          <Text key={entry.path}>
            {entry.label}: {issueText(issueAt.get(entry.path) as RateIssue)}
          </Text>
        ))}
      </>
    );
  }

  function renderList(section: RateSection, entries: RateEntry[]) {
    const tucked = query || sharedShown[section.key] ? [] : entries.filter((entry) => entry.shared && !issueAt.has(entry.path) && highlight !== entry.path);
    const shown = entries.filter((entry) => !tucked.includes(entry));

    return (
      <>
        <Table>
          <TableRow>
            <TableColumn style={{ width: '32ch' }}>RATE</TableColumn>
            <TableColumn style={{ width: '16ch' }}>UNIT</TableColumn>
            <TableColumn>VALUE</TableColumn>
          </TableRow>
          {shown.map((entry, index) => {
            const issue = issueAt.get(entry.path);
            const cellClass = issue ? (issue.tone === 'error' ? 'rate-cell-error' : 'rate-cell-warning') : undefined;
            const startsGroup = entry.group && (index === 0 || shown[index - 1].group !== entry.group);

            return (
              <Fragment key={entry.path}>
                {startsGroup ? (
                  <TableRow>
                    <TableColumn>
                      <strong>{entry.group}</strong>
                    </TableColumn>
                    <TableColumn />
                    <TableColumn>{groupNote ? groupNote(rates, entry) : ''}</TableColumn>
                  </TableRow>
                ) : null}
                <TableRow>
                  <TableColumn id={`rate-${entry.path}`} className={cellClass}>
                    {highlight === entry.path ? <span className="status-pill status-pill-warning">{entry.label}</span> : entry.label}
                    {issue ? (
                      <>
                        {' '}
                        <span className={`status-pill ${issue.tone === 'error' ? 'status-pill-error' : 'status-pill-warning'}`}>{issue.badge}</span>
                      </>
                    ) : null}
                  </TableColumn>
                  <TableColumn className={cellClass}>{entry.unit}</TableColumn>
                  <TableColumn className={cellClass}>{rateInput(entry)}</TableColumn>
                </TableRow>
                {entry.shared ? (
                  <TableRow>
                    <TableColumn className={cellClass} colSpan={3}>
                      <span style={{ opacity: 0.7 }}>Set in {entry.shared.list}.</span> <ActionButton onClick={() => router.push(entry.shared?.href ?? '/settings')}>Open</ActionButton>
                    </TableColumn>
                  </TableRow>
                ) : null}
                {issue ? (
                  <TableRow>
                    <TableColumn className={cellClass} colSpan={3}>
                      {issueText(issue)}
                    </TableColumn>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </Table>
        {sharedByList(tucked).map((line) => (
          <Text key={line.href}>
            {line.count} rate{line.count === 1 ? '' : 's'} set in {line.list}. <ActionButton onClick={() => router.push(line.href)}>Open</ActionButton> <ActionButton onClick={() => setSharedShown((prev) => ({ ...prev, [section.key]: true }))}>Show Here</ActionButton>
          </Text>
        ))}
      </>
    );
  }

  const saveLabel = !canWrite ? 'Saving Needs Access' : blocking.length ? `Fix ${blocking.length} Rate${blocking.length === 1 ? '' : 's'} To Save` : hasChanges ? 'Save Changes' : 'No Changes To Save';
  const warnings = issues.length - blocking.length;
  const overview = summariseSections(catalogue, rates);
  const mustOpen = new Set(overview.filter((line) => line.toFix > 0).map((line) => line.key));
  const isOpen = (key: string) => Boolean(query) || mustOpen.has(key) || Boolean(opened[key]);
  const sections = catalogue.sections.map((section) => ({ section, entries: found.filter((entry) => entry.section === section.key) })).filter(({ section, entries }) => entries.length > 0 && isOpen(section.key));
  const sectionTitle = (key: string) => catalogue.sections.find((section) => section.key === key)?.title || key;
  const stale = needsReview(gradeAsAt(rates.asAt, sectionTitle)).length;
  const toggleDetail = (wanted: Detail) => setDetail((current) => (current === wanted ? null : wanted));

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⚙"
      navRight={<ActionButton onClick={() => router.push(back.href)}>{back.label}</ActionButton>}
      heading={heading}
      sectionNavigationItems={APP_ACCOUNT_SECTION_ITEMS}
      badge={isLoading ? 'LOADING' : hasChanges ? 'UNSAVED CHANGES' : source === 'saved' ? 'SAVED RATES' : 'DEFAULT RATES'}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
          <Card title="ACTIONS">
            {canWrite ? (
              <>
                <ActionButton onClick={hasChanges ? handleSave : undefined}>{saveLabel}</ActionButton>
                <br />
                <ActionButton onClick={handleReset}>Reset To Defaults</ActionButton>
              </>
            ) : (
              <Text>{isLoading ? 'Loading.' : 'Read only. Changing rates needs pricing access.'}</Text>
            )}
            {status ? (
              <>
                <br />
                <Text>
                  <span className={`status-${status.tone}`}>{status.message}</span>
                </Text>
              </>
            ) : null}
          </Card>

          {hasChanges && impact ? <Card title="WHAT THIS CHANGES">{impact(savedRates, rates)}</Card> : null}

          {sidebarExtra ? sidebarExtra(rates) : null}
        </>
      }
      actionItems={[
        { hotkey: '⌘+S', body: 'Save', onClick: handleSave },
        { hotkey: '⌘+B', body: 'Back', onClick: () => router.push(back.href) },
      ]}
    >
      <Card title="FIND A RATE">
        <Input label="SEARCH" name="rate_search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="name, group or section" />
        {query ? (
          <Text>
            {found.length} rate{found.length === 1 ? '' : 's'} match. <ActionButton onClick={() => setSearch('')}>Clear Search</ActionButton>
          </Text>
        ) : (
          <Text>{source === 'saved' && updatedAt ? `Saved ${new Date(updatedAt).toLocaleString()}.` : 'Defaults in use; nothing saved yet.'} Blank = not priced. 40 is 40%.</Text>
        )}
        {blocking.length ? <ActionButton onClick={() => toggleDetail('issues')}>{`${blocking.length} To Fix`}</ActionButton> : null}
        {warnings ? <ActionButton onClick={() => toggleDetail('issues')}>{`${warnings} To Check`}</ActionButton> : null}
        {stale ? <ActionButton onClick={() => toggleDetail('age')}>{`${stale} Price Date${stale === 1 ? '' : 's'} Old`}</ActionButton> : null}
        {intro ? <ActionButton onClick={() => toggleDetail('terms')}>What The Terms Mean</ActionButton> : null}
      </Card>

      {detail === 'issues' && issues.length ? (
        <Card title={blocking.length ? 'RATES TO FIX' : 'RATES TO CHECK'}>
          {blocking.length ? (
            <Text>
              <span className="status-error">
                {blocking.length} rate{blocking.length === 1 ? '' : 's'} would make quotes wrong. Saving is blocked until fixed.
              </span>
            </Text>
          ) : null}
          {warnings ? (
            <Text>
              <span className="status-warning">
                {warnings} rate{warnings === 1 ? '' : 's'} to check. A save is not blocked.
              </span>
            </Text>
          ) : null}
          <br />
          <Table>
            {[...blocking, ...issues.filter((issue) => issue.tone !== 'error')].slice(0, ISSUES_SHOWN).map((issue) => (
              <TableRow key={issue.path}>
                <TableColumn style={{ width: '32ch' }}>
                  {issue.label}
                  <br />
                  <span className={issue.tone === 'error' ? 'status-error' : 'status-warning'}>{issue.badge.toUpperCase()}</span>
                </TableColumn>
                <TableColumn>
                  <ActionButton onClick={() => jumpTo(issue.path)}>Show</ActionButton>
                </TableColumn>
              </TableRow>
            ))}
          </Table>
          {issues.length > ISSUES_SHOWN ? <Text>and {issues.length - ISSUES_SHOWN} more.</Text> : null}
        </Card>
      ) : null}
      {detail === 'age' ? <RateReviewCard asAt={rates.asAt} label={sectionTitle} /> : null}
      {detail === 'terms' ? intro : null}

      {query && found.length === 0 ? (
        <Card title="NO MATCHES">
          <Text>No rate matches “{query}”.</Text>
        </Card>
      ) : null}

      {query ? null : (
        <Card title="SECTIONS">
          <Table>
            {overview.map((line) => (
              <TableRow key={line.key}>
                <TableColumn style={{ width: '34ch' }}>{line.title}</TableColumn>
                <TableColumn style={{ width: '12ch' }}>
                  {line.rates} rate{line.rates === 1 ? '' : 's'}
                </TableColumn>
                <TableColumn style={{ width: '24ch' }}>
                  {line.toFix ? <span className="status-error">{line.toFix} TO FIX </span> : null}
                  {line.toCheck ? <span className="status-warning">{line.toCheck} TO CHECK</span> : null}
                  {line.toFix || line.toCheck ? null : 'OK'}
                </TableColumn>
                <TableColumn>{mustOpen.has(line.key) ? null : <ActionButton onClick={() => setOpened((prev) => ({ ...prev, [line.key]: !prev[line.key] }))}>{opened[line.key] ? 'Close' : 'Open'}</ActionButton>}</TableColumn>
              </TableRow>
            ))}
          </Table>
        </Card>
      )}

      {sections.map(({ section, entries }) => {
        const errors = entries.filter((entry) => issueAt.get(entry.path)?.tone === 'error').length;
        const toCheck = entries.filter((entry) => issueAt.get(entry.path)?.tone === 'warning').length;
        const asAt = rates.asAt[section.key] ?? '';

        return (
          <CardDouble key={section.key} title={`${section.title}${errors ? ` — ${errors} TO FIX` : ''}${toCheck ? ` — ${toCheck} TO CHECK` : ''}`}>
            {section.note ? <Text>{section.note}</Text> : null}
            <Input label="PRICES LAST KNOWN GOOD" name={`asat-${section.key}`} value={asAt} onChange={(event) => updateAsAt(section.key, event.target.value)} placeholder="unknown" disabled={!canWrite} />
            <RateAgeBadge text={asAt} />
            <br />
            {section.grid && !query ? renderGrid(section, entries) : renderList(section, entries)}
          </CardDouble>
        );
      })}
    </AppFrame>
  );
}
