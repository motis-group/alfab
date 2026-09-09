// Checks for the price drift report. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultPricingData } from '@components/PricingProvider';
import { DEFAULT_AWNING_RATES } from './awning-costing-rates';
import { DEFAULT_WINDOW_RATES } from './window-costing-rates';
import { MATERIAL_SPREAD, compareRates, materialDrift } from './rate-drift';

const items = compareRates(defaultPricingData, DEFAULT_WINDOW_RATES, DEFAULT_AWNING_RATES);

function item(key: string) {
  const found = items.find((entry) => entry.key === key);
  assert.ok(found, `no item ${key}`);
  return found;
}

test('only items held in more than one list are reported', () => {
  assert.ok(items.length > 0);
  for (const entry of items) {
    assert.ok(entry.prices.length > 1, `${entry.key} has one price`);
  }
});

test('the three Super Grey prices are all found', () => {
  const superGrey = item('glass_super_grey_6');

  assert.deepEqual(
    superGrey.prices.map((price) => price.source),
    ['glass', 'window', 'awning']
  );
  assert.equal(superGrey.prices[0].value, 198.12);
  assert.equal(superGrey.prices[1].value, 170);
  assert.equal(superGrey.prices[2].value, 198);
  assert.equal(superGrey.low, 170);
  assert.equal(superGrey.high, 198.12);
});

test('window glass carrying the loading is compared on the loaded price, not the list', () => {
  const clear8 = item('glass_clear_8');
  const windowPrice = clear8.prices.find((price) => price.source === 'window');

  assert.equal(windowPrice?.value, 145.02);
  // 145.02 plus the 20 percent glass loading.
  assert.ok(Math.abs((windowPrice?.effective ?? 0) - 174.024) < 0.01);
  assert.match(windowPrice?.note || '', /20% glass loading/);
});

test('glass with no loading is compared on the list price itself', () => {
  const clear6 = item('glass_clear_6');
  const windowPrice = clear6.prices.find((price) => price.source === 'window');

  assert.equal(windowPrice?.value, 80);
  assert.equal(windowPrice?.effective, 80);
  assert.equal(windowPrice?.note, undefined);
});

test('the two labour rates are reported as a 13 percent gap', () => {
  const labour = item('labour_per_hour');

  assert.equal(labour.low, 75);
  assert.equal(labour.high, 85);
  assert.ok(Math.abs((labour.spread ?? 0) - 10 / 75) < 0.001);
});

test('items that agree are reported with a spread but are not material', () => {
  const banding = item('ceramic_banding');
  const polish = item('flat_polish');

  assert.equal(banding.spread, 0);
  assert.equal(polish.spread, 0);
  assert.equal(materialDrift([banding, polish]).length, 0, 'banding and polish match across the lists');
});

test('rounding is not reported as drift', () => {
  // Super Grey is 198.12 in one list and 198.00 in another: the same price, typed twice.
  assert.ok(198.12 / 198 - 1 < MATERIAL_SPREAD);
});

test('the report is sorted dearest spread first', () => {
  const spreads = items.map((entry) => entry.spread ?? 0);
  assert.deepEqual(
    spreads,
    [...spreads].sort((a, b) => b - a)
  );
});

test('the defaults carry real drift worth a conversation', () => {
  const material = materialDrift(items);

  assert.ok(material.length >= 3, `expected several material gaps, got ${material.length}`);
  // The 5 mm and 6 mm clear gaps and the labour rate are all well over the threshold.
  assert.ok(material.some((entry) => entry.key === 'labour_per_hour'));
  assert.ok(material.some((entry) => entry.key === 'glass_clear_6'));
});

test('a list missing an item drops out rather than reading as zero', () => {
  const stripped = { ...DEFAULT_AWNING_RATES, glass: { ...DEFAULT_AWNING_RATES.glass, bandingSet: null } };
  const banding = compareRates(defaultPricingData, DEFAULT_WINDOW_RATES, stripped).find((entry) => entry.key === 'ceramic_banding');

  assert.equal(banding, undefined, 'one price left, so nothing to compare');
});
