'use client';

import '@root/global.scss';

import { useEffect, useState } from 'react';

import EstimateAccuracyCard from '@components/EstimateAccuracyCard';
import RatesEditor, { ExampleImpact } from '@components/RatesEditor';

import { costAwning, createAwningInput } from '@utils/awning-costing';
import { AwningRates, DEFAULT_AWNING_RATES, mergeAwningRates } from '@utils/awning-costing-rates';
import { loadAwningRates, resetAwningRates, saveAwningRates } from '@utils/awning-costing-store';
import { AccuracySummary, measureAccuracy } from '@utils/estimate-accuracy';
import { loadMeasuredLines } from '@utils/estimate-accuracy-store';
import { AWNING_RATE_CATALOGUE } from '@utils/rate-catalogue';
import { DEFAULT_WINDOW_RATES } from '@utils/window-costing-rates';

const EXAMPLE = createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 6 });

async function resetToDefaults(): Promise<AwningRates> {
  await resetAwningRates();
  return mergeAwningRates(null);
}

function AwningAccuracy({ rates }: { rates: AwningRates }) {
  const [accuracy, setAccuracy] = useState<AccuracySummary | null>(null);

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

  return accuracy ? <EstimateAccuracyCard summary={accuracy} /> : null;
}

export default function AwningRatesSettings() {
  return (
    <RatesEditor
      catalogue={AWNING_RATE_CATALOGUE}
      heading="AWNING RATES"
      listName="awning rates"
      back={{ label: 'BACK TO AWNING COSTING', href: '/glass/awnings?editLine=1' }}
      defaults={DEFAULT_AWNING_RATES}
      load={loadAwningRates}
      save={saveAwningRates}
      reset={resetToDefaults}
      impact={(saved, edited) => <ExampleImpact example="1220 x 1100 glass, 6 off" before={costAwning(EXAMPLE, saved).price} after={costAwning(EXAMPLE, edited).price} />}
      sidebarExtra={(rates) => <AwningAccuracy rates={rates} />}
    />
  );
}
