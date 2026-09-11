// Checks for how a quote's status is read and tallied. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { QuoteStatus, StoredQuoteStatus, effectiveQuoteStatus, quoteDeleteRefusal, readQuoteStatus, winRate } from './quote-status';

const quote = (status: QuoteStatus, price: number | null = 100) => ({ status, price });

test('a stored status only ever says open or expired: won comes from the order link', () => {
  assert.equal(readQuoteStatus('won'), 'open', 'marked won by hand and never made an order');
  assert.equal(readQuoteStatus('lost'), 'expired');
  assert.equal(readQuoteStatus('expired'), 'expired');
  assert.equal(readQuoteStatus(null), 'open');
  assert.equal(readQuoteStatus('nonsense'), 'open');
});

test('the rate is won over quotes that have run their course, so an open quote is left out', () => {
  const tally = winRate([quote('won'), quote('won'), quote('expired'), quote('open'), quote('open'), quote('open')]);

  assert.equal(tally.won, 2);
  assert.equal(tally.expired, 1);
  assert.equal(tally.open, 3);
  assert.ok(Math.abs((tally.rate ?? 0) - 2 / 3) < 0.0001, 'three open quotes do not drag the rate down');
});

test('the rate is null until a quote has run its course', () => {
  assert.equal(winRate([]).rate, null);
  assert.equal(winRate([quote('open'), quote('open')]).rate, null);
  assert.equal(winRate([quote('expired')]).rate, 0);
});

test('value won adds up only over won quotes, and a quote with no price adds nothing', () => {
  const tally = winRate([quote('won', 1500), quote('won', null), quote('expired', 900), quote('open', 4000)]);

  assert.equal(tally.won, 2);
  assert.equal(tally.wonValue, 1500);
});

const dated = (status: StoredQuoteStatus, date: string, purchaseOrderId: string | null = null) => ({ status, date, purchaseOrderId });

test('a quote with a purchase order is won, whatever its date or stored status', () => {
  assert.equal(effectiveQuoteStatus(dated('open', '2025-01-01', 'po-1'), '2026-09-11'), 'won', 'an order outlasts the price hold');
  assert.equal(effectiveQuoteStatus(dated('expired', '2026-09-10', 'po-1'), '2026-09-11'), 'won');
  assert.equal(effectiveQuoteStatus(dated(readQuoteStatus('won'), '2026-09-10'), '2026-09-11'), 'open', 'marked won with no order: open again');
});

test('an open quote holds for 30 days from its date and expires the day after', () => {
  // Printed quotes are stored at midnight UTC; the day is what the order list shows.
  const printed = dated('open', '2026-09-10T00:00:00.000Z');

  assert.equal(effectiveQuoteStatus(printed, '2026-10-10'), 'open', 'the thirtieth day is inside the hold');
  assert.equal(effectiveQuoteStatus(printed, '2026-10-11'), 'expired');
  assert.equal(effectiveQuoteStatus(dated('open', '2026-01-31'), '2026-03-02'), 'open', 'counted in days, not months');
  assert.equal(effectiveQuoteStatus(dated('open', '2026-01-31'), '2026-03-03'), 'expired');
});

test('a quote expired or lost by hand stays expired; one with no date stays open', () => {
  assert.equal(effectiveQuoteStatus(dated('expired', '2026-09-10'), '2026-09-11'), 'expired');
  assert.equal(effectiveQuoteStatus(dated(readQuoteStatus('lost'), '2026-09-10'), '2026-09-11'), 'expired');
  assert.equal(effectiveQuoteStatus(dated('open', ''), '2030-01-01'), 'open');
});

test('only a quote that became an order is refused a delete', () => {
  assert.equal(quoteDeleteRefusal({ status: 'open', label: 'Q-3F2A9C1E' }), null);
  assert.equal(quoteDeleteRefusal({ status: 'expired', label: 'Q-3F2A9C1E' }), null);
  assert.match(quoteDeleteRefusal({ status: 'won', label: 'Q-3F2A9C1E' }) || '', /^Q-3F2A9C1E became a purchase order, so it stays\. Delete the order to delete the quote\.$/);
});
