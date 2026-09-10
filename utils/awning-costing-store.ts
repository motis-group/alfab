import { AwningRates, mergeAwningRates } from '@utils/awning-costing-rates';
import { LoadedRates, createRatesStore } from '@utils/rates-store';
import { loadGlassRates } from '@utils/glass-rate-store';
import { loadWindowRates } from '@utils/window-costing-store';
import { applySharedRatesToAwning } from '@utils/shared-rates';

const store = createRatesStore<AwningRates>('awning_costing_rates', mergeAwningRates);

export type LoadedAwningRates = LoadedRates<AwningRates>;

/**
 * The awning rates, with shared glass, banding and flat polish taken from the shop's saved glass
 * price list and the labour rate from the window costing. See loadWindowRates.
 */
export async function loadAwningRates(): Promise<LoadedAwningRates> {
  const [loaded, glass, windows] = await Promise.all([store.load(), loadGlassRates(), loadWindowRates()]);
  if (glass.error) {
    return loaded;
  }

  return {
    ...loaded,
    rates: applySharedRatesToAwning(loaded.rates, {
      basePrices: glass.rates.basePrices,
      ceramicBanding: glass.rates.otherPrices.ceramicBanding ?? null,
      flatPolishPerM: glass.rates.edgeworkPrices['FLAT POLISH - STRAIGHT']?.['4-6'] ?? null,
      labourPerHour: windows.error ? null : windows.rates.labourPerHour,
    }),
  };
}

export const loadAwningRatesVersion = (updatedAt: string) => store.loadVersion(updatedAt);
/** Saves and returns what the table then holds, so a save that did not land is not announced as one. */
export const saveAwningRates = (rates: AwningRates, expectedUpdatedAt?: string | null) => store.saveAndReload(rates, expectedUpdatedAt);
export const resetAwningRates = () => store.reset();
