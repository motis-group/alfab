// The menu the workshop picks from must point at recipes that exist.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ALL_PRODUCTS, WINDOW_SERIES, findProduct, productForInput, productFullName, seriesOfProduct, visibleSeries } from './window-catalogue';
import { DEFAULT_WINDOW_RATES } from './window-costing-rates';
import { WINDOW_TYPES, WINDOW_TYPE_ORDER, costWindow, createWindowInput } from './window-costing';

test('every product points at a recipe that exists, or says it has none', () => {
  for (const product of ALL_PRODUCTS) {
    if (product.type === null) {
      assert.ok(product.note, `${product.id} has no recipe and must say why`);
      continue;
    }
    assert.ok(WINDOW_TYPES[product.type], `${product.id} points at unknown type ${product.type}`);
    if (product.variant !== undefined) {
      assert.ok(WINDOW_TYPES[product.type].variantLabels, `${product.id} sets a section on a type that has none`);
    }
  }
});

test('product and series ids are unique', () => {
  assert.equal(new Set(ALL_PRODUCTS.map((p) => p.id)).size, ALL_PRODUCTS.length);
  assert.equal(new Set(WINDOW_SERIES.map((s) => s.id)).size, WINDOW_SERIES.length);
});

test('every costable window type is named somewhere, on the menu or retired', () => {
  const named = new Set(ALL_PRODUCTS.filter((p) => p.type).map((p) => p.type));
  for (const type of WINDOW_TYPE_ORDER) {
    assert.ok(named.has(type), `${type} can be priced but no product names it`);
  }
});

test('the picker offers only the series still in use', () => {
  assert.deepEqual(
    visibleSeries().map((series) => series.id),
    ['1000', '750', '650', '500'],
    'a retired series is off the menu'
  );
});

test('a retired series comes back while a costing is using it', () => {
  assert.ok(
    visibleSeries('other').some((series) => series.id === 'other'),
    'a costing saved against a retired window must still show its series'
  );
});

test('a retired window still prices, so an old costing still opens', () => {
  for (const productId of ['other-8610', 'other-2482', 'other-tsf', 'other-sf']) {
    const product = findProduct(productId);
    assert.ok(product?.type, `${productId} must keep its recipe`);
    const input = createWindowInput(product!.type!, { glazingId: 'ap6_clear' });
    assert.ok((costWindow(input, DEFAULT_WINDOW_RATES).price ?? 0) > 0, `${productId} must still price`);
  }
});

test('both sections of a two-section type are on the menu', () => {
  for (const type of WINDOW_TYPE_ORDER) {
    if (!WINDOW_TYPES[type].variantLabels) {
      continue;
    }
    const variants = ALL_PRODUCTS.filter((p) => p.type === type).map((p) => p.variant ?? 0);
    assert.ok(variants.includes(0) && variants.includes(1), `${type} is missing a section on the menu`);
  }
});

test('one recipe can serve several series', () => {
  // 5573 is the fixed window in both the 750 and the 500.
  const fixed = ALL_PRODUCTS.filter((p) => p.type === 'T5573');
  assert.ok(fixed.length >= 2);
  assert.deepEqual(fixed.map((p) => seriesOfProduct(p.id)?.id).sort(), ['500', '750']);
});

test('a product prices the window its series expects', () => {
  const slider650 = findProduct('650-037');
  assert.equal(slider650?.type, 'T4633');
  assert.equal(slider650?.variant, 1, 'the 650 slider is the AFB037 section');

  const slider500 = findProduct('500-4633');
  assert.equal(slider500?.variant, 0, 'the 500 horse float slider is the T4633 section');

  const input = { ...createWindowInput('T4633', { glazingId: 'ap6_clear' }), variant: 1 as const, productId: '650-037' };
  assert.ok((costWindow(input, DEFAULT_WINDOW_RATES).price ?? 0) > 0);
});

test('a costing names the window the way the workshop does', () => {
  assert.equal(productFullName('650-037'), '650 Series 037 — Slider');
  assert.equal(productFullName(null), null);
});

test('a costing saved before the menu existed still finds its product', () => {
  const legacy = { ...createWindowInput('T5836'), productId: null };
  assert.equal(productForInput(legacy)?.id, '500-5836');
});
