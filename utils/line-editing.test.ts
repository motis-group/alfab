// Checks the trip from a document to a calculator and back. Run with `npm test`.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { LineDraft, createLineDraft, emptyOrderForm } from './order-draft';
import { LineEditOrigin, LineEditResult, OrderSnapshot, applyLineEditResult, applyOrderLineEditResult, calculatorFor, clearLineEditRequest, consumeLineEditResult, peekLineEditRequest, persistLineEditRequest, persistLineEditResult } from './line-editing';

/** Session storage. Only the parts that the module under test uses. */
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

function fromOrder(lines: LineDraft[]): LineEditOrigin {
  return { kind: 'order', order: snapshot(lines), label: 'PO-1042' };
}

const fromQuote: LineEditOrigin = { kind: 'quote', label: 'Q-3F2A9C1E' };

function request(origin: LineEditOrigin, line: LineDraft, returnTo = '/glass/new?lineEdited=1') {
  return { origin, localId: line.localId, line, customerId: 'customer-1', lineLabel: 'Line 1', returnTo };
}

beforeEach(installSessionStorage);

test('a line goes to the calculator that prices it', () => {
  assert.equal(calculatorFor('adhoc_calculator'), '/glass/quote');
  assert.equal(calculatorFor('window_calculator'), '/glass/windows');
  assert.equal(calculatorFor('awning_calculator'), '/glass/awnings');
  assert.equal(calculatorFor('existing_config'), null, 'a customer product is priced on the order');
});

test('the request carries the line, so the calculator does not need the document', () => {
  const line = createLineDraft({ localId: 'b', lineNote: 'second' });
  persistLineEditRequest(request(fromQuote, line));

  const sent = peekLineEditRequest();
  assert.equal(sent?.localId, 'b');
  assert.equal(sent?.line.lineNote, 'second');
  assert.equal(sent?.customerId, 'customer-1');
  assert.equal(sent?.origin.kind, 'quote');
  assert.equal(sent?.origin.label, 'Q-3F2A9C1E', 'the banner shows the label of the document');
});

test('the whole order travels, so an unsaved one survives the trip', () => {
  const lines = [createLineDraft({ localId: 'a', lineNote: 'first' }), createLineDraft({ localId: 'b', lineNote: 'second' })];
  persistLineEditRequest(request(fromOrder(lines), lines[1]));

  const sent = peekLineEditRequest();
  assert.equal(sent?.origin.kind, 'order');
  const origin = sent?.origin as Extract<LineEditOrigin, { kind: 'order' }>;
  assert.equal(origin.order.lineDrafts.length, 2, 'the request carries both lines, not only the line under edit');
  assert.equal(origin.order.orderForm.poNumber, 'PO-1042');
  assert.equal(origin.order.isEditingOrder, true);
});

test('a quote sends no document, because the quote page keeps its own draft', () => {
  const line = createLineDraft({ localId: 'a' });
  persistLineEditRequest(request(fromQuote, line, '/glass/quotes/new?lineEdited=1'));

  const sent = peekLineEditRequest();
  assert.equal(sent?.origin.kind, 'quote');
  assert.ok(!('order' in (sent?.origin ?? {})), 'a quote line carries no order snapshot');
  assert.equal(sent?.returnTo, '/glass/quotes/new?lineEdited=1');
});

test('the request stays until the calculator finishes with it', () => {
  const line = createLineDraft({ localId: 'a' });
  persistLineEditRequest(request(fromOrder([line]), line, '/glass/new'));

  assert.ok(peekLineEditRequest(), 'a read does not remove the request');
  assert.ok(peekLineEditRequest(), 'a second read still finds the request');

  clearLineEditRequest();
  assert.equal(peekLineEditRequest(), null);
});

test('a returned line ends the request, so nothing applies it twice', () => {
  const line = createLineDraft({ localId: 'a' });
  persistLineEditRequest(request(fromOrder([line]), line, '/glass/new'));
  persistLineEditResult({ origin: fromOrder([line]), localId: 'a', line: { quantityOrdered: 3, unitPriceAtOrder: 50, lineNote: 'priced', markupPercent: 25, adhocSpec: line.adhocSpec, windowSpec: null, windowRatesUpdatedAt: null, awningSpec: null, awningRatesUpdatedAt: null }, spec: 'Clear 4mm 1000 x 1000', extras: [] });

  assert.equal(peekLineEditRequest(), null, 'the request is spent');
  assert.ok(consumeLineEditResult());
  assert.equal(consumeLineEditResult(), null, 'a second read of the result returns nothing');
});

test('only the edited line changes, and only in the fields of the calculator', () => {
  const lines = [createLineDraft({ localId: 'a', lineNote: 'untouched', quantityOrdered: 1 }), createLineDraft({ localId: 'b', lineNote: 'old', quantityOrdered: 1, unitPriceAtOrder: 0, id: 'db-id', quantityFulfilled: 2 })];
  const result: LineEditResult = {
    origin: fromOrder(lines),
    localId: 'b',
    line: { quantityOrdered: 4, unitPriceAtOrder: 72.54, lineNote: 'side panel', markupPercent: 30, adhocSpec: { ...lines[1].adhocSpec, width: 1500 }, windowSpec: null, windowRatesUpdatedAt: null, awningSpec: null, awningRatesUpdatedAt: null },
    spec: 'Clear 4mm 1500 x 1000',
    extras: [],
  };

  const [first, second] = applyLineEditResult(lines, result);

  assert.equal(first.lineNote, 'untouched');
  assert.equal(second.lineNote, 'side panel');
  assert.equal(second.quantityOrdered, 4);
  assert.equal(second.unitPriceAtOrder, 72.54);
  assert.equal(second.adhocSpec.width, 1500);
  assert.equal(second.id, 'db-id', 'the document owns the database id, not the calculator');
  assert.equal(second.quantityFulfilled, 2, 'so is what has already been made');
});

test('the order returns complete, with one line replaced', () => {
  const lines = [createLineDraft({ localId: 'a' }), createLineDraft({ localId: 'b', lineNote: 'old' })];
  const order = snapshot(lines);
  const applied = applyOrderLineEditResult(order, {
    origin: fromOrder(lines),
    localId: 'b',
    line: { quantityOrdered: 2, unitPriceAtOrder: 10, lineNote: 'new', markupPercent: 0, adhocSpec: lines[1].adhocSpec, windowSpec: null, windowRatesUpdatedAt: null, awningSpec: null, awningRatesUpdatedAt: null },
    spec: 'Clear 4mm',
    extras: [],
  });

  assert.equal(applied.orderForm.poNumber, 'PO-1042', 'the order header does not change');
  assert.equal(applied.lineDrafts[1].lineNote, 'new');
});

test('the reader discards a damaged handoff', () => {
  (globalThis as { window: { sessionStorage: { setItem: (k: string, v: string) => void } } }).window.sessionStorage.setItem('alfabLineEditRequest', '{not json');
  assert.equal(peekLineEditRequest(), null);

  const line = createLineDraft({ localId: 'a' });
  persistLineEditRequest({ ...request(fromOrder([line]), line), localId: '' });
  assert.equal(peekLineEditRequest(), null, 'a request that names no line is not valid');
});
