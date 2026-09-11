// Checks the order-to-calculator round trip. Run with `npm test`.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { LineDraft, createLineDraft, emptyOrderForm } from './order-draft';
import { LineEditResult, OrderSnapshot, applyLineEditResult, calculatorFor, clearLineEditRequest, consumeLineEditResult, peekLineEditRequest, persistLineEditRequest, persistLineEditResult } from './line-editing';

/** Session storage, enough of it for the module under test. */
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

function snapshot(lines: LineDraft[]): OrderSnapshot {
  return { orderForm: { ...emptyOrderForm(), poNumber: 'PO-1042' }, lineDrafts: lines, loadedLineIds: [], isEditingOrder: true, archivedAt: null };
}

beforeEach(installSessionStorage);

test('a line goes to the calculator that prices it', () => {
  assert.equal(calculatorFor('adhoc_calculator'), '/glass/quote');
  assert.equal(calculatorFor('window_calculator'), '/glass/windows');
  assert.equal(calculatorFor('awning_calculator'), '/glass/awnings');
  assert.equal(calculatorFor('existing_config'), null, 'a customer product is priced on the order');
});

test('the whole order travels, so an unsaved one survives the trip', () => {
  const lines = [createLineDraft({ localId: 'a', lineNote: 'first' }), createLineDraft({ localId: 'b', lineNote: 'second' })];
  persistLineEditRequest({ order: snapshot(lines), localId: 'b', returnTo: '/glass/new?lineEdited=1' });

  const request = peekLineEditRequest();
  assert.equal(request?.localId, 'b');
  assert.equal(request?.order.lineDrafts.length, 2, 'both lines came along, not only the one being edited');
  assert.equal(request?.order.orderForm.poNumber, 'PO-1042');
  assert.equal(request?.order.isEditingOrder, true);
});

test('the request stays until the calculator is finished with it', () => {
  persistLineEditRequest({ order: snapshot([createLineDraft({ localId: 'a' })]), localId: 'a', returnTo: '/glass/new' });

  assert.ok(peekLineEditRequest(), 'reading it does not take it');
  assert.ok(peekLineEditRequest(), 'and reading it again still finds it');

  clearLineEditRequest();
  assert.equal(peekLineEditRequest(), null);
});

test('returning a line ends the request, so it cannot be applied twice', () => {
  const lines = [createLineDraft({ localId: 'a' })];
  persistLineEditRequest({ order: snapshot(lines), localId: 'a', returnTo: '/glass/new' });
  persistLineEditResult({ order: snapshot(lines), localId: 'a', line: { quantityOrdered: 3, unitPriceAtOrder: 50, lineNote: 'priced', markupPercent: 25, adhocSpec: lines[0].adhocSpec, windowSpec: null, windowRatesUpdatedAt: null, awningSpec: null, awningRatesUpdatedAt: null } });

  assert.equal(peekLineEditRequest(), null, 'the request is spent');
  assert.ok(consumeLineEditResult());
  assert.equal(consumeLineEditResult(), null, 'and the result is taken only once');
});

test('only the edited line changes, and only in the fields a calculator decides', () => {
  const lines = [createLineDraft({ localId: 'a', lineNote: 'untouched', quantityOrdered: 1 }), createLineDraft({ localId: 'b', lineNote: 'old', quantityOrdered: 1, unitPriceAtOrder: 0, id: 'db-id', quantityFulfilled: 2 })];
  const result: LineEditResult = {
    order: snapshot(lines),
    localId: 'b',
    line: { quantityOrdered: 4, unitPriceAtOrder: 72.54, lineNote: 'side panel', markupPercent: 30, adhocSpec: { ...lines[1].adhocSpec, width: 1500 }, windowSpec: null, windowRatesUpdatedAt: null, awningSpec: null, awningRatesUpdatedAt: null },
  };

  const applied = applyLineEditResult(result);
  const [first, second] = applied.lineDrafts;

  assert.equal(first.lineNote, 'untouched');
  assert.equal(second.lineNote, 'side panel');
  assert.equal(second.quantityOrdered, 4);
  assert.equal(second.unitPriceAtOrder, 72.54);
  assert.equal(second.adhocSpec.width, 1500);
  assert.equal(second.id, 'db-id', 'the database id is the order’s, not the calculator’s');
  assert.equal(second.quantityFulfilled, 2, 'so is what has already been made');
});

test('a damaged handoff is discarded rather than half applied', () => {
  (globalThis as { window: { sessionStorage: { setItem: (k: string, v: string) => void } } }).window.sessionStorage.setItem('alfabLineEditRequest', '{not json');
  assert.equal(peekLineEditRequest(), null);

  persistLineEditRequest({ order: snapshot([]), localId: '', returnTo: '/glass/new' });
  assert.equal(peekLineEditRequest(), null, 'a request naming no line is not a request');
});
