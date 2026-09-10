import { QuoteStatus } from '@utils/quote-status';
import { SavedAwningCosting, listAwningCostings } from '@utils/awning-quote-store';
import { SavedGlassQuote, listGlassQuotes } from '@utils/glass-quote-store';
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

/** Every saved quote, newest first. A calculator that fails to read is reported, not dropped. */
export async function listQuoteRecords(): Promise<{ records: QuoteRecord[]; errors: string[] }> {
  const [glass, windows, awnings] = await Promise.allSettled([listGlassQuotes(), listWindowCostings(), listAwningCostings()]);
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

  records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { records, errors };
}

export interface MergedQuoteDraft {
  draft: QuoteToOrderDraftInput;
  /** What the estimator has to look at before saving the order. */
  warnings: string[];
}

/**
 * Several quotes as one purchase order.
 *
 * A boat needs windows, awnings and cut glass, each priced on its own page and saved as its own
 * quote. Converting them together concatenates their lines into one draft, so the customer gets one
 * order and one number. Quotes written against different customers are still merged — the estimator
 * is told, because it is usually a mistake and occasionally not.
 */
export function mergeQuotesForOrder(records: QuoteRecord[]): MergedQuoteDraft | null {
  const priced = records.filter((record) => record.draft);
  if (!priced.length) {
    return null;
  }

  const warnings: string[] = [];
  for (const record of records) {
    if (!record.draft) {
      warnings.push(`${record.name || QUOTE_KIND_LABELS[record.kind]} has no priced line and is not on the order.`);
    }
  }

  const customers = new Set(priced.map((record) => record.customer.trim()).filter(Boolean));
  if (customers.size > 1) {
    warnings.push(`These quotes name ${customers.size} different customers: ${Array.from(customers).join(', ')}. Check the order is for one of them.`);
  }

  const withCustomerId = priced.find((record) => record.customerId);
  const notes = priced.map((record) => record.draft!.quoteNotes).filter((note) => note && note.trim());

  return {
    draft: {
      quoteName: priced.length === 1 ? priced[0].name : priced.map((record) => record.name).filter(Boolean).join(' + '),
      customerName: withCustomerId?.customer || priced[0].customer,
      customerId: withCustomerId?.customerId || null,
      quoteDate: priced[0].draft!.quoteDate,
      quoteNotes: Array.from(new Set(notes)).join('\n'),
      glassLines: priced.flatMap((record) => record.draft!.glassLines || []),
      windowLines: priced.flatMap((record) => record.draft!.windowLines || []),
      awningLines: priced.flatMap((record) => record.draft!.awningLines || []),
    },
    warnings,
  };
}
