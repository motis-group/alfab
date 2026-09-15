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

import type { PricingData } from '@components/PricingProvider';
import { calculateCost, describeGlassSpecification } from '@utils/calculations';
import type { ExtractedPiece } from '@utils/import/model';
import { LineEditResult } from '@utils/line-editing';
import { DEFAULT_QUOTE_MARGIN_PERCENT, SavedQuote, SavedQuoteLine, applyQuoteMargin, quoteReference } from '@utils/quote-store';
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
  /** Percent on cost. It prices every line that has a cost. */
  marginPercent: number;
  lines: SavedQuoteLine[];
  /** True if the quote is kept on its customer. Save Quote writes it. */
  savedToCustomer: boolean;
  /** The saved quote that this unsaved quote copies. The page names it until the copy is saved. */
  reissuedFrom?: { reference: string; date: string };
  /**
   * A line that the operator added but did not price.
   *
   * The page discards this line if the operator returns without a price. An empty line therefore
   * does not stay on the quote after a cancelled Add Line.
   */
  pendingLineId: string | null;
}

export function emptyQuoteDraft(): QuoteDraft {
  return { id: null, name: '', customer: '', customerId: '', date: todayISODate(), notes: '', marginPercent: DEFAULT_QUOTE_MARGIN_PERCENT, lines: [], pendingLineId: null, savedToCustomer: false };
}

/**
 * A new quote that copies a saved quote: its customer, lines, notes and margin.
 *
 * Each line keeps its price. The date is today, so the 30-day price hold starts again. Save Quote
 * gives the copy its own number, and the saved quote does not change. The copy is not saved to the
 * customer, so the saved quotes of a customer do not increase each time a quote is reissued.
 */
export function reissueQuoteDraft(source: Pick<SavedQuote, 'id' | 'name' | 'customer' | 'customerId' | 'date' | 'notes' | 'marginPercent' | 'lines'>): QuoteDraft {
  return {
    id: null,
    name: source.name,
    customer: source.customer,
    customerId: source.customerId || '',
    date: todayISODate(),
    notes: source.notes,
    marginPercent: source.marginPercent,
    lines: source.lines,
    pendingLineId: null,
    savedToCustomer: false,
    reissuedFrom: { reference: quoteReference(source.id), date: source.date.slice(0, 10) },
  };
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
    if (!draft || !Array.isArray(draft.lines)) {
      return null;
    }
    // A draft with no margin reads at the default. Without a number, a returning line prices as NaN.
    return typeof draft.marginPercent === 'number' ? draft : { ...draft, marginPercent: DEFAULT_QUOTE_MARGIN_PERCENT };
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
 *
 * A calculator prices a quote line at cost. The margin of the quote makes the price.
 */
export function applyQuoteLineResult(draft: QuoteDraft, result: LineEditResult): QuoteDraft {
  const existing = draft.lines.find((line) => line.draft.localId === result.localId);
  const priced = applyQuoteMargin(
    {
      draft: { ...(existing?.draft ?? createLineDraft({ localId: result.localId })), ...result.line },
      unitCost: result.line.unitPriceAtOrder,
      spec: result.spec,
      extras: result.extras.map((extra) => ({ ...extra, cost: extra.total })),
    },
    draft.marginPercent
  );

  return {
    ...draft,
    lines: existing ? draft.lines.map((line) => (line.draft.localId === result.localId ? priced : line)) : [...draft.lines, priced],
    pendingLineId: null,
  };
}

/** Sets the margin of the quote and prices every line that has a cost again. */
export function setQuoteMargin(draft: QuoteDraft, marginPercent: number): QuoteDraft {
  return { ...draft, marginPercent, lines: draft.lines.map((line) => applyQuoteMargin(line, marginPercent)) };
}

/** Removes a line that the operator added but did not price. */
export function dropPendingLine(draft: QuoteDraft): QuoteDraft {
  if (!draft.pendingLineId) {
    return draft;
  }
  return { ...draft, lines: draft.lines.filter((line) => line.draft.localId !== draft.pendingLineId), pendingLineId: null };
}

/**
 * Puts the pieces read off a customer's order on the draft, one cut-glass line for each piece.
 *
 * The glass rates price each piece at cost, as the glass calculator prices a quote line. The margin
 * of the quote makes the price. calculateCost throws for a piece that it cannot price, and the draft
 * then gets none of the lines.
 */
export function addGlassPieces(draft: QuoteDraft, pieces: ExtractedPiece[], pricingData: PricingData): QuoteDraft {
  const lines = pieces.map((piece) =>
    applyQuoteMargin(
      {
        draft: createLineDraft({ pricingSource: 'adhoc_calculator', adhocSpec: { ...piece.spec }, quantityOrdered: Math.max(1, piece.quantity), lineNote: (piece.name || '').trim() }),
        unitCost: calculateCost(piece.spec, pricingData).total,
        spec: describeGlassSpecification(piece.spec),
        extras: [],
      },
      draft.marginPercent
    )
  );
  return { ...draft, lines: [...draft.lines, ...lines] };
}
