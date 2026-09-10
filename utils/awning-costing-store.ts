import { AwningRates, mergeAwningRates } from '@utils/awning-costing-rates';
import { LoadedRates, createRatesStore } from '@utils/rates-store';

const store = createRatesStore<AwningRates>('awning_costing_rates', mergeAwningRates);

export type LoadedAwningRates = LoadedRates<AwningRates>;

export const loadAwningRates = () => store.load();
export const loadAwningRatesVersion = (updatedAt: string) => store.loadVersion(updatedAt);
/** Saves and returns what the table then holds, so a save that did not land is not announced as one. */
export const saveAwningRates = (rates: AwningRates, expectedUpdatedAt?: string | null) => store.saveAndReload(rates, expectedUpdatedAt);
export const resetAwningRates = () => store.reset();
