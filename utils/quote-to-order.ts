import { GlassSpecification, describeGlassSpecification } from '@utils/calculations';
import { WindowCostingInput } from '@utils/window-costing';
import { AwningCostingInput } from '@utils/awning-costing';
import { JobLine, normalizeJob } from '@utils/job-basket';

const QUOTE_TO_ORDER_STORAGE_KEY = 'adhocQuoteToPurchaseOrderDraft';

export type QuoteToOrderDraftKind = 'glass' | 'window' | 'awning' | 'job';

/** One window costing on its way to a purchase order line. A quote can carry several. */
export interface WindowQuoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
  windowSpec: WindowCostingInput;
  /** Stamp of the rates the price was calculated on. */
  ratesUpdatedAt: string | null;
}

/** One awning costing on its way to a purchase order line. A quote can carry several. */
export interface AwningQuoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
  awningSpec: AwningCostingInput;
  /** Stamp of the rates the price was calculated on. */
  ratesUpdatedAt: string | null;
}

/** One glass piece on its way to a purchase order line. A quote can carry several. */
export interface GlassQuoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
  markupPercent: number;
  spec: GlassSpecification;
}

export interface QuoteToOrderDraft {
  kind: QuoteToOrderDraftKind;
  quoteName: string;
  customerName: string;
  /** The customer the quote was written against, so the order does not have to match on name. */
  customerId: string | null;
  quoteDate: string;
  quantity: number;
  unitPrice: number;
  markupPercent: number;
  quoteNotes: string;
  /** Glass calculator specification. Null for window costings. */
  spec: GlassSpecification | null;
  /** Glass pieces, one per purchase order line. Empty for window quotes. */
  glassLines: GlassQuoteLine[];
  /** Window costings, one per purchase order line. Empty for glass quotes. */
  windowLines: WindowQuoteLine[];
  /** Awning costings, one per purchase order line. Empty for every other kind. */
  awningLines: AwningQuoteLine[];
  /** A job spanning more than one product type. One order line per entry, whatever its kind. */
  jobLines: JobLine[];
}

export type QuoteToOrderDraftInput = Omit<QuoteToOrderDraft, 'kind' | 'spec' | 'glassLines' | 'windowLines' | 'awningLines' | 'jobLines' | 'quantity' | 'unitPrice' | 'customerId' | 'markupPercent'> & {
  kind?: QuoteToOrderDraftKind;
  customerId?: string | null;
  /** Legacy single-piece markup. Each line carries its own. */
  markupPercent?: number;
  spec?: GlassSpecification | null;
  glassLines?: GlassQuoteLine[];
  windowLines?: WindowQuoteLine[];
  awningLines?: AwningQuoteLine[];
  jobLines?: JobLine[];
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

function isAwningCostingInput(value: unknown): value is AwningCostingInput {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const spec = value as Record<string, unknown>;
  return typeof spec.heightMm === 'number' && typeof spec.widthMm === 'number' && typeof spec.qty === 'number';
}

function normalizeAwningLines(value: unknown): AwningQuoteLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((line) => line && typeof line === 'object' && isAwningCostingInput((line as Record<string, unknown>).awningSpec))
    .map((line) => {
      const entry = line as Record<string, unknown>;
      return {
        description: typeof entry.description === 'string' ? entry.description.trim() : '',
        quantity: Math.max(1, normalizeNumber(entry.quantity, 1)),
        unitPrice: Math.max(0, normalizeNumber(entry.unitPrice, 0)),
        awningSpec: { ...(entry.awningSpec as AwningCostingInput) },
        ratesUpdatedAt: typeof entry.ratesUpdatedAt === 'string' ? entry.ratesUpdatedAt : null,
      };
    });
}

function normalizeGlassLines(value: unknown): GlassQuoteLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((line) => line && typeof line === 'object' && isGlassSpecification((line as Record<string, unknown>).spec))
    .map((line) => {
      const entry = line as Record<string, unknown>;
      return {
        description: typeof entry.description === 'string' ? entry.description.trim() : '',
        quantity: Math.max(1, normalizeNumber(entry.quantity, 1)),
        unitPrice: Math.max(0, normalizeNumber(entry.unitPrice, 0)),
        markupPercent: Math.max(0, normalizeNumber(entry.markupPercent, 0)),
        spec: { ...(entry.spec as GlassSpecification) },
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

  if (draft.kind === 'window') {
    return normalizeWindowLines(draft.windowLines).length > 0;
  }
  if (draft.kind === 'awning') {
    return normalizeAwningLines(draft.awningLines).length > 0;
  }
  if (draft.kind === 'job') {
    return normalizeJob({ lines: draft.jobLines }).lines.length > 0;
  }
  return normalizeGlassLines(draft.glassLines).length > 0 || isGlassSpecification(draft.spec);
}

function normalizeDraft(draft: QuoteToOrderDraftInput | QuoteToOrderDraft): QuoteToOrderDraft {
  const kind: QuoteToOrderDraftKind = draft.kind === 'window' || draft.kind === 'awning' || draft.kind === 'job' ? draft.kind : 'glass';
  const windowLines = kind === 'window' ? normalizeWindowLines(draft.windowLines) : [];
  const awningLines = kind === 'awning' ? normalizeAwningLines(draft.awningLines) : [];
  const glassLines = kind === 'glass' ? normalizeGlassLines(draft.glassLines) : [];
  const jobLines = kind === 'job' ? normalizeJob({ lines: draft.jobLines }).lines : [];
  const firstLine = windowLines[0] || awningLines[0] || glassLines[0] || jobLines[0];

  return {
    kind,
    quoteName: draft.quoteName.trim(),
    customerName: draft.customerName.trim(),
    customerId: typeof draft.customerId === 'string' && draft.customerId ? draft.customerId : null,
    quoteDate: draft.quoteDate,
    quantity: Math.max(1, normalizeNumber(draft.quantity, firstLine?.quantity ?? 1)),
    unitPrice: Math.max(0, normalizeNumber(draft.unitPrice, firstLine?.unitPrice ?? 0)),
    markupPercent: Math.max(0, normalizeNumber(draft.markupPercent, 0)),
    quoteNotes: draft.quoteNotes.trim(),
    spec: kind === 'glass' && draft.spec ? { ...draft.spec } : null,
    glassLines,
    windowLines,
    awningLines,
    jobLines,
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

/** Line description for one glass piece: the quote name or the piece's own name, then the spec. */
export function buildGlassLineDescription(quoteName: string, line: GlassQuoteLine): string {
  const title = line.description.trim() || quoteName.trim();
  const cadSummary = line.spec.cadOutline ? `CAD: ${line.spec.cadOutline.fileName}` : '';
  return [title, describeGlassSpecification(line.spec), cadSummary].filter(Boolean).join(' | ') || 'Ad Hoc Calculator Item';
}

/** Line description for a window costing: the quote name, then the window's own summary. */
export function buildWindowLineDescription(quoteName: string, line: WindowQuoteLine): string {
  return [quoteName.trim(), line.description.trim()].filter(Boolean).join(' | ') || 'Window Costing Item';
}

/** Line description for one item on a mixed job: the job name, then the item's own summary. */
export function buildJobLineDescription(quoteName: string, line: JobLine): string {
  return [quoteName.trim(), line.description.trim()].filter(Boolean).join(' | ') || 'Job Item';
}

/** Line description for an awning costing: the quote name, then the awning's own summary. */
export function buildAwningLineDescription(quoteName: string, line: AwningQuoteLine): string {
  return [quoteName.trim(), line.description.trim()].filter(Boolean).join(' | ') || 'Awning Costing Item';
}
