import { createClient } from '@utils/db-client';
import { QuoteStatus, readQuoteStatus } from '@utils/quote-status';
import { CostLine, WindowCostingInput, WindowCostResult, readFinish } from '@utils/window-costing';

const TABLE = 'quotes';

/** Saved window costing. Doubles as a per-customer template: load it to price the same window again. */
export interface SavedWindowCosting {
  id: string;
  name: string;
  customer: string;
  date: string;
  input: WindowCostingInput;
  price: number | null;
  unitLabel: string;
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

/** Window costings share the quotes table with the glass calculator, so rows carry a kind. */
function toSavedCosting(row: QuoteRow): SavedWindowCosting | null {
  const specification = asObject(row.specification);
  if (!specification || specification.kind !== 'window' || !specification.input) {
    return null;
  }
  const cost = asObject(row.cost) || {};
  const price = typeof cost.price === 'number' ? cost.price : null;
  const input = specification.input as WindowCostingInput;

  return {
    id: row.id,
    name: row.name || 'Window costing',
    customer: row.client || '',
    date: row.date || '',
    input: { ...input, finish: readFinish(input.finish) },
    price,
    unitLabel: typeof cost.unitLabel === 'string' ? cost.unitLabel : 'Per Each',
    lines: Array.isArray(cost.lines) ? (cost.lines as CostLine[]) : [],
    glazing: Array.isArray(cost.glazing) ? (cost.glazing as CostLine[]) : [],
    status: readQuoteStatus(row.status),
    statusReason: typeof row.status_reason === 'string' ? row.status_reason : null,
    ratesUpdatedAt: typeof specification.ratesUpdatedAt === 'string' ? specification.ratesUpdatedAt : null,
  };
}

export async function listWindowCostings(): Promise<SavedWindowCosting[]> {
  const db = createClient();
  const { data, error } = await db.from(TABLE).select('*').order('date', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data as QuoteRow[]) || []).map(toSavedCosting).filter(Boolean) as SavedWindowCosting[];
}

export async function saveWindowCosting(costing: { name: string; customer: string; input: WindowCostingInput; result: WindowCostResult; ratesUpdatedAt: string | null }): Promise<void> {
  const db = createClient();
  const { error } = await db.from(TABLE).insert({
    name: costing.name.trim() || 'Window costing',
    client: costing.customer.trim() || 'No Client',
    specification: {
      kind: 'window',
      input: costing.input,
      ratesUpdatedAt: costing.ratesUpdatedAt,
    },
    cost: {
      price: costing.result.price,
      unitLabel: costing.result.unitLabel,
      subtotal: costing.result.subtotal,
      margin: costing.result.margin,
      packing: costing.result.packing,
      uplift: costing.result.uplift,
      lines: costing.result.lines,
      glazing: costing.result.glazing,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteWindowCosting(id: string): Promise<void> {
  const db = createClient();
  const { error } = await db.from(TABLE).delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}
