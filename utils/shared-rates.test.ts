// Checks that a shared rate is chosen in one place. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultBasePrices, defaultEdgeworkPrices } from './calculations';
import { AWNING_RATES_AS_TRANSCRIBED, DEFAULT_AWNING_RATES } from './awning-costing-rates';
import { DEFAULT_WINDOW_RATES, WINDOW_RATES_AS_TRANSCRIBED } from './window-costing-rates';
import { AWNING_GLASS_FROM_LIST, WINDOW_GLASS_FROM_LIST, applySharedRatesToAwning, applySharedRatesToWindow } from './shared-rates';

test('every shared window glass line charges the glass list price', () => {
  for (const [id, ref] of Object.entries(WINDOW_GLASS_FROM_LIST)) {
    const option = DEFAULT_WINDOW_RATES.glass.options[id as keyof typeof DEFAULT_WINDOW_RATES.glass.options];
    const shared = defaultBasePrices[ref.type]?.[ref.mm];
    assert.ok(option && shared, `${id} has no price`);

    // A loaded line holds the shared price divided by the loading, so the two agree once it applies.
    const charged = option.loaded ? option.list! * (1 + DEFAULT_WINDOW_RATES.glass.loading) : option.list!;
    assert.ok(Math.abs(charged - shared) < 0.02, `${id} charges ${charged.toFixed(2)}, the glass list says ${shared}`);
  }
});

test('a window glass line with no glass-list equivalent keeps its own price', () => {
  for (const id of ['ap5_tint', 'lam638_clear', 'acr5_clear', 'poly6_clear'] as const) {
    assert.ok(!(id in WINDOW_GLASS_FROM_LIST), `${id} is not shared`);
    assert.equal(DEFAULT_WINDOW_RATES.glass.options[id].list, WINDOW_RATES_AS_TRANSCRIBED.glass.options[id].list, `${id} is unchanged`);
  }
});

test('every shared awning rate comes from the list that owns it', () => {
  for (const [id, ref] of Object.entries(AWNING_GLASS_FROM_LIST)) {
    assert.equal(DEFAULT_AWNING_RATES.glass.options[id as keyof typeof DEFAULT_AWNING_RATES.glass.options].list, defaultBasePrices[ref.type]?.[ref.mm], `${id}`);
  }

  assert.equal(DEFAULT_AWNING_RATES.glass.flatPolishPerM, defaultEdgeworkPrices['FLAT POLISH - STRAIGHT']['4-6']);
  assert.equal(DEFAULT_AWNING_RATES.labour.perHour, DEFAULT_WINDOW_RATES.labourPerHour, 'one shop, one hourly rate');
});

test('the glass prices the shop saves reach both costings', () => {
  const raised = { ...defaultBasePrices, Clear: { ...defaultBasePrices.Clear, 6: 150 } };

  const windowRates = applySharedRatesToWindow(WINDOW_RATES_AS_TRANSCRIBED, raised);
  assert.equal(windowRates.glass.options.ap6_clear.list, 150, '6 mm clear is unloaded, so the list price is the shared price');

  const awningRates = applySharedRatesToAwning(AWNING_RATES_AS_TRANSCRIBED, {
    basePrices: raised,
    ceramicBanding: 70,
    flatPolishPerM: 5,
    labourPerHour: 95,
  });
  assert.equal(awningRates.glass.bandingSet, 70);
  assert.equal(awningRates.glass.flatPolishPerM, 5);
  assert.equal(awningRates.labour.perHour, 95);
});

test('a loaded line is divided by the loading, so raising the glass price raises the charge by the same amount', () => {
  const raised = { ...defaultBasePrices, Clear: { ...defaultBasePrices.Clear, 8: 240 } };
  const rates = applySharedRatesToWindow(WINDOW_RATES_AS_TRANSCRIBED, raised);
  const option = rates.glass.options.ap8_clear;

  assert.ok(option.loaded, 'this line carries the loading');
  assert.ok(Math.abs(option.list! * (1 + rates.glass.loading) - 240) < 0.02, `charges ${(option.list! * (1 + rates.glass.loading)).toFixed(2)}`);
});
