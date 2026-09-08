// The menu the workshop picks from must point at recipes that exist.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ALL_PRODUCTS, WINDOW_SERIES, findProduct, productForInput, productFullName, seriesOfProduct } from './window-catalogue';
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

test('every costable window type is reachable from the menu', () => {
  const reachable = new Set(ALL_PRODUCTS.filter((p) => p.type).map((p) => p.type));
  for (const type of WINDOW_TYPE_ORDER) {
    assert.ok(reachable.has(type), `${type} can be priced but is not on the menu`);
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
