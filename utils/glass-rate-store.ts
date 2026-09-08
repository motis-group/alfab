import { PricingData, defaultPricingData } from '@components/PricingProvider';
import { createClient } from '@utils/db-client';

const TABLE = 'glass_costing_rates';
const CURRENT_ID = 'default';

/** Archive rows keep the rates that were current before a save, so an old price can be recalculated. */
function versionId(updatedAt: string): string {
  return `v-${updatedAt}`;
}

export interface LoadedGlassRates {
  rates: PricingData;
  source: 'saved' | 'default';
  /** Stamp of the rates in use, for showing where a price came from. */
  updatedAt: string | null;
  error: string | null;
}

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
      if (current && typeof current === 'object' && value && typeof value === 'object') {
        merge(current as Record<string, unknown>, value as Record<string, unknown>);
      }
    }
  };

  merge(base as unknown as Record<string, unknown>, saved as Record<string, unknown>);
  return base;
}

export async function loadGlassRates(): Promise<LoadedGlassRates> {
  const db = createClient();
  const { data, error } = await db.from(TABLE).select('rates, updated_at').eq('id', CURRENT_ID).maybeSingle();
  if (error) {
    return { rates: mergeGlassRates(null), source: 'default', updatedAt: null, error: error.message };
  }
  if (!data || !data.rates) {
    return { rates: mergeGlassRates(null), source: 'default', updatedAt: null, error: null };
  }
  return { rates: mergeGlassRates(data.rates), source: 'saved', updatedAt: data.updated_at || null, error: null };
}

/** Save the rates, keeping the replaced document as an archive row. */
export async function saveGlassRates(rates: PricingData, expectedUpdatedAt?: string | null): Promise<void> {
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
export async function resetGlassRates(): Promise<void> {
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
