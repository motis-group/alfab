import { createClient } from '@utils/db-client';
import { QuoteStatus, readQuoteStatus } from '@utils/quote-status';
import { CostBreakdown, GlassSpecification } from '@utils/calculations';

const TABLE = 'quotes';

/** One piece on a glass quote: what to cut, how many, and what it was quoted at. */
export interface SavedGlassItem {
  name: string;
  spec: GlassSpecification;
  quantity: number;
  markupPercent: number;
  unitPrice: number;
  breakdown: CostBreakdown | null;
}

/**
 * A glass quote as it was given. Reopening one shows the prices that were quoted rather than
 * repricing on today's rates, which is why the rate stamp is kept beside them.
 */
export interface SavedGlassQuote {
  id: string;
  name: string;
  customer: string;
  customerId: string | null;
  date: string;
  notes: string;
  items: SavedGlassItem[];
  total: number;
  status: QuoteStatus;
  /** Why it was lost, when it was lost. */
  statusReason: string | null;
  /** Stamp of the glass rates the saved prices were calculated on. */
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

/** Glass quotes share the quotes table with window costings, so rows carry a kind. */
function toSavedQuote(row: QuoteRow): SavedGlassQuote | null {
  const specification = asObject(row.specification);
  if (!specification || specification.kind !== 'glass' || !Array.isArray(specification.items)) {
    return null;
  }
  const cost = asObject(row.cost) || {};

  return {
    id: row.id,
    name: row.name || 'Glass quote',
    customer: row.client || '',
    customerId: typeof specification.customerId === 'string' ? specification.customerId : null,
    date: row.date || '',
    notes: typeof specification.notes === 'string' ? specification.notes : '',
    items: specification.items as SavedGlassItem[],
    total: typeof cost.total === 'number' ? cost.total : 0,
    status: readQuoteStatus(row.status),
    statusReason: typeof row.status_reason === 'string' ? row.status_reason : null,
    ratesUpdatedAt: typeof specification.ratesUpdatedAt === 'string' ? specification.ratesUpdatedAt : null,
  };
}

export async function listGlassQuotes(): Promise<SavedGlassQuote[]> {
  const db = createClient();
  const { data, error } = await db.from(TABLE).select('*').order('date', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data as QuoteRow[]) || []).map(toSavedQuote).filter(Boolean) as SavedGlassQuote[];
}

export async function saveGlassQuote(quote: { name: string; customer: string; customerId: string | null; notes: string; items: SavedGlassItem[]; total: number; ratesUpdatedAt: string | null }): Promise<void> {
  const db = createClient();
  const { error } = await db.from(TABLE).insert({
    name: quote.name.trim() || 'Glass quote',
    client: quote.customer.trim() || 'No Client',
    specification: {
      kind: 'glass',
      customerId: quote.customerId,
      notes: quote.notes,
      items: quote.items,
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

export async function deleteGlassQuote(id: string): Promise<void> {
  const db = createClient();
  const { error } = await db.from(TABLE).delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}
