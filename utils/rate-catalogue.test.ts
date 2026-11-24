import assert from 'node:assert/strict';
import { test } from 'node:test';

import { costAwning, createAwningInput } from './awning-costing';
import { AWNING_RATES_AS_TRANSCRIBED, DEFAULT_AWNING_RATES, mergeAwningRates } from './awning-costing-rates';
import { calculateCost } from './calculations';
import { mergeGlassRates } from './glass-rate-store';
import { defaultPricingData } from './glass-rates';
import {
  AWNING_RATE_CATALOGUE,
  GLASS_RATE_CATALOGUE,
  RateCatalogue,
  WINDOW_RATE_CATALOGUE,
  blockingIssues,
  checkRate,
  findRates,
  formatRate,
  listIssues,
  parseRate,
  rateAt,
  rateEntry,
  sharedByList,
  summariseSections,
  withRate,
} from './rate-catalogue';
import { AWNING_GLASS_FROM_LIST, WINDOW_GLASS_FROM_LIST, applySharedRatesToAwning, applySharedRatesToWindow } from './shared-rates';
import { costWindow, createWindowInput } from './window-costing';
import { DEFAULT_WINDOW_RATES, WINDOW_RATES_AS_TRANSCRIBED, mergeWindowRates } from './window-costing-rates';

function rateLeaves(node: unknown, segments: string[] = []): string[] {
  if (typeof node === 'number' || node === null) {
    return segments[segments.length - 1] === 'mm' ? [] : [segments.join('.')];
  }
  if (!node || typeof node !== 'object') {
    return [];
  }
  return Object.entries(node).flatMap(([key, child]) => (segments.length === 0 && key === 'asAt' ? [] : rateLeaves(child, [...segments, key])));
}

function changedLeaves(before: unknown, after: unknown): string[] {
  return rateLeaves(before).filter((path) => rateAt(before, path) !== rateAt(after, path));
}

const LISTS: Array<{ name: string; catalogue: RateCatalogue; defaults: unknown; merge: (saved: unknown) => unknown }> = [
  { name: 'glass', catalogue: GLASS_RATE_CATALOGUE, defaults: defaultPricingData, merge: mergeGlassRates },
  { name: 'window', catalogue: WINDOW_RATE_CATALOGUE, defaults: DEFAULT_WINDOW_RATES, merge: mergeWindowRates },
  { name: 'awning', catalogue: AWNING_RATE_CATALOGUE, defaults: DEFAULT_AWNING_RATES, merge: mergeAwningRates },
];

const windowIssue = (path: string, value: number | null) => checkRate(rateEntry(WINDOW_RATE_CATALOGUE, path), value);
const awningIssue = (path: string, value: number | null) => checkRate(rateEntry(AWNING_RATE_CATALOGUE, path), value);

for (const list of LISTS) {
  test(`every ${list.name} rate has one catalogue entry with a label and a unit`, () => {
    assert.deepEqual(list.catalogue.entries.map((entry) => entry.path).sort(), rateLeaves(list.defaults).sort());

    const sections = new Set(list.catalogue.sections.map((section) => section.key));
    for (const entry of list.catalogue.entries) {
      assert.ok(entry.label.trim(), `${entry.path} has no label`);
      assert.ok(entry.unit.trim(), `${entry.path} has no unit`);
      assert.ok(sections.has(entry.section), `${entry.path} sits in an undeclared section ${entry.section}`);
    }
  });

  test(`a ${list.name} document edited through the catalogue survives its own merge`, () => {
    let edited = list.defaults;
    for (const entry of list.catalogue.entries.filter((candidate) => !candidate.shared)) {
      edited = withRate(edited, entry.path, entry.kind === 'percent' ? 0.5 : (rateAt(list.defaults, entry.path) ?? 0) + 1);
    }

    const merged = list.merge(JSON.parse(JSON.stringify(edited)));
    for (const entry of list.catalogue.entries.filter((candidate) => !candidate.shared)) {
      assert.equal(rateAt(merged, entry.path), rateAt(edited, entry.path), entry.path);
    }
  });

  test(`the default ${list.name} rates can be saved`, () => {
    assert.deepEqual(blockingIssues(listIssues(list.catalogue, list.defaults)), []);
  });
}

