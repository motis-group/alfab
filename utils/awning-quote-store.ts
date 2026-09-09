import { createClient } from '@utils/db-client';
import { QuoteStatus, readQuoteStatus } from '@utils/quote-status';
import { AwningCostingInput, AwningCostResult, CostLine } from '@utils/awning-costing';

const TABLE = 'quotes';

/** Saved awning costing. Doubles as a per-customer template: load it to price the same awning again. */
export interface SavedAwningCosting {
  id: string;
  name: string;
  customer: string;
  date: string;
  input: AwningCostingInput;
  price: number | null;
  /** The priced lines as they stood when the costing was saved, so reopening shows what was quoted. */
  lines: CostLine[];
  glazing: CostLine[];
  status: QuoteStatus;
  /** Why it was lost, when it was lost. */
  statusReason: string | null;
  /** Stamp of the rates the saved price was calculated on. */
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

/** Awning costings share the quotes table with the glass and window calculators, so rows carry a kind. */
function toSavedCosting(row: QuoteRow): SavedAwningCosting | null {
  const specification = asObject(row.specification);
  if (!specification || specification.kind !== 'awning' || !specification.input) {
    return null;
  }
  const cost = asObject(row.cost) || {};

  return {
    id: row.id,
    name: row.name || 'Awning costing',
    customer: row.client || '',
    date: row.date || '',
    input: specification.input as AwningCostingInput,
    price: typeof cost.price === 'number' ? cost.price : null,
    lines: Array.isArray(cost.lines) ? (cost.lines as CostLine[]) : [],
    glazing: Array.isArray(cost.glazing) ? (cost.glazing as CostLine[]) : [],
    status: readQuoteStatus(row.status),
    statusReason: typeof row.status_reason === 'string' ? row.status_reason : null,
    ratesUpdatedAt: typeof specification.ratesUpdatedAt === 'string' ? specification.ratesUpdatedAt : null,
  };
}

export async function listAwningCostings(): Promise<SavedAwningCosting[]> {
  const db = createClient();
  const { data, error } = await db.from(TABLE).select('*').order('date', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data as QuoteRow[]) || []).map(toSavedCosting).filter(Boolean) as SavedAwningCosting[];
}

export async function saveAwningCosting(costing: { name: string; customer: string; input: AwningCostingInput; result: AwningCostResult; ratesUpdatedAt: string | null }): Promise<void> {
  const db = createClient();
  const { error } = await db.from(TABLE).insert({
    name: costing.name.trim() || 'Awning costing',
    client: costing.customer.trim() || 'No Client',
    specification: {
      kind: 'awning',
      input: costing.input,
      ratesUpdatedAt: costing.ratesUpdatedAt,
    },
    cost: {
      price: costing.result.price,
      subtotal: costing.result.subtotal,
      margin: costing.result.margin,
      lines: costing.result.lines,
      glazing: costing.result.glazing,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteAwningCosting(id: string): Promise<void> {
  const db = createClient();
  const { error } = await db.from(TABLE).delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}
