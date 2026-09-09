// Checks for the estimate-against-actual comparison. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_AWNING_RATES } from './awning-costing-rates';
import { DEFAULT_WINDOW_RATES } from './window-costing-rates';
import { createAwningInput } from './awning-costing';
import { createWindowInput } from './window-costing';
import { MeasuredLine, describeAccuracy, impliedMinutesPerUnit, measureAccuracy } from './estimate-accuracy';

const awningSpec = createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 6 });
// That awning is costed at 340 minutes each, so a line of six is estimated at 2040.
const AWNING_ESTIMATE = 340 * 6;

function summaries(lines: MeasuredLine[]) {
  const all = measureAccuracy(lines, DEFAULT_WINDOW_RATES, DEFAULT_AWNING_RATES);
  return { window: all.find((entry) => entry.kind === 'window')!, awning: all.find((entry) => entry.kind === 'awning')! };
}

test('an unmeasured shop reports as unmeasured, not as on time', () => {
  const { awning, window } = summaries([]);

  assert.equal(awning.ratio, null);
  assert.equal(window.ratio, null);
  assert.equal(describeAccuracy(awning), null);
});

test('a line with no recorded minutes is skipped rather than counted as zero', () => {
  const { awning } = summaries([
    { kind: 'awning', quantity: 6, actualMinutes: 0, awningSpec },
    { kind: 'awning', quantity: 6, actualMinutes: AWNING_ESTIMATE, awningSpec },
  ]);

  assert.equal(awning.lines, 1, 'only the measured line counts');
  assert.equal(awning.ratio, 1);
});

test('a line with minutes but no spec is skipped, because nothing can be compared', () => {
  const { awning } = summaries([{ kind: 'awning', quantity: 6, actualMinutes: 500, awningSpec: null }]);

  assert.equal(awning.lines, 0);
  assert.equal(awning.ratio, null);
});

test('the estimate is the per-unit minutes multiplied back up by the line quantity', () => {
  const { awning } = summaries([{ kind: 'awning', quantity: 6, actualMinutes: AWNING_ESTIMATE, awningSpec }]);

  assert.equal(awning.estimatedMinutes, AWNING_ESTIMATE);
  assert.equal(awning.ratio, 1);
});

test('an overrun is reported as a ratio above one', () => {
  const { awning } = summaries([{ kind: 'awning', quantity: 6, actualMinutes: AWNING_ESTIMATE * 1.25, awningSpec }]);

  assert.ok(Math.abs((awning.ratio ?? 0) - 1.25) < 0.001);
  assert.match(describeAccuracy(awning) || '', /25% longer than costed/);
});

test('coming in under is reported too, not treated as fine', () => {
  const { awning } = summaries([{ kind: 'awning', quantity: 6, actualMinutes: AWNING_ESTIMATE * 0.8, awningSpec }]);

  assert.match(describeAccuracy(awning) || '', /20% less than costed/);
});

test('a small gap reads as the estimate holding up', () => {
  const { awning } = summaries([{ kind: 'awning', quantity: 6, actualMinutes: AWNING_ESTIMATE * 1.04, awningSpec }]);

  assert.match(describeAccuracy(awning) || '', /holding up/);
});

test('the ratio is weighted by minutes, so a big job counts for more than a small one', () => {
  const { awning } = summaries([
    { kind: 'awning', quantity: 10, actualMinutes: 340 * 10 * 2, awningSpec: createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 10 }) },
    { kind: 'awning', quantity: 1, actualMinutes: 390 * 1, awningSpec: createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 1 }) },
  ]);

  // The ten-off line doubled its estimate and dominates; a plain mean of the two ratios would be 1.5.
  assert.ok((awning.ratio ?? 0) > 1.8, `expected the big job to dominate, got ${awning.ratio}`);
});

test('implied minutes per unit is over every measured line, not only the worst five', () => {
  const lines: MeasuredLine[] = Array.from({ length: 8 }, () => ({ kind: 'awning' as const, quantity: 1, actualMinutes: 400, awningSpec: createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 1 }) }));
  const { awning } = summaries(lines);

  assert.equal(awning.lines, 8);
  assert.equal(awning.units, 8);
  assert.equal(awning.worst.length, 5, 'the list shown is capped');
  assert.equal(impliedMinutesPerUnit(awning), 400, 'but the implied figure uses all eight');
});

test('windows and awnings are measured apart', () => {
  const { awning, window } = summaries([
    { kind: 'awning', quantity: 1, actualMinutes: 1000, awningSpec: createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 1 }) },
    { kind: 'window', quantity: 1, actualMinutes: 50, windowSpec: createWindowInput('T5573', { heightMm: 1000, lengthMm: 1200, qtyToSize: 1, glazingId: 'ap6_clear' }) },
  ]);

  assert.equal(awning.lines, 1);
  assert.equal(window.lines, 1);
  assert.ok((awning.ratio ?? 0) > 1, 'the awning overran');
  assert.ok((window.ratio ?? 0) < 1, 'the window came in under');
});