test('a percentage shows as a whole number and is stored as a fraction', () => {
  const margin = rateEntry(AWNING_RATE_CATALOGUE, 'marginRate');
  assert.equal(formatRate(margin, 0.4), '40');
  assert.equal(parseRate(margin, '40'), 0.4);
  assert.equal(parseRate(margin, '7.5'), 0.075);
  assert.equal(formatRate(rateEntry(WINDOW_RATE_CATALOGUE, 'suppliers.james.loading'), 0.333), '33.3');

  for (const list of LISTS) {
    for (const entry of list.catalogue.entries.filter((candidate) => candidate.kind === 'percent')) {
      const stored = rateAt(list.defaults, entry.path);
      if (stored != null) {
        assert.equal(parseRate(entry, formatRate(entry, stored)), stored, `${entry.path} does not round trip`);
      }
    }
  }
});

test('every fraction the costings multiply by is a percentage in the editor', () => {
  for (const path of ['suppliers.capral.loading', 'extrusions.T5573.offcut', 'glass.loading', 'glass.loadingMws', 'margins.T5573.margin', 'margins.T5836.marginMws', 'margins.SF.uplift']) {
    assert.equal(rateEntry(WINDOW_RATE_CATALOGUE, path).kind, 'percent', path);
  }
  assert.notEqual(rateEntry(WINDOW_RATE_CATALOGUE, 'labour.T5573.develop.areaK').kind, 'percent', 'a factor on minutes, not a share');
  assert.notEqual(rateEntry(WINDOW_RATE_CATALOGUE, 'labourPerHour').kind, 'percent');
});

test('a rate that is not a percentage is stored as typed', () => {
  const frame = rateEntry(AWNING_RATE_CATALOGUE, 'parts.frame');
  assert.equal(parseRate(frame, '12.5'), 12.5);
  assert.equal(formatRate(frame, 12.5), '12.5');
  assert.equal(parseRate(frame, '0'), 0);
});

test('a blank is never read as zero', () => {
  for (const list of LISTS) {
    for (const entry of list.catalogue.entries) {
      assert.equal(parseRate(entry, '   '), null, entry.path);
      assert.equal(formatRate(entry, null), '', entry.path);
    }
  }
  assert.equal(parseRate(rateEntry(AWNING_RATE_CATALOGUE, 'parts.frame'), '12abc'), undefined, 'text that is not a number changes nothing');
});

test('a blank glass rate blocks the save, because the glass calculator cannot price on it', () => {
  for (const path of ['basePrices.Clear.6', 'edgeworkPrices.FLAT POLISH - STRAIGHT.4-6', 'otherPrices.holePrice4to6', 'otherPrices.minCharge']) {
    const blocking = blockingIssues(listIssues(GLASS_RATE_CATALOGUE, withRate(defaultPricingData, path, null)));
    assert.deepEqual(
      blocking.map((issue) => issue.path),
      [path]
    );
  }
  assert.equal(checkRate(rateEntry(GLASS_RATE_CATALOGUE, 'edgeworkPrices.ROUGH ARRIS.4-6'), 0), null, 'rough arris is free');
  assert.equal(checkRate(rateEntry(GLASS_RATE_CATALOGUE, 'otherPrices.minCharge'), 0), null, 'zero means no minimum');
  assert.equal(checkRate(rateEntry(GLASS_RATE_CATALOGUE, 'basePrices.Clear.6'), -1)?.tone, 'error');
});

test('a glass document edited through the catalogue prices a piece', () => {
  const entry = rateEntry(GLASS_RATE_CATALOGUE, 'basePrices.Clear.6');
  const edited = withRate(defaultPricingData, entry.path, parseRate(entry, '100') ?? null);
  const piece = { width: 1000, height: 1000, thickness: 6, glassType: 'Clear', edgework: 'ROUGH ARRIS', ceramicBand: false, shape: 'RECTANGLE', holes: false, numHoles: 0, radiusCorners: false, scanning: false } as const;

  assert.equal(calculateCost(piece, edited).baseGlass, 100);
});

test('a blank or a zero on a rate the awning costing leans on blocks the save', () => {
  for (const path of ['labour.perHour', 'labour.eachMinutes', 'marginRate', 'quantities.anchorPlateM', 'quantities.fixingSets']) {
    assert.equal(awningIssue(path, null)?.tone, 'error', `${path} blank`);
    assert.equal(awningIssue(path, 0)?.tone, 'error', `${path} zero`);
  }
  assert.equal(awningIssue('marginRate', 1.5)?.tone, 'warning', '150 percent saves with a warning');
  assert.equal(awningIssue('parts.frame', -1)?.tone, 'error');
});

