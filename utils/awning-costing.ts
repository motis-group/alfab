/**
 * Awning costing engine: a port of the legacy Excel awning sheet
 * (projects/costing/discovery/AWNING COSTING Feb 16 20201.xlsx). Pure functions, no React, no
 * runtime imports. See projects/costing/development/specs/awning-costing.md for the model.
 *
 * The sheet prices one awning: a fixed parts list, three lines driven by the glass perimeter, a
 * labour block whose setup divides across the run, a glazing block, and a 40 percent markup. It
 * has none of the window sheet's finishes, trims, welds or uplift.
 */

import type { AwningRates, GlazingId } from './awning-costing-rates';

export type { AwningRates, GlazingId } from './awning-costing-rates';
export { GLAZING_ORDER } from './awning-costing-rates';

export type LineUnit = 'm' | 'ea' | 'pr' | 'set' | 'min' | 'sqm';

export interface AwningCostingInput {
  /** Glass height, mm. The frame and the seals are cut to the glass. */
  heightMm: number;
  /** Glass width, mm. */
  widthMm: number;
  /** How many of this size are made in the run. Setup labour divides across it. */
  qty: number;
  glazingId: GlazingId | null;
  /** Ceramic banding, a set price whatever the size. */
  banding: boolean;
  /** Flat polish on the glass perimeter. */
  flatPolish: boolean;
  flyscreen: boolean;
  /** Extra minutes for anything the parts list does not cover. */
  sundryMinutes: number;
}

export interface CostLine {
  key: string;
  label: string;
  qty: number;
  unit: LineUnit;
  rate: number | null;
  /** Where the rate lives in the rates document, so an unpriced line can link to its field. */
  ratePath: string | null;
  cost: number;
}

export interface UnpricedRate {
  label: string;
  path: string | null;
}

export interface AwningLabourMinutes {
  setup: number;
  each: number;
  sundry: number;
  total: number;
}

export interface AwningCostResult {
  perimeterM: number;
  areaSqm: number;
  qty: number;
  unitLabel: 'Per Each';
  minutes: AwningLabourMinutes;
  lines: CostLine[];
  glazing: CostLine[];
  glazingTotal: number;
  subtotal: number;
  marginRate: number;
  margin: number;
  price: number | null;
  /** Price of the whole run, which is what the customer is told for a batch. */
  runTotal: number | null;
  unpriced: UnpricedRate[];
  warnings: string[];
  errors: string[];
}

const sumLines = (lines: CostLine[]) => lines.reduce((accumulator, line) => accumulator + line.cost, 0);
const nonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);
const count = (value: number) => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

export const DEFAULT_AWNING_INPUT: AwningCostingInput = {
  heightMm: 1220,
  widthMm: 1100,
  qty: 1,
  glazingId: 'supergrey_tgn',
  banding: true,
  flatPolish: true,
  flyscreen: true,
  sundryMinutes: 0,
};

export function createAwningInput(overrides?: Partial<AwningCostingInput>): AwningCostingInput {
  return { ...DEFAULT_AWNING_INPUT, ...overrides };
}

/**
 * Price one awning. Everything is per each: unlike the window sheet there is no per-pair option,
 * because an awning is fitted singly.
 */
