// Checks the quote side of the trip to a calculator. Run with `npm test`.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { defaultPricingData } from '@components/PricingProvider';
import { calculateCost } from './calculations';
import { ExtractedPiece } from './import/model';
import { LineEditResult } from './line-editing';
import { QuoteDraft, addGlassPieces, applyQuoteLineResult, clearQuoteDraft, dropPendingLine, emptyQuoteDraft, peekQuoteDraft, persistQuoteDraft, setQuoteMargin } from './quote-draft';
import { DEFAULT_QUOTE_MARGIN_PERCENT, SavedQuoteLine, priceAtMargin } from './quote-store';
import { createLineDraft } from './order-draft';

function installSessionStorage() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
}

function line(localId: string, over: Partial<SavedQuoteLine['draft']> = {}): SavedQuoteLine {
  return { draft: createLineDraft({ localId, pricingSource: 'window_calculator', ...over }), spec: 'as it was', extras: [] };
}

function result(localId: string, over: Partial<LineEditResult['line']> = {}): LineEditResult {
  return {
    origin: { kind: 'quote', label: 'Q-3F2A9C1E' },
    localId,
    line: { quantityOrdered: 4, unitPriceAtOrder: 1200, lineNote: 'Sliding window', markupPercent: 0, adhocSpec: createLineDraft().adhocSpec, windowSpec: null, windowRatesUpdatedAt: null, awningSpec: null, awningRatesUpdatedAt: null, ...over },
    spec: '500 series, clear 6.38',
    extras: [{ label: 'Trims', total: 40 }],
  };
}

beforeEach(installSessionStorage);

test('the quote waits while a calculator prices one of its lines', () => {
  const draft: QuoteDraft = { ...emptyQuoteDraft(), name: 'Marina balustrade', lines: [line('a')] };
  persistQuoteDraft(draft);

  const waiting = peekQuoteDraft();
  assert.equal(waiting?.name, 'Marina balustrade');
  assert.equal(waiting?.lines.length, 1, 'the remainder of the quote is present');

  clearQuoteDraft();
  assert.equal(peekQuoteDraft(), null);
});

test('a priced line returns with the fields of the calculator and no others', () => {
  const draft: QuoteDraft = { ...emptyQuoteDraft(), lines: [line('a', { lineNote: 'old', quantityOrdered: 1, unitPriceAtOrder: 0 }), line('b', { lineNote: 'untouched' })], pendingLineId: 'a' };

  const applied = applyQuoteLineResult(draft, result('a'));

  assert.equal(applied.lines[0].draft.lineNote, 'Sliding window');
  assert.equal(applied.lines[0].draft.quantityOrdered, 4);
  assert.equal(applied.lines[0].spec, '500 series, clear 6.38', 'the draft keeps the words of the calculator');
  assert.equal(applied.lines[0].extras[0].label, 'Trims');
  assert.equal(applied.lines[0].draft.pricingSource, 'window_calculator', 'the line keeps its calculator');
  assert.equal(applied.lines[1].draft.lineNote, 'untouched');
  assert.equal(applied.pendingLineId, null, 'the line has a price, so it is no longer pending');
});

test('a calculator prices a quote line at cost, and the margin of the quote makes the price', () => {
  const draft: QuoteDraft = { ...emptyQuoteDraft(), marginPercent: 25, lines: [line('a')] };

  const [priced] = applyQuoteLineResult(draft, result('a', { unitPriceAtOrder: 1200 })).lines;

  assert.equal(priced.unitCost, 1200, 'the calculator sent the cost');
  assert.equal(priced.draft.unitPriceAtOrder, 1500, 'the quote adds 25 percent');
  assert.equal(priced.draft.markupPercent, 25, 'an order made from the quote carries the margin');
  assert.deepEqual(priced.extras, [{ label: 'Trims', total: 50, cost: 40 }], 'an extra takes the same margin');
});