test('a blank or a zero on any other awning rate is reported and does not block', () => {
  assert.equal(awningIssue('parts.frame', null)?.tone, 'warning');
  assert.equal(awningIssue('glass.options.clear_tgn.list', null)?.tone, 'warning');
  assert.equal(awningIssue('parts.frame', 0), null);
  assert.equal(awningIssue('labour.setupMinutes', 0), null);
});

test('an awning margin typed as a percentage prices at cost plus that share', () => {
  const margin = rateEntry(AWNING_RATE_CATALOGUE, 'marginRate');
  const example = createAwningInput({ heightMm: 1220, widthMm: 1100, qty: 6 });
  const atCost = costAwning(example, withRate(DEFAULT_AWNING_RATES, margin.path, 0)).price ?? 0;
  const atHalf = costAwning(example, withRate(DEFAULT_AWNING_RATES, margin.path, parseRate(margin, '50') ?? null)).price ?? 0;

  assert.ok(atCost > 0);
  assert.ok(Math.abs(atHalf - atCost * 1.5) < 0.01);
});

test('the default window rates carry the sheet gaps as warnings and nothing to fix', () => {
  const issues = listIssues(WINDOW_RATE_CATALOGUE, DEFAULT_WINDOW_RATES);

  assert.deepEqual(
    issues.map((issue) => issue.path).sort(),
    ['each.handleVitus', 'each.hingeStainless', 'each.keeperSaddle', 'each.staysFlat', 'each.staysMed', 'each.strutGas', 'each.strutManual', 'glass.processing.laminate.cview'],
    'the legacy sheet gaps, plus the 035 fittings Nick has still to price'
  );
});

test('a blank Marine Window Service margin is the normal case, not a gap', () => {
  assert.equal(windowIssue('margins.T5573.marginMws', null), null);
});

test('a flat ground edge is only charged on laminate, so the other groups are not gaps', () => {
  assert.equal(windowIssue('glass.processing.ap5-6.flatGround', null), null);
  assert.equal(windowIssue('glass.processing.ap8-12.flatGround', null), null);
  assert.equal(windowIssue('glass.processing.laminate.cview', null)?.tone, 'warning');
});

test('a window charge that is free by default is not flagged', () => {
  assert.equal(windowIssue('glass.processing.acrylic.holes', 0), null);
  assert.equal(windowIssue('labour.T8610.trim.perSqm', 0), null);
  assert.equal(windowIssue('labour.SF.develop.areaK', 0), null);
});

test('clearing a window rate that had a price is an error, because it silently costs nothing', () => {
  for (const path of ['labourPerHour', 'suppliers.capral.perKg', 'margins.T5573.margin', 'perMetre.sikaflex', 'labour.T5573.window.square.each', 'packingPerSqm']) {
    assert.equal(windowIssue(path, null)?.tone, 'error', `${path} blank should be an error`);
  }
});

test('a divisor must have a value', () => {
  assert.equal(windowIssue('extrusions.bar40x10.barLength', null)?.tone, 'error');
  assert.equal(windowIssue('extrusions.bar40x10.barLength', 0)?.tone, 'error');
  assert.equal(windowIssue('labour.T4633.trim.fixedQty', 0)?.tone, 'error');
  assert.equal(windowIssue('extrusions.bar40x10.barLength', 4), null);
});

test('a window rate below zero is an error anywhere', () => {
  assert.equal(windowIssue('perMetre.sikaflex', -1)?.tone, 'error');
  assert.equal(windowIssue('margins.T5573.margin', -0.1)?.tone, 'error');
});

test('a share above one whole is a warning that does not block a save', () => {
  const margin = windowIssue('margins.T5573.margin', 1.5);
  assert.equal(margin?.tone, 'warning');
  assert.equal(margin?.badge, 'over 100%');
  assert.deepEqual(blockingIssues(margin ? [margin] : []), []);
  assert.equal(windowIssue('margins.T5573.margin', 1), null);
  assert.equal(windowIssue('margins.T5573.margin', 0.4), null);
  assert.equal(windowIssue('suppliers.capral.loading', 20)?.tone, 'warning');
  assert.equal(windowIssue('glass.loading', 0.2), null);
  assert.equal(windowIssue('labour.T5573.develop.areaK', 0.8), null);
  assert.equal(windowIssue('labourPerHour', 95), null);
});

