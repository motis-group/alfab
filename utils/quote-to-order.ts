import { GlassSpecification } from '@utils/calculations';
import { WindowCostingInput } from '@utils/window-costing';

const QUOTE_TO_ORDER_STORAGE_KEY = 'adhocQuoteToPurchaseOrderDraft';

export type QuoteToOrderDraftKind = 'glass' | 'window';

/** One window costing on its way to a purchase order line. A quote can carry several. */
export interface WindowQuoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
  windowSpec: WindowCostingInput;
  /** Stamp of the rates the price was calculated on. */
  ratesUpdatedAt: string | null;
}

export interface QuoteToOrderDraft {
  kind: QuoteToOrderDraftKind;
  quoteName: string;
  customerName: string;
  quoteDate: string;
  quantity: number;
  unitPrice: number;
  markupPercent: number;
  quoteNotes: string;
  /** Glass calculator specification. Null for window costings. */
  spec: GlassSpecification | null;
  /** Window costings, one per purchase order line. Empty for glass quotes. */
  windowLines: WindowQuoteLine[];
}

export type QuoteToOrderDraftInput = Omit<QuoteToOrderDraft, 'kind' | 'spec' | 'windowLines' | 'quantity' | 'unitPrice'> & {
  kind?: QuoteToOrderDraftKind;
  spec?: GlassSpecification | null;
  windowLines?: WindowQuoteLine[];
  quantity?: number;
  unitPrice?: number;
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

function normalizeWindowLines(value: unknown): WindowQuoteLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((line) => line && typeof line === 'object' && isWindowCostingInput((line as Record<string, unknown>).windowSpec))
    .map((line) => {
      const entry = line as Record<string, unknown>;
      return {
        description: typeof entry.description === 'string' ? entry.description.trim() : '',
        quantity: Math.max(1, normalizeNumber(entry.quantity, 1)),
        unitPrice: Math.max(0, normalizeNumber(entry.unitPrice, 0)),
        windowSpec: { ...(entry.windowSpec as WindowCostingInput) },
        ratesUpdatedAt: typeof entry.ratesUpdatedAt === 'string' ? entry.ratesUpdatedAt : null,
      };
    });
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

  return draft.kind === 'window' ? normalizeWindowLines(draft.windowLines).length > 0 : isGlassSpecification(draft.spec);
}

function normalizeDraft(draft: QuoteToOrderDraftInput | QuoteToOrderDraft): QuoteToOrderDraft {
  const kind: QuoteToOrderDraftKind = draft.kind === 'window' ? 'window' : 'glass';
  const windowLines = kind === 'window' ? normalizeWindowLines(draft.windowLines) : [];

  return {
    kind,
    quoteName: draft.quoteName.trim(),
    customerName: draft.customerName.trim(),
    quoteDate: draft.quoteDate,
    quantity: Math.max(1, normalizeNumber(draft.quantity, windowLines[0]?.quantity ?? 1)),
    unitPrice: Math.max(0, normalizeNumber(draft.unitPrice, windowLines[0]?.unitPrice ?? 0)),
    markupPercent: Math.max(0, normalizeNumber(draft.markupPercent, 0)),
    quoteNotes: draft.quoteNotes.trim(),
    spec: kind === 'glass' && draft.spec ? { ...draft.spec } : null,
    windowLines,
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

export function buildQuoteDraftLineDescription(draft: Pick<QuoteToOrderDraft, 'quoteName' | 'spec'>): string {
  const title = draft.quoteName.trim();

  if (!draft.spec) {
    return title || 'Ad Hoc Calculator Item';
  }

  const specSummary = `${draft.spec.width} x ${draft.spec.height} mm | ${draft.spec.thickness}mm ${draft.spec.glassType} | ${draft.spec.shape}`;
  const cadSummary = draft.spec.cadOutline ? `CAD: ${draft.spec.cadOutline.fileName}` : '';

  return [title, specSummary, cadSummary].filter(Boolean).join(' | ') || 'Ad Hoc Calculator Item';
}

/** Line description for a window costing: the quote name, then the window's own summary. */
export function buildWindowLineDescription(quoteName: string, line: WindowQuoteLine): string {
  return [quoteName.trim(), line.description.trim()].filter(Boolean).join(' | ') || 'Window Costing Item';
}
