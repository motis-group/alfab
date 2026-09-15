import { AwningCostingInput } from '@utils/awning-costing';
import { createClient } from '@utils/db-client';
import { StoredQuoteStatus, readQuoteStatus } from '@utils/quote-status';
import { WindowCostingInput } from '@utils/window-costing';

const TABLE = 'quotes';

/** Quoted prices are struck excluding GST; the printed quote states it rather than burying it. */
export const GST_RATE = 0.1;

/**
 * A window or awning quote as it was printed for a customer. A saved costing in the same table holds
 * one item. These rows are the offers that went out. The quote list reads them, and no page writes
 * them.
 */
export type CustomerQuoteKind = 'window-quote' | 'awning-quote';

/** One line as the customer reads it. */
export interface QuoteLine {
  /** What the customer calls it: "Window 1", "Kitchen awning". */
  description: string;
  /** The specification under the description, in the calculator's own words. */
  spec: string;
  quantity: number;
  /** Null when the calculator could not price the line. Such lines carry no amount. */
  unitPrice: number | null;
  extras?: { label: string; total: number | null }[];
}

/** A printed line, with the calculator input that priced it, so the quote can become an order. */
export interface CustomerQuoteLine extends QuoteLine {
  input: WindowCostingInput | AwningCostingInput;
}

/** Everything the printed quote says. */
export interface CustomerQuoteContent {
  kind: CustomerQuoteKind;
  name: string;
  customer: string;
  customerId: string | null;
  /** The date printed on the quote. The 30-day price hold runs from it. */
  date: string;
  notes: string;
  lines: CustomerQuoteLine[];
}

export interface CustomerQuote extends CustomerQuoteContent {
  id: string;
  reference: string;
  subtotal: number;
  gst: number;
  /** Who printed it and when, as the browser reported. The date above can be set by hand. */
  issuedBy: string | null;
  issuedAt: string | null;
  /** Stamp of the rates the prices were calculated on. */
  ratesUpdatedAt: string | null;
  /** What the stored status still says. Won comes from the order link, not from here. */
  status: StoredQuoteStatus;
  /** The purchase order this quote became. Null until an order made from it is saved. */
  purchaseOrderId: string | null;
}

/**
 * Money to the cent.
 *
 * The paper prints each amount to the cent. The totals must therefore be built from amounts of the
 * same size. A customer who adds the column must reach the printed total.
 */
export function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function quoteTotals(lines: QuoteLine[]) {
  // Round each amount before it is added, because each amount is printed. A sum of unrounded
  // products can differ from the sum of the printed column by a cent.
  const amounts = lines.map((line) => (line.unitPrice == null ? null : toCents(line.unitPrice * line.quantity)));
  const subtotal = toCents(amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0));
  const gst = toCents(subtotal * GST_RATE);
  return { amounts, subtotal, gst, total: toCents(subtotal + gst), anyUnpriced: amounts.some((amount) => amount == null) };
}

/**
 * What a customer reads out to refer to a quote: the record id, shortened. Eight hex digits are
 * unique in practice at Alfab's volume, not by construction.
 */
// ponytail: prefix of a uuid, no uniqueness guarantee; a sequential quote number when the quotes table gets a column for it.
export function quoteReference(id: string): string {
  return `Q-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
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

/** Reads a quotes row. Rows of any other kind, or without lines, are not customer quotes. */
export function toCustomerQuote(row: QuoteRow): CustomerQuote | null {
  const specification = asObject(row.specification);
  const kind = specification?.kind;
  if (!specification || (kind !== 'window-quote' && kind !== 'awning-quote') || !Array.isArray(specification.lines)) {
    return null;
  }
  const lines = specification.lines as CustomerQuoteLine[];
  const cost = asObject(row.cost) || {};
  const totals = quoteTotals(lines);
  const text = (value: unknown) => (typeof value === 'string' ? value : null);

  return {
    id: row.id,
    reference: quoteReference(row.id),
    kind,
    name: row.name || '',
    customer: row.client || '',
    customerId: text(specification.customerId),
    date: row.date || '',
    notes: text(specification.notes) || '',
    lines,
    // What was stored is what was printed; recomputing is the fallback for a row without it.
    subtotal: typeof cost.subtotal === 'number' ? cost.subtotal : totals.subtotal,
    gst: typeof cost.gst === 'number' ? cost.gst : totals.gst,
    issuedBy: text(specification.issuedBy),
    issuedAt: text(specification.issuedAt),
    ratesUpdatedAt: text(specification.ratesUpdatedAt),
    status: readQuoteStatus(row.status),
    purchaseOrderId: typeof row.purchase_order_id === 'string' ? row.purchase_order_id : null,
  };
}

export async function listCustomerQuotes(): Promise<CustomerQuote[]> {
  const db = createClient();
  const { data, error } = await db.from(TABLE).select('*').order('date', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data as QuoteRow[]) || []).map(toCustomerQuote).filter(Boolean) as CustomerQuote[];
}