test('a zero on a rate the whole window costing leans on is an error, elsewhere a warning', () => {
  assert.equal(windowIssue('labourPerHour', 0)?.tone, 'error');
  assert.equal(windowIssue('suppliers.capral.perKg', 0)?.tone, 'error');
  assert.equal(windowIssue('glass.options.ap6_clear.list', 0)?.tone, 'error');
  assert.equal(windowIssue('anodising.etchPerSqm', 0)?.tone, 'error');
  assert.equal(windowIssue('perMetre.sikaflex', 0)?.tone, 'warning');
  assert.equal(windowIssue('each.lockComb', 0)?.tone, 'warning');
});

test('only an error blocks a save', () => {
  const edited = withRate(withRate(DEFAULT_WINDOW_RATES, 'perMetre.sikaflex', 0), 'labourPerHour', null);
  assert.deepEqual(
    blockingIssues(listIssues(WINDOW_RATE_CATALOGUE, edited)).map((issue) => issue.path),
    ['labourPerHour']
  );
});

test('a saved window document cannot blank a rate that has a price', () => {
  assert.equal(mergeWindowRates({ labourPerHour: null }).labourPerHour, DEFAULT_WINDOW_RATES.labourPerHour);
  assert.equal(mergeWindowRates({ suppliers: { capral: { perKg: null } } }).suppliers.capral.perKg, DEFAULT_WINDOW_RATES.suppliers.capral.perKg);
  assert.equal(mergeWindowRates({ margins: { T5573: { margin: null } } }).margins.T5573.margin, DEFAULT_WINDOW_RATES.margins.T5573.margin);

  assert.equal(mergeWindowRates({ each: { keeperSaddle: null } }).each.keeperSaddle, null);
  assert.equal(mergeWindowRates({ each: { keeperSaddle: 12 } }).each.keeperSaddle, 12);
  assert.equal(mergeWindowRates({ labourPerHour: 95 }).labourPerHour, 95);
});

test('the default labour rate prices a window when the saved rate is blank', () => {
  const input = createWindowInput('T5573', { glazingId: 'ap6_clear' });
  const priced = costWindow(input, DEFAULT_WINDOW_RATES).price ?? 0;
  const afterBlanking = costWindow(input, mergeWindowRates({ labourPerHour: null })).price ?? 0;

  assert.ok(priced > 0);
  assert.equal(afterBlanking, priced, 'the default rate is used instead of zero');
});

test('the read-only window rates are the ones the glass price list sets', () => {
  const raised = JSON.parse(JSON.stringify(defaultPricingData.basePrices));
  for (const type of Object.keys(raised)) {
    for (const mm of Object.keys(raised[type])) {
      raised[type][mm] += 500;
    }
  }
  const shared = WINDOW_RATE_CATALOGUE.entries.filter((entry) => entry.shared);

  assert.deepEqual(shared.map((entry) => entry.path).sort(), changedLeaves(WINDOW_RATES_AS_TRANSCRIBED, applySharedRatesToWindow(WINDOW_RATES_AS_TRANSCRIBED, raised)).sort());
  assert.deepEqual(shared.map((entry) => entry.path).sort(), Object.keys(WINDOW_GLASS_FROM_LIST).map((id) => `glass.options.${id}.list`).sort());
  for (const entry of shared) {
    assert.equal(entry.shared?.href, '/settings', entry.path);
  }
});

test('the read-only awning rates are the ones another list sets, each with its own list', () => {
  const raised = JSON.parse(JSON.stringify(defaultPricingData.basePrices));
  raised['Super Grey'][6] += 500;
  const moved = applySharedRatesToAwning(AWNING_RATES_AS_TRANSCRIBED, { basePrices: raised, ceramicBanding: 999, flatPolishPerM: 998, labourPerHour: 997 });
  const shared = AWNING_RATE_CATALOGUE.entries.filter((entry) => entry.shared);

  assert.deepEqual(shared.map((entry) => entry.path).sort(), changedLeaves(AWNING_RATES_AS_TRANSCRIBED, moved).sort());
  assert.equal(rateEntry(AWNING_RATE_CATALOGUE, 'labour.perHour').shared?.href, '/settings/windows');
  assert.equal(rateEntry(AWNING_RATE_CATALOGUE, 'glass.bandingSet').shared?.href, '/settings');
  assert.equal(rateEntry(AWNING_RATE_CATALOGUE, 'glass.flatPolishPerM').shared?.href, '/settings');
  for (const id of Object.keys(AWNING_GLASS_FROM_LIST)) {
    assert.equal(rateEntry(AWNING_RATE_CATALOGUE, `glass.options.${id}.list`).shared?.href, '/settings');
  }
});

