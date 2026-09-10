/**
 * The quote being worked on, shared by the three calculator pages.
 *
 * A boat needs cut glass, a window and an awning. Priced on three pages and saved three times, the
 * customer receives three documents and three numbers. Each calculator keeps its own editing state
 * and mirrors its own product's lines into this one draft, so the three pages fill in one quote.
 *
 * The draft lives in local storage because it is the estimator's work in progress on this machine,
 * not a record anyone else reads. Saving it puts it in the quotes table.
 */

import { AwningQuoteLine, GlassQuoteLine, WindowQuoteLine, normalizeAwningLines, normalizeGlassLines, normalizeWindowLines } from '@utils/quote-to-order';
import { QUOTE_KIND_LABELS, QuoteKind } from '@utils/quote-register';

const QUOTE_DRAFT_STORAGE_KEY = 'alfabWorkingQuote';

export interface QuoteDraft {
  name: string;
  customer: string;
  customerId: string | null;
  /** yyyy-mm-dd. Empty until a calculator sets it. */
  date: string;
  notes: string;
  glassLines: GlassQuoteLine[];
  windowLines: WindowQuoteLine[];
  awningLines: AwningQuoteLine[];
}

/** The heading a calculator may fill in while pricing its own product. */
export type QuoteDraftMeta = Partial<Pick<QuoteDraft, 'name' | 'customer' | 'customerId' | 'date' | 'notes'>>;

export const EMPTY_QUOTE_DRAFT: QuoteDraft = {
  name: '',
  customer: '',
  customerId: null,
  date: '',
  notes: '',
  glassLines: [],
  windowLines: [],
  awningLines: [],
};

export function quoteDraftLineCount(draft: QuoteDraft): number {
  return draft.glassLines.length + draft.windowLines.length + draft.awningLines.length;
}

/**
 * What the quote comes to. A line saved with no quantity is one of that line, not none.
 *
 * Each line is rounded to the cent before it is added, because that is the amount printed beside it.
 * Summing the unrounded products instead gives a total that does not equal the lines above it.
 */
export function quoteDraftTotal(draft: QuoteDraft): number {
  const lines: Array<{ quantity: number; unitPrice: number }> = [...draft.glassLines, ...draft.windowLines, ...draft.awningLines];
  return lines.reduce((total, line) => total + Math.round(line.unitPrice * Math.max(1, line.quantity) * 100) / 100, 0);
}

/** The product types on the quote, in the order the calculators are listed. */
export function quoteDraftKinds(draft: QuoteDraft): QuoteKind[] {
  const kinds: QuoteKind[] = [];
  if (draft.glassLines.length) {
    kinds.push('glass');
  }
  if (draft.windowLines.length) {
    kinds.push('window');
  }
  if (draft.awningLines.length) {
    kinds.push('awning');
  }
  return kinds;
}

/** What a quote holds, for a list that shows one row per quote: "Glass + Window". */
export function describeQuoteProducts(kinds: QuoteKind[]): string {
  return kinds.map((kind) => QUOTE_KIND_LABELS[kind]).join(' + ');
}

/**
 * The draft with one product's lines replaced. A calculator owns its own kind and nothing else, so
 * mirroring glass into the draft must not disturb the windows another page put there.
 */
export function withQuoteDraftLines(draft: QuoteDraft, kind: QuoteKind, lines: GlassQuoteLine[] | WindowQuoteLine[] | AwningQuoteLine[], meta: QuoteDraftMeta = {}): QuoteDraft {
  const next: QuoteDraft = { ...draft, ...meta };

  if (kind === 'glass') {
    next.glassLines = lines as GlassQuoteLine[];
  } else if (kind === 'window') {
    next.windowLines = lines as WindowQuoteLine[];
  } else {
    next.awningLines = lines as AwningQuoteLine[];
  }

  return next;
}

/** Reads whatever is in storage. A draft written by an older build, or by nothing, reads as empty. */
export function normalizeQuoteDraft(value: unknown): QuoteDraft {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;

  return {
    name: typeof source.name === 'string' ? source.name : '',
    customer: typeof source.customer === 'string' ? source.customer : '',
    customerId: typeof source.customerId === 'string' && source.customerId ? source.customerId : null,
    date: typeof source.date === 'string' ? source.date : '',
    notes: typeof source.notes === 'string' ? source.notes : '',
    glassLines: normalizeGlassLines(source.glassLines),
    windowLines: normalizeWindowLines(source.windowLines),
    awningLines: normalizeAwningLines(source.awningLines),
  };
}

export function readQuoteDraft(): QuoteDraft {
  if (typeof window === 'undefined') {
    return normalizeQuoteDraft(null);
  }

  const raw = window.localStorage.getItem(QUOTE_DRAFT_STORAGE_KEY);

  try {
    return normalizeQuoteDraft(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeQuoteDraft(null);
  }
}

export function writeQuoteDraft(draft: QuoteDraft): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(QUOTE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearQuoteDraft(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(QUOTE_DRAFT_STORAGE_KEY);
}

/**
 * Empties the stored draft, but only while it still holds what was saved.
 *
 * A quote is filed from what storage holds at that moment. Clearing regardless would take a line
 * another calculator wrote while the save was in flight with it.
 */
export function clearQuoteDraftIfUnchanged(saved: QuoteDraft): boolean {
  if (JSON.stringify(readQuoteDraft()) !== JSON.stringify(saved)) {
    return false;
  }

  clearQuoteDraft();
  return true;
}

/**
 * Calls back with the stored quote when another tab writes it, and returns the unsubscribe.
 *
 * A calculator holds the heading in its own state and writes all of it on every mirror, so a page
 * that has not seen a second tab's edit would put its own stale heading back over the quote.
 */
export function subscribeToQuoteDraft(onChange: (draft: QuoteDraft) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  // A null key is the whole of storage being cleared.
  const reread = (event: StorageEvent) => {
    if (event.key === null || event.key === QUOTE_DRAFT_STORAGE_KEY) {
      onChange(readQuoteDraft());
    }
  };

  window.addEventListener('storage', reread);
  return () => window.removeEventListener('storage', reread);
}

/** Mirrors one calculator's lines into the stored draft and returns what the draft now holds. */
export function replaceQuoteDraftLines(kind: QuoteKind, lines: GlassQuoteLine[] | WindowQuoteLine[] | AwningQuoteLine[], meta: QuoteDraftMeta = {}): QuoteDraft {
  const next = withQuoteDraftLines(readQuoteDraft(), kind, lines, meta);
  writeQuoteDraft(next);
  return next;
}
