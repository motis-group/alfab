// Checks the quote side of the trip to a calculator. Run with `npm test`.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { LineEditResult } from './line-editing';
import { QuoteDraft, applyQuoteLineResult, clearQuoteDraft, dropPendingLine, emptyQuoteDraft, peekQuoteDraft, persistQuoteDraft } from './quote-draft';
import { SavedQuoteLine } from './quote-store';
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
  assert.equal(applied.lines[0].draft.unitPriceAtOrder, 1200);
  assert.equal(applied.lines[0].spec, '500 series, clear 6.38', 'the draft keeps the words of the calculator');
  assert.equal(applied.lines[0].extras[0].label, 'Trims');
  assert.equal(applied.lines[0].draft.pricingSource, 'window_calculator', 'the line keeps its calculator');
  assert.equal(applied.lines[1].draft.lineNote, 'untouched');
  assert.equal(applied.pendingLineId, null, 'the line has a price, so it is no longer pending');
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
