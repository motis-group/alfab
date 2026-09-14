/**
 * Line edit handoff between a document page and a calculator.
 *
 * A document is a purchase order or a quote. The document owns the customer and the list of lines.
 * The calculator owns the specification of one line. The operator therefore edits a line in the
 * calculator. A second copy of the same form on the document page is not necessary.
 *
 * The request carries the line. The calculator loads the line. The calculator does not test which
 * document sent the line.
 *
 * An order also sends its full state. The lines of an unsaved order exist only in page state. The
 * order must not be saved to make the trip. A quote does not send its state. The quote page holds
 * its own draft. Refer to utils/quote-draft.ts.
 *
 * This module uses session storage. One trip completes in one sitting. This module keeps no record.
 */

import { LineDraft, OrderFormState } from '@utils/order-draft';

const REQUEST_KEY = 'alfabLineEditRequest';
const RESULT_KEY = 'alfabLineEditResult';

/** The state the order page restores after a trip to a calculator. */
export interface OrderSnapshot {
  orderForm: OrderFormState;
  lineDrafts: LineDraft[];
  loadedLineIds: string[];
  isEditingOrder: boolean;
  archivedAt: string | null;
}

/**
 * The document that sent the line. The banner shows the label.
 *
 * An order sends its full state. A quote sends only its label. The quote page keeps its own draft.
 */
export type LineEditOrigin = { kind: 'order'; order: OrderSnapshot; label: string } | { kind: 'quote'; label: string };

export interface LineEditRequest {
  origin: LineEditOrigin;
  /** The line being edited, by its draft id. */
  localId: string;
  /** The line before the edit. The calculator loads this line. */
  line: LineDraft;
  /** The customer of the document. The calculator shows the same customer. */
  customerId: string;
  /** The name of the line in the banner. Example: "Line 3". */
  lineLabel: string;
  /** Where the calculator returns to. */
  returnTo: string;
}

/** The line after the edit. The result holds only the fields that the calculator sets. */
export interface LineEditResult {
  origin: LineEditOrigin;
  localId: string;
  line: Pick<LineDraft, 'quantityOrdered' | 'unitPriceAtOrder' | 'lineNote' | 'markupPercent' | 'adhocSpec' | 'windowSpec' | 'windowRatesUpdatedAt' | 'awningSpec' | 'awningRatesUpdatedAt'>;
  /**
   * The specification in the words of the calculator.
   *
   * A quote stores this text and prints it. The text must stay the same after the catalogue
   * changes. An order builds its own text and ignores this field.
   */
  spec: string;
  /** Items that the calculator charges in addition. Examples: trims, second glazing. */
  extras: { label: string; total: number | null }[];
}

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.sessionStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function persistLineEditRequest(request: LineEditRequest): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(REQUEST_KEY, JSON.stringify(request));
  }
}

/**
 * Reads the request and leaves it in place.
 *
 * The calculator reads the request on each render of the banner. The calculator removes the request
 * only when the operator saves or cancels.
 */
export function peekLineEditRequest(): LineEditRequest | null {
  const request = read<LineEditRequest>(REQUEST_KEY);
  return request && request.localId && request.line && request.origin ? request : null;
}

export function clearLineEditRequest(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(REQUEST_KEY);
  }
}

/** Returns the line and ends the request. A second return cannot apply the same line twice. */
export function persistLineEditResult(result: LineEditResult): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
    window.sessionStorage.removeItem(REQUEST_KEY);
  }
}

export function consumeLineEditResult(): LineEditResult | null {
  const result = read<LineEditResult>(RESULT_KEY);
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(RESULT_KEY);
  }
  return result && result.localId && result.origin && result.line ? { ...result, spec: result.spec || '', extras: result.extras || [] } : null;
}

/** Replaces one line with the line that the calculator returned. */
export function applyLineEditResult(lines: LineDraft[], result: LineEditResult): LineDraft[] {
  return lines.map((line) => (line.localId === result.localId ? { ...line, ...result.line } : line));
}

/** Replaces one line of the order with the line that the calculator returned. */
export function applyOrderLineEditResult(order: OrderSnapshot, result: LineEditResult): OrderSnapshot {
  return { ...order, lineDrafts: applyLineEditResult(order.lineDrafts, result) };
}

/** The calculator that prices a line of this kind. Null if the document prices the line. */
export function calculatorFor(pricingSource: LineDraft['pricingSource']): string | null {
  switch (pricingSource) {
    case 'adhoc_calculator':
      return '/glass/quote';
    case 'window_calculator':
      return '/glass/windows';
    case 'awning_calculator':
      return '/glass/awnings';
    default:
      return null;
  }
}
