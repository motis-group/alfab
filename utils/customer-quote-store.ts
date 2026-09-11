import { AwningCostingInput } from '@utils/awning-costing';
import { createClient } from '@utils/db-client';
import { QuoteStatus, readQuoteStatus } from '@utils/quote-status';
import { WindowCostingInput } from '@utils/window-costing';

const TABLE = 'quotes';

/** Quoted prices are struck excluding GST; the printed quote states it rather than burying it. */
export const GST_RATE = 0.1;

/**
 * A window or awning quote as it was printed for a customer. Saved costings in the same table are
 * single-item templates; these are the offers that went out. The glass calculator saves its own.
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

/** Everything the printed quote says. Two prints with the same content are the same offer. */
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
  status: QuoteStatus;
  statusReason: string | null;
}

export function quoteTotals(lines: QuoteLine[]) {
  const amounts = lines.map((line) => (line.unitPrice == null ? null : line.unitPrice * line.quantity));
  const subtotal = amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0);
  const gst = subtotal * GST_RATE;
  return { amounts, subtotal, gst, total: subtotal + gst, anyUnpriced: amounts.some((amount) => amount == null) };
}

/**
 * What a customer reads out to refer to a quote: the record id, shortened. Eight hex digits are
 * unique in practice at Alfab's volume, not by construction.
 */
// ponytail: prefix of a uuid, no uniqueness guarantee; a sequential quote number when the quotes table gets a column for it.
export function quoteReference(id: string): string {
  return `Q-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/** Identifies the offer a print would record. A reprint with the same fingerprint reuses its record. */
export function quoteFingerprint(quote: CustomerQuoteContent): string {
  const { kind, name, customer, customerId, date, notes, lines } = quote;
  return JSON.stringify({ kind, name, customer, customerId, date, notes, lines });
}

/** Saves the quote exactly as it will print, and returns the record id the reference is taken from. */
export async function saveCustomerQuote(quote: CustomerQuoteContent & { issuedBy: string | null; ratesUpdatedAt: string | null }): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(quote.date)) {
    throw new Error('Set the quote date: the 30-day price hold runs from it.');
  }
  const { subtotal, gst } = quoteTotals(quote.lines);
  const db = createClient();
  const { data, error } = await db
    .from(TABLE)
    .insert({
      // As printed, blank included: the paper supplies its own wording for a blank.
      name: quote.name.trim(),
      client: quote.customer.trim(),
      // Midnight UTC, so the day printed is the day read back whatever time zone the database runs in.
      date: `${quote.date}T00:00:00Z`,
      specification: {
        kind: quote.kind,
        customerId: quote.customerId,
        notes: quote.notes,
        lines: quote.lines,
        issuedBy: quote.issuedBy,
        issuedAt: new Date().toISOString(),
        ratesUpdatedAt: quote.ratesUpdatedAt,
      },
      cost: { subtotal, gst },
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || 'The quote was saved but no record id came back.');
  }
  return data.id as string;
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
  status_reason?: string | null;
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
    statusReason: text(row.status_reason),
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
