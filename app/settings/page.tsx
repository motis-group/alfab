'use client';

import '@root/global.scss';

import { usePricing } from '@components/PricingProvider';
import RatesEditor, { ExampleImpact } from '@components/RatesEditor';

import { GlassSpecification, calculateCost } from '@utils/calculations';
import { loadGlassRates, mergeGlassRates } from '@utils/glass-rate-store';
import { PricingData, defaultPricingData } from '@utils/glass-rates';
import { GLASS_RATE_CATALOGUE } from '@utils/rate-catalogue';

const EXAMPLE: GlassSpecification = {
  width: 1000,
  height: 1000,
  thickness: 6,
  glassType: 'Clear',
  edgework: 'FLAT POLISH - STRAIGHT',
  ceramicBand: false,
  shape: 'RECTANGLE',
  holes: false,
  numHoles: 0,
  radiusCorners: false,
  scanning: false,
};

function examplePrice(rates: PricingData): number | null {
  try {
    return calculateCost(EXAMPLE, rates).total;
  } catch {
    return null;
  }
}

export default function GlassRatesSettings() {
  const { updatePricingData, resetToDefaults } = usePricing();

  return (
    <RatesEditor
      catalogue={GLASS_RATE_CATALOGUE}
      heading="GLASS RATES"
      listName="glass rates"
      back={{ label: 'BACK TO COSTING', href: '/' }}
      defaults={defaultPricingData}
      load={loadGlassRates}
      save={updatePricingData}
      reset={async () => {
        await resetToDefaults();
        return mergeGlassRates(null);
      }}
      impact={(saved, edited) => <ExampleImpact example="1000 x 1000, 6 mm Clear, flat polish" before={examplePrice(saved)} after={examplePrice(edited)} />}
    />
  );
}
