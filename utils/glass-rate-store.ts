import { PricingData, defaultPricingData } from '@components/PricingProvider';
import { LoadedRates, createRatesStore } from '@utils/rates-store';

/**
 * Overlay a saved document on the defaults. Numbers only, and a blank is never kept: a missing glass
 * price would read as zero and quietly underquote, the same failure the window rates guard against.
 */
export function mergeGlassRates(saved: unknown): PricingData {
  const base = JSON.parse(JSON.stringify(defaultPricingData)) as PricingData;
  if (!saved || typeof saved !== 'object') {
    return base;
  }

  const merge = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(source)) {
      const current = target[key];
      if (typeof current === 'number') {
        if (typeof value === 'number' && Number.isFinite(value)) {
          target[key] = value;
        }
        continue;
      }
      // The as-at dates are text. Without this they would never survive a save.
      if (typeof current === 'string') {
        if (typeof value === 'string') {
          target[key] = value;
        }
        continue;
      }
      if (current && typeof current === 'object' && value && typeof value === 'object') {
        merge(current as Record<string, unknown>, value as Record<string, unknown>);
      }
    }
  };

  merge(base as unknown as Record<string, unknown>, saved as Record<string, unknown>);
  return base;
}

const store = createRatesStore<PricingData>('glass_costing_rates', mergeGlassRates);

export type LoadedGlassRates = LoadedRates<PricingData>;

export const loadGlassRates = () => store.load();
export const saveGlassRates = (rates: PricingData, expectedUpdatedAt?: string | null) => store.save(rates, expectedUpdatedAt);
export const resetGlassRates = () => store.reset();
