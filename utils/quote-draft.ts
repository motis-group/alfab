/**
 * The quote under edit, before the operator saves it.
 *
 * A quote sends one line at a time to a calculator. The remainder of the quote must survive the
 * trip. The quote waits in this module. The quote does not travel with the line. An unsaved order
 * travels with the line, because an order has no other place to wait.
 *
 * This module uses session storage. One trip completes in one sitting. The record of a quote is the
 * row in the database, not this draft.
 */

import { LineEditResult } from '@utils/line-editing';
import { SavedQuoteLine } from '@utils/quote-store';
import { createLineDraft } from '@utils/order-draft';
import { todayISODate } from '@utils/order-management';

const DRAFT_KEY = 'alfabQuoteDraft';

export interface QuoteDraft {
  /** The record id of the saved quote. Null before the first save. */
  id: string | null;
  name: string;
  customer: string;
  customerId: string;
  /** The date on the quote. Format: yyyy-mm-dd. */
  date: string;
  notes: string;
  lines: SavedQuoteLine[];
  /**
   * A line that the operator added but did not price.
   *
   * The page discards this line if the operator returns without a price. An empty line therefore
   * does not stay on the quote after a cancelled Add Line.
   */
  pendingLineId: string | null;
}

export function emptyQuoteDraft(): QuoteDraft {
  return { id: null, name: '', customer: '', customerId: '', date: todayISODate(), notes: '', lines: [], pendingLineId: null };
}

export function persistQuoteDraft(draft: QuoteDraft): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }
}

/** Reads the draft and leaves it in place. The page restores the draft and continues the edit. */
export function peekQuoteDraft(): QuoteDraft | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.sessionStorage.getItem(DRAFT_KEY);
  if (!raw) {
    return null;
  }
  try {
    const draft = JSON.parse(raw) as QuoteDraft;
    return draft && Array.isArray(draft.lines) ? draft : null;
  } catch {
    window.sessionStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

export function clearQuoteDraft(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(DRAFT_KEY);
  }
}

/**
 * Puts the priced line back on the draft.
 *
 * The calculator sets the price, the quantity, the note and the specification. The quote owns the
 * other fields of the line. This function therefore copies only the fields of the calculator.
 */
export function applyQuoteLineResult(draft: QuoteDraft, result: LineEditResult): QuoteDraft {
  const existing = draft.lines.find((line) => line.draft.localId === result.localId);
  const priced: SavedQuoteLine = {
    draft: { ...(existing?.draft ?? createLineDraft({ localId: result.localId })), ...result.line },
    spec: result.spec,
    extras: result.extras,
  };

  return {
    ...draft,
    lines: existing ? draft.lines.map((line) => (line.draft.localId === result.localId ? priced : line)) : [...draft.lines, priced],
    pendingLineId: null,
  };
}

/** Removes a line that the operator added but did not price. */
export function dropPendingLine(draft: QuoteDraft): QuoteDraft {
  if (!draft.pendingLineId) {
    return draft;
  }
  return { ...draft, lines: draft.lines.filter((line) => line.draft.localId !== draft.pendingLineId), pendingLineId: null };
}
