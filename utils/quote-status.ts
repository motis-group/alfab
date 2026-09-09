/**
 * Whether a quote turned into work.
 *
 * Quotes were written, printed and then forgotten: the table held what was quoted and never whether
 * it was won. So nobody could say what the win rate was, which quotes were still live, or whether
 * the margin was set too high. One field answers all three, and it only pays off if it is filled in,
 * which is why marking a quote is two clicks from the list it already appears on.
 *
 * Shared by the glass, window and awning quote lists: all three are rows in `quotes`.
 */

import { createClient } from '@utils/db-client';

const TABLE = 'quotes';

export type QuoteStatus = 'open' | 'won' | 'lost' | 'expired';

export const QUOTE_STATUS_ORDER: QuoteStatus[] = ['open', 'won', 'lost', 'expired'];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  open: 'Open',
  won: 'Won',
  lost: 'Lost',
  expired: 'Expired',
};

/** The class the interface paints each status with. */
export const QUOTE_STATUS_TONE: Record<QuoteStatus, string> = {
  open: 'status-warning',
  won: 'status-success',
  lost: 'status-error',
  expired: 'status-warning',
};

/**
 * Why a quote was lost. A free-text box gets left empty; a short list gets answered, and only an
 * answered one can tell you whether you are losing on price or on lead time.
 */
export const LOST_REASONS = ['Price', 'Lead time', 'No response', 'Went elsewhere', 'Job cancelled', 'Other'] as const;

export type LostReason = (typeof LOST_REASONS)[number];

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return typeof value === 'string' && (QUOTE_STATUS_ORDER as string[]).includes(value);
}

/** Read a status off a quote row, defaulting anything unrecognised to open. */
export function readQuoteStatus(value: unknown): QuoteStatus {
  return isQuoteStatus(value) ? value : 'open';
}

export async function setQuoteStatus(id: string, status: QuoteStatus, reason?: string | null): Promise<void> {
  const db = createClient();
  const { error } = await db
    .from(TABLE)
    .update({
      status,
      // A reason belongs to a loss. Keeping one on a re-opened quote would read as the reason it is open.
      status_reason: status === 'lost' ? reason || null : null,
      status_changed_at: new Date().toISOString(),
    })
    .eq('id', id);

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
  lost: number;
  expired: number;
  /** Decided quotes only: won / (won + lost). Null until something has been decided. */
  rate: number | null;
  /** Value won and lost, for the quotes that carry a price. */
  wonValue: number;
  lostValue: number;
}

/**
 * Win rate over decided quotes. Open and expired quotes are counted but kept out of the rate: a
 * quote nobody has answered is not a loss, and treating it as one flatters nothing.
 */
export function winRate(quotes: QuoteOutcome[]): WinRate {
  const tally: WinRate = { open: 0, won: 0, lost: 0, expired: 0, rate: null, wonValue: 0, lostValue: 0 };

  for (const quote of quotes) {
    tally[quote.status] += 1;
    if (quote.status === 'won') {
      tally.wonValue += quote.price ?? 0;
    }
    if (quote.status === 'lost') {
      tally.lostValue += quote.price ?? 0;
    }
  }

  const decided = tally.won + tally.lost;
  tally.rate = decided > 0 ? tally.won / decided : null;
  return tally;
}

/** Losses grouped by the reason given, biggest first. Losses with no reason group under "Not given". */
export function lossReasons(quotes: Array<{ status: QuoteStatus; statusReason: string | null }>): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();

  for (const quote of quotes) {
    if (quote.status !== 'lost') {
      continue;
    }
    const reason = quote.statusReason?.trim() || 'Not given';
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }

  return Array.from(counts, ([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}
