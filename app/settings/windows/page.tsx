'use client';

import '@root/global.scss';

import { useEffect, useState } from 'react';

import CardDouble from '@components/CardDouble';
import EstimateAccuracyCard from '@components/EstimateAccuracyCard';
import RatesEditor from '@components/RatesEditor';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';
import WindowCostingGlossary from '@components/WindowCostingGlossary';

import { DEFAULT_AWNING_RATES } from '@utils/awning-costing-rates';
import { AccuracySummary, measureAccuracy } from '@utils/estimate-accuracy';
import { loadMeasuredLines } from '@utils/estimate-accuracy-store';
import { formatCurrency } from '@utils/order-management';
import { RateEntry, WINDOW_RATE_CATALOGUE } from '@utils/rate-catalogue';
import { WindowCostingInput, costWindow, extrusionRate } from '@utils/window-costing';
import { DEFAULT_WINDOW_RATES, WindowRates, mergeWindowRates } from '@utils/window-costing-rates';
import { loadWindowRates, resetWindowRates, saveWindowRates } from '@utils/window-costing-store';
import { listWindowCostings } from '@utils/window-quote-store';

interface Sample {
  id: string;
  name: string;
  input: WindowCostingInput;
}

const SAMPLES_REPRICED = 20;

async function resetToDefaults(): Promise<WindowRates> {
  await resetWindowRates();
  return mergeWindowRates(null);
}

function extrusionNote(rates: WindowRates, entry: RateEntry): string {
  if (entry.section !== 'extrusions') {
    return '';
  }
  const rate = extrusionRate(rates, entry.groupKey);
  return rate == null ? 'not priced' : `${formatCurrency(rate)} per metre`;
}

function WindowAccuracy({ rates }: { rates: WindowRates }) {
  const [accuracy, setAccuracy] = useState<AccuracySummary | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const measured = await loadMeasuredLines();
        setAccuracy(measureAccuracy(measured, rates, DEFAULT_AWNING_RATES).find((entry) => entry.kind === 'window') || null);
      } catch {
        setAccuracy(null);
      }
    })();
  }, [rates]);

  return accuracy ? <EstimateAccuracyCard summary={accuracy} /> : null;
}

function SavedCostingImpact({ samples, saved, edited }: { samples: Sample[]; saved: WindowRates; edited: WindowRates }) {
  const moved = samples
    .map((sample) => {
      const before = costWindow(sample.input, saved).price;
      const after = costWindow(sample.input, edited).price;
      const delta = before == null || after == null ? null : after - before;
      return { ...sample, before, after, delta, percent: delta == null || !before ? null : (delta / before) * 100 };
    })
    .filter((row) => row.delta === null || Math.abs(row.delta) >= 0.01)
    .sort((a, b) => Math.abs(b.percent ?? 0) - Math.abs(a.percent ?? 0));

  if (!moved.length) {
    return <Text>{samples.length ? 'No saved costing changes price.' : 'No saved costings.'}</Text>;
  }

  return (
    <>
      <Text>
        {moved.length} of the last {samples.length} saved costing{samples.length === 1 ? '' : 's'} move{moved.length === 1 ? 's' : ''}.
      </Text>
      <Table>
        <TableRow>
          <TableColumn style={{ width: '24ch' }}>COSTING</TableColumn>
          <TableColumn style={{ width: '12ch' }}>NOW</TableColumn>
          <TableColumn style={{ width: '12ch' }}>AFTER</TableColumn>
          <TableColumn>CHANGE</TableColumn>
        </TableRow>
        {moved.map((row) => (
          <TableRow key={row.id}>
            <TableColumn>{row.name}</TableColumn>
            <TableColumn>{formatCurrency(row.before)}</TableColumn>
            <TableColumn>{formatCurrency(row.after)}</TableColumn>
            <TableColumn>
              <span className={Math.abs(row.percent ?? 0) >= 10 ? 'status-warning' : undefined}>{row.percent == null ? 'not priced' : `${row.percent > 0 ? '+' : ''}${row.percent.toFixed(1)}%`}</span>
            </TableColumn>
          </TableRow>
        ))}
      </Table>
    </>
  );
}

export default function WindowRatesSettings() {
  const [samples, setSamples] = useState<Sample[]>([]);

  useEffect(() => {
    listWindowCostings()
      .then((costings) => setSamples(costings.slice(0, SAMPLES_REPRICED).map((costing) => ({ id: costing.id, name: costing.name, input: costing.input }))))
      .catch(() => setSamples([]));
  }, []);

  return (
    <RatesEditor
      catalogue={WINDOW_RATE_CATALOGUE}
      heading="WINDOW RATES"
      listName="window rates"
      back={{ label: 'WINDOW COSTING', href: '/glass/windows?editLine=1' }}
      defaults={DEFAULT_WINDOW_RATES}
      load={loadWindowRates}
      save={saveWindowRates}
      reset={resetToDefaults}
      impact={(saved, edited) => <SavedCostingImpact samples={samples} saved={saved} edited={edited} />}
      groupNote={extrusionNote}
      sidebarExtra={(rates) => <WindowAccuracy rates={rates} />}
      intro={
        <CardDouble title="WHAT THESE TERMS MEAN">
          <Text>Terms used by the legacy sheet.</Text>
          <br />
          <WindowCostingGlossary groups={['price']} openGroup="price" />
        </CardDouble>
      }
    />
  );
}
