'use client';

import '@root/global.scss';

import { Fragment, useEffect, useMemo, useState } from 'react';
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
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';
import { WindowRates, mergeWindowRates } from '@utils/window-costing-rates';
import { loadWindowRates, resetWindowRates, saveWindowRates } from '@utils/window-costing-store';

const navigationItems = APP_NAVIGATION_ITEMS;

// Section titles keyed by the top-level rates key; anything else falls back to the key itself.
const SECTION_TITLES: Record<string, string> = {
  labourPerHour: 'LABOUR RATE ($ PER HOUR)',
  suppliers: 'ALUMINIUM SUPPLIERS ($/KG, LOADING)',
  extrusions: 'EXTRUSIONS (KG/M, OFFCUT, BAR $)',
  anodising: 'ANODISING',
  perMetre: 'PER METRE ITEMS ($/M)',
  each: 'PER ITEM ($ EACH / PAIR / SET)',
  glass: 'GLAZING ($/SQM LIST, PROCESSING)',
  packingPerSqm: 'PACKING ($ PER SQM)',
  labour: 'LABOUR MINUTES',
  margins: 'MARGIN & UPLIFT (FRACTIONS)',
};

// Structural numbers that are not rates.
const SKIP_KEYS = new Set(['mm']);

interface RateField {
  path: string[];
  group: string;
  label: string;
  value: number | null;
}

interface RateSection {
  key: string;
  title: string;
  fields: RateField[];
}

function humanise(segment: string): string {
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

function collectFields(value: unknown, path: string[], out: RateField[]): void {
  if (typeof value === 'number' || value === null) {
    if (SKIP_KEYS.has(path[path.length - 1])) {
      return;
    }
    out.push({
      path,
      group: path.length > 2 ? path[1] : '',
      label: path.length > 2 ? path.slice(2).map(humanise).join(' › ') : humanise(path[path.length - 1]),
      value,
    });
    return;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectFields(child, [...path, key], out);
    }
  }
}

function buildSections(rates: WindowRates): RateSection[] {
  return Object.entries(rates)
    .filter(([, value]) => typeof value === 'number' || (value && typeof value === 'object'))
    .map(([key, value]) => {
      const fields: RateField[] = [];
      collectFields(value, [key], fields);
      return { key, title: SECTION_TITLES[key] || key.toUpperCase(), fields };
    })
    .filter((section) => section.fields.length > 0);
}

function setAtPath(rates: WindowRates, path: string[], value: number | null): WindowRates {
  const next = JSON.parse(JSON.stringify(rates)) as WindowRates;
  let cursor = next as unknown as Record<string, unknown>;
  for (const segment of path.slice(0, -1)) {
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  return next;
}

export default function WindowRatesSettings() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [rates, setRates] = useState<WindowRates>(() => mergeWindowRates(null));
  const [savedRates, setSavedRates] = useState<WindowRates>(() => mergeWindowRates(null));
  const [source, setSource] = useState<'saved' | 'default'>('default');
  const [status, setStatus] = useState<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null);
  // Raw text per field while editing, so a partially typed decimal is not reformatted under the cursor.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const sections = useMemo(() => buildSections(rates), [rates]);
  const hasChanges = useMemo(() => JSON.stringify(rates) !== JSON.stringify(savedRates), [rates, savedRates]);

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

        const loaded = await loadWindowRates();
        setRates(loaded.rates);
        setSavedRates(loaded.rates);
        setSource(loaded.source);
        if (loaded.error) {
          setStatus({ tone: 'warning', message: `Could not read saved rates (${loaded.error}); showing defaults.` });
        }
      } catch (loadError: any) {
        setStatus({ tone: 'error', message: loadError?.message || 'Unable to load window rates.' });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  function updateField(path: string[], raw: string) {
    const key = path.join('.');
    setDrafts((prev) => ({ ...prev, [key]: raw }));
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && !Number.isFinite(parsed)) {
      return;
    }
    setRates((prev) => setAtPath(prev, path, parsed));
  }

  async function handleSave() {
    if (!canEdit || !hasChanges) {
      return;
    }
    try {
      await saveWindowRates(rates);
      setSavedRates(rates);
      setDrafts({});
      setSource('saved');
      setStatus({ tone: 'success', message: 'Window rates saved.' });
    } catch (saveError: any) {
      setStatus({ tone: 'error', message: saveError?.message || 'Unable to save window rates.' });
    }
  }

  async function handleReset() {
    if (!canEdit) {
      return;
    }
    try {
      await resetWindowRates();
      const defaults = mergeWindowRates(null);
      setRates(defaults);
      setSavedRates(defaults);
      setDrafts({});
      setSource('default');
      setStatus({ tone: 'success', message: 'Window rates reset to the code defaults.' });
    } catch (resetError: any) {
      setStatus({ tone: 'error', message: resetError?.message || 'Unable to reset window rates.' });
    }
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
                <ActionButton onClick={hasChanges ? handleSave : undefined}>{hasChanges ? 'Save Changes' : 'No Changes to Save'}</ActionButton>
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

          <Card title="ABOUT">
            <Text>Rates behind the Window Costing page, transcribed from the legacy costing sheet (Victorian basis). Blank means not priced: the costing shows a warning and treats the line as $0.</Text>
            <br />
            <Text>Extrusion $/m = kg/m × $/kg × (1 + loading) × (1 + offcut). Anodising $/m = etch $/sqm × section factor. Loaded glass prices carry the glass loading (15% under Marine Window Service).</Text>
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
      {sections.map((section) => (
        <CardDouble key={section.key} title={section.title}>
          <Table>
            {section.fields.map((field, index) => {
              const showGroup = field.group && (index === 0 || section.fields[index - 1].group !== field.group);
              return (
                <Fragment key={field.path.join('.')}>
                  {showGroup ? (
                    <TableRow>
                      <TableColumn>
                        <strong>{humanise(field.group)}</strong>
                      </TableColumn>
                      <TableColumn />
                    </TableRow>
                  ) : null}
                  <TableRow>
                    <TableColumn style={{ width: '36ch' }}>{field.label}</TableColumn>
                    <TableColumn>
                      <Input type="number" name={field.path.join('-')} value={drafts[field.path.join('.')] ?? (field.value == null ? '' : String(field.value))} onChange={(event) => updateField(field.path, event.target.value)} placeholder="not priced" step="0.001" disabled={!canEdit} />
                    </TableColumn>
                  </TableRow>
                </Fragment>
              );
            })}
          </Table>
        </CardDouble>
      ))}
    </AppFrame>
  );
}
