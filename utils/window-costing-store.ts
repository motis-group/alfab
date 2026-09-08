import { createClient } from '@utils/db-client';
import { WindowRates, mergeWindowRates } from '@utils/window-costing-rates';

const TABLE = 'window_costing_rates';
const ROW_ID = 'default';

export interface LoadedWindowRates {
  rates: WindowRates;
  source: 'saved' | 'default';
  error: string | null;
}

/** Saved rates merged over the defaults; falls back to the defaults (with the error) when the read fails. */
export async function loadWindowRates(): Promise<LoadedWindowRates> {
  const db = createClient();
  const { data, error } = await db.from(TABLE).select('rates').eq('id', ROW_ID).maybeSingle();
  if (error) {
    return { rates: mergeWindowRates(null), source: 'default', error: error.message };
  }
  if (!data || !data.rates) {
    return { rates: mergeWindowRates(null), source: 'default', error: null };
  }
  return { rates: mergeWindowRates(data.rates), source: 'saved', error: null };
}

export async function saveWindowRates(rates: WindowRates): Promise<void> {
  const db = createClient();
  const { data, error } = await db.from(TABLE).update({ rates }).eq('id', ROW_ID).select('id');
  if (error) {
    throw new Error(error.message);
  }
  if (Array.isArray(data) && data.length > 0) {
    return;
  }
  const { error: insertError } = await db.from(TABLE).insert({ rates });
  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function resetWindowRates(): Promise<void> {
  const db = createClient();
  const { error } = await db.from(TABLE).delete().eq('id', ROW_ID);
  if (error) {
    throw new Error(error.message);
  }
}
