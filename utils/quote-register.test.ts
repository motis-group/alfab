// Checks that several quotes become one purchase order. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GlassSpecification } from './calculations';
import { MergedQuoteDraft, QuoteRecord, isMergeRefusal, mergeQuotesForOrder } from './quote-register';

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
    reference: null,
    name: 'Cut glass',
    customer: 'Status Houseboats',
    customerId: 'c1',
    date: '2026-09-10',
    lineCount: 1,
    total: 200,
    status: 'open',
    statusReason: null,
    statusChangedAt: null,
    draft: { quoteName: 'Cut glass', customerName: 'Status Houseboats', customerId: 'c1', quoteDate: '2026-09-10', quoteNotes: 'deliver to Eildon', glassLines: [{ description: 'Side panel', quantity: 2, unitPrice: 100, markupPercent: 20, spec }] },
    ...over,
  };
}

function windowQuote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'w1',
    kind: 'window',
    reference: null,
    name: 'Kitchen hopper',
    customer: 'Status Houseboats',
    customerId: null,
    date: '2026-09-09',
    lineCount: 1,
    total: 800,
    status: 'open',
    statusReason: null,
    statusChangedAt: null,
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
