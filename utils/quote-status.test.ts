// Checks for the quote outcome tally. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { QuoteStatus, effectiveQuoteStatus, lossReasons, readQuoteStatus, winRate } from './quote-status';

const quote = (status: QuoteStatus, price: number | null = 100, statusReason: string | null = null) => ({ status, price, statusReason });

test('an unrecognised or missing status reads as open', () => {
  assert.equal(readQuoteStatus('won'), 'won');
  assert.equal(readQuoteStatus(null), 'open');
  assert.equal(readQuoteStatus('nonsense'), 'open');
  assert.equal(readQuoteStatus(undefined), 'open');
});

test('the rate is won over decided, so an unanswered quote is not counted as a loss', () => {
  const tally = winRate([quote('won'), quote('won'), quote('lost'), quote('open'), quote('open'), quote('open')]);

  assert.equal(tally.won, 2);
  assert.equal(tally.lost, 1);
  assert.equal(tally.open, 3);
  assert.ok(Math.abs((tally.rate ?? 0) - 2 / 3) < 0.0001, 'three open quotes do not drag the rate down');
});

test('the rate is null until something is decided', () => {
  assert.equal(winRate([]).rate, null);
  assert.equal(winRate([quote('open'), quote('expired')]).rate, null);
});

test('value won and lost add up only over their own quotes', () => {
  const tally = winRate([quote('won', 1500), quote('won', 500), quote('lost', 900), quote('open', 4000)]);

  assert.equal(tally.wonValue, 2000);
  assert.equal(tally.lostValue, 900);
});

test('a quote with no price counts in the rate but adds nothing to the value', () => {
  const tally = winRate([quote('won', null), quote('won', 250)]);

  assert.equal(tally.won, 2);
  assert.equal(tally.wonValue, 250);
});

test('loss reasons are counted biggest first, and only over losses', () => {
  const reasons = lossReasons([quote('lost', 100, 'Price'), quote('lost', 100, 'Price'), quote('lost', 100, 'Lead time'), quote('won', 100, 'Price')]);

  assert.deepEqual(reasons, [
    { reason: 'Price', count: 2 },
    { reason: 'Lead time', count: 1 },
  ]);
});

test('a loss with no reason is grouped rather than dropped', () => {
  const reasons = lossReasons([quote('lost', 100, null), quote('lost', 100, '   ')]);

  assert.deepEqual(reasons, [{ reason: 'Not given', count: 2 }]);
});

const dated = (status: QuoteStatus, date: string, statusChangedAt: string | null = null) => ({ status, date, statusChangedAt });

test('an open quote holds for 30 days from its date and expires the day after', () => {
  // Printed quotes are stored at midnight UTC; the day is what the order list shows.
  const printed = dated('open', '2026-09-10T00:00:00.000Z');

  assert.equal(effectiveQuoteStatus(printed, '2026-10-10'), 'open', 'the thirtieth day is inside the hold');
  assert.equal(effectiveQuoteStatus(printed, '2026-10-11'), 'expired');
  assert.equal(effectiveQuoteStatus(dated('open', '2026-01-31'), '2026-03-02'), 'open', 'counted in days, not months');
  assert.equal(effectiveQuoteStatus(dated('open', '2026-01-31'), '2026-03-03'), 'expired');
});

test('only an open quote expires; a decided or already expired one keeps its status', () => {
  const longAgo = '2025-01-01';

  assert.equal(effectiveQuoteStatus(dated('won', longAgo), '2026-09-11'), 'won');
  assert.equal(effectiveQuoteStatus(dated('lost', longAgo), '2026-09-11'), 'lost');
  assert.equal(effectiveQuoteStatus(dated('expired', longAgo), '2026-09-11'), 'expired');
});

test('re-opening a quote by hand starts the hold again from that day', () => {
  const reopened = dated('open', '2026-08-01', '2026-09-05T03:00:00.000Z');

  assert.equal(effectiveQuoteStatus(reopened, '2026-10-05'), 'open');
  assert.equal(effectiveQuoteStatus(reopened, '2026-10-06'), 'expired');
  assert.equal(effectiveQuoteStatus(dated('open', '2026-09-10', '2026-09-01T00:00:00.000Z'), '2026-10-10'), 'open', 'a mark older than the date does not shorten the hold');
});

test('a quote with no date cannot run out, so it stays open', () => {
  assert.equal(effectiveQuoteStatus(dated('open', ''), '2030-01-01'), 'open');
});
