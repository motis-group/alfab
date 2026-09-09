// Golden checks for the awning costing engine, taken from the legacy Excel sheet
// (projects/costing/discovery/AWNING COSTING Feb 16 20201.xlsx). Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_AWNING_RATES, mergeAwningRates } from './awning-costing-rates';
import { costAwning, costAwningBatches, createAwningInput, describeAwning } from './awning-costing';

const rates = DEFAULT_AWNING_RATES;

function near(actual: number | null | undefined, expected: number, label: string) {
  assert.ok(actual != null && Math.abs(actual - expected) < 0.01, `${label}: got ${actual}, expected ${expected}`);
}

function lineCost(result: ReturnType<typeof costAwning>, key: string): number {
  const line = result.lines.find((entry) => entry.key === key);
  assert.ok(line, `no line ${key}`);
  return line.cost;
}

// The sheet as it shipped: 1220 x 1100 glass, six off, Super Grey toughened, banded, flat polished,
// flyscreen. Every figure below is a cell in that sheet.
test('golden case: the sheet as shipped, 1220 x 1100, 6 off', () => {
  const result = costAwning(createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 6 }), rates);

  assert.deepEqual(result.errors, []);
  near(result.perimeterM, 4.64, 'perimeter (A4)');
  near(result.areaSqm, 1.342, 'area (A37)');
  near(result.minutes.total, 340, 'minutes per each (F29)');

  near(lineCost(result, 'frame'), 46.4, 'frame (E4)');
  near(lineCost(result, 'anchorPlate'), 4.8, 'anchor plate (E5)');
  near(lineCost(result, 'rubberSeal'), 30.624, 'rubber seal (E6)');
  near(lineCost(result, 'winder'), 52, 'winder (E7)');
  near(lineCost(result, 'hinges'), 38.5, 'hinges (E8)');
  near(lineCost(result, 'winderMountPlate'), 25, 'winder mount plate (E9)');
  near(lineCost(result, 'glassWinderPlate'), 25, 'glass winder plate (E10)');
  near(lineCost(result, 'fixings'), 20, 'fixings (E11)');
  near(lineCost(result, 'trackInfill'), 16.24, 'track infill (E12)');
  near(lineCost(result, 'sealant'), 10, 'sealant (E13)');
  near(lineCost(result, 'labour'), 425, 'labour (E15)');
  near(lineCost(result, 'flyscreen'), 75, 'flyscreen (E16)');

  near(result.glazingTotal, 350.5544, 'glazing (D40)');
  near(result.subtotal, 1119.1184, 'total cost (E17)');
  near(result.margin, 447.64736, 'margin (E18)');
  near(result.price, 1566.76576, 'selling price (E19)');
  near(result.runTotal, 1566.76576 * 6, 'run total');
  assert.equal(result.unitLabel, 'Per Each');
  assert.deepEqual(result.unpriced, []);
});

test('glazing block splits into glass, banding and flat polish', () => {
  const result = costAwning(createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 6 }), rates);
  const byKey = Object.fromEntries(result.glazing.map((line) => [line.key, line.cost]));

  near(byKey.glass, 265.716, 'glass (D37)');
  near(byKey.banding, 63.68, 'banding (D38)');
  near(byKey.flatPolish, 21.1584, 'flat polish (D39)');
});

test('setup labour divides across the run, so a one-off costs more than one of six', () => {
  const one = costAwning(createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 1 }), rates);
  const six = costAwning(createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 6 }), rates);

  near(one.minutes.total, 390, 'minutes at one off');
  near(six.minutes.total, 340, 'minutes at six off');
  // 50 minutes of setup saved, at $1.25 a minute, marked up 40 percent.
  near((one.price ?? 0) - (six.price ?? 0), 50 * 1.25 * 1.4, 'saving per awning');
});

test('batch prices fall as the run grows', () => {
  const batches = costAwningBatches(createAwningInput({ heightMm: 1220, widthMm: 1100 }), rates);

  assert.deepEqual(
    batches.map((batch) => batch.batchSize),
    [1, 2, 5, 10]
  );
  near(batches[0].saving ?? 0, 0, 'no saving at one');
  assert.ok((batches[3].pricePerUnit ?? 0) < (batches[0].pricePerUnit ?? 0), 'ten costs less each than one');
});

test('turning off the options drops their lines', () => {
  const result = costAwning(createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 6, banding: false, flatPolish: false, flyscreen: false }), rates);

  assert.equal(result.glazing.length, 1);
  near(result.glazingTotal, 265.716, 'glass only');
  assert.equal(
    result.lines.some((line) => line.key === 'flyscreen'),
    false
  );
  near(result.subtotal, 1119.1184 - 63.68 - 21.1584 - 75, 'subtotal without the options');
});

test('sundry minutes are charged at the labour rate', () => {
  const base = costAwning(createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 6 }), rates);
  const withSundry = costAwning(createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 6, sundryMinutes: 30 }), rates);

  near(withSundry.minutes.total - base.minutes.total, 30, 'extra minutes');
  near((withSundry.price ?? 0) - (base.price ?? 0), 30 * 1.25 * 1.4, 'extra price');
});

test('glass with no price is reported rather than charged as the priced glass', () => {
  const result = costAwning(createAwningInput({ heightMm: 1220, widthMm: 1100, glazingId: 'clear_tgn' }), rates);

  assert.equal(result.unpriced.length, 1);
  assert.equal(result.unpriced[0].path, 'glass.options.clear_tgn.list');
  near(result.glazingTotal, 63.68 + 21.1584, 'banding and polish only');
});

test('a size of zero is an error, not a price of zero', () => {
  const result = costAwning(createAwningInput({ heightMm: 0, widthMm: 1100 }), rates);

  assert.equal(result.price, null);
  assert.ok(result.errors.length > 0);
});

test('a blank on a rate that has a default price falls back to that price', () => {
  const merged = mergeAwningRates({ parts: { frame: null, winder: 60 }, labour: { perHour: null } });

  assert.equal(merged.parts.frame, 10);
  assert.equal(merged.parts.winder, 60);
  assert.equal(merged.labour.perHour, 75);
});

test('a rate that is blank by default may be saved blank, and unknown keys are dropped', () => {
  const merged = mergeAwningRates({ glass: { options: { clear_tgn: { list: null } } }, nonsense: 1 });

  assert.equal(merged.glass.options.clear_tgn.list, null);
  assert.equal((merged as unknown as Record<string, unknown>).nonsense, undefined);
});

test('the description names the awning, the size, the run and the glass', () => {
  const text = describeAwning(createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 6 }), rates);

  assert.match(text, /Awning/);
  assert.match(text, /1220 x 1100 mm/);
  assert.match(text, /6 off/);
  assert.match(text, /Super Grey Toughened/);
});
