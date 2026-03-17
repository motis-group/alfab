import { GlassSpecification } from '@utils/calculations';

const QUOTE_TO_ORDER_STORAGE_KEY = 'adhocQuoteToPurchaseOrderDraft';

export interface QuoteToOrderDraft {
  quoteName: string;
  customerName: string;
  quoteDate: string;
  quantity: number;
  unitPrice: number;
  markupPercent: number;
  quoteNotes: string;
  spec: GlassSpecification;
}

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

function isQuoteToOrderDraft(value: unknown): value is QuoteToOrderDraft {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Record<string, unknown>;
  const spec = draft.spec as Record<string, unknown> | undefined;

  return typeof draft.quoteName === 'string'
    && typeof draft.customerName === 'string'
    && typeof draft.quoteDate === 'string'
    && typeof draft.quoteNotes === 'string'
    && !!spec
    && typeof spec.glassType === 'string'
    && typeof spec.edgework === 'string'
    && typeof spec.shape === 'string';
}

export function persistQuoteToOrderDraft(draft: QuoteToOrderDraft): void {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: QuoteToOrderDraft = {
    quoteName: draft.quoteName.trim(),
    customerName: draft.customerName.trim(),
    quoteDate: draft.quoteDate,
    quantity: Math.max(1, normalizeNumber(draft.quantity, 1)),
    unitPrice: Math.max(0, normalizeNumber(draft.unitPrice, 0)),
    markupPercent: Math.max(0, normalizeNumber(draft.markupPercent, 0)),
    quoteNotes: draft.quoteNotes.trim(),
    spec: { ...draft.spec },
  };

  window.sessionStorage.setItem(QUOTE_TO_ORDER_STORAGE_KEY, JSON.stringify(payload));
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

    return {
      quoteName: parsed.quoteName.trim(),
      customerName: parsed.customerName.trim(),
      quoteDate: parsed.quoteDate,
      quantity: Math.max(1, normalizeNumber(parsed.quantity, 1)),
      unitPrice: Math.max(0, normalizeNumber(parsed.unitPrice, 0)),
      markupPercent: Math.max(0, normalizeNumber(parsed.markupPercent, 0)),
      quoteNotes: parsed.quoteNotes.trim(),
      spec: { ...(parsed.spec as GlassSpecification) },
    };
  } catch {
    return null;
  }
}

export function buildQuoteDraftLineDescription(draft: Pick<QuoteToOrderDraft, 'quoteName' | 'spec'>): string {
  const title = draft.quoteName.trim();
  const specSummary = `${draft.spec.width} x ${draft.spec.height} mm | ${draft.spec.thickness}mm ${draft.spec.glassType} | ${draft.spec.shape}`;

  return [title, specSummary].filter(Boolean).join(' | ') || 'Ad Hoc Calculator Item';
}
