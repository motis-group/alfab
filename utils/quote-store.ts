/**
 * A quote for a job. The quote holds lines of any kind, because a job is one offer. Each calculator
 * prices one line at a time.
 *
 * A line is a LineDraft. An order line has the same shape. A calculator returns a line in one shape
 * for both documents. A quote does not use the order fields of a LineDraft. Examples: the quantity
 * made, the database id.
 *
 * Rows share the quotes table with four other shapes, which the calculators write. The field
 * specification.kind identifies the shape.
 */

import { GST_RATE, QuoteLine, quoteReference, quoteTotals, toCents } from '@utils/customer-quote-store';
import { LineDraft } from '@utils/order-draft';
import { StoredQuoteStatus, readQuoteStatus } from '@utils/quote-status';
import { createClient } from '@utils/db-client';

const TABLE = 'quotes';

/** The value of specification.kind for a quote for a job. */
export const QUOTE_KIND = 'quote';

/** The margin a new quote starts at, in percent on cost. The glass calculator's markup starts at the same figure. */
export const DEFAULT_QUOTE_MARGIN_PERCENT = 20;

/** One line on a quote. The line holds the price and the calculator input. */
export interface SavedQuoteLine {
  /** The line as the calculator returns it. The same calculator can edit the line again. */
  draft: LineDraft;
  /**
   * One unit at cost, as the calculator priced it. The margin of the quote makes the price.
   *
   * A line with no cost keeps its price, which already holds a margin. Examples: a line of a quote
   * that a calculator wrote, a line of a quote whose row stores no costs, and a piece with a manual
   * price on a quote printed from the glass calculator. Pricing the line again in its calculator
   * gives it a cost.
   */
  unitCost?: number | null;
  /**
   * The specification in the words of the calculator, as printed.
   *
   * This module stores the text and does not build it again. A quote states the offer of that day.
   * A later change to the catalogue must not change the text.
   */
  spec: string;
  /** Items charged in addition. An item has a cost when the margin of the quote prices it. */
  extras: { label: string; total: number | null; cost?: number | null }[];
}

/** The content of the quote. */
export interface SavedQuoteContent {
  name: string;
  customer: string;
  customerId: string | null;
  /** The date on the quote. The 30-day price hold starts on this date. */
  date: string;
  notes: string;
  /** Percent on cost. It prices every line that has a cost. */
  marginPercent: number;
  lines: SavedQuoteLine[];
}

export interface SavedQuote extends SavedQuoteContent {
  id: string;
  reference: string;
  subtotal: number;
  gst: number;
  issuedBy: string | null;
  issuedAt: string | null;
  /** The time stamp of the rates that produced the prices. */
  ratesUpdatedAt: string | null;
  status: StoredQuoteStatus;
  purchaseOrderId: string | null;
}

/** One line for the customer. The paper shows these lines. The paper does not show the drafts. */
export function paperLine(line: SavedQuoteLine): QuoteLine {
  return {
    description: line.draft.lineNote || 'Item',
    spec: line.spec,
    quantity: line.draft.quantityOrdered,
    unitPrice: line.draft.unitPriceAtOrder,
    // The customer reads the price of an extra, never its cost.
    extras: line.extras.map(({ label, total }) => ({ label, total })),
  };
}

export function quotePaperLines(lines: SavedQuoteLine[]): QuoteLine[] {
  return lines.map(paperLine);
}

/** The total of the lines, with GST included. */
export function quoteTotal(lines: SavedQuoteLine[]): number {
  return quoteTotals(quotePaperLines(lines)).total;
}

/** One unit at the margin, to the cent, so the printed unit price times the quantity is the printed amount. */
export function priceAtMargin(cost: number, marginPercent: number): number {
  return toCents(cost * (1 + marginPercent / 100));
}

/** Prices a line from its cost at the margin of the quote. A line with no cost keeps its price. */
export function applyQuoteMargin(line: SavedQuoteLine, marginPercent: number): SavedQuoteLine {
  if (typeof line.unitCost !== 'number') {
    return line;
  }
  return {
    ...line,
    // An order made from the quote reads the margin of a glass line from its markup.
    draft: { ...line.draft, unitPriceAtOrder: priceAtMargin(line.unitCost, marginPercent), markupPercent: marginPercent },
    extras: line.extras.map((extra) => (typeof extra.cost === 'number' ? { ...extra, total: priceAtMargin(extra.cost, marginPercent) } : extra)),
  };
}

/**
 * What the margin adds, for the office. The customer reads only the prices.
 *
 * A line with no cost keeps its own price, so it counts in neither the cost nor the margin. The
 * three parts add up to the subtotal that the paper prints.
 */
