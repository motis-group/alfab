import { createClient } from '@utils/db-client';
import { WindowRates, mergeWindowRates } from '@utils/window-costing-rates';

const TABLE = 'window_costing_rates';
const CURRENT_ID = 'default';

/** Archive rows keep the rates that were current before a save, so an old price can be recalculated. */
function versionId(updatedAt: string): string {
  return `v-${updatedAt}`;
}

export interface LoadedWindowRates {
  rates: WindowRates;
  source: 'saved' | 'default';
  /** Stamp of the rates in use. Costings record it so the price can be reproduced later. */
  updatedAt: string | null;
  error: string | null;
}

/** Saved rates merged over the defaults; falls back to the defaults (with the error) when the read fails. */
export async function loadWindowRates(): Promise<LoadedWindowRates> {
  const db = createClient();
  const { data, error } = await db.from(TABLE).select('rates, updated_at').eq('id', CURRENT_ID).maybeSingle();
  if (error) {
    return { rates: mergeWindowRates(null), source: 'default', updatedAt: null, error: error.message };
  }
  if (!data || !data.rates) {
    return { rates: mergeWindowRates(null), source: 'default', updatedAt: null, error: null };
  }
  return { rates: mergeWindowRates(data.rates), source: 'saved', updatedAt: data.updated_at || null, error: null };
}

/**
 * Read the rates a costing was priced on. Returns the current rates when the stamp matches them,
 * the archived copy when it does not, and null when neither exists.
 */
export async function loadWindowRatesVersion(updatedAt: string): Promise<WindowRates | null> {
  const current = await loadWindowRates();
  if (current.updatedAt === updatedAt) {
    return current.rates;
  }

  const db = createClient();
  const { data, error } = await db.from(TABLE).select('rates').eq('id', versionId(updatedAt)).maybeSingle();
  if (error || !data || !data.rates) {
    return null;
  }
  return mergeWindowRates(data.rates);
}

/** Save the rates, keeping the replaced document as an archive row. */
export async function saveWindowRates(rates: WindowRates, expectedUpdatedAt?: string | null): Promise<void> {
  const db = createClient();
  const { data: current, error: readError } = await db.from(TABLE).select('rates, updated_at').eq('id', CURRENT_ID).maybeSingle();
  if (readError) {
    throw new Error(readError.message);
  }

  // Somebody else saved while this page was open. Overwriting would drop their prices with nothing
  // to show it happened.
  // ponytail: read-then-compare, not a conditional update. The gateway takes only eq filters and a
  // shop this size does not have two people in the rates editor at the same second.
  if (expectedUpdatedAt !== undefined && (current?.updated_at || null) !== (expectedUpdatedAt || null)) {
    throw new Error('These rates were saved by someone else while this page was open. Reload to see their changes, then make yours again.');
  }

  if (current?.updated_at && current.rates) {
    const { error: archiveError } = await db.from(TABLE).insert({ id: versionId(current.updated_at), rates: current.rates });
    // A duplicate means this version is already archived, which is fine. Anything else is not.
    if (archiveError && !archiveError.message.includes('duplicate key')) {
      throw new Error(archiveError.message);
    }
  }

  if (current) {
    const { error: updateError } = await db.from(TABLE).update({ rates }).eq('id', CURRENT_ID);
    if (updateError) {
      throw new Error(updateError.message);
    }
    return;
  }

  const { error: insertError } = await db.from(TABLE).insert({ id: CURRENT_ID, rates });
  if (insertError) {
    throw new Error(insertError.message);
  }
}

/** Go back to the code defaults, keeping the document being dropped as an archive row. */
export async function resetWindowRates(): Promise<void> {
  const db = createClient();
  const { data: current, error: readError } = await db.from(TABLE).select('rates, updated_at').eq('id', CURRENT_ID).maybeSingle();
  if (readError) {
    throw new Error(readError.message);
  }

  if (current?.updated_at && current.rates) {
    const { error: archiveError } = await db.from(TABLE).insert({ id: versionId(current.updated_at), rates: current.rates });
    // A duplicate means this version is already archived, which is fine. Anything else is not.
    if (archiveError && !archiveError.message.includes('duplicate key')) {
      throw new Error(archiveError.message);
    }
  }

  const { error } = await db.from(TABLE).delete().eq('id', CURRENT_ID);
  if (error) {
    throw new Error(error.message);
  }
}
