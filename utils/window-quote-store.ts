import { createClient } from '@utils/db-client';
import { StoredQuoteStatus, readQuoteStatus } from '@utils/quote-status';
import { CostLine, WindowCostingInput, readFinish } from '@utils/window-costing';

const TABLE = 'quotes';

/** A saved window costing. The order list shows it, and the quote page opens it as a quote for a job. */
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
  /** What the stored status still says. Won comes from the order link, not from here. */
  status: StoredQuoteStatus;
  /** The purchase order this quote became. Null until an order made from it is saved. */
  purchaseOrderId: string | null;
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
  purchase_order_id?: string | null;
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

/** Every kind of quote shares the quotes table, so rows carry a kind. */
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
    purchaseOrderId: typeof row.purchase_order_id === 'string' ? row.purchase_order_id : null,
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
