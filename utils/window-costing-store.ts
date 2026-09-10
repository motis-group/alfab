import { WindowRates, mergeWindowRates } from '@utils/window-costing-rates';
import { LoadedRates, createRatesStore } from '@utils/rates-store';

const store = createRatesStore<WindowRates>('window_costing_rates', mergeWindowRates);

export type LoadedWindowRates = LoadedRates<WindowRates>;

export const loadWindowRates = () => store.load();
export const loadWindowRatesVersion = (updatedAt: string) => store.loadVersion(updatedAt);
/** Saves and returns what the table then holds, so a save that did not land is not announced as one. */
export const saveWindowRates = (rates: WindowRates, expectedUpdatedAt?: string | null) => store.saveAndReload(rates, expectedUpdatedAt);
export const resetWindowRates = () => store.reset();
