// Golden checks for the window costing engine, hand-derived from the legacy Lotus sheet
// (docs/legacy/WINDOWS.12M). Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_WINDOW_RATES, mergeWindowRates } from './window-costing-rates';
import { GLAZING_ORDER, WINDOW_TYPE_ORDER, WindowTypeId, costWindow, costWindowBatches, createWindowInput, describeWindow, switchWindowType } from './window-costing';

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

// Same window for every type: 1000 x 1000 mm, one made to size, etch, no trims, no development
// labour, 6 mm Clear A/P. Expected prices come from the sheet's formulas, worked by hand.
const BASE_CASE = { heightMm: 1000, lengthMm: 1000, qtyToSize: 1, qtyShaped: 0, develop: false, glazingId: 'ap6_clear' as const, finish: 'etch' as const, trims: 'none' as const };

const GOLDEN: Array<{ type: WindowTypeId; price: number; minutes: number; glazing: number; packing: number }> = [
  { type: 'T5836', price: 666.3, minutes: 150, glazing: 102.62, packing: 2.5 },
  { type: 'T4633', price: 502.25, minutes: 96.6, glazing: 118.34, packing: 2.6 },
  { type: 'T2482', price: 432.37, minutes: 70, glazing: 84.56, packing: 2.5 },
  { type: 'U6567', price: 552.64, minutes: 86, glazing: 84.56, packing: 2.5 },
  { type: 'AFB008', price: 760.76, minutes: 160, glazing: 89.12, packing: 2 },
  { type: 'TSF', price: 1298.72, minutes: 241.667, glazing: 84.56, packing: 2.5 },
  { type: 'SF', price: 773.47, minutes: 140, glazing: 84.56, packing: 2.5 },
];

for (const golden of GOLDEN) {
  test(`${golden.type} golden case: 1000 x 1000, 1 to size, etch, no trims, 6 mm clear`, () => {
    const result = costWindow(createWindowInput(golden.type, BASE_CASE), rates);
    assert.deepEqual(result.errors, [], `${golden.type} errors`);
    near(result.minutes.total, golden.minutes, `${golden.type} minutes`);
    near(result.glazingTotal, golden.glazing, `${golden.type} glazing`);
    near(result.packing, golden.packing, `${golden.type} packing`);
    near(result.price, golden.price, `${golden.type} price`);
  });
}

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

test('source gaps surface as not priced, and each names its rate field', () => {
  const sf = costWindow(createWindowInput('SF'), rates);
  assert.ok(sf.unpriced.some((entry) => entry.label.includes('KEEPERS') && entry.path === 'each.keeperSaddle'), 'S&F keepers');

  const stays = costWindow(createWindowInput('TSF', { stayType: 'flat' }), rates);
  assert.ok(stays.unpriced.some((entry) => entry.label.includes('STAYS') && entry.path === 'each.staysFlat'), 'flat stays');

  const laminate = costWindow(createWindowInput('T5573', { glazingId: 'lam638_clear', cviewHoles: 2 }), rates);
  assert.ok(laminate.unpriced.some((entry) => entry.path === 'glass.processing.laminate.cview'), 'laminate c/view holes');
});

test('every priced line names the rate field it used', () => {
  for (const type of WINDOW_TYPE_ORDER) {
    const result = costWindow(createWindowInput(type, { glazingId: 'ap6_clear' }), rates);
    for (const line of result.lines) {
      if (line.qty > 0 && line.key !== 'labour' && line.key !== 'glazing' && !line.label.startsWith('ANOD. N/A')) {
        assert.ok(line.ratePath, `${type} ${line.label} has no rate field`);
      }
    }
  }
});

