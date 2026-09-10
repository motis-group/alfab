// Checks a printed quote is recorded as it printed. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CustomerQuoteContent, CustomerQuoteLine, quoteFingerprint, quoteReference, quoteTotals, saveCustomerQuote, toCustomerQuote } from './customer-quote-store';
import { fromCustomerQuote } from './quote-register';
import { WindowCostingInput } from './window-costing';

const input = { productId: '500-5573' } as unknown as WindowCostingInput;
const line = (unitPrice: number | null, quantity = 1, description = 'Window 1'): CustomerQuoteLine => ({ description, spec: 'Sliding 1800 x 1200', quantity, unitPrice, input });

const content = (lines: CustomerQuoteLine[]): CustomerQuoteContent => ({ kind: 'window-quote', name: 'Smith residence', customer: 'Smith Constructions', customerId: 'c-1', date: '2026-09-10', notes: '', lines });

test('an unpriced line carries no amount and stays out of the total, which adds GST once', () => {
  const totals = quoteTotals([line(1240, 4), line(null), line(1010, 2)]);

  assert.deepEqual(totals.amounts, [4960, null, 2020]);
  assert.equal(totals.subtotal, 6980);
  assert.ok(Math.abs(totals.gst - 698) < 1e-9);
  assert.ok(Math.abs(totals.total - 7678) < 1e-9);
  assert.equal(totals.anyUnpriced, true);
});

test('the reference is the record id, shortened to something a customer can read out', () => {
  assert.equal(quoteReference('3f2a9c1e-7b4d-4c1a-9e2f-0a1b2c3d4e5f'), 'Q-3F2A9C1E');
});

test('a reprint of the same content is the same offer; a changed price is a different one', () => {
  const printed = quoteFingerprint(content([line(1240, 4)]));

  assert.equal(quoteFingerprint(content([line(1240, 4)])), printed);
  assert.notEqual(quoteFingerprint(content([line(1250, 4)])), printed);
  assert.notEqual(quoteFingerprint({ ...content([line(1240, 4)]), date: '2026-09-11' }), printed, 'the price hold runs from the date');
});

test('a quote with no date is refused before anything is written, because the price hold runs from it', async () => {
  await assert.rejects(saveCustomerQuote({ ...content([line(1240)]), date: '', issuedBy: 'nick', ratesUpdatedAt: null }), /quote date/);
});

test('only printed quotes read back as customer quotes, with the totals that were printed', () => {
  const row = {
    id: '3f2a9c1e-7b4d-4c1a-9e2f-0a1b2c3d4e5f',
    name: 'Smith residence',
    client: 'Smith Constructions',
    date: '2026-09-10T00:00:00.000Z',
    specification: { kind: 'window-quote', customerId: 'c-1', notes: 'Colour TBC', lines: [line(1240, 4), line(null)], issuedBy: 'nick', issuedAt: '2026-09-10T01:02:03.000Z', ratesUpdatedAt: 'r-1' },
    cost: { subtotal: 4960, gst: 496 },
    status: 'open',
  };
  const quote = toCustomerQuote(row);

  assert.ok(quote);
  assert.equal(quote.reference, 'Q-3F2A9C1E');
  assert.equal(quote.subtotal, 4960);
  assert.equal(quote.issuedBy, 'nick');

  assert.equal(toCustomerQuote({ ...row, specification: { kind: 'window', input } }), null, 'a saved costing is a template, not an offer');
  assert.equal(toCustomerQuote({ ...row, specification: { kind: 'glass', items: [] } }), null);
  assert.equal(toCustomerQuote({ ...row, specification: 'not json' }), null);
});

test('a printed quote becomes an order at the prices offered, without its unpriced lines', () => {
  const quote = toCustomerQuote({
    id: '3f2a9c1e-7b4d-4c1a-9e2f-0a1b2c3d4e5f',
    name: 'Smith residence',
    client: 'Smith Constructions',
    date: '2026-09-10T00:00:00.000Z',
    specification: { kind: 'window-quote', customerId: 'c-1', notes: '', lines: [line(1240, 4, 'Window 1'), line(null, 1, 'Highlight')], ratesUpdatedAt: 'r-1' },
    cost: { subtotal: 4960, gst: 496 },
  });
  assert.ok(quote);
  const record = fromCustomerQuote(quote);

  assert.equal(record.kind, 'window');
  assert.equal(record.reference, 'Q-3F2A9C1E');
  assert.equal(record.lineCount, 2, 'the list counts every printed line');
  assert.equal(record.total, 4960);
  assert.equal(record.draft?.quoteDate, '2026-09-10');
  assert.match(record.draft?.quoteName || '', /^Q-3F2A9C1E /, 'the order names the quote it came from');
  assert.deepEqual(record.draft?.windowLines, [{ description: 'Window 1', quantity: 4, unitPrice: 1240, ratesUpdatedAt: 'r-1', windowSpec: input }]);
});