export function costAwning(input: AwningCostingInput, rates: AwningRates): AwningCostResult {
  const height = nonNegative(input.heightMm);
  const width = nonNegative(input.widthMm);
  const qty = Math.max(1, count(input.qty));

  const perimeterM = ((height + width) * 2) / 1000;
  // Exact area, not rounded: unlike the window sheet the awning sheet never rounded it, and
  // rounding to 2 dp moves the glass line by a few dollars on most sizes.
  const areaSqm = (height * width) / 1e6;

  const unpriced: UnpricedRate[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  if (height <= 0 || width <= 0) {
    errors.push('Enter a glass height and width.');
  }

  /** One cost line. A null rate is charged as nil and reported, as the window engine does. */
  const line = (key: string, label: string, quantity: number, unit: LineUnit, rate: number | null, ratePath: string | null, cost?: number): CostLine => {
    if (rate == null) {
      unpriced.push({ label, path: ratePath });
    }
    return { key, label, qty: quantity, unit, rate, ratePath, cost: cost ?? (rate == null ? 0 : quantity * rate) };
  };

  const parts = rates.parts;
  const fixed = rates.quantities;

  // Glazing. The sheet charges banding as a set price and polishes the whole perimeter.
  const glazingOption = input.glazingId ? rates.glass.options[input.glazingId] : undefined;
  const glazing: CostLine[] = [];
  if (glazingOption) {
    glazing.push(line('glass', glazingOption.label, areaSqm, 'sqm', glazingOption.list, `glass.options.${input.glazingId}.list`));
  } else if (input.glazingId) {
    errors.push('That glass is not in the rates.');
  } else {
    warnings.push('No glass chosen, so the awning is costed unglazed.');
  }
  if (input.banding) {
    glazing.push(line('banding', 'BANDING', 1, 'ea', rates.glass.bandingSet, 'glass.bandingSet'));
  }
  if (input.flatPolish) {
    glazing.push(line('flatPolish', 'FLAT POLISH', perimeterM, 'm', rates.glass.flatPolishPerM, 'glass.flatPolishPerM'));
  }
  const glazingTotal = sumLines(glazing);

  // Labour. Setup divides across the run, so a batch of six costs less per awning than a one-off.
  const sundry = nonNegative(input.sundryMinutes);
  const minutes: AwningLabourMinutes = {
    setup: rates.labour.setupMinutes / qty,
    each: rates.labour.eachMinutes,
    sundry,
    total: rates.labour.setupMinutes / qty + rates.labour.eachMinutes + sundry,
  };
  const perMinute = rates.labour.perHour == null ? null : rates.labour.perHour / 60;
  if (rates.labour.perHour === 0) {
    errors.push('The labour rate is zero, so every awning quotes short by its whole labour cost.');
  }

  // The sheet's own line order, so a printed sheet reads against it row for row.
  const lines: CostLine[] = [line('frame', 'MTRS FRAME', perimeterM, 'm', parts.frame, 'parts.frame'), line('anchorPlate', 'MTRS ANCHOR PLATE', fixed.anchorPlateM, 'm', parts.anchorPlate, 'parts.anchorPlate'), line('rubberSeal', 'MTRS SILICONE RUBBER SEAL', perimeterM, 'm', parts.rubberSeal, 'parts.rubberSeal'), line('winder', 'WINDOW WINDER', 1, 'ea', parts.winder, 'parts.winder'), line('hinges', 'PAIR HINGES', 1, 'pr', parts.hinges, 'parts.hinges'), line('winderMountPlate', 'WINDER MOUNT PLATE', 1, 'ea', parts.winderMountPlate, 'parts.winderMountPlate'), line('glassWinderPlate', 'GLASS WINDER PLATE', 1, 'ea', parts.glassWinderPlate, 'parts.glassWinderPlate'), line('fixings', 'SET OF FIXINGS', fixed.fixingSets, 'set', parts.fixingSet, 'parts.fixingSet'), line('trackInfill', 'METRES T81 TRACK INFILL', perimeterM, 'm', parts.trackInfill, 'parts.trackInfill'), line('sealant', 'SEALANT', 1, 'ea', parts.sealant, 'parts.sealant'), line('glazing', 'GLAZING', 1, 'ea', glazingTotal, null), line('labour', 'MINUTES LABOUR', minutes.total, 'min', perMinute, 'labour.perHour')];

  // The sheet's flyscreen line is already a selling price and still sits inside the cost the margin
  // is taken on, so it is marked up twice. Kept: changing it would move every awning price.
  if (input.flyscreen) {
    lines.push(line('flyscreen', 'FLY & CLIPS (selling price)', 1, 'ea', parts.flyscreen, 'parts.flyscreen'));
  }

  const subtotal = sumLines(lines);
  const margin = subtotal * rates.marginRate;
  const price = errors.length ? null : subtotal + margin;

  return {
    perimeterM,
    areaSqm,
    qty,
    unitLabel: 'Per Each',
    minutes,
    lines,
    glazing,
    glazingTotal,
    subtotal,
    marginRate: rates.marginRate,
    margin,
    price,
    runTotal: price == null ? null : price * qty,
    unpriced,
    warnings,
    errors,
  };
}

export interface BatchPrice {
  batchSize: number;
  pricePerUnit: number | null;
  saving: number | null;
}

/**
 * Price per awning at several run sizes. Setup minutes divide across the run, so a larger run
 * costs less each.
 */
export function costAwningBatches(input: AwningCostingInput, rates: AwningRates, batchSizes: number[] = [1, 2, 5, 10]): BatchPrice[] {
  const single = costAwning({ ...input, qty: 1 }, rates).price;

  return batchSizes.map((batchSize) => {
    const size = Math.max(1, Math.floor(batchSize));
    const result = costAwning({ ...input, qty: size }, rates);
    return {
      batchSize: size,
      pricePerUnit: result.price,
      saving: single == null || result.price == null ? null : single - result.price,
    };
  });
}

/** One-line description for purchase-order lines and the clipboard summary. */
export function describeAwning(input: AwningCostingInput, rates: AwningRates): string {
  const glazing = input.glazingId ? rates.glass.options[input.glazingId]?.label : undefined;
  return ['Awning', `${nonNegative(input.heightMm)} x ${nonNegative(input.widthMm)} mm`, `${Math.max(1, count(input.qty))} off`, glazing || 'no glazing', input.banding ? 'banded' : '', input.flatPolish ? 'flat polish' : '', input.flyscreen ? 'with flyscreen' : 'no flyscreen'].filter(Boolean).join(' | ');
}
