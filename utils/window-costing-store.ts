import { WindowRates, mergeWindowRates } from '@utils/window-costing-rates';
import { LoadedRates, createRatesStore } from '@utils/rates-store';

const store = createRatesStore<WindowRates>('window_costing_rates', mergeWindowRates);

export type LoadedWindowRates = LoadedRates<WindowRates>;

export const loadWindowRates = () => store.load();
export const loadWindowRatesVersion = (updatedAt: string) => store.loadVersion(updatedAt);
export const saveWindowRates = (rates: WindowRates, expectedUpdatedAt?: string | null) => store.save(rates, expectedUpdatedAt);
export const resetWindowRates = () => store.reset();
