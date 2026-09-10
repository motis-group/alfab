// Checks that several quotes become one purchase order. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GlassSpecification } from './calculations';
import { QuoteRecord, mergeQuotesForOrder } from './quote-register';

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
    name: 'Cut glass',
    customer: 'Status Houseboats',
    customerId: 'c1',
    date: '2026-09-10',
    lineCount: 1,
    total: 200,
    status: 'open',
    statusReason: null,
    draft: { quoteName: 'Cut glass', customerName: 'Status Houseboats', customerId: 'c1', quoteDate: '2026-09-10', quoteNotes: 'deliver to Eildon', glassLines: [{ description: 'Side panel', quantity: 2, unitPrice: 100, markupPercent: 20, spec }] },
    ...over,
  };
}

function windowQuote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'w1',
    kind: 'window',
    name: 'Kitchen hopper',
    customer: 'Status Houseboats',
    customerId: null,
    date: '2026-09-09',
    lineCount: 1,
    total: 800,
    status: 'open',
    statusReason: null,
    draft: { quoteName: 'Kitchen hopper', customerName: 'Status Houseboats', customerId: null, quoteDate: '2026-09-09', quoteNotes: '', windowLines: [{ description: 'Kitchen hopper', quantity: 1, unitPrice: 800, windowSpec: { type: 'T5573' } as never, ratesUpdatedAt: null }] },
    ...over,
  };
}

test('a boat that needs glass and a window becomes one order', () => {
  const merged = mergeQuotesForOrder([glassQuote(), windowQuote()]);

  assert.ok(merged);
  assert.equal(merged.draft.glassLines?.length, 1);
  assert.equal(merged.draft.windowLines?.length, 1);
  assert.equal(merged.draft.quoteName, 'Cut glass + Kitchen hopper');
  assert.equal(merged.draft.customerId, 'c1', 'the quote that knows the customer supplies the id');
  assert.deepEqual(merged.warnings, []);
});

test('converting one quote keeps its own name', () => {
  const merged = mergeQuotesForOrder([glassQuote()]);

  assert.equal(merged?.draft.quoteName, 'Cut glass');
  assert.equal(merged?.draft.quoteNotes, 'deliver to Eildon');
});

test('quotes for different customers are merged, and the difference is reported', () => {
  const merged = mergeQuotesForOrder([glassQuote(), windowQuote({ customer: 'Gippsland Marine' })]);

  assert.ok(merged);
  assert.equal(merged.warnings.length, 1);
  assert.match(merged.warnings[0], /2 different customers/);
});

test('a quote with no priced line is left off the order and reported', () => {
  const merged = mergeQuotesForOrder([glassQuote(), windowQuote({ draft: null, name: 'Not priced' })]);

  assert.ok(merged);
  assert.equal(merged.draft.windowLines?.length, 0, 'nothing to contribute');
  assert.equal(merged.draft.glassLines?.length, 1);
  assert.match(merged.warnings[0], /Not priced has no priced line/);
});

test('nothing priced means no order', () => {
  assert.equal(mergeQuotesForOrder([glassQuote({ draft: null })]), null);
  assert.equal(mergeQuotesForOrder([]), null);
});

test('notes from every quote are carried once', () => {
  const merged = mergeQuotesForOrder([glassQuote(), windowQuote({ draft: { ...windowQuote().draft!, quoteNotes: 'deliver to Eildon' } })]);

  assert.equal(merged?.draft.quoteNotes, 'deliver to Eildon', 'the same note twice is one note');
});
