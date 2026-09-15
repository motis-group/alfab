import { QuoteStatus, StoredQuoteStatus, effectiveQuoteStatus } from '@utils/quote-status';
import { todayISODate } from '@utils/order-management';
import { AwningCostingInput } from '@utils/awning-costing';
import { SavedAwningCosting, listAwningCostings } from '@utils/awning-quote-store';
import { CustomerQuote, QuoteLine, listCustomerQuotes } from '@utils/customer-quote-store';
import { SavedGlassQuote, listGlassQuotes } from '@utils/glass-quote-store';
import { WindowCostingInput } from '@utils/window-costing';
import { SavedWindowCosting, listWindowCostings } from '@utils/window-quote-store';
import { AwningQuoteLine, GlassQuoteLine, QuoteToOrderDraftInput, WindowQuoteLine } from '@utils/quote-to-order';
import { SavedQuote, SavedQuoteLine, listQuotes, quotePaperLines } from '@utils/quote-store';
import { createLineDraft } from '@utils/order-draft';
import { describeGlassSpecification } from '@utils/calculations';

/**
 * The kind 'quote' is a quote for a job. It holds lines of any kind.
 *
 * The other three kinds are the documents of the calculators. Each holds one kind of line. Save
 * Quote on the glass calculator writes a 'glass' quote. Save Costing and Quote For Customer on the
 * window and awning calculators write a 'window' or an 'awning' quote.
 */
export type QuoteKind = 'glass' | 'window' | 'awning' | 'quote';

export const QUOTE_KIND_LABELS: Record<QuoteKind, string> = {
  glass: 'Glass',
  window: 'Window',
  awning: 'Awning',
  quote: 'Job',
};

/**
 * One saved quote, whichever calculator priced it. The three calculators write to the same table
 * with different shapes; this is the shape the order list reads.
 */
export interface QuoteRecord {
  id: string;
  kind: QuoteKind;
  /** The name of the kind in a list. The kind of a job quote comes from its lines. */
  kindLabel: string;
  /** True if the quote page can change the quote. The document of a calculator is read-only. */
  editable: boolean;
  name: string;
  customer: string;
  customerId: string | null;
  date: string;
  /** What the customer reads off a printed quote, e.g. Q-3F2A9C1E. Null for a costing never printed. */
  reference: string | null;
  /** The lines as they were printed, unpriced ones included. Only a printed quote has them. */
  printedLines?: QuoteLine[];
  /**
   * The lines in the shape the quote page edits.
   *
   * A quote that one of the calculators wrote holds the calculator input for every line, so the
   * quote page can edit it. Saving rewrites the row as a quote for a job. The row keeps its id, so
   * the number the customer holds still finds it.
   *
   * A line with no price is not here. It carries no offer, and it would otherwise print as $0.00.
   * mergeQuotesForOrder drops such a line for the same reason.
   */
  editableLines: SavedQuoteLine[];
  /** Purchase order lines this quote would create. */
  lineCount: number;
  total: number;
  status: QuoteStatus;
  /** The purchase order the quote became, which is what makes it won. Null until then. */
  purchaseOrderId: string | null;
  /** The draft an order is created from, or null when the quote has no price to carry. */
  draft: QuoteToOrderDraftInput | null;
}

