import { createClient } from '@utils/db-client';
import { QuoteStatus, readQuoteStatus } from '@utils/quote-status';
import { AwningQuoteLine, GlassQuoteLine, WindowQuoteLine, normalizeAwningLines, normalizeGlassLines, normalizeWindowLines } from '@utils/quote-to-order';

const TABLE = 'quotes';

/**
 * A quote as it was given, holding every product on it. One boat needing glass, a window and an
 * awning is one quote and one document, so the customer is given one number rather than three.
 *
 * Reopening one shows the prices that were quoted rather than repricing on today's rates, which is
 * why the rate stamp is kept beside them.
 */
export interface SavedQuote {
  id: string;
  name: string;
  customer: string;
  customerId: string | null;
  date: string;
  notes: string;
  glassLines: GlassQuoteLine[];
  windowLines: WindowQuoteLine[];
  awningLines: AwningQuoteLine[];
  total: number;
  status: QuoteStatus;
  /** Why it was lost, when it was lost. */
  statusReason: string | null;
  /** Stamp of the rates the saved prices were calculated on. */
  ratesUpdatedAt: string | null;
}

interface QuoteRow {
  id: string;
  name: string | null;
  client: string | null;
  date: string | null;
  specification: unknown;
  cost: unknown;
  status?: unknown;
  status_reason?: string | null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** Quotes share the quotes table with the single-product calculators, so rows carry a kind. */
function toSavedQuote(row: QuoteRow): SavedQuote | null {
  const specification = asObject(row.specification);
  if (!specification || specification.kind !== 'quote') {
    return null;
  }
  const cost = asObject(row.cost) || {};

  return {
    id: row.id,
    name: row.name || 'Quote',
    customer: row.client || '',
    customerId: typeof specification.customerId === 'string' ? specification.customerId : null,
    date: row.date || '',
    notes: typeof specification.notes === 'string' ? specification.notes : '',
    glassLines: normalizeGlassLines(specification.glassLines),
    windowLines: normalizeWindowLines(specification.windowLines),
    awningLines: normalizeAwningLines(specification.awningLines),
    total: typeof cost.total === 'number' ? cost.total : 0,
    status: readQuoteStatus(row.status),
    statusReason: typeof row.status_reason === 'string' ? row.status_reason : null,
    ratesUpdatedAt: typeof specification.ratesUpdatedAt === 'string' ? specification.ratesUpdatedAt : null,
  };
}

export async function listSavedQuotes(): Promise<SavedQuote[]> {
  const db = createClient();
  const { data, error } = await db.from(TABLE).select('*').order('date', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data as QuoteRow[]) || []).map(toSavedQuote).filter(Boolean) as SavedQuote[];
}

export async function saveQuote(quote: {
  name: string;
  customer: string;
  customerId: string | null;
  date: string;
  notes: string;
  glassLines: GlassQuoteLine[];
  windowLines: WindowQuoteLine[];
  awningLines: AwningQuoteLine[];
  total: number;
  ratesUpdatedAt: string | null;
}): Promise<void> {
  const db = createClient();
  const { error } = await db.from(TABLE).insert({
    name: quote.name.trim() || 'Quote',
    client: quote.customer.trim() || 'No Client',
    // The column defaults to the time of the insert, so a quote with no date given keeps that.
    ...(quote.date ? { date: quote.date } : {}),
    specification: {
      kind: 'quote',
      customerId: quote.customerId,
      notes: quote.notes,
      glassLines: quote.glassLines,
      windowLines: quote.windowLines,
      awningLines: quote.awningLines,
      ratesUpdatedAt: quote.ratesUpdatedAt,
    },
    cost: {
      total: quote.total,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteSavedQuote(id: string): Promise<void> {
  const db = createClient();
  const { error } = await db.from(TABLE).delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}
