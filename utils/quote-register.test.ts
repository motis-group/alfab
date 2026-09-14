// Checks that several quotes become one purchase order. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GlassSpecification } from './calculations';
import { MergedQuoteDraft, QuoteRecord, fromSavedQuote, isMergeRefusal, mergeQuotesForOrder } from './quote-register';
import { WindowCostingInput } from './window-costing';
import { createLineDraft } from './order-draft';

/** Enough of a window for a line to carry one; the costing itself is not what these tests check. */
const windowInput = { type: 'T5573', productId: '500-5573' } as unknown as WindowCostingInput;

/** Narrows a merge that is expected to succeed, so a refusal fails the test rather than the types. */
function merged(records: QuoteRecord[]): MergedQuoteDraft {
  const result = mergeQuotesForOrder(records);
  assert.ok(result && !isMergeRefusal(result), 'expected a draft');
  return result;
}

const spec: GlassSpecification = {
  width: 1200,
  height: 600,
  thickness: 6,
  glassType: 'Clear',
  edgework: 'ROUGH ARRIS',
  ceramicBand: false,
  shape: 'RECTANGLE',
  holes: false,
  numHoles: 0,
  radiusCorners: false,
  scanning: false,
};

function glassQuote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'g1',
    kind: 'glass',
    kindLabel: 'Glass',
    editable: false,
    reference: null,
    name: 'Cut glass',
    customer: 'Status Houseboats',
    customerId: 'c1',
    date: '2026-09-10',
    lineCount: 1,
    total: 200,
    status: 'open',
    purchaseOrderId: null,
    draft: { quoteName: 'Cut glass', customerName: 'Status Houseboats', customerId: 'c1', quoteDate: '2026-09-10', quoteNotes: 'deliver to Eildon', glassLines: [{ description: 'Side panel', quantity: 2, unitPrice: 100, markupPercent: 20, spec }] },
    ...over,
  };
}

function windowQuote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'w1',
    kind: 'window',
    kindLabel: 'Window',
    editable: false,
    reference: null,
    name: 'Kitchen hopper',
    customer: 'Status Houseboats',
    customerId: null,
    date: '2026-09-09',
    lineCount: 1,
    total: 800,
    status: 'open',
    purchaseOrderId: null,
    draft: { quoteName: 'Kitchen hopper', customerName: 'Status Houseboats', customerId: null, quoteDate: '2026-09-09', quoteNotes: '', windowLines: [{ description: 'Kitchen hopper', quantity: 1, unitPrice: 800, windowSpec: { type: 'T5573' } as never, ratesUpdatedAt: null }] },
    ...over,
  };
}

test('a boat that needs glass and a window becomes one order', () => {
  const result = merged([glassQuote(), windowQuote()]);

  assert.equal(result.draft.glassLines?.length, 1);
  assert.equal(result.draft.windowLines?.length, 1);
  assert.equal(result.draft.quoteName, 'Cut glass + Kitchen hopper');
  assert.equal(result.draft.customerId, 'c1', 'the quote that knows the customer supplies the id');
  assert.deepEqual(result.warnings, []);
});

test('converting one quote keeps its own name', () => {
  const result = merged([glassQuote()]);

  assert.equal(result.draft.quoteName, 'Cut glass');
  assert.equal(result.draft.quoteNotes, 'deliver to Eildon');
});

/**
 * One order carries one customer id and one delivery address, so two customers' work on one order
 * would put one customer's glass on the other's paperwork with nothing downstream to catch it.
 */
test('quotes for different customers are refused, not merged', () => {
  const result = mergeQuotesForOrder([glassQuote(), windowQuote({ customer: 'Gippsland Marine', customerId: 'c2' })]);

  assert.ok(result && isMergeRefusal(result));
  assert.match(result.reason, /One order goes to one customer/);
  assert.match(result.reason, /Gippsland Marine/);
});

test('two spellings of one customer are one customer', () => {
  const result = merged([glassQuote({ customerId: null, customer: 'Status Houseboats' }), windowQuote({ customerId: null, customer: '  status   houseboats ' })]);

  assert.equal(result.draft.windowLines?.length, 1, 'both quotes are on the order');
});

