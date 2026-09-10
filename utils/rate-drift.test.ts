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

test('the three Super Grey prices are all found, and all agree', () => {
  const superGrey = item('glass_super_grey_6');

  assert.deepEqual(
    superGrey.prices.map((price) => price.source),
    ['glass', 'window', 'awning']
  );
  // One price, chosen in the glass list and derived by the other two. It was 198.12, 170 and 198.
  for (const price of superGrey.prices) {
    assert.ok(Math.abs(price.effective - 198.12) < 0.01, `${price.source} is ${price.effective}`);
  }
  assert.equal(superGrey.spread, 0);
});

test('window glass carrying the loading is compared on the loaded price, not the list', () => {
  const clear8 = item('glass_clear_8');
  const windowPrice = clear8.prices.find((price) => price.source === 'window');
  const glassPrice = clear8.prices.find((price) => price.source === 'glass');

  // The window costing loads this line, so its list price is the shared price divided by the
  // loading. The two lists hold different numbers and charge the same price, which is the point.
  assert.ok(Math.abs((windowPrice?.value ?? 0) - 167.19) < 0.01, `list is ${windowPrice?.value}`);
  assert.ok(Math.abs((windowPrice?.effective ?? 0) - (glassPrice?.effective ?? 0)) < 0.01, 'loaded price matches the glass list');
  assert.match(windowPrice?.note || '', /20% glass loading/);
});

test('glass with no loading is compared on the list price itself', () => {
  const clear6 = item('glass_clear_6');
  const windowPrice = clear6.prices.find((price) => price.source === 'window');

  // Unloaded, so the list price is the shared price unchanged. It was 80 against the glass list's 92.47.
  assert.equal(windowPrice?.value, 92.47);
  assert.equal(windowPrice?.effective, 92.47);
  assert.equal(windowPrice?.note, undefined);
});

test('one shop, one hourly rate', () => {
  const labour = item('labour_per_hour');

  // The window costing charged $85 and the awning $75 for the same hour.
  assert.equal(labour.low, 85);
  assert.equal(labour.high, 85);
  assert.equal(labour.spread, 0);
});

test('items that agree are reported with a spread but are not material', () => {
  const banding = item('ceramic_banding');
  const polish = item('flat_polish');

  assert.equal(banding.spread, 0);
  assert.equal(polish.spread, 0);
  assert.equal(materialDrift([banding, polish]).length, 0, 'banding and polish match across the lists');
});

test('the report is sorted dearest spread first', () => {
  const spreads = items.map((entry) => entry.spread ?? 0);
  assert.deepEqual(
    spreads,
    [...spreads].sort((a, b) => b - a)
  );
});

/**
 * The report is what proves the consolidation holds. Every shared item is chosen once, in the glass
 * price list, so no two lists can put a different price on the same product. Before this, seven
 * glass items and the labour rate disagreed by 13 to 17 percent.
 */
test('no shared item drifts', () => {
  const material = materialDrift(items);

  assert.deepEqual(
    material.map((entry) => entry.key),
    [],
    `these items are priced in more than one place: ${material.map((entry) => entry.key).join(', ')}`
  );

  for (const entry of items) {
    assert.ok((entry.spread ?? 0) < MATERIAL_SPREAD, `${entry.key} spreads ${((entry.spread ?? 0) * 100).toFixed(1)}%`);
  }
});

test('a list missing an item drops out rather than reading as zero', () => {
  const stripped = { ...DEFAULT_AWNING_RATES, glass: { ...DEFAULT_AWNING_RATES.glass, bandingSet: null } };
  const banding = compareRates(defaultPricingData, DEFAULT_WINDOW_RATES, stripped).find((entry) => entry.key === 'ceramic_banding');

  assert.equal(banding, undefined, 'one price left, so nothing to compare');
});