test('batch pricing spreads the setup minutes across the batch', () => {
  const input = createWindowInput('T5573', { ...BASE_CASE, glazingId: 'ap5_clear', lengthMm: 1200 });
  const batches = costWindowBatches(input, rates, [1, 2, 5, 10]);

  assert.deepEqual(batches.map((batch) => batch.batchSize), [1, 2, 5, 10]);
  near(batches[0].pricePerUnit, 518.95, 'batch of 1 matches the single price');
  near(batches[0].saving, 0, 'no saving at a batch of one');
  for (let index = 1; index < batches.length; index += 1) {
    assert.ok((batches[index].pricePerUnit ?? 0) < (batches[index - 1].pricePerUnit ?? 0), 'a larger batch costs less per window');
    assert.ok((batches[index].saving ?? 0) > 0, 'a larger batch saves money');
  }

  // 20 setup minutes shared over 2 windows saves 10 minutes, which is $14.17 of labour.
  const perMinute = rates.labourPerHour / 60;
  const expected = (10 * perMinute * (1 + rates.margins.T5573.margin)) * (1 + rates.margins.T5573.uplift);
  near(batches[1].saving, expected, 'saving at a batch of two');
});

test('a shaped-only window keeps its shape across batch sizes', () => {
  const shaped = createWindowInput('T5573', { ...BASE_CASE, qtyToSize: 0, qtyShaped: 1 });
  const batches = costWindowBatches(shaped, rates, [1, 4]);
  const direct = costWindow({ ...shaped, qtyShaped: 4 }, rates);
  near(batches[1].pricePerUnit, direct.price ?? 0, 'batch of four shaped windows');
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
  const merged = mergeWindowRates({ labourPerHour: 90, anodising: { etchMin: 12 }, bogus: 1, extrusions: { T5573: { kgPerM: 'x' } } });
  assert.equal(merged.labourPerHour, 90);
  assert.equal(merged.anodising.etchMin, 12);
  assert.equal((merged as { bogus?: unknown }).bogus, undefined);
  assert.deepEqual(merged.extrusions.T5573, rates.extrusions.T5573, 'invalid leaf keeps default');
  assert.deepEqual({ ...merged, labourPerHour: 85, anodising: { ...merged.anodising, etchMin: 10 } }, rates, 'merge changes only given keys');
});

test('rates merge keeps the as-at dates and takes saved ones', () => {
  assert.equal(mergeWindowRates({}).asAt.labourPerHour, rates.asAt.labourPerHour, 'default as-at date');
  assert.equal(mergeWindowRates({ asAt: { labourPerHour: 'Mar 2026' } }).asAt.labourPerHour, 'Mar 2026', 'saved as-at date');
  assert.equal(mergeWindowRates({ asAt: { labourPerHour: 7 } }).asAt.labourPerHour, rates.asAt.labourPerHour, 'a non-text as-at date is ignored');
});

test('a rate entered for a source gap prices the line', () => {
  const gap = costWindow(createWindowInput('SF'), rates);
  assert.ok(gap.unpriced.some((entry) => entry.path === 'each.keeperSaddle'), 'the keeper is a gap by default');

  const withKeeper = mergeWindowRates({ each: { keeperSaddle: 12 } });
  const result = costWindow(createWindowInput('SF'), withKeeper);
  assert.ok(!result.unpriced.some((entry) => entry.path === 'each.keeperSaddle'), 'not a gap once the rate exists');
  const line = result.lines.find((entry) => entry.ratePath === 'each.keeperSaddle');
  near(line?.cost, (line?.qty ?? 0) * 12, 'keeper line priced at the entered rate');
});

test('a batch shares its setup minutes, so ten cost less than ten singles', () => {
  const single = costWindow(createWindowInput('T5573', { qtyToSize: 1 }), rates);
  const batch = costWindow(createWindowInput('T5573', { qtyToSize: 10 }), rates);

  assert.ok(single.price != null && batch.price != null, 'both price');
  assert.ok((batch.price as number) < (single.price as number), 'the price for each falls as the run grows');

  // The order line multiplies the batch price by the batch, never the single price. Getting this
  // backwards quoted a run of ten at ten times the one-off price.
  const runOfTen = (batch.price as number) * 10;
  const tenSingles = (single.price as number) * 10;
  assert.ok(runOfTen < tenSingles, 'a run of ten is dearer priced one at a time');
  near(batch.minutes.window, 20 / 10 + 40 + 1.0 * 30, 'setup divided across the batch');
});
