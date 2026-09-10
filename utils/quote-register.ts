import { QuoteStatus } from '@utils/quote-status';
import { AwningCostingInput } from '@utils/awning-costing';
import { SavedAwningCosting, listAwningCostings } from '@utils/awning-quote-store';
import { CustomerQuote, listCustomerQuotes } from '@utils/customer-quote-store';
import { SavedGlassQuote, listGlassQuotes } from '@utils/glass-quote-store';
import { WindowCostingInput } from '@utils/window-costing';
import { SavedWindowCosting, listWindowCostings } from '@utils/window-quote-store';
import { QuoteToOrderDraftInput } from '@utils/quote-to-order';

export type QuoteKind = 'glass' | 'window' | 'awning';

export const QUOTE_KIND_LABELS: Record<QuoteKind, string> = {
  glass: 'Glass',
  window: 'Window',
  awning: 'Awning',
};

/** Where a quote of this kind is opened for editing. */
export const QUOTE_KIND_HREFS: Record<QuoteKind, string> = {
  glass: '/glass/quote',
  window: '/glass/windows',
  awning: '/glass/awnings',
};

/**
 * One saved quote, whichever calculator priced it. The three calculators write to the same table
 * with different shapes; this is the shape the order list reads.
 */
export interface QuoteRecord {
  id: string;
  kind: QuoteKind;
  name: string;
  customer: string;
  customerId: string | null;
  date: string;
  /** What the customer reads off a printed quote, e.g. Q-3F2A9C1E. Null for a costing never printed. */
  reference: string | null;
  /** Purchase order lines this quote would create. */
  lineCount: number;
  total: number;
  status: QuoteStatus;
  statusReason: string | null;
  /** The draft an order is created from, or null when the quote has no price to carry. */
  draft: QuoteToOrderDraftInput | null;
}

function fromGlass(quote: SavedGlassQuote): QuoteRecord {
  return {
    id: quote.id,
    kind: 'glass',
    reference: null,
    name: quote.name,
    customer: quote.customer,
    customerId: quote.customerId,
    date: quote.date,
    lineCount: quote.items.length,
    total: quote.total,
    status: quote.status,
    statusReason: quote.statusReason,
    draft: quote.items.length
      ? {
          quoteName: quote.name,
          customerName: quote.customer,
          customerId: quote.customerId,
          quoteDate: quote.date ? quote.date.slice(0, 10) : '',
          quoteNotes: quote.notes,
          glassLines: quote.items.map((item) => ({
            description: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            markupPercent: item.markupPercent,
            spec: item.spec,
          })),
        }
      : null,
  };
}

function fromWindow(costing: SavedWindowCosting): QuoteRecord {
  return {
    id: costing.id,
    kind: 'window',
    reference: null,
    name: costing.name,
    customer: costing.customer,
    customerId: null,
    date: costing.date,
    lineCount: 1,
    total: costing.price ?? 0,
    status: costing.status,
    statusReason: costing.statusReason,
    draft:
      costing.price == null
        ? null
        : {
            quoteName: costing.name,
            customerName: costing.customer,
            customerId: null,
            quoteDate: costing.date ? costing.date.slice(0, 10) : '',
            quoteNotes: '',
            windowLines: [{ description: costing.name, quantity: 1, unitPrice: costing.price, windowSpec: costing.input, ratesUpdatedAt: costing.ratesUpdatedAt ?? null }],
          },
  };
}

function fromAwning(costing: SavedAwningCosting): QuoteRecord {
  return {
    id: costing.id,
    kind: 'awning',
    reference: null,
    name: costing.name,
    customer: costing.customer,
    customerId: null,
    date: costing.date,
    lineCount: 1,
    total: (costing.price ?? 0) * Math.max(1, costing.input.qty),
    status: costing.status,
    statusReason: costing.statusReason,
    draft:
      costing.price == null
        ? null
        : {
            quoteName: costing.name,
            customerName: costing.customer,
            customerId: null,
            quoteDate: costing.date ? costing.date.slice(0, 10) : '',
            quoteNotes: '',
            awningLines: [{ description: costing.name, quantity: Math.max(1, costing.input.qty), unitPrice: costing.price, awningSpec: costing.input, ratesUpdatedAt: costing.ratesUpdatedAt ?? null }],
          },
  };
}

/** A quote printed for a customer, with its lines as printed. */
export function fromCustomerQuote(quote: CustomerQuote): QuoteRecord {
  const priced = quote.lines.filter((line) => line.unitPrice != null);
  const orderLine = (line: (typeof priced)[number]) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice as number, ratesUpdatedAt: quote.ratesUpdatedAt });

  return {
    id: quote.id,
    kind: quote.kind === 'window-quote' ? 'window' : 'awning',
    reference: quote.reference,
    name: quote.name,
    customer: quote.customer,
    customerId: quote.customerId,
    date: quote.date,
    lineCount: quote.lines.length,
    total: quote.subtotal,
    status: quote.status,
    statusReason: quote.statusReason,
    draft: priced.length
      ? {
          quoteName: `${quote.reference} ${quote.name}`,
          customerName: quote.customer,
          customerId: quote.customerId,
          quoteDate: quote.date.slice(0, 10),
          quoteNotes: quote.notes,
          ...(quote.kind === 'window-quote' ? { windowLines: priced.map((line) => ({ ...orderLine(line), windowSpec: line.input as WindowCostingInput })) } : { awningLines: priced.map((line) => ({ ...orderLine(line), awningSpec: line.input as AwningCostingInput })) }),
        }
      : null,
  };
}

/** Every saved quote, newest first. A calculator that fails to read is reported, not dropped. */
export async function listQuoteRecords(): Promise<{ records: QuoteRecord[]; errors: string[] }> {
  const [glass, windows, awnings, printed] = await Promise.allSettled([listGlassQuotes(), listWindowCostings(), listAwningCostings(), listCustomerQuotes()]);
  const records: QuoteRecord[] = [];
  const errors: string[] = [];

  if (glass.status === 'fulfilled') {
    records.push(...glass.value.map(fromGlass));
  } else {
    errors.push('Glass quotes could not be read.');
  }
  if (windows.status === 'fulfilled') {
    records.push(...windows.value.map(fromWindow));
  } else {
    errors.push('Window costings could not be read.');
  }
  if (awnings.status === 'fulfilled') {
    records.push(...awnings.value.map(fromAwning));
  } else {
    errors.push('Awning costings could not be read.');
  }

  if (printed.status === 'fulfilled') {
    records.push(...printed.value.map(fromCustomerQuote));
  } else {
    errors.push('Printed quotes could not be read.');
  }

  records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { records, errors };
}
