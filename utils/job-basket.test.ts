// Checks for the mixed-item job basket. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JobLine, describeJob, jobBreakdown, jobTotal, normalizeJob } from './job-basket';

const windowLine = (quantity: number, unitPrice: number): JobLine => ({ id: 'w1', kind: 'window', description: 'Window', quantity, unitPrice, windowSpec: {} as never, ratesUpdatedAt: null });
const awningLine = (quantity: number, unitPrice: number, id = 'a1'): JobLine => ({ id, kind: 'awning', description: 'Awning', quantity, unitPrice, awningSpec: {} as never, ratesUpdatedAt: null });
const glassLine = (quantity: number, unitPrice: number): JobLine => ({ id: 'g1', kind: 'glass', description: 'Glass', quantity, unitPrice, spec: {} as never, markupPercent: 20 });

test('the total multiplies each line by its own quantity', () => {
  assert.equal(jobTotal([windowLine(2, 500), awningLine(6, 1566.77)]), 2 * 500 + 6 * 1566.77);
});

test('an empty job totals nothing rather than failing', () => {
  assert.equal(jobTotal([]), 0);
  assert.deepEqual(jobBreakdown([]), []);
  assert.equal(describeJob([]), 'Nothing on this job yet');
});

test('the breakdown counts units by kind and drops kinds the job has none of', () => {
  const breakdown = jobBreakdown([windowLine(2, 500), awningLine(6, 100)]);

  assert.deepEqual(
    breakdown.map((entry) => entry.kind),
    ['window', 'awning']
  );
  assert.equal(breakdown[0].count, 2);
  assert.equal(breakdown[1].count, 6);
  assert.equal(breakdown[1].total, 600);
});

test('a mixed job reads as a sentence', () => {
  assert.equal(describeJob([windowLine(2, 1), awningLine(6, 1), glassLine(1, 1)]), '2 windows, 6 awnings and 1 glass piece');
  assert.equal(describeJob([windowLine(1, 1)]), '1 window');
  assert.equal(describeJob([glassLine(3, 1)]), '3 glass pieces');
  assert.equal(describeJob([windowLine(1, 1), awningLine(1, 1)]), '1 window and 1 awning');
});

test('a stored job keeps its details and its good lines', () => {
  const job = normalizeJob({ name: 'Nautilus', customerName: 'Boatworks', customerId: 'c1', notes: 'Deliver Friday', lines: [awningLine(6, 100)] });

  assert.equal(job.name, 'Nautilus');
  assert.equal(job.customerId, 'c1');
  assert.equal(job.lines.length, 1);
});

test('a line with no spec is dropped rather than sent to an order', () => {
  const job = normalizeJob({
    lines: [awningLine(6, 100), { id: 'bad', kind: 'awning', description: 'x', quantity: 1, unitPrice: 1 }, { id: 'worse', kind: 'nonsense', description: 'x', quantity: 1, unitPrice: 1 }, null],
  });

  assert.equal(job.lines.length, 1);
  assert.equal(job.lines[0].id, 'a1');
});

test('rubbish in storage reads as an empty job, not a crash', () => {
  assert.deepEqual(normalizeJob(null).lines, []);
  assert.deepEqual(normalizeJob('not a job').lines, []);
  assert.deepEqual(normalizeJob({ lines: 'nope' }).lines, []);
  assert.equal(normalizeJob({}).customerId, null);
});

test('the three kinds all survive a round trip through JSON', () => {
  const lines = [windowLine(1, 100), awningLine(2, 200), glassLine(3, 300)];
  const job = normalizeJob(JSON.parse(JSON.stringify({ name: '', customerName: '', customerId: null, notes: '', lines })));

  assert.equal(job.lines.length, 3);
  assert.deepEqual(
    job.lines.map((line) => line.kind),
    ['window', 'awning', 'glass']
  );
  assert.equal(jobTotal(job.lines), 100 + 400 + 900);
});