export function quoteMarginSummary(lines: SavedQuoteLine[]): { cost: number; margin: number; fixed: number; subtotal: number } {
  const { amounts, subtotal } = quoteTotals(quotePaperLines(lines));
  let cost = 0;
  let atMargin = 0;
  lines.forEach((line, index) => {
    if (typeof line.unitCost === 'number') {
      cost += toCents(line.unitCost * line.draft.quantityOrdered);
      atMargin += amounts[index] ?? 0;
    }
  });
  return { cost: toCents(cost), margin: toCents(atMargin - cost), fixed: toCents(subtotal - atMargin), subtotal };
}

function rowFields(quote: SavedQuoteContent & { issuedBy: string | null; ratesUpdatedAt: string | null }) {
  const { subtotal, gst } = quoteTotals(quotePaperLines(quote.lines));
  return {
    name: quote.name.trim(),
    client: quote.customer.trim(),
    // Use midnight UTC. The date read back is then the date written, in every time zone.
    date: `${quote.date}T00:00:00Z`,
    specification: {
      kind: QUOTE_KIND,
      customerId: quote.customerId,
      notes: quote.notes,
      marginPercent: quote.marginPercent,
      lines: quote.lines,
      issuedBy: quote.issuedBy,
      issuedAt: new Date().toISOString(),
      ratesUpdatedAt: quote.ratesUpdatedAt,
    },
    cost: { subtotal, gst },
  };
}

function assertDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Set the quote date: the 30-day price hold runs from it.');
  }
}

/** Writes a new quote. Returns the record id. The reference comes from the record id. */
export async function createQuote(quote: SavedQuoteContent & { issuedBy: string | null; ratesUpdatedAt: string | null }): Promise<string> {
  assertDate(quote.date);
  const db = createClient();
  const { data, error } = await db.from(TABLE).insert(rowFields(quote)).select('id').single();

  if (error || !data?.id) {
    throw new Error(error?.message || 'The quote was saved but no record id came back.');
  }
  return data.id as string;
}

/** Rewrites a quote that has a number. The number does not change. The customer holds that number. */
export async function updateQuote(id: string, quote: SavedQuoteContent & { issuedBy: string | null; ratesUpdatedAt: string | null }): Promise<void> {
  assertDate(quote.date);
  const db = createClient();
  const { error } = await db.from(TABLE).update(rowFields(quote)).eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
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

/** Reads a quotes row. Returns null for a row of another kind. */
export function toSavedQuote(row: QuoteRow): SavedQuote | null {
  const specification = asObject(row.specification);
  if (!specification || specification.kind !== QUOTE_KIND || !Array.isArray(specification.lines)) {
    return null;
  }

  // A line without a draft cannot be priced or edited. Discard it.
  const lines = (specification.lines as SavedQuoteLine[]).filter((line) => line && line.draft && typeof line.draft.localId === 'string');
  const cost = asObject(row.cost) || {};
  const totals = quoteTotals(quotePaperLines(lines));
  const text = (value: unknown) => (typeof value === 'string' ? value : null);

  return {
    id: row.id,
    reference: quoteReference(row.id),
    name: row.name || '',
    customer: row.client || '',
    customerId: text(specification.customerId),
    date: row.date || '',
    notes: text(specification.notes) || '',
    // A row with no margin reads at the default. Its lines have no cost, so the default prices none
    // of them.
    marginPercent: typeof specification.marginPercent === 'number' ? specification.marginPercent : DEFAULT_QUOTE_MARGIN_PERCENT,
    lines,
    // The stored total is the offer. Calculate the total again only if the row has no total.
    subtotal: typeof cost.subtotal === 'number' ? cost.subtotal : totals.subtotal,
    gst: typeof cost.gst === 'number' ? cost.gst : totals.gst,
    issuedBy: text(specification.issuedBy),
    issuedAt: text(specification.issuedAt),
    ratesUpdatedAt: text(specification.ratesUpdatedAt),
    status: readQuoteStatus(row.status),
    purchaseOrderId: typeof row.purchase_order_id === 'string' ? row.purchase_order_id : null,
  };
}

/** Reads one quote by record id. Returns null if no row of this kind has that id. */
export async function findQuote(id: string): Promise<SavedQuote | null> {
  const quotes = await listQuotes();
  return quotes.find((quote) => quote.id === id) || null;
}

export async function listQuotes(): Promise<SavedQuote[]> {
  const db = createClient();
  const { data, error } = await db.from(TABLE).select('*').order('date', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data as QuoteRow[]) || []).map(toSavedQuote).filter(Boolean) as SavedQuote[];
}

export { GST_RATE, quoteReference };