test('a quote with no priced line is left off the order and reported', () => {
  const result = merged([glassQuote(), windowQuote({ draft: null, name: 'Not priced' })]);

  assert.equal(result.draft.windowLines?.length, 0, 'nothing to contribute');
  assert.equal(result.draft.glassLines?.length, 1);
  assert.match(result.warnings[0], /Not priced has no priced line/);
});

test('nothing priced means no order', () => {
  assert.equal(mergeQuotesForOrder([glassQuote({ draft: null })]), null);
  assert.equal(mergeQuotesForOrder([]), null);
});

test('notes from every quote are carried once', () => {
  const result = merged([glassQuote(), windowQuote({ draft: { ...windowQuote().draft!, quoteNotes: 'deliver to Eildon' } })]);

  assert.equal(result.draft.quoteNotes, 'deliver to Eildon', 'the same note twice is one note');
});

test('a job quote sorts its lines by the calculator that priced each line', () => {
  const quote = fromSavedQuote({
    id: 'j1',
    reference: 'Q-J1',
    name: 'Marina balustrade',
    customer: 'Harbour Marine',
    customerId: 'c1',
    date: '2026-09-14',
    notes: 'Deposit 50%',
    subtotal: 6980,
    gst: 698,
    issuedBy: null,
    issuedAt: null,
    ratesUpdatedAt: null,
    status: 'open',
    purchaseOrderId: null,
    lines: [
      { draft: createLineDraft({ localId: 'a', pricingSource: 'window_calculator', lineNote: 'Sliding window', quantityOrdered: 4, unitPriceAtOrder: 1200, windowSpec: { ...windowInput } }), spec: '500 series', extras: [] },
      { draft: createLineDraft({ localId: 'b', pricingSource: 'adhoc_calculator', lineNote: 'Side panel', quantityOrdered: 2, unitPriceAtOrder: 100, adhocSpec: spec }), spec: 'Clear 4mm', extras: [] },
    ],
  });

  assert.equal(quote.kind, 'quote');
  assert.equal(quote.editable, true, 'the quote page edits a job quote');
  assert.equal(quote.kindLabel, 'Window + Glass', 'the list shows the kinds of line');
  assert.equal(quote.draft?.windowLines?.length, 1);
  assert.equal(quote.draft?.glassLines?.length, 1);
  assert.equal(quote.draft?.awningLines?.length, 0);
  assert.equal(quote.draft?.windowLines?.[0].description, 'Sliding window');
  assert.equal(quote.printedLines?.length, 2, 'the paper shows both lines');
});

test('a job quote with no priced line gives no order draft', () => {
  const quote = fromSavedQuote({
    id: 'j2',
    reference: 'Q-J2',
    name: 'Empty',
    customer: 'Harbour Marine',
    customerId: null,
    date: '2026-09-14',
    notes: '',
    subtotal: 0,
    gst: 0,
    issuedBy: null,
    issuedAt: null,
    ratesUpdatedAt: null,
    status: 'open',
    purchaseOrderId: null,
    lines: [],
  });

  assert.equal(quote.draft, null);
  assert.equal(quote.kindLabel, 'Job', 'a quote with no line shows the default label');
});

test('a job quote converts to an order with the older quotes', () => {
  const job = fromSavedQuote({
    id: 'j3',
    reference: 'Q-J3',
    name: 'Boat windows',
    customer: 'Status Houseboats',
    customerId: 'c1',
    date: '2026-09-14',
    notes: '',
    subtotal: 100,
    gst: 10,
    issuedBy: null,
    issuedAt: null,
    ratesUpdatedAt: null,
    status: 'open',
    purchaseOrderId: null,
    lines: [{ draft: createLineDraft({ localId: 'a', pricingSource: 'adhoc_calculator', lineNote: 'Pane', quantityOrdered: 1, unitPriceAtOrder: 100, adhocSpec: spec }), spec: 'Clear 4mm', extras: [] }],
  });

  const merged = mergeQuotesForOrder([job, glassQuote()]);
  assert.ok(merged && !isMergeRefusal(merged));
  assert.equal((merged as MergedQuoteDraft).draft.glassLines?.length, 2, 'the order holds the glass lines of both quotes');
});