test('a new margin prices every line at cost again, and leaves a line at its own margin alone', () => {
  const atCost: SavedQuoteLine = { ...line('a', { quantityOrdered: 2, unitPriceAtOrder: 120 }), unitCost: 100 };
  const ownMargin = line('b', { unitPriceAtOrder: 140 });
  const draft: QuoteDraft = { ...emptyQuoteDraft(), marginPercent: 20, lines: [atCost, ownMargin] };

  const repriced = setQuoteMargin(draft, 33.333);

  assert.equal(repriced.marginPercent, 33.333);
  assert.equal(repriced.lines[0].draft.unitPriceAtOrder, 133.33, 'the price is to the cent');
  assert.equal(repriced.lines[1].draft.unitPriceAtOrder, 140, 'a line carried over from a calculator keeps its price');
});

test('a line that the quote does not hold is added, not discarded', () => {
  const draft = emptyQuoteDraft();
  const applied = applyQuoteLineResult(draft, result('new-line'));

  assert.equal(applied.lines.length, 1);
  assert.equal(applied.lines[0].draft.localId, 'new-line');
});

test('a cancelled Add Line leaves no empty line', () => {
  const draft: QuoteDraft = { ...emptyQuoteDraft(), lines: [line('a'), line('b')], pendingLineId: 'b' };

  const dropped = dropPendingLine(draft);
  assert.deepEqual(
    dropped.lines.map((entry) => entry.draft.localId),
    ['a']
  );
  assert.equal(dropped.pendingLineId, null);
});

test('a cancelled Edit leaves the line unchanged', () => {
  const draft: QuoteDraft = { ...emptyQuoteDraft(), lines: [line('a', { lineNote: 'as saved' })], pendingLineId: null };

  const dropped = dropPendingLine(draft);
  assert.equal(dropped.lines.length, 1, 'an edit of an existing line marks no line pending');
  assert.equal(dropped.lines[0].draft.lineNote, 'as saved');
});

test('the reader discards a damaged draft', () => {
  (globalThis as { window: { sessionStorage: { setItem: (k: string, v: string) => void } } }).window.sessionStorage.setItem('alfabQuoteDraft', '{not json');
  assert.equal(peekQuoteDraft(), null);
});

test('a draft with no margin reads at the default margin', () => {
  const draft: Partial<QuoteDraft> = { ...emptyQuoteDraft(), lines: [line('a')] };
  delete draft.marginPercent;
  (globalThis as { window: { sessionStorage: { setItem: (k: string, v: string) => void } } }).window.sessionStorage.setItem('alfabQuoteDraft', JSON.stringify(draft));

  assert.equal(peekQuoteDraft()?.marginPercent, DEFAULT_QUOTE_MARGIN_PERCENT, 'a returning line is priced at a number, not NaN');
});

test('pieces read off a customer order go on the quote at cost, one cut-glass line for each piece', () => {
  const piece: ExtractedPiece = { name: ' Side panel ', quantity: 3, spec: { ...createLineDraft().adhocSpec, width: 1000, height: 800 }, confidence: 'read', source: 'line 4', notes: [] };
  const cost = calculateCost(piece.spec, defaultPricingData).total;
  assert.ok(cost > 0, 'the piece has a cost for the margin to act on');

  const added = addGlassPieces({ ...emptyQuoteDraft(), marginPercent: 25, lines: [line('a')] }, [piece], defaultPricingData);

  assert.equal(added.lines.length, 2, 'the lines already on the quote stay');
  const [, glass] = added.lines;
  assert.equal(glass.draft.pricingSource, 'adhoc_calculator', 'Edit sends the line to the glass calculator');
  assert.equal(glass.draft.lineNote, 'Side panel');
  assert.equal(glass.draft.quantityOrdered, 3);
  assert.equal(glass.unitCost, cost, 'the line holds the cost');
  assert.equal(glass.draft.unitPriceAtOrder, priceAtMargin(cost, 25), 'the margin of the quote makes the price');
});
