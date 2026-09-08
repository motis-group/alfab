// Which rate values are safe, which only cost a line, and which make every quote wrong.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_WINDOW_RATES, mergeWindowRates } from './window-costing-rates';
import { costWindow, createWindowInput } from './window-costing';
import { checkRateValue, checkWindowRates } from './window-rate-health';

test('the default rates carry the sheet gaps as warnings and nothing to fix', () => {
  const issues = checkWindowRates(DEFAULT_WINDOW_RATES);
  const errors = issues.filter((issue) => issue.tone === 'error').length;

  assert.equal(errors, 0, `expected no errors, got ${JSON.stringify(issues.filter((issue) => issue.tone === 'error'))}`);
  assert.deepEqual(
    issues.map((issue) => issue.path).sort(),
    ['anodising.blackPerSqm', 'each.keeperSaddle', 'each.staysFlat', 'each.staysMed', 'glass.processing.laminate.cview'],
    'only the legacy sheet gaps are flagged'
  );
  assert.equal(issues.length, 5);
});

test('a blank Marine Window Service margin is the normal case, not a gap', () => {
  assert.equal(checkRateValue('margins.T5573.marginMws', null), null);
});

test('a flat ground edge is only charged on laminate, so the other groups are not gaps', () => {
  assert.equal(checkRateValue('glass.processing.ap5-6.flatGround', null), null);
  assert.equal(checkRateValue('glass.processing.ap8-12.flatGround', null), null);
  assert.equal(checkRateValue('glass.processing.laminate.cview', null)?.tone, 'warning');
});

test('a charge that is free by default is not flagged', () => {
  assert.equal(checkRateValue('glass.processing.acrylic.holes', 0), null);
  assert.equal(checkRateValue('labour.T8610.trim.perSqm', 0), null);
  assert.equal(checkRateValue('labour.SF.develop.areaK', 0), null);
});

test('clearing a rate that had a price is an error, because it silently costs nothing', () => {
  for (const path of ['labourPerHour', 'suppliers.capral.perKg', 'margins.T5573.margin', 'perMetre.sikaflex', 'labour.T5573.window.square.each', 'packingPerSqm']) {
    const issue = checkRateValue(path, null);
    assert.equal(issue?.tone, 'error', `${path} blank should be an error`);
  }
});

test('a divisor must have a value', () => {
  assert.equal(checkRateValue('extrusions.bar40x10.barLength', null)?.tone, 'error');
  assert.equal(checkRateValue('extrusions.bar40x10.barLength', 0)?.tone, 'error');
  assert.equal(checkRateValue('labour.T4633.trim.fixedQty', 0)?.tone, 'error');
  assert.equal(checkRateValue('extrusions.bar40x10.barLength', 4), null);
});

test('a rate below zero is an error anywhere', () => {
  assert.equal(checkRateValue('perMetre.sikaflex', -1)?.tone, 'error');
  assert.equal(checkRateValue('margins.T5573.margin', -0.1)?.tone, 'error');
});

test('a percentage typed as a whole number is an error', () => {
  assert.equal(checkRateValue('margins.T5573.margin', 40)?.tone, 'error', '40 means 4000 percent');
  assert.equal(checkRateValue('margins.T5573.margin', 0.4), null);
  assert.equal(checkRateValue('suppliers.capral.loading', 20)?.tone, 'error');
  assert.equal(checkRateValue('glass.loading', 0.2), null);
  // Minutes per square metre is not a fraction, so a value above 1 is ordinary.
  assert.equal(checkRateValue('labour.T5573.develop.areaK', 0.8), null);
  assert.equal(checkRateValue('labourPerHour', 95), null);
});

test('a zero on a rate the whole costing leans on is an error, elsewhere a warning', () => {
  assert.equal(checkRateValue('labourPerHour', 0)?.tone, 'error');
  assert.equal(checkRateValue('suppliers.capral.perKg', 0)?.tone, 'error');
  assert.equal(checkRateValue('glass.options.ap6_clear.list', 0)?.tone, 'error');
  assert.equal(checkRateValue('perMetre.sikaflex', 0)?.tone, 'warning');
  assert.equal(checkRateValue('each.lockComb', 0)?.tone, 'warning');
});

test('a saved document cannot blank a rate that has a price', () => {
  // Without this, JavaScript reads the blank as zero and the quote comes out low with no warning.
  assert.equal(mergeWindowRates({ labourPerHour: null }).labourPerHour, DEFAULT_WINDOW_RATES.labourPerHour);
  assert.equal(mergeWindowRates({ suppliers: { capral: { perKg: null } } }).suppliers.capral.perKg, DEFAULT_WINDOW_RATES.suppliers.capral.perKg);
  assert.equal(mergeWindowRates({ margins: { T5573: { margin: null } } }).margins.T5573.margin, DEFAULT_WINDOW_RATES.margins.T5573.margin);

  // A rate the sheet never priced stays blank, and an entered price is kept.
  assert.equal(mergeWindowRates({ anodising: { blackPerSqm: null } }).anodising.blackPerSqm, null);
  assert.equal(mergeWindowRates({ anodising: { blackPerSqm: 55 } }).anodising.blackPerSqm, 55);
  assert.equal(mergeWindowRates({ labourPerHour: 95 }).labourPerHour, 95);
});

test('a blanked labour rate can no longer quietly halve a quote', () => {
  const input = createWindowInput('T5573', { glazingId: 'ap6_clear' });
  const priced = costWindow(input, DEFAULT_WINDOW_RATES).price ?? 0;
  const afterBlanking = costWindow(input, mergeWindowRates({ labourPerHour: null })).price ?? 0;

  assert.ok(priced > 0);
  assert.equal(afterBlanking, priced, 'the default rate is used instead of zero');
});
