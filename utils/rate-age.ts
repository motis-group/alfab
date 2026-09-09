/**
 * How old a price list is.
 *
 * Every rates document records when each group of prices was last known good, as free text the
 * estimator typed: "Oct 2021", "July 2007", "Apr 2010 (etch), Mar 2015 (powder coat)", "unknown".
 * That text was display-only, so a fittings price from 2007 quoted 2026 work without a word.
 *
 * The text is kept rather than replaced by a date column: it carries detail a single date cannot,
 * such as two dates for one group. This module reads the oldest date out of it, which is the
 * conservative answer, and grades it.
 *
 * Keep this module free of runtime imports: utils/rate-age.test.ts runs it under tsx.
 */

export type RateFreshness = 'current' | 'ageing' | 'stale' | 'unknown';

/** A price older than this wants a look. */
export const AGEING_MONTHS = 12;
/** A price older than this is reported on every costing that uses it. */
export const STALE_MONTHS = 24;

export interface RateAge {
  /** The text the rates hold, unchanged. */
  text: string;
  /** The oldest date the text names, or null when it names none. */
  oldest: Date | null;
  /** Whole months from that date to now, or null when there is no date. */
  months: number | null;
  freshness: RateFreshness;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

// A year, optionally preceded by a month name. "Sept 2021", "July 2007", "2021".
const DATE_PATTERN = /(?:([a-z]{3,9})\.?\s+)?((?:19|20)\d{2})/gi;

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * Read the oldest date out of an as-at text and grade it. A text naming no date is "unknown", which
 * is treated as needing attention rather than as fresh: a price nobody dated could be any age.
 */
export function parseAsAt(text: string | null | undefined, now: Date = new Date()): RateAge {
  const raw = (text || '').trim();
  let oldest: Date | null = null;

  DATE_PATTERN.lastIndex = 0;
  for (let match = DATE_PATTERN.exec(raw); match; match = DATE_PATTERN.exec(raw)) {
    const monthKey = (match[1] || '').slice(0, 3).toLowerCase();
    // A bare year is read as January of it, so an undated month cannot look newer than it is.
    const month = monthKey in MONTHS ? MONTHS[monthKey] : 0;
    const candidate = new Date(Number(match[2]), month, 1);
    if (!oldest || candidate < oldest) {
      oldest = candidate;
    }
  }

  if (!oldest) {
    return { text: raw, oldest: null, months: null, freshness: 'unknown' };
  }

  const months = Math.max(0, monthsBetween(oldest, now));
  const freshness: RateFreshness = months >= STALE_MONTHS ? 'stale' : months >= AGEING_MONTHS ? 'ageing' : 'current';
  return { text: raw, oldest, months, freshness };
}

/** Plain English for the age, for a badge beside the field. */
export function describeAge(age: RateAge): string {
  if (age.months == null) {
    return 'never dated';
  }
  if (age.months < 12) {
    return age.months <= 1 ? 'this month' : `${age.months} months old`;
  }
  const years = Math.floor(age.months / 12);
  const rest = age.months % 12;
  return rest ? `${years}y ${rest}m old` : `${years} year${years === 1 ? '' : 's'} old`;
}

export interface RateGroupAge extends RateAge {
  /** Key in the document's asAt record. */
  key: string;
  /** What to call the group in the interface. */
  label: string;
}

const WORST_FIRST: Record<RateFreshness, number> = { stale: 0, unknown: 1, ageing: 2, current: 3 };

/**
 * Grade every group in an as-at record, worst first. An undated group sorts just after a stale one:
 * both need a decision, but a known-old price is the more urgent of the two.
 */
export function gradeAsAt(asAt: Record<string, string>, label: (key: string) => string, now: Date = new Date()): RateGroupAge[] {
  return Object.entries(asAt || {})
    .map(([key, text]) => ({ key, label: label(key), ...parseAsAt(text, now) }))
    .sort((a, b) => WORST_FIRST[a.freshness] - WORST_FIRST[b.freshness] || (b.months ?? 0) - (a.months ?? 0));
}

/** Groups that want attention: stale or never dated. */
export function needsReview(groups: RateGroupAge[]): RateGroupAge[] {
  return groups.filter((group) => group.freshness === 'stale' || group.freshness === 'unknown');
}