export function fromGlass(quote: SavedGlassQuote): QuoteRecord {
  return {
    id: quote.id,
    kind: 'glass',
    kindLabel: QUOTE_KIND_LABELS['glass'],
    editable: false,
    editableLines: quote.items
      .filter((item) => item.unitPrice > 0)
      .map((item) => ({
        draft: createLineDraft({ pricingSource: 'adhoc_calculator', adhocSpec: item.spec, quantityOrdered: Math.max(1, item.quantity), unitPriceAtOrder: item.unitPrice, lineNote: item.name, markupPercent: item.markupPercent }),
        spec: describeGlassSpecification(item.spec),
        extras: [],
      })),
    reference: null,
    name: quote.name,
    customer: quote.customer,
    customerId: quote.customerId,
    date: quote.date,
    lineCount: quote.items.length,
    total: quote.total,
    status: quote.status,
    purchaseOrderId: quote.purchaseOrderId,
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

export function fromWindow(costing: SavedWindowCosting): QuoteRecord {
  return {
    id: costing.id,
    kind: 'window',
    kindLabel: QUOTE_KIND_LABELS['window'],
    editable: false,
    editableLines: costing.price == null ? [] : [{ draft: createLineDraft({ pricingSource: 'window_calculator', windowSpec: costing.input, quantityOrdered: 1, unitPriceAtOrder: costing.price, lineNote: costing.name, windowRatesUpdatedAt: costing.ratesUpdatedAt ?? null }), spec: '', extras: [] }],
    reference: null,
    name: costing.name,
    customer: costing.customer,
    customerId: null,
    date: costing.date,
    lineCount: 1,
    total: costing.price ?? 0,
    status: costing.status,
    purchaseOrderId: costing.purchaseOrderId,
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

export function fromAwning(costing: SavedAwningCosting): QuoteRecord {
  return {
    id: costing.id,
    kind: 'awning',
    kindLabel: QUOTE_KIND_LABELS['awning'],
    editable: false,
    editableLines: costing.price == null ? [] : [{ draft: createLineDraft({ pricingSource: 'awning_calculator', awningSpec: costing.input, quantityOrdered: Math.max(1, costing.input.qty), unitPriceAtOrder: costing.price, lineNote: costing.name, awningRatesUpdatedAt: costing.ratesUpdatedAt ?? null }), spec: '', extras: [] }],
    reference: null,
    name: costing.name,
    customer: costing.customer,
    customerId: null,
    date: costing.date,
    lineCount: 1,
    total: (costing.price ?? 0) * Math.max(1, costing.input.qty),
    status: costing.status,
    purchaseOrderId: costing.purchaseOrderId,
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
    kindLabel: QUOTE_KIND_LABELS[quote.kind === 'window-quote' ? 'window' : 'awning'],
    editable: false,
    editableLines: priced.map((line) => ({
      draft: createLineDraft(quote.kind === 'window-quote' ? { pricingSource: 'window_calculator', windowSpec: line.input as WindowCostingInput, quantityOrdered: Math.max(1, line.quantity), unitPriceAtOrder: line.unitPrice as number, lineNote: line.description, windowRatesUpdatedAt: quote.ratesUpdatedAt } : { pricingSource: 'awning_calculator', awningSpec: line.input as AwningCostingInput, quantityOrdered: Math.max(1, line.quantity), unitPriceAtOrder: line.unitPrice as number, lineNote: line.description, awningRatesUpdatedAt: quote.ratesUpdatedAt }),
      spec: line.spec,
      extras: line.extras || [],
    })),
    reference: quote.reference,
    printedLines: quote.lines,
    name: quote.name,
    customer: quote.customer,
    customerId: quote.customerId,
    date: quote.date,
    lineCount: quote.lines.length,
    total: quote.subtotal,
    status: quote.status,
    purchaseOrderId: quote.purchaseOrderId,
    draft: priced.length
      ? {
          quoteName: quote.name,
          customerName: quote.customer,
          customerId: quote.customerId,
          quoteDate: quote.date.slice(0, 10),
          quoteNotes: quote.notes,
          ...(quote.kind === 'window-quote' ? { windowLines: priced.map((line) => ({ ...orderLine(line), windowSpec: line.input as WindowCostingInput })) } : { awningLines: priced.map((line) => ({ ...orderLine(line), awningSpec: line.input as AwningCostingInput })) }),
        }
      : null,
  };
}

/** The kinds of line on a job quote, as one string for one column of a list. */
function linesLabel(quote: SavedQuote): string {
  const seen = new Set<string>();
  for (const line of quote.lines) {
    if (line.draft.pricingSource === 'window_calculator') {
      seen.add('Window');
    } else if (line.draft.pricingSource === 'awning_calculator') {
      seen.add('Awning');
    } else if (line.draft.pricingSource === 'adhoc_calculator') {
      seen.add('Glass');
    }
  }
  return seen.size ? Array.from(seen).join(' + ') : QUOTE_KIND_LABELS.quote;
}

/** Reads a quote for a job. Each line has a price from the calculator for its kind. */
export function fromSavedQuote(quote: SavedQuote): QuoteRecord {
  const glassLines: GlassQuoteLine[] = [];
  const windowLines: WindowQuoteLine[] = [];
  const awningLines: AwningQuoteLine[] = [];

  for (const line of quote.lines) {
    const draft = line.draft;
    const common = { description: draft.lineNote || 'Item', quantity: draft.quantityOrdered, unitPrice: draft.unitPriceAtOrder };

    if (draft.pricingSource === 'window_calculator' && draft.windowSpec) {
      windowLines.push({ ...common, windowSpec: draft.windowSpec, ratesUpdatedAt: draft.windowRatesUpdatedAt });
    } else if (draft.pricingSource === 'awning_calculator' && draft.awningSpec) {
      awningLines.push({ ...common, awningSpec: draft.awningSpec, ratesUpdatedAt: draft.awningRatesUpdatedAt });
    } else if (draft.pricingSource === 'adhoc_calculator') {
      glassLines.push({ ...common, markupPercent: draft.markupPercent, spec: draft.adhocSpec });
    }
  }

  const orderLines = glassLines.length + windowLines.length + awningLines.length;

  return {
    id: quote.id,
    kind: 'quote',
    kindLabel: linesLabel(quote),
    editable: true,
    editableLines: quote.lines,
    reference: quote.reference,
    printedLines: quotePaperLines(quote.lines),
    name: quote.name,
    customer: quote.customer,
    customerId: quote.customerId,
    date: quote.date,
    lineCount: quote.lines.length,
    total: quote.subtotal,
    status: quote.status,
    purchaseOrderId: quote.purchaseOrderId,
    draft: orderLines
      ? {
          quoteName: quote.name,
          customerName: quote.customer,
          customerId: quote.customerId,
          quoteDate: quote.date ? quote.date.slice(0, 10) : '',
          quoteNotes: quote.notes,
          glassLines,
          windowLines,
          awningLines,
        }
      : null,
  };
}

/** Every saved quote, newest first. A calculator that fails to read is reported, not dropped. */
export async function listQuoteRecords(): Promise<{ records: QuoteRecord[]; errors: string[] }> {
  const [glass, windows, awnings, printed, jobs] = await Promise.allSettled([listGlassQuotes(), listWindowCostings(), listAwningCostings(), listCustomerQuotes(), listQuotes()]);
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

  if (jobs.status === 'fulfilled') {
    records.push(...jobs.value.map(fromSavedQuote));
  } else {
    errors.push('Quotes could not be read.');
  }

  records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  // Every reader of a quote's status comes through here, so this is where an unanswered quote expires.
  const today = todayISODate();
  // The mappers carry the stored status; this is where it becomes the status every list shows.
  return { records: records.map((record) => ({ ...record, status: effectiveQuoteStatus({ status: record.status as StoredQuoteStatus, date: record.date, purchaseOrderId: record.purchaseOrderId }, today) })), errors };
}

export interface MergedQuoteDraft {
  draft: QuoteToOrderDraftInput;
  /** What the estimator has to look at before saving the order. */
  warnings: string[];
}

/** Why a set of quotes cannot become one order. */
export interface MergeRefusal {
  reason: string;
}

/**
 * Several quotes as one purchase order.
 *
 * A boat needs windows, awnings and cut glass, each priced on its own page and saved as its own
 * quote. Converting them together concatenates their lines into one draft, so the customer gets one
 * order and one number.
 *
 * One order goes to one customer, so quotes naming different customers are refused. A purchase
 * order carries a single customer id and a single delivery address, and a line carries no customer
 * of its own, so nothing downstream would catch one customer's glass on another's order.
 */
export function mergeQuotesForOrder(records: QuoteRecord[]): MergedQuoteDraft | MergeRefusal | null {
  const priced = records.filter((record) => record.draft);
  if (!priced.length) {
    return null;
  }

  // Names are matched the way the order editor matches a walk-in typed by hand, so two spellings of
  // one name are one customer. A quote that knows the customer id and one that does not are still
  // the same customer, which is why the two are counted separately rather than as one key.
  const names = new Map<string, string>();
  const ids = new Set<string>();
  for (const record of priced) {
    const name = record.customer.trim();
    if (name) {
      names.set(name.toLowerCase().replace(/\s+/g, ' '), name);
    }
    if (record.customerId) {
      ids.add(record.customerId);
    }
  }

  if (names.size > 1) {
    return { reason: `One order goes to one customer. These quotes name ${names.size}: ${Array.from(names.values()).join(', ')}.` };
  }
  if (ids.size > 1) {
    return { reason: 'One order goes to one customer. These quotes are written against different customer records with the same name.' };
  }

  const warnings: string[] = [];
  for (const record of records) {
    if (!record.draft) {
      warnings.push(`${record.name || QUOTE_KIND_LABELS[record.kind]} has no priced line and is not on the order.`);
    }
  }

  const withCustomerId = priced.find((record) => record.customerId);
  const notes = priced.map((record) => record.draft!.quoteNotes).filter((note) => note && note.trim());
  // A printed quote is named with its reference, so the order says which offer it came from.
  const label = (record: QuoteRecord) => [record.reference, record.name].filter(Boolean).join(' ');

  return {
    draft: {
      quoteName: priced.length === 1 ? label(priced[0]) : priced.map(label).filter(Boolean).join(' + '),
      customerName: withCustomerId?.customer || priced[0].customer,
      customerId: withCustomerId?.customerId || null,
      quoteDate: priced[0].draft!.quoteDate,
      quoteNotes: Array.from(new Set(notes)).join('\n'),
      glassLines: priced.flatMap((record) => record.draft!.glassLines || []),
      windowLines: priced.flatMap((record) => record.draft!.windowLines || []),
      awningLines: priced.flatMap((record) => record.draft!.awningLines || []),
      quoteIds: priced.map((record) => record.id),
    },
    warnings,
  };
}

/**
 * One saved quote by id, whichever calculator priced it. The four stores have no reader for a
 * single row, and a shop has hundreds of quotes rather than millions, so this reads the register
 * and picks. Null when nothing has that id.
 */
export async function findQuoteRecord(id: string): Promise<{ record: QuoteRecord | null; errors: string[] }> {
  const { records, errors } = await listQuoteRecords();
  return { record: records.find((record) => record.id === id) || null, errors };
}

/** Whether a merge came back refused. */
export function isMergeRefusal(result: MergedQuoteDraft | MergeRefusal | null): result is MergeRefusal {
  return result !== null && 'reason' in result;
}
