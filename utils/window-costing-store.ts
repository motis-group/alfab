import { WindowRates, mergeWindowRates } from '@utils/window-costing-rates';
import { LoadedRates, createRatesStore } from '@utils/rates-store';
import { loadGlassRates } from '@utils/glass-rate-store';
import { applySharedRatesToWindow } from '@utils/shared-rates';

const store = createRatesStore<WindowRates>('window_costing_rates', mergeWindowRates);

export type LoadedWindowRates = LoadedRates<WindowRates>;

/**
 * The window rates, with shared glass taken from the shop's saved glass price list. mergeWindowRates
 * applies the code defaults; this applies what the shop actually typed, so editing a glass price at
 * Settings moves the window costing with it. A glass list that cannot be read leaves the defaults in
 * place rather than failing the page.
 */
export async function loadWindowRates(): Promise<LoadedWindowRates> {
  const [loaded, glass] = await Promise.all([store.load(), loadGlassRates()]);
  if (glass.error) {
    return loaded;
  }
  return { ...loaded, rates: applySharedRatesToWindow(loaded.rates, glass.rates.basePrices) };
}

export const loadWindowRatesVersion = (updatedAt: string) => store.loadVersion(updatedAt);
/** Saves and returns what the table then holds, so a save that did not land is not announced as one. */
export const saveWindowRates = (rates: WindowRates, expectedUpdatedAt?: string | null) => store.saveAndReload(rates, expectedUpdatedAt);
export const resetWindowRates = () => store.reset();
