import { GlassSpecification } from '@utils/calculations';
import { WindowCostingInput } from '@utils/window-costing';

const QUOTE_TO_ORDER_STORAGE_KEY = 'adhocQuoteToPurchaseOrderDraft';

export type QuoteToOrderDraftKind = 'glass' | 'window';

export interface QuoteToOrderDraft {
  kind: QuoteToOrderDraftKind;
  quoteName: string;
  customerName: string;
  quoteDate: string;
  quantity: number;
  unitPrice: number;
  markupPercent: number;
  quoteNotes: string;
  /** Glass calculator specification; null for window costings. */
  spec: GlassSpecification | null;
  /** Window costing input; null for glass quotes. */
  windowSpec: WindowCostingInput | null;
  /** Ready-made line description; used for window costings. */
  description: string;
}

export type QuoteToOrderDraftInput = Omit<QuoteToOrderDraft, 'kind' | 'spec' | 'windowSpec' | 'description'> & {
  kind?: QuoteToOrderDraftKind;
  spec?: GlassSpecification | null;
  windowSpec?: WindowCostingInput | null;
  description?: string;
};

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function isGlassSpecification(value: unknown): value is GlassSpecification {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const spec = value as Record<string, unknown>;
  return typeof spec.glassType === 'string' && typeof spec.edgework === 'string' && typeof spec.shape === 'string';
}

function isWindowCostingInput(value: unknown): value is WindowCostingInput {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const spec = value as Record<string, unknown>;
  return typeof spec.type === 'string' && typeof spec.heightMm === 'number' && typeof spec.lengthMm === 'number';
}

function isQuoteToOrderDraft(value: unknown): value is QuoteToOrderDraft {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Record<string, unknown>;
  const hasStrings = typeof draft.quoteName === 'string' && typeof draft.customerName === 'string' && typeof draft.quoteDate === 'string' && typeof draft.quoteNotes === 'string';
  if (!hasStrings) {
    return false;
  }

  return draft.kind === 'window' ? isWindowCostingInput(draft.windowSpec) : isGlassSpecification(draft.spec);
}

function normalizeDraft(draft: QuoteToOrderDraftInput | QuoteToOrderDraft): QuoteToOrderDraft {
  const kind: QuoteToOrderDraftKind = draft.kind === 'window' ? 'window' : 'glass';
  return {
    kind,
    quoteName: draft.quoteName.trim(),
    customerName: draft.customerName.trim(),
    quoteDate: draft.quoteDate,
    quantity: Math.max(1, normalizeNumber(draft.quantity, 1)),
    unitPrice: Math.max(0, normalizeNumber(draft.unitPrice, 0)),
    markupPercent: Math.max(0, normalizeNumber(draft.markupPercent, 0)),
    quoteNotes: draft.quoteNotes.trim(),
    spec: kind === 'glass' && draft.spec ? { ...draft.spec } : null,
    windowSpec: kind === 'window' && draft.windowSpec ? { ...draft.windowSpec } : null,
    description: typeof draft.description === 'string' ? draft.description.trim() : '',
  };
}

export function persistQuoteToOrderDraft(draft: QuoteToOrderDraftInput): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(QUOTE_TO_ORDER_STORAGE_KEY, JSON.stringify(normalizeDraft(draft)));
}

export function consumeQuoteToOrderDraft(): QuoteToOrderDraft | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(QUOTE_TO_ORDER_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  window.sessionStorage.removeItem(QUOTE_TO_ORDER_STORAGE_KEY);

  try {
    const parsed = JSON.parse(raw);
    if (!isQuoteToOrderDraft(parsed)) {
      return null;
    }

    return normalizeDraft(parsed);
  } catch {
    return null;
  }
}

export function buildQuoteDraftLineDescription(draft: Pick<QuoteToOrderDraft, 'quoteName' | 'spec'> & Partial<Pick<QuoteToOrderDraft, 'kind' | 'description'>>): string {
  const title = draft.quoteName.trim();

  if (draft.kind === 'window') {
    return [title, draft.description?.trim()].filter(Boolean).join(' | ') || 'Window Costing Item';
  }

  if (!draft.spec) {
    return title || 'Ad Hoc Calculator Item';
  }

  const specSummary = `${draft.spec.width} x ${draft.spec.height} mm | ${draft.spec.thickness}mm ${draft.spec.glassType} | ${draft.spec.shape}`;
  const cadSummary = draft.spec.cadOutline ? `CAD: ${draft.spec.cadOutline.fileName}` : '';

  return [title, specSummary, cadSummary].filter(Boolean).join(' | ') || 'Ad Hoc Calculator Item';
}
