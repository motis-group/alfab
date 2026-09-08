// Checks for the glass calculator. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GlassSpecification, calculateCost, describeGlassSpecification } from './calculations';

const small: GlassSpecification = {
  width: 200,
  height: 200,
  thickness: 6,
  glassType: 'Clear',
  edgework: 'ROUGH ARRIS',
  ceramicBand: false,
  shape: 'RECTANGLE',
  holes: false,
  numHoles: 0,
  radiusCorners: false,
  scanning: false,
};

test('a minimum charge floors a small piece and says what it added', () => {
  const exact = calculateCost(small, { otherPrices: {} });
  assert.ok(exact.total < 10, `area alone prices a 200 x 200 piece at a few dollars, got ${exact.total}`);
  assert.equal(exact.minimumTopUp, 0, 'no top-up while no minimum is set');

  const floored = calculateCost(small, { otherPrices: { minCharge: 45 } });
  assert.equal(floored.total, 45, 'the piece is charged the minimum');
  assert.ok(Math.abs(floored.minimumTopUp - (45 - exact.total)) < 0.01, 'the top-up is the difference, not hidden in the glass line');

  const big = calculateCost({ ...small, width: 2000, height: 2000 }, { otherPrices: { minCharge: 45 } });
  assert.equal(big.minimumTopUp, 0, 'a piece already above the minimum is untouched');
});

test('a minimum area prices the glass as if the piece were that big', () => {
  const exact = calculateCost(small, { otherPrices: {} });
  const floored = calculateCost(small, { otherPrices: { minAreaSqm: 0.25 } });

  // 200 x 200 is 0.04 m². Charged at 0.25 m², the glass line is six and a quarter times bigger.
  assert.ok(floored.baseGlass > exact.baseGlass, 'the glass line rises to the minimum area');
  assert.ok(Math.abs(floored.baseGlass - exact.baseGlass * (0.25 / 0.04)) < 0.01, 'priced at the minimum area exactly');
});

test('a piece describes itself the way the floor reads it', () => {
  assert.equal(describeGlassSpecification(small), '200 x 200 mm | 6 mm Clear | rough arris');

  const worked = describeGlassSpecification({ ...small, shape: 'TRIANGLE', ceramicBand: true, holes: true, numHoles: 2, radiusCorners: true });
  assert.ok(worked.includes('triangle') && worked.includes('ceramic band') && worked.includes('2 holes') && worked.includes('radius corners'), `every worked feature is named, got ${worked}`);

  assert.ok(describeGlassSpecification({ ...small, holes: true, numHoles: 0 }).includes('hole') === false, 'holes ticked but none entered says nothing');
});
