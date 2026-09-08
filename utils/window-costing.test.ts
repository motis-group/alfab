// Golden checks for the window costing engine, hand-derived from the legacy Lotus sheet
// (docs/legacy/WINDOWS.12M). Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_WINDOW_RATES, mergeWindowRates } from './window-costing-rates';
import { GLAZING_ORDER, WINDOW_TYPE_ORDER, costWindow, createWindowInput, describeWindow, switchWindowType } from './window-costing';

const rates = DEFAULT_WINDOW_RATES;

function near(actual: number | null | undefined, expected: number, label: string) {
  assert.ok(actual != null && Math.abs(actual - expected) < 0.01, `${label}: got ${actual}, expected ${expected}`);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

test('T5573 golden case A: 1000 x 1200, 1 to size, etch, no trims, develop off, 5 mm clear', () => {
  const result = costWindow(createWindowInput('T5573', { heightMm: 1000, lengthMm: 1200, qtyToSize: 1, qtyShaped: 0, develop: false, glazingId: 'ap5_clear', finish: 'etch', trims: 'none' }), rates);
  assert.deepEqual(result.errors, []);
  near(result.perimeterM, 4.4, 'perimeter');
  near(result.areaSqm, 1.2, 'area');
  near(result.minutes.total, 96, 'minutes');
  near(result.subtotal, 342.674, 'subtotal');
  near(result.packing, 3.0, 'packing');
  near(result.price, 518.95, 'price');
});

test('T5573 golden case B: case A plus pairs, trims required, 4 welds', () => {
  const result = costWindow(createWindowInput('T5573', { heightMm: 1000, lengthMm: 1200, qtyToSize: 1, qtyShaped: 0, develop: false, glazingId: 'ap5_clear', trims: 'required', pairs: true, welds: 4 }), rates);
  near(result.minutes.trim, 57, 'trim minutes');
  near(result.minutes.welding, 50, 'welding minutes');
  near(result.minutes.total, 203, 'minutes');
  near(result.subtotal, 527.624, 'subtotal');
  assert.equal(result.unitLabel, 'Per Pair');
  near(result.price, 1594.6, 'price');
});

test('T5573 golden case C: 1000 x 1000, develop on, 6 mm clear', () => {
  const result = costWindow(createWindowInput('T5573', { heightMm: 1000, lengthMm: 1000, qtyToSize: 1, qtyShaped: 0, develop: true, glazingId: 'ap6_clear' }), rates);
  near(result.minutes.total, 105, 'minutes');
  near(result.price, 507.21, 'price');
});

test('T8610 golden case D: 600 x 400, 2 shaped, pairs, develop on, 5 mm clear', () => {
  const result = costWindow(createWindowInput('T8610', { heightMm: 600, lengthMm: 400, qtyToSize: 0, qtyShaped: 2, develop: true, glazingId: 'ap5_clear' }), rates);
  assert.equal(result.unitLabel, 'Per Pair');
  near(result.minutes.window, 56.82, 'window minutes');
  near(result.minutes.develop, 20.432, 'develop minutes');
  near(result.marginRate, 0.35, 'margin');
  near(result.packing, 0.6, 'packing');
  near(result.price, 444.94, 'price');
});

test('every window type prices at its defaults', () => {
  for (const type of WINDOW_TYPE_ORDER) {
    const result = costWindow(createWindowInput(type, { glazingId: 'ap6_clear' }), rates);
    assert.deepEqual(result.errors, [], `${type} errors`);
    assert.ok(result.price !== null && result.price > 0, `${type} prices`);
    assert.ok(result.lines.every((line) => Number.isFinite(line.cost)), `${type} finite costs`);
    assert.ok(describeWindow(createWindowInput(type), rates).length > 0, `${type} description`);
  }
  assert.equal(GLAZING_ORDER.length, Object.keys(rates.glass.options).length, 'glazing order complete');
});

test('source gaps surface as not priced instead of failing', () => {
  assert.ok(costWindow(createWindowInput('T5573', { finish: 'black' }), rates).unpriced.some((label) => label.includes('BLACK')), 'black anodising');
  assert.equal(costWindow(createWindowInput('T5573', { finish: 'blackExtra' }), rates).extras.blackAnodising?.total, null, 'black as extra');
  assert.ok(costWindow(createWindowInput('SF'), rates).unpriced.some((label) => label.includes('KEEPERS')), 'S&F keepers');
  assert.ok(costWindow(createWindowInput('TSF', { stayType: 'flat' }), rates).unpriced.some((label) => label.includes('STAYS')), 'flat stays');
});

test('validation and warnings', () => {
  const tooManyWelds = costWindow(createWindowInput('T5573', { welds: 5 }), rates);
  assert.ok(tooManyWelds.errors.length > 0 && tooManyWelds.price === null, 'welds > 4 on to-size rejected');
  assert.deepEqual(costWindow(createWindowInput('T5573', { qtyToSize: 0, qtyShaped: 1, welds: 5 }), rates).errors, [], 'welds > 4 allowed when shaped');
  assert.ok(costWindow(createWindowInput('U6567', { glazingId: 'ap5_clear' }), rates).warnings.some((w) => w.includes('minimum 6 mm')), 'U6567 5 mm warning');
  assert.equal(costWindow(createWindowInput('T5573', { glazingId: null }), rates).price, null, 'no glazing');
});

test('marine window service lowers selected margins and the glass loading', () => {
  near(costWindow(createWindowInput('T8610', { mws: true }), rates).marginRate, 0.225, 'T8610 margin');
  near(costWindow(createWindowInput('T5573', { mws: true }), rates).marginRate, 0.4, 'T5573 margin unchanged');
  near(costWindow(createWindowInput('T5573', { mws: true, glazingId: 'ap8_clear' }), rates).glazing[0].rate, 145.02 * 1.15, 'glass loading');
});

test('extras: trims, second glazing, reinforcement replaces packing', () => {
  const trimsExtra = costWindow(createWindowInput('T5573', { trims: 'extra' }), rates);
  assert.ok((trimsExtra.extras.trims?.total ?? 0) > 0, 'trims as extra priced');
  assert.ok(!trimsExtra.lines.some((line) => line.key === 'trim'), 'trims as extra not in main lines');

  const secondGlass = costWindow(createWindowInput('T5573', { glazingId: 'ap5_clear', secondGlazingId: 'ap6_clear' }), rates);
  near(secondGlass.extras.secondGlazing?.total, round2(round2(5 * 1 * 1.4) * 1.075), 'second glazing differential');

  const withMullion = costWindow(createWindowInput('T5573', { reinforcement: 'mullion', reinforcementCount: 2 }), rates);
  assert.ok(withMullion.reinforcement && withMullion.reinforcement.count === 2, 'mullion block present');
  near(withMullion.packing, (withMullion.reinforcement?.perBar ?? 0) * 2, 'mullion block replaces packing');
});

test('switching type keeps shared fields and resets type-specific ones', () => {
  const current = createWindowInput('U6567', { heightMm: 800, lengthMm: 600, finish: 'powder', welds: 3, reinforcement: 'reo', reinforcementCount: 1 });
  const next = switchWindowType(current, 'T8610');
  assert.equal(next.type, 'T8610');
  assert.equal(next.heightMm, 800);
  assert.equal(next.finish, 'powder');
  assert.equal(next.welds, 0);
  assert.equal(next.reinforcement, 'none');
  assert.equal(next.pairs, true, 'T8610 defaults to pairs');
});

test('rates merge overlays numeric leaves only', () => {
  assert.deepEqual(mergeWindowRates({}), rates, 'empty merge equals defaults');
  assert.deepEqual(mergeWindowRates(null), rates, 'null merge equals defaults');
  const merged = mergeWindowRates({ labourPerHour: 90, anodising: { blackPerSqm: 55 }, bogus: 1, extrusions: { T5573: { kgPerM: 'x' } } });
  assert.equal(merged.labourPerHour, 90);
  assert.equal(merged.anodising.blackPerSqm, 55);
  assert.equal((merged as { bogus?: unknown }).bogus, undefined);
  assert.deepEqual(merged.extrusions.T5573, rates.extrusions.T5573, 'invalid leaf keeps default');
  assert.deepEqual({ ...merged, labourPerHour: 85, anodising: { ...merged.anodising, blackPerSqm: null } }, rates, 'merge changes only given keys');
});
