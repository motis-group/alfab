/**
 * One JSON rates document per table, with the document it replaced kept as an archive row so an old
 * price can be reproduced. Glass, window and awning rates all work this way; this is the one copy of
 * the behaviour.
 *
 * The archive id is built from `updated_at`, so every table used here needs the `set_updated_at`
 * trigger. Without it the stamp never advances, the second save writes an archive id that already
 * exists, and every save after the first archives nothing. See docs/order-management-schema.sql.
 */

import { createClient } from '@utils/db-client';

/** Archive rows keep the rates that were current before a save. */
function versionId(updatedAt: string): string {
  return `v-${updatedAt}`;
}

const CURRENT_ID = 'default';

export interface LoadedRates<T> {
  rates: T;
  source: 'saved' | 'default';
  /** Stamp of the rates in use. Costings record it so the price can be reproduced later. */
  updatedAt: string | null;
  error: string | null;
}

export interface RatesStore<T> {
  /** Saved rates merged over the defaults; falls back to the defaults (with the error) when the read fails. */
  load(): Promise<LoadedRates<T>>;
  /**
   * Read the rates a costing was priced on. Returns the current rates when the stamp matches them,
   * the archived copy when it does not, and null when neither exists.
   */
  loadVersion(updatedAt: string): Promise<T | null>;
  /** Save the rates, keeping the replaced document as an archive row. */
  save(rates: T, expectedUpdatedAt?: string | null): Promise<void>;
  /**
   * Save, then read back what the table now holds and prove the write landed. Throws when it cannot
   * be proved. Returns the reloaded rates, so an editor shows what is stored rather than what it
   * sent — the two differ wherever `merge` puts a default back under a blank.
   */
  saveAndReload(rates: T, expectedUpdatedAt?: string | null): Promise<LoadedRates<T>>;
  /** Go back to the code defaults, keeping the document being dropped as an archive row. */
  reset(): Promise<void>;
}

/** Move the current document into an archive row, if there is one to move. */
async function archiveCurrent(table: string, current: { updated_at?: string | null; rates?: unknown } | null): Promise<void> {
  if (!current?.updated_at || !current.rates) {
    return;
  }

  const db = createClient();
  const { error } = await db.from(table).insert({ id: versionId(current.updated_at), rates: current.rates });
  // A duplicate means this version is already archived, which is fine. Anything else is not.
  if (error && !error.message.includes('duplicate key')) {
    throw new Error(error.message);
  }
}

async function readCurrent(table: string) {
  const db = createClient();
  const { data, error } = await db.from(table).select('rates, updated_at').eq('id', CURRENT_ID).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data as { rates?: unknown; updated_at?: string | null } | null;
}

/**
 * A rates store for one table. `merge` overlays a saved document on the code defaults, and is the
 * guard that stops a blank from being read as zero and quoting the job short.
 */
export function createRatesStore<T>(table: string, merge: (saved: unknown) => T): RatesStore<T> {
  return {
    async load(): Promise<LoadedRates<T>> {
      const db = createClient();
      const { data, error } = await db.from(table).select('rates, updated_at').eq('id', CURRENT_ID).maybeSingle();
      if (error) {
        return { rates: merge(null), source: 'default', updatedAt: null, error: error.message };
      }
      if (!data || !data.rates) {
        return { rates: merge(null), source: 'default', updatedAt: null, error: null };
      }
      return { rates: merge(data.rates), source: 'saved', updatedAt: data.updated_at || null, error: null };
    },

    async loadVersion(updatedAt: string): Promise<T | null> {
      const current = await this.load();
      if (current.updatedAt === updatedAt) {
        return current.rates;
      }

      const db = createClient();
      const { data, error } = await db.from(table).select('rates').eq('id', versionId(updatedAt)).maybeSingle();
      if (error || !data || !data.rates) {
        return null;
      }
      return merge(data.rates);
    },

    async save(rates: T, expectedUpdatedAt?: string | null): Promise<void> {
      const current = await readCurrent(table);

      // Somebody else saved while this page was open. Overwriting would drop their prices with
      // nothing to show it happened.
      // ponytail: read-then-compare, not a conditional update. The gateway takes only eq filters and
      // a shop this size does not have two people in the rates editor at the same second.
      if (expectedUpdatedAt !== undefined && (current?.updated_at || null) !== (expectedUpdatedAt || null)) {
        throw new Error('These rates were saved by someone else while this page was open. Reload to see their changes, then make yours again.');
      }

      await archiveCurrent(table, current);

      const db = createClient();
      if (current) {
        const { error } = await db.from(table).update({ rates }).eq('id', CURRENT_ID);
        if (error) {
          throw new Error(error.message);
        }
        return;
      }

      const { error } = await db.from(table).insert({ id: CURRENT_ID, rates });
      if (error) {
        throw new Error(error.message);
      }
    },

    /**
     * A save that is announced without being read back reports success for a write that never
     * happened, and the editor keeps showing the values in the form. The user finds out the next
     * time they open the page, with no way to tell which of their edits were lost.
     */
    async saveAndReload(rates: T, expectedUpdatedAt?: string | null): Promise<LoadedRates<T>> {
      await this.save(rates, expectedUpdatedAt);

      const loaded = await this.load();
      if (loaded.error) {
        throw new Error(`The rates were written but could not be read back, so it is not certain they saved: ${loaded.error}`);
      }
      if (loaded.source !== 'saved') {
        throw new Error('The rates did not save: the table holds no saved rates, so the editor is still showing the defaults.');
      }
      // The stamp advances on every write. One that has not moved means the row was not touched, and
      // the archive row that keeps the replaced prices was not written either.
      if (expectedUpdatedAt !== undefined && loaded.updatedAt === (expectedUpdatedAt || null)) {
        throw new Error('The rates did not save: the table still holds the rates that were there before. Reload the page and try again.');
      }

      return loaded;
    },

    async reset(): Promise<void> {
      const current = await readCurrent(table);
      await archiveCurrent(table, current);

      const db = createClient();
      const { error } = await db.from(table).delete().eq('id', CURRENT_ID);
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