test('setting a rate leaves the document it was given unchanged', () => {
  for (const list of LISTS) {
    const before = JSON.stringify(list.defaults);
    const entry = list.catalogue.entries[list.catalogue.entries.length - 1];
    const edited = withRate(list.defaults, entry.path, 123);

    assert.equal(rateAt(edited, entry.path), 123);
    assert.equal(JSON.stringify(list.defaults), before, `${list.name} defaults were mutated`);
    assert.notEqual(edited, list.defaults);
  }
});

test('a rate is found by its name, its group, its section or its path', () => {
  const found = (query: string) => findRates(WINDOW_RATE_CATALOGUE, query).map((entry) => entry.path);

  assert.deepEqual(found('sikaflex'), ['perMetre.sikaflex']);
  assert.ok(found('g. james').includes('suppliers.james.perKg'));
  assert.ok(found('ANODISING').includes('anodising.etchMin'));
  assert.deepEqual(found('keeperSaddle'), ['each.keeperSaddle']);
  assert.deepEqual(found('no such rate'), []);
  assert.equal(findRates(WINDOW_RATE_CATALOGUE, '   ').length, WINDOW_RATE_CATALOGUE.entries.length);
});

test('a rate can be set in a stored document that lacks the branch it sits in', () => {
  const stored = { parts: { frame: 10 } };
  const edited = withRate(stored, 'labour.perHour', 90);

  assert.equal(rateAt(edited, 'labour.perHour'), 90);
  assert.equal(rateAt(edited, 'parts.frame'), 10);
  assert.deepEqual(stored, { parts: { frame: 10 } });
});

test('every glass price in a table sits in a column the table shows', () => {
  for (const section of GLASS_RATE_CATALOGUE.sections.filter((candidate) => candidate.grid)) {
    const cells = GLASS_RATE_CATALOGUE.entries.filter((entry) => entry.section === section.key);
    assert.ok(cells.length > 0, section.key);
    for (const entry of cells) {
      assert.ok(entry.cell && section.grid?.columns.includes(entry.cell.column), entry.path);
    }
    assert.deepEqual(Array.from(new Set(cells.map((entry) => entry.cell?.column))).sort(), [...(section.grid?.columns ?? [])].sort(), 'no empty column');
  }
});

for (const list of LISTS) {
  test(`the ${list.name} overview has one line per section and accounts for every rate and issue`, () => {
    const lines = summariseSections(list.catalogue, list.defaults);
    const issues = listIssues(list.catalogue, list.defaults);

    assert.deepEqual(
      lines.map((line) => line.key),
      list.catalogue.sections.map((section) => section.key).filter((key) => list.catalogue.entries.some((entry) => entry.section === key))
    );
    assert.equal(lines.reduce((sum, line) => sum + line.rates, 0), list.catalogue.entries.length);
    assert.equal(lines.reduce((sum, line) => sum + line.toFix, 0), blockingIssues(issues).length);
    assert.equal(lines.reduce((sum, line) => sum + line.toCheck, 0), issues.length - blockingIssues(issues).length);
  });
}

test('the overview puts a broken rate against its own section and no other', () => {
  const entry = rateEntry(WINDOW_RATE_CATALOGUE, 'margins.T5573.margin');
  const lines = summariseSections(WINDOW_RATE_CATALOGUE, withRate(DEFAULT_WINDOW_RATES, entry.path, -0.1));

  assert.deepEqual(
    lines.filter((line) => line.toFix > 0).map((line) => [line.key, line.toFix]),
    [[entry.section, 1]]
  );
});

test('rates another list sets roll up to one line per owning list', () => {
  const windowGlass = WINDOW_RATE_CATALOGUE.entries.filter((entry) => entry.shared);
  assert.deepEqual(sharedByList(windowGlass), [{ list: windowGlass[0].shared?.list, href: '/settings', count: windowGlass.length }]);

  const awning = sharedByList(AWNING_RATE_CATALOGUE.entries);
  assert.deepEqual(awning.map((line) => line.href).sort(), ['/settings', '/settings/windows']);
  assert.equal(awning.reduce((sum, line) => sum + line.count, 0), AWNING_RATE_CATALOGUE.entries.filter((entry) => entry.shared).length);

  assert.deepEqual(sharedByList(GLASS_RATE_CATALOGUE.entries), []);
});
