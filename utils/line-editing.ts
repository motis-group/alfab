/**
 * Editing one order line in the calculator that prices it.
 *
 * The order owns who a purchase order is for and which lines are on it. What a line *is* — the
 * glass, the window, the awning — belongs to the calculator that prices it, so a line is edited
 * there rather than in a second copy of the same form on the order page.
 *
 * The whole order travels with the request, not just the line. A new order's lines exist only in
 * the page's state until it is saved, and being sent away to save a half-finished order before a
 * line could be priced would be worse than the duplication this replaces.
 *
 * Session storage, like the calculator-to-order handoff it mirrors: a round trip is finished in one
 * sitting, and nothing here is a record of anything.
 */

import { LineDraft, OrderFormState } from '@utils/order-draft';

const REQUEST_KEY = 'alfabLineEditRequest';
const RESULT_KEY = 'alfabLineEditResult';

/** Everything the order page needs to come back to exactly where it was. */
export interface OrderSnapshot {
  orderForm: OrderFormState;
  lineDrafts: LineDraft[];
  loadedLineIds: string[];
  isEditingOrder: boolean;
  archivedAt: string | null;
}

export interface LineEditRequest {
  order: OrderSnapshot;
  /** The line being edited, by its draft id. */
  localId: string;
  /** Where the calculator returns to. */
  returnTo: string;
}

/** The line as the calculator left it. Only the fields a calculator decides. */
export interface LineEditResult {
  order: OrderSnapshot;
  localId: string;
  line: Pick<LineDraft, 'quantityOrdered' | 'unitPriceAtOrder' | 'lineNote' | 'markupPercent' | 'adhocSpec' | 'windowSpec' | 'windowRatesUpdatedAt' | 'awningSpec' | 'awningRatesUpdatedAt'>;
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
 * The request, left in place. A calculator reads it on every render of the banner, and only takes
 * it when the estimator saves or cancels.
 */
export function peekLineEditRequest(): LineEditRequest | null {
  const request = read<LineEditRequest>(REQUEST_KEY);
  return request && request.localId && request.order && Array.isArray(request.order.lineDrafts) ? request : null;
}

export function clearLineEditRequest(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(REQUEST_KEY);
  }
}

/** Hands the line back and ends the request, so returning twice cannot apply it twice. */
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
  return result && result.localId && result.order && result.line ? result : null;
}

/** The order with one line replaced by what the calculator returned. */
export function applyLineEditResult(result: LineEditResult): OrderSnapshot {
  return {
    ...result.order,
    lineDrafts: result.order.lineDrafts.map((line) => (line.localId === result.localId ? { ...line, ...result.line } : line)),
  };
}

/** Which calculator prices a line of this kind, or null when the order itself owns it. */
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
