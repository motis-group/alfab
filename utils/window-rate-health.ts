/**
 * Severity of a window rate value, for the rates editor.
 *
 * A blank or zero rate is not always a mistake: the legacy sheet left five prices blank, and a few
 * charges really are nil. The rules below separate those from the values that make a quote wrong.
 *
 * The distinction that matters: a rate consumed as a rate (per metre, each) is reported as
 * "not priced" by the costing and charged as nil. A rate consumed by arithmetic (a $ per kg, a
 * loading, a margin, a labour minute) is coerced to zero, so the quote still prints a confident
 * price that is too low. The second kind is an error.
 */

import { DEFAULT_WINDOW_RATES } from '@utils/window-costing-rates';

export type RateTone = 'error' | 'warning';

export interface RateIssue {
  path: string;
  tone: RateTone;
  /** Short label for the field itself. */
  badge: string;
  /** One sentence a fabricator can act on. */
  message: string;
}

/** Rates whose loss empties a whole cost bucket on every window, rather than one line. */
const SPINE = /^labourPerHour$|^suppliers\.[^.]+\.perKg$|^glass\.options\.[^.]+\.list$|^anodising\.etchPerSqm$/;

/** The only rate values the engine divides by. */
const DIVISOR = /\.barLength$|\.fixedQty$/;

/**
 * Rates the costing can never reach, so a blank there is not a gap. A flat ground edge is only
 * charged on laminate (see the glazing block in utils/window-costing.ts).
 */
const UNREACHABLE = /^glass\.processing\.(?!laminate\.)[^.]+\.flatGround$/;

/** Values held as a fraction, where 0.2 means 20 percent. */
const RATIO = /^suppliers\.[^.]+\.loading$|^extrusions\.[^.]+\.offcut$|^glass\.loading(Mws)?$|^margins\.[^.]+\.(margin|marginMws|uplift)$/;

function defaultAt(segments: string[]): number | null | undefined {
  let node: unknown = DEFAULT_WINDOW_RATES;
  for (const segment of segments) {
    if (node == null || typeof node !== 'object') {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'number' || node === null ? node : undefined;
}

/**
 * Severity of one rate value, or null when it is fine. The first rule that matches wins.
 */
export function checkRateValue(path: string, value: number | null): RateIssue | null {
  const segments = path.split('.');
  const fallback = defaultAt(segments);

  // A blank Marine Window Service margin means "use the standard margin", which is the normal case.
  if (value == null && path.endsWith('.marginMws')) {
    return null;
  }

  if (value == null && UNREACHABLE.test(path)) {
    return null;
  }

  if (DIVISOR.test(path) && (value == null || value === 0)) {
    return {
      path,
      tone: 'error',
      badge: 'breaks the costing',
      message: 'The costing divides by this number, so a blank or a zero deletes the whole line. Enter the bar length or the batch quantity.',
    };
  }

  if (value != null && value < 0) {
    return {
      path,
      tone: 'error',
      badge: 'below zero',
      message: 'A rate below zero turns the line into a credit, so the window gets cheaper the more work it takes.',
    };
  }

  if (value != null && value > 1 && RATIO.test(path)) {
    return {
      path,
      tone: 'error',
      badge: 'not a fraction',
      message: 'This value is a fraction: 0.2 means 20 percent. A value above 1 multiplies the price instead of adding to it.',
    };
  }

  if (value == null) {
    if (fallback === null) {
      return {
        path,
        tone: 'warning',
        badge: 'not priced',
        message: 'The legacy sheet never priced this. The costing charges the line as nil and lists it as not priced.',
      };
    }
    return {
      path,
      tone: 'error',
      badge: 'was priced',
      message: 'This rate had a price. Left blank it counts as zero in the costing, and the quote still prints a price that is too low.',
    };
  }

  if (value === 0 && fallback !== 0) {
    if (SPINE.test(path)) {
      return {
        path,
        tone: 'error',
        badge: 'zero on every window',
        message: 'A zero here prices this item at nothing on every window, and a zero is never reported as not priced.',
      };
    }
    return {
      path,
      tone: 'warning',
      badge: 'free of charge',
      message: 'A zero means the item is supplied free. Leave the field blank to say that it is not priced yet.',
    };
  }

  return null;
}

/** Every numeric leaf in a rates document that needs attention. */
export function checkWindowRates(rates: unknown): RateIssue[] {
  const issues: RateIssue[] = [];

  const walk = (node: unknown, segments: string[]) => {
    if (typeof node === 'number' || node === null) {
      // Glass thickness is a dimension, not a rate.
      if (segments[segments.length - 1] === 'mm') {
        return;
      }
      const issue = checkRateValue(segments.join('.'), node);
      if (issue) {
        issues.push(issue);
      }
      return;
    }

    if (node && typeof node === 'object' && !Array.isArray(node)) {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (segments.length === 0 && key === 'asAt') {
          continue;
        }
        walk(child, [...segments, key]);
      }
    }
  };

  walk(rates, []);
  return issues;
}

export function countRateIssues(issues: RateIssue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter((issue) => issue.tone === 'error').length,
    warnings: issues.filter((issue) => issue.tone === 'warning').length,
  };
}
