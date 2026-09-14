// Checks the row shape of a quote for a job. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_QUOTE_MARGIN_PERCENT, SavedQuoteLine, applyQuoteMargin, quoteMarginSummary, quotePaperLines, quoteTotal, toSavedQuote } from './quote-store';
import { createLineDraft } from './order-draft';

function line(over: Partial<SavedQuoteLine['draft']>, spec = 'A specification'): SavedQuoteLine {
  return { draft: createLineDraft(over), spec, extras: [] };
}

function row(specification: unknown, over: Record<string, unknown> = {}) {
  return { id: '3f2a9c1e-0000-4000-8000-000000000000', name: 'Marina balustrade', client: 'Harbour Marine', date: '2026-09-14T00:00:00Z', specification, cost: { subtotal: 100, gst: 10 }, ...over } as Parameters<typeof toSavedQuote>[0];
}

test('a quote for a job holds lines of more than one kind', () => {
  const lines = [line({ localId: 'a', pricingSource: 'window_calculator', lineNote: 'Sliding window', quantityOrdered: 4, unitPriceAtOrder: 1200 }), line({ localId: 'b', pricingSource: 'adhoc_calculator', lineNote: 'Side panel', quantityOrdered: 2, unitPriceAtOrder: 100 })];

  const quote = toSavedQuote(row({ kind: 'quote', customerId: 'c1', notes: 'Deposit 50%', lines }));

  assert.equal(quote?.lines.length, 2);
  assert.equal(quote?.reference, 'Q-3F2A9C1E', 'the customer reads the row id, shortened');
  assert.equal(quote?.customerId, 'c1');
  assert.equal(quote?.notes, 'Deposit 50%');
});

test('a row of an older kind is not a quote for a job', () => {
  assert.equal(toSavedQuote(row({ kind: 'window-quote', lines: [] })), null);
  assert.equal(toSavedQuote(row({ kind: 'glass', items: [] })), null);
  assert.equal(toSavedQuote(row({ kind: 'quote' })), null, 'a row with no lines is not one either');
});

test('the reader discards a line that has no draft', () => {
  const quote = toSavedQuote(row({ kind: 'quote', lines: [line({ localId: 'a' }), { spec: 'orphan', extras: [] }] }));
  assert.equal(quote?.lines.length, 1);
});

test('the reader keeps the margin a quote was saved at', () => {
  assert.equal(toSavedQuote(row({ kind: 'quote', marginPercent: 35, lines: [line({ localId: 'a' })] }))?.marginPercent, 35);
  assert.equal(toSavedQuote(row({ kind: 'quote', lines: [line({ localId: 'a' })] }))?.marginPercent, DEFAULT_QUOTE_MARGIN_PERCENT, 'a quote saved before quotes had a margin');
});

test('the paper shows the line note and the specification as stored', () => {
  const lines = [line({ localId: 'a', lineNote: 'Sliding window 1200x900', quantityOrdered: 4, unitPriceAtOrder: 1200 }, '500 series, clear 6.38')];
  const [paper] = quotePaperLines(lines);

  assert.equal(paper.description, 'Sliding window 1200x900');
  assert.equal(paper.spec, '500 series, clear 6.38');
  assert.equal(paper.quantity, 4);
  assert.equal(paper.unitPrice, 1200);
});

test('a line with no note still prints a description', () => {
  const [paper] = quotePaperLines([line({ localId: 'a', lineNote: '' })]);
  assert.equal(paper.description, 'Item');
});

test('the paper never carries the cost of an extra', () => {
  const [paper] = quotePaperLines([{ ...line({ localId: 'a' }), unitCost: 80, extras: [{ label: 'Trims', total: 12, cost: 10 }] }]);
  assert.deepEqual(paper.extras, [{ label: 'Trims', total: 12 }]);
});

test('a line at cost is priced at the margin of the quote, to the cent', () => {
  const priced = applyQuoteMargin({ ...line({ localId: 'a', quantityOrdered: 3 }), unitCost: 83.337, extras: [{ label: 'Trims', total: 10, cost: 10 }, { label: 'Second glazing', total: null, cost: null }] }, 20);

  assert.equal(priced.draft.unitPriceAtOrder, 100, '83.337 plus 20 percent is 100.0044, printed as $100.00');
  assert.equal(priced.draft.markupPercent, 20);
  assert.equal(priced.extras[0].total, 12);
  assert.equal(priced.extras[1].total, null, 'an extra with no price stays unpriced');
});

test('a line with no cost keeps the price it was given', () => {
  const carried = line({ localId: 'a', unitPriceAtOrder: 140 });
  assert.equal(applyQuoteMargin(carried, 50), carried);
});

test('cost, margin and the lines at their own margin add up to the printed subtotal', () => {
  const lines: SavedQuoteLine[] = [{ ...line({ localId: 'a', quantityOrdered: 3, unitPriceAtOrder: 33.34 }), unitCost: 27.78 }, line({ localId: 'b', quantityOrdered: 1, unitPriceAtOrder: 140 })];

  const summary = quoteMarginSummary(lines);

  assert.equal(summary.cost, 83.34);
  assert.equal(summary.margin, 16.68, 'the printed amount 100.02 less the cost');
  assert.equal(summary.fixed, 140, 'the line carried over counts apart');
  assert.equal(summary.subtotal, 240.02);
});

test('the total includes GST, because the customer pays GST', () => {
  const lines = [line({ localId: 'a', quantityOrdered: 4, unitPriceAtOrder: 1200 }), line({ localId: 'b', quantityOrdered: 2, unitPriceAtOrder: 1090 })];
  assert.equal(quoteTotal(lines), 7678, '6980 plus 10 percent GST');
});

test('the stored total is the offer, not a new calculation', () => {
  const lines = [line({ localId: 'a', quantityOrdered: 1, unitPriceAtOrder: 999 })];
  const quote = toSavedQuote(row({ kind: 'quote', lines }, { cost: { subtotal: 100, gst: 10 } }));

  assert.equal(quote?.subtotal, 100, 'the row carries the numbers the customer was given');
  assert.equal(quote?.gst, 10);
});

test('a row without a stored total falls back to the lines', () => {
  const lines = [line({ localId: 'a', quantityOrdered: 2, unitPriceAtOrder: 50 })];
  const quote = toSavedQuote(row({ kind: 'quote', lines }, { cost: {} }));

  assert.equal(quote?.subtotal, 100);
  assert.equal(quote?.gst, 10);
});

test('the reader accepts a specification stored as text', () => {
  const lines = [line({ localId: 'a' })];
  const quote = toSavedQuote(row(JSON.stringify({ kind: 'quote', lines, notes: 'from text' })));
  assert.equal(quote?.notes, 'from text');
});
