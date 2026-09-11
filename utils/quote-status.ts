/**
 * Whether a quote turned into work.
 *
 * Nobody marks a quote. It is won when it becomes a purchase order, expired when its price hold runs
 * out unanswered, and open until then. So the win rate, the live quotes and their value come from
 * what the shop does anyway, converting quotes, rather than from a status somebody has to remember
 * to set.
 *
 * Shared by the glass, window and awning quote lists: all three are rows in `quotes`.
 */

import { createClient } from '@utils/db-client';

const TABLE = 'quotes';

export type QuoteStatus = 'open' | 'won' | 'expired';

export const QUOTE_STATUS_ORDER: QuoteStatus[] = ['open', 'won', 'expired'];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  open: 'Open',
  won: 'Won',
  expired: 'Expired',
};

/** The class the interface paints each status with. */
export const QUOTE_STATUS_TONE: Record<QuoteStatus, string> = {
  open: 'status-warning',
  won: 'status-success',
  expired: 'status-warning',
};

/** How long a quote's prices hold. The printed quote states it; an unanswered quote then expires. */
export const QUOTE_HOLD_DAYS = 30;

/** The calendar day a date or timestamp falls on, as the order list shows it. */
function dayOf(stamp: string): string {
  return stamp.slice(0, 10);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * What a stored status still says. Won is no longer stored: a quote marked won by hand, and never
 * made into an order, reads as open. Lost and expired were only ever set by hand, and both mean the
 * quote is not coming back.
 */
export type StoredQuoteStatus = 'open' | 'expired';

export function readQuoteStatus(value: unknown): StoredQuoteStatus {
  return value === 'lost' || value === 'expired' ? 'expired' : 'open';
}

/**
 * The status a quote reads as on `today` (YYYY-MM-DD). A quote with a purchase order is won. An
 * open one expires the day after its hold runs out.
 *
 * Computed, never written: nothing runs on a schedule, so nothing can stop running. SQL that reads
 * `quotes.status` directly has to apply the same rule.
 */
export function effectiveQuoteStatus(quote: { status: StoredQuoteStatus; date: string; purchaseOrderId: string | null }, today: string): QuoteStatus {
  if (quote.purchaseOrderId) {
    return 'won';
  }
  if (quote.status === 'expired' || !/^\d{4}-\d{2}-\d{2}/.test(quote.date)) {
    return quote.status;
  }
  return today > addDays(dayOf(quote.date), QUOTE_HOLD_DAYS) ? 'expired' : 'open';
}

/**
 * Why a quote cannot be deleted, or null when it can. A won quote is the record of what an order
 * was sold at, so it goes only when its order does: deleting the order returns it to open.
 */
export function quoteDeleteRefusal(quote: { status: QuoteStatus; label: string }): string | null {
  return quote.status === 'won' ? `${quote.label} became a purchase order, so it stays. Delete the order to delete the quote.` : null;
}

/** Deletes a quote of any kind: every calculator's quotes are rows in the one table. */
export async function deleteQuote(id: string): Promise<void> {
  const db = createClient();
  const { error } = await db.from(TABLE).delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}

export interface QuoteOutcome {
  status: QuoteStatus;
  price: number | null;
}

export interface WinRate {
  open: number;
  won: number;
  expired: number;
  /** Won over quotes that have run their course: won / (won + expired). Null until one has. */
  rate: number | null;
  /** Value won, for the quotes that carry a price. */
  wonValue: number;
}

/**
 * Win rate over quotes that have run their course. An open quote is still in play, so it is counted
 * but kept out of the rate; an expired one went unanswered for its whole price hold and counts
 * against it.
 */
export function winRate(quotes: QuoteOutcome[]): WinRate {
  const tally: WinRate = { open: 0, won: 0, expired: 0, rate: null, wonValue: 0 };

  for (const quote of quotes) {
    tally[quote.status] += 1;
    if (quote.status === 'won') {
      tally.wonValue += quote.price ?? 0;
    }
  }

  const settled = tally.won + tally.expired;
  tally.rate = settled > 0 ? tally.won / settled : null;
  return tally;
}
