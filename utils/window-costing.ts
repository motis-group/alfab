/**
 * Window costing engine: a port of the legacy Lotus 1-2-3 costing sheet (docs/legacy/WINDOWS.12M),
 * Victorian basis. Pure functions, no React, no runtime imports (utils/window-costing.spec.ts runs
 * this file under plain node). See docs/window-costing.md for the model.
 */

import type { AnodCode, EachKey, ExtrusionCode, GlassGroup, GlazingId, LabourTable, PerMetreKey, TrimBlackCode, TrimCode, WindowRates, WindowTypeId } from './window-costing-rates';

export type { GlassGroup, GlazingId, WindowRates, WindowTypeId } from './window-costing-rates';

export type Finish = 'mill' | 'etch' | 'black' | 'blackExtra' | 'powder';
export type TrimMode = 'none' | 'required' | 'extra';
export type Reinforcement = 'none' | 'reo' | 'mullion';
export type LockType = 'none' | 'comb' | 'plunger' | '600';
export type MullionKind = 'transom' | 'mullion';
export type StayType = 'flat' | 'medium' | 'heavy';
export type WindowField =
  | 'pairs'
  | 'welds'
  | 'reinforcement'
  | 'sillFlat'
  | 'lockType'
  | 'locks'
  | 'wipeBars'
  | 'sliderStop'
  | 'variant'
  | 'mullions'
  | 'mullionRiviera'
  | 'hinges'
  | 'stays'
  | 'boltSets'
  | 'hopper'
  | 'caravanStays';
export type LabourPart = 'window' | 'trim' | 'welding' | 'develop' | 'sundry' | 'mullion' | 'sillFlat' | 'fittings' | 'wipeBars';
export type LineUnit = 'm' | 'ea' | 'pr' | 'set' | 'min' | 'sqm';

export interface WindowCostingInput {
  type: WindowTypeId;
  /** The catalogue product picked, when the costing came from the menu. Does not affect the price. */
  productId: string | null;
  state: 'VIC';
  heightMm: number;
  lengthMm: number;
  qtyToSize: number;
  qtyShaped: number;
  pairs: boolean;
  finish: Finish;
  trims: TrimMode;
  develop: boolean;
  sundryMinutes: number;
  mws: boolean;
  glazingId: GlazingId | null;
  secondGlazingId: GlazingId | null;
  holes: number;
  cviewHoles: number;
  flatSmoothM: number;
  flatGroundM: number;
  welds: number;
  reinforcement: Reinforcement;
  reinforcementCount: number;
  sillFlat: boolean;
  lockType: LockType;
  locks: number;
  wipeBars: 0 | 1 | 2;
  sliderStop: boolean;
  variant: 0 | 1;
  mullionKind: MullionKind;
  mullionCount: number;
  mullionRiviera: boolean;
  hinges: number;
  stays: number;
  stayType: StayType;
  boltSets: number;
  hopper: 500 | 600;
  caravanStays: number;
}

/** A rate plus where it lives in the rates document, so an unpriced line can link to its field. */
export interface RateRef {
  value: number | null;
  path: string | null;
}

export interface CostLine {
  key: string;
  label: string;
  qty: number;
  unit: LineUnit;
  rate: number | null;
  ratePath: string | null;
  cost: number;
}

export interface UnpricedRate {
  label: string;
  path: string | null;
}

export interface CostExtra {
  label: string;
  lines: CostLine[];
  base: number;
  uplift: number;
  total: number | null;
}

export interface ReinforcementBlock {
  label: string;
  lines: CostLine[];
  perBar: number;
  count: number;
}

export type LabourMinutes = Record<LabourPart, number> & { total: number };

export interface WindowCostResult {
  type: WindowTypeId;
  perimeterM: number;
  areaSqm: number;
  glassAreaSqm: number;
  unitLabel: 'Per Each' | 'Per Pair';
  minutes: LabourMinutes;
  lines: CostLine[];
  glazing: CostLine[];
  glazingTotal: number;
  reinforcement: ReinforcementBlock | null;
  subtotal: number;
  marginRate: number;
  margin: number;
  packing: number;
  perEach: number;
  beforeUplift: number;
  upliftRate: number;
  uplift: number;
  price: number | null;
  extras: { trims?: CostExtra; blackAnodising?: CostExtra; secondGlazing?: CostExtra };
  unpriced: UnpricedRate[];
  warnings: string[];
  errors: string[];
}

interface GlazingQuantities {
  holes: number;
  cviewHoles: number;
  shapes: number;
  flatSmoothM: number;
  flatGroundM: number;
}

interface AnodRef {
  line: CostLine;
  code: string;
  metres: number;
  minMultiplier: number;
}

function rateRef(value: number | null | undefined, path: string | null): RateRef {
  return { value: value === undefined || value === null || !Number.isFinite(value) ? null : value, path };
}

interface Ctx {
  input: WindowCostingInput;
  rates: WindowRates;
  cfg: WindowTypeConfig;
  t: LabourTable;
  H: number;
  L: number;
  per: number;
  area: number;
  glassArea: number;
  qty: number;
  square: boolean;
  trimM: number;
  perMin: number;
  unpriced: UnpricedRate[];
  anodLines: AnodRef[];
  line(key: string, label: string, qty: number, unit: LineUnit, rate: RateRef | number | null, cost?: number): CostLine;
  ext(code: ExtrusionCode): RateRef;
  pm(key: PerMetreKey): RateRef;
  ea(key: EachKey): RateRef;
  trimEtch(code: TrimCode): RateRef;
  trimBlack(code: TrimBlackCode): RateRef;
  trimRate(code: TrimCode & ExtrusionCode): RateRef;
  anod(key: string, code: AnodCode, metres: number, opts?: { minMultiplier?: number; noMin?: boolean }): CostLine;
  glassSelected(nonAcrylicOnly: boolean): boolean;
}

export interface WindowTypeConfig {
  id: WindowTypeId;
  label: string;
  variantLabels?: [string, string];
  lockTypes?: LockType[];
  fields: WindowField[];
  pairsSupported: boolean;
  trimsSupported: boolean;
  glassAreaMin: number;
  glassNote: string;
  minGlassMm?: number;
  packingFlat?: number;
  labourParts: LabourPart[];
  defaults: Partial<WindowCostingInput>;
  lines: (c: Ctx) => CostLine[];
  trimExtraLines: (c: Ctx) => CostLine[];
  extraMinutes?: (c: Ctx, m: LabourMinutes) => void;
  windowMultiplier?: (c: Ctx) => number;
  labourMultiplier?: (c: Ctx) => number;
  glazingQty?: (c: Ctx) => { holes: number; shapes: number; flatSmoothM: number };
  reinforcement?: (c: Ctx, m: LabourMinutes) => { label: string; lines: CostLine[]; count: number } | null;
}

export const FINISH_LABELS: Record<Finish, string> = {
  mill: 'Mill finish',
  etch: 'Etch anodised (natural)',
  black: 'Black anodised',
  blackExtra: 'Etch, black anodising as extra',
  powder: 'Powder coated',
};

export const TRIM_LABELS: Record<TrimMode, string> = {
  none: 'No trims',
  required: 'Trims required',
  extra: 'Trims as extra',
};

export const LOCK_LABELS: Record<LockType, string> = {
  none: 'No lock',
  comb: 'Combination lock',
  plunger: 'Plunger lock & handle',
  '600': '600 series lock',
};

export const GLASS_GROUP_LABELS: Record<GlassGroup, string> = {
  'ap5-6': '5 & 6 mm toughened',
  'ap8-12': '8 - 12 mm toughened',
  laminate: 'Laminate',
  acrylic: 'Acrylic / polycarbonate',
};

export const GLAZING_ORDER: GlazingId[] = [
  'ap5_clear',
  'ap5_tint',
  'ap6_clear',
  'ap6_tint',
  'tsg6_super_grey',
  'tsg5_dark_grey',
  'ap8_clear',
  'ap10_clear',
  'ap10_tint',
  'ap12_clear',
  'ap12_tint',
  'lam638_clear',
  'lam638_tint',
  'acr5_clear',
  'acr5_green',
  'acr5_grey',
  'acr6_clear',
  'acr6_grey',
  'poly6_clear',
  'poly6_tint',
];

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const sumLines = (lines: CostLine[]) => lines.reduce((acc, line) => acc + line.cost, 0);
const addRates = (a: RateRef, b: RateRef): RateRef => ({
  value: a.value == null || b.value == null ? null : a.value + b.value,
  path: a.value == null ? a.path : b.value == null ? b.path : a.path,
});
const scaleRate = (a: RateRef, k: number): RateRef => ({ value: a.value == null ? null : a.value * k, path: a.path });
const count = (value: number) => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
const nonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

export function extrusionRate(rates: WindowRates, code: string): number | null {
  const entry = rates.extrusions[code];
  if (!entry) {
    return null;
  }
  if ('barPrice' in entry) {
    return (entry.barPrice / entry.barLength) * (1 + rates.suppliers.capral.loading) * (1 + entry.offcut);
  }
  const supplier = rates.suppliers[entry.supplier];
  const perKg = supplier.perKg + (entry.hollow ? rates.suppliers.james.hollowSurcharge : 0);
  return entry.kgPerM * perKg * (1 + supplier.loading) * (1 + entry.offcut);
}

function trimLine(c: Ctx, code: TrimCode & ExtrusionCode, label = `M. ${code} TRIM`): CostLine[] {
  return c.trimM > 0 ? [c.line('trim', label, c.trimM, 'm', c.trimRate(code))] : [];
}

function reinforcementMinutes(c: Ctx): number {
  const kind = c.input.reinforcement;
  if (kind === 'none' || count(c.input.reinforcementCount) === 0) {
    return 0;
  }
  const table = kind === 'reo' ? c.t.reo : c.t.mullion;
  if (!table) {
    return 0;
  }
  return table.each + (c.input.qtyShaped > 0 ? table.offSquareExtra : 0);
}

function hopperReinforcement(c: Ctx, m: LabourMinutes, opts: { bar: ExtrusionCode; barLabel: string; frame: ExtrusionCode & AnodCode; rubber: PerMetreKey }) {
  const kind = c.input.reinforcement;
  const bars = count(c.input.reinforcementCount);
  if (kind === 'none' || bars === 0) {
    return null;
  }
  const metres = kind === 'reo' ? c.H / 1000 : (c.H / 1000) * 2;
  const lines = [
    kind === 'reo' ? c.line('bar', opts.barLabel, metres, 'm', c.ext(opts.bar)) : c.line('bar', `M. STRIPPED ${opts.frame}`, metres, 'm', c.ext(opts.frame)),
    c.anod('barAnod', opts.frame, metres, { noMin: true }),
    c.line('barRubber', kind === 'reo' ? 'M. D.S. TAPE & PERSPEX' : 'M. GLAZING RUBBER', metres, 'm', c.pm(opts.rubber)),
    ...(kind === 'mullion' ? [c.line('barSealant', 'M. SEALANT', metres, 'm', c.pm('sikaflex'))] : []),
    c.line('barLabour', 'MTS. LABOUR', m.mullion, 'min', c.perMin),
  ];
  return { label: kind === 'reo' ? 'REO BAR' : 'MULLION', lines, count: bars };
}

function weldingMinutes(table: NonNullable<LabourTable['weld']>, welds: number, qty: number, glassArea: number, square: boolean): number {
  const w = square ? table.square : table.offSquare;
  if (welds > 1) {
    const excess = welds > 4 ? welds - 4 : 0;
    const perExtraWeld = w.setup / qty + w.each + (glassArea * table.perSqm) / 2;
    return welds * (w.setup / qty + w.each) + glassArea * table.perSqm + excess * perExtraWeld;
  }
  return table.round.setup / qty + table.round.each + glassArea * (table.perSqm / 3);
}

const T5573: WindowTypeConfig = {
  id: 'T5573',
  label: 'T5573 fixed frame',
  fields: ['pairs', 'welds', 'reinforcement'],
  pairsSupported: true,
  trimsSupported: true,
  glassAreaMin: 0.1,
  glassNote: '5 & 6 mm',
  labourParts: ['window', 'trim', 'welding', 'develop', 'sundry'],
  defaults: {},
  lines: (c) => [
    c.line('frame', 'M. T5573', c.per, 'm', c.ext('T5573')),
    c.anod('anod', 'T5573', c.per),
    c.line('rubber', 'M. GLAZING RUBBER (1206)', c.per, 'm', c.pm('rubber1206')),
    c.line('infill', 'M. INFILL RUBBER (1249)', c.per + c.trimM, 'm', c.pm('infill1249')),
    c.line('sealant', 'M. SEALANT', c.per, 'm', c.pm('sealantHopper')),
    ...trimLine(c, 'T5574'),
  ],
  trimExtraLines: (c) => [c.line('trim', 'M. T5574 TRIM (etch)', c.per, 'm', c.trimRate('T5574')), c.line('trimInfill', 'M. A49 INFILL RUBBER', c.per, 'm', c.pm('infill1249'))],
  extraMinutes: (c, m) => {
    m.mullion = reinforcementMinutes(c);
  },
  reinforcement: (c, m) => hopperReinforcement(c, m, { bar: 'bar40x10', barLabel: 'M. 40 * 10 BAR', frame: 'T5573', rubber: 'rubber1206' }),
};

const T5836: WindowTypeConfig = {
  id: 'T5836',
  // Every part on this type is 500 series (1249 infill, MP-024 500/650 track). The only "600" is
  // the lock option, which the 1000 series slider uses too, so it names a lock and not a frame.
  label: 'T5836 slider',
  fields: ['pairs', 'sillFlat', 'lockType', 'locks', 'welds', 'mullions'],
  lockTypes: ['600', 'plunger'],
  pairsSupported: true,
  trimsSupported: true,
  glassAreaMin: 0.2,
  glassNote: '5 & 6 mm',
  labourParts: ['window', 'trim', 'develop', 'sillFlat', 'welding', 'sundry'],
  defaults: { sillFlat: true, lockType: '600', locks: 1, mullionKind: 'mullion' },
  lines: (c) => {
    const i = c.input;
    const sillM = i.sillFlat ? c.L / 1000 : 0;
    const anodFlat = i.finish === 'black' ? c.trimBlack('flat40x3') : i.finish === 'powder' ? rateRef(c.rates.anodising.powderPerM, 'anodising.powderPerM') : c.trimEtch('flat40x3');
    return [
      c.line('frame', 'M. T5836', c.per, 'm', c.ext('T5836')),
      c.anod('anod', 'T5836', c.per),
      c.line('felt', 'M. FELT', (c.H + c.L * 2) / 1000, 'm', c.pm('felt')),
      c.line('infill', 'M. INFILL RUBBER (1249)', c.per + c.trimM, 'm', c.pm('infill1249')),
      c.line('trackInfill', 'M. TRACK INFILL P78/98', c.per / 2, 'm', c.pm('trackInfillMP024')),
      c.line('wipe', 'M. WIPE BARS', c.H / 1000, 'm', c.pm('wipeBlack')),
      c.line('glazingPlastic', 'M. GLAZING PLASTIC (C5)', c.per / 2, 'm', c.pm('channelC5')),
      c.line('lock', i.lockType === '600' ? '600 SERIES LOCK' : 'PLUNGER LOCK & HANDLE', count(i.locks), 'ea', c.ea('lockPlunger')),
      ...(sillM > 0
        ? [c.line('sillFlat', 'M. SILL FLAT 40 * 3 (anod)', sillM, 'm', addRates(c.ext('flat40x3'), anodFlat)), c.line('sillScrews', 'SILL FLAT SCREWS', sillM * 5, 'ea', c.ea('sTapper'))]
        : []),
      ...trimLine(c, 'T5574'),
    ];
  },
  trimExtraLines: (c) => [c.line('trim', 'M. T5574 TRIM (etch)', c.per, 'm', c.trimRate('T5574')), c.line('trimInfill', 'M. A49 INFILL RUBBER', c.per, 'm', c.pm('infill1249'))],
  extraMinutes: (c, m) => {
    const i = c.input;
    const t = c.t;
    if (!i.sillFlat && t.sillFlat) {
      // The sheet's per-each minutes include the sill flat; a window without one gets a credit.
      m.sillFlat = -(t.sillFlat.setup / c.qty + t.sillFlat.each + (c.L / 1000) * 3);
    }
    const bars = count(i.mullionCount);
    if (bars > 0 && t.transom && t.mullionBar) {
      if (i.mullionKind === 'mullion') {
        m.mullion = t.mullionBar.setup / c.qty + t.mullionBar.each;
      } else {
        const areaTerm = t.window.perSqm * c.glassArea * 2;
        m.mullion =
          (i.qtyToSize > 0 ? t.transom.square.setup / c.qty + (t.transom.square.each + areaTerm) : 0) +
          (i.qtyShaped > 0 ? bars * (t.transom.offSquare.setup / c.qty + (t.transom.offSquare.each + areaTerm)) : 0) +
          (bars > 1 ? t.transom.extraOverOne : 0);
      }
    }
  },
  glazingQty: (c) => {
    const i = c.input;
    const locks = count(i.locks);
    const bars = count(i.mullionCount);
    return {
      holes: c.glassSelected(true) ? (i.lockType === '600' ? locks * 2 : locks) : 0,
      shapes: c.glassSelected(false) ? (bars === 1 ? (i.mullionKind === 'mullion' ? locks + 2 : 3) : bars === 2 ? 5 : 2) : 0,
      flatSmoothM: (c.H / 1000) * locks,
    };
  },
  reinforcement: (c, m) => {
    const i = c.input;
    const bars = count(i.mullionCount);
    if (bars === 0) {
      return null;
    }
    const metres = i.mullionKind === 'transom' ? (c.L * 2) / 1000 : (c.H * 2) / 1000;
    return {
      label: i.mullionKind === 'transom' ? 'TRANSOM' : 'MULLION',
      count: bars,
      lines: [c.line('bar', 'M. STRIPPED T5836', metres, 'm', c.ext('T5836')), c.anod('barAnod', 'T5836', metres, { noMin: true }), c.line('barLabour', 'MTS. LABOUR', m.mullion, 'min', c.perMin)],
    };
  },
};

const T4633: WindowTypeConfig = {
  id: 'T4633',
  label: 'T4633 / AFB037 slider',
  variantLabels: ['T4633', 'AFB037'],
  fields: ['pairs', 'variant', 'wipeBars', 'lockType', 'locks', 'sliderStop'],
  lockTypes: ['none', 'comb', 'plunger', '600'],
  pairsSupported: true,
  trimsSupported: true,
  glassAreaMin: 0.2,
  glassNote: '5 & 6 mm',
  labourParts: ['window', 'trim', 'wipeBars', 'develop', 'sundry'],
  defaults: { lockType: 'none', locks: 0 },
  windowMultiplier: (c) => (c.input.sliderStop ? 1.06 : 1),
  lines: (c) => {
    const i = c.input;
    const v0 = i.variant === 0;
    const wipe = c.pm('wipeBlack');
    const wipeFactor = i.finish !== 'mill' ? (i.wipeBars === 1 ? 0.67 : 1) : i.wipeBars === 1 ? 0.51 : 0.7;
    return [
      c.line('frame', v0 ? 'M. T4633' : 'M. AFB037', c.per, 'm', c.ext('T4633')),
      c.anod('anod', 'T4633', c.per),
      ...(i.wipeBars > 0 ? [c.line('wipe', i.wipeBars === 1 ? 'M. WIPE BAR (single)' : 'M. WIPE BARS (double)', c.H / 1000, 'm', scaleRate(wipe, wipeFactor))] : []),
      c.line('felt', v0 ? 'M. FELT' : 'M. 2339/M PU TRACK', (c.H + c.L * 2) / 1000, 'm', v0 ? c.pm('felt') : c.pm('puTrack2339')),
      c.line('wedge', v0 ? 'M. GLAZING WEDGE (A174)' : 'M. P794 CHANNEL (C5)', c.per / 2, 'm', v0 ? c.pm('wedgeA174') : c.pm('channelC5')),
      ...(i.sliderStop ? [c.line('sliderStop', 'M. P78/98 SLIDER STOP', (c.H + 200) / 1000, 'm', c.pm('trackInfillMP024'))] : []),
      ...(i.lockType !== 'none' ? [c.line('lock', LOCK_LABELS[i.lockType].toUpperCase(), count(i.locks), 'ea', i.lockType === 'comb' ? c.ea('lockComb') : c.ea('lockPlunger'))] : []),
      ...trimLine(c, 'T5574'),
    ];
  },
  trimExtraLines: (c) => [c.line('trim', 'M. T5574 TRIM (etch)', c.per, 'm', c.trimRate('T5574')), c.line('trimInfill', 'M. A49 INFILL RUBBER', c.per, 'm', c.pm('infill1249'))],
  extraMinutes: (c, m) => {
    const i = c.input;
    const table = i.wipeBars === 1 ? c.t.wipeSingle : i.wipeBars === 2 ? c.t.wipeDouble : undefined;
    if (table) {
      m.wipeBars = table.setup / c.qty + table.each;
    }
  },
  glazingQty: (c) => {
    const i = c.input;
    const locks = count(i.locks);
    return {
      holes: c.glassSelected(true) ? (i.lockType === 'plunger' ? locks : i.lockType === '600' ? locks * 2 : 0) : 2,
      shapes: c.glassSelected(false) ? 2 : 0,
      flatSmoothM: ((c.H * 2 + c.L / 2) / 1000) * 2,
    };
  },
};

const T8610: WindowTypeConfig = {
  id: 'T8610',
  label: 'T8610 flat sash',
  fields: ['pairs'],
  pairsSupported: true,
  trimsSupported: true,
  glassAreaMin: 0.1,
  glassNote: '5 mm',
  labourParts: ['window', 'trim', 'develop', 'sundry'],
  defaults: { pairs: true },
  lines: (c) => [c.line('frame', 'M. T8610', c.per, 'm', c.ext('T8610')), c.anod('anod', 'T8610', c.per), c.line('wedge', 'M. GLAZING WEDGE (A174)', c.per, 'm', c.pm('wedgeA174')), ...trimLine(c, 'T5574')],
  trimExtraLines: (c) => [c.line('trim', 'M. T5574 TRIM (etch)', c.per, 'm', c.trimRate('T5574')), c.line('trimInfill', 'M. A49 INFILL RUBBER', c.per, 'm', c.pm('infill1249'))],
};

const T2482: WindowTypeConfig = {
  id: 'T2482',
  label: 'T2482 caravan',
  fields: ['pairs', 'welds'],
  pairsSupported: true,
  trimsSupported: true,
  glassAreaMin: 0.1,
  glassNote: '5 mm',
  labourParts: ['window', 'trim', 'welding', 'develop', 'sundry'],
  defaults: {},
  lines: (c) => [
    c.line('frame', 'M. T2482', c.per, 'm', c.ext('T2482')),
    c.anod('anod', 'T2482', c.per),
    ...(c.trimM > 0 ? [c.anod('anodAngle', 'L25x3', c.per)] : []),
    c.line('rubber', "M. C'VAN RUBBER (1146)", c.per, 'm', c.pm('caravan1146')),
    c.line('silicone', 'M. SILICONE', c.per, 'm', scaleRate(c.pm('sikaflex'), 0.5)),
    // The sheet prices the 25 x 3 trim angle at the T5574 rate.
    ...trimLine(c, 'T5574', 'M. 25 * 3 ANGLE'),
  ],
  trimExtraLines: (c) => [c.line('trim', 'M. 32 * 3 ANGLE', c.per, 'm', c.ext('T5574')), c.anod('trimAnod', 'L25x3', c.per)],
  extraMinutes: (c, m) => {
    const i = c.input;
    const w = c.t.weldSimple;
    if (w && i.welds > 0) {
      const square = i.qtyToSize > 0 ? w.setup / c.qty + w.each : 0;
      const shaped = i.qtyShaped > 0 ? w.setup / c.qty + w.each + w.offSquareExtra / c.qty : 0;
      m.welding = count(i.welds) * (square + shaped);
    }
  },
};

const U6567: WindowTypeConfig = {
  id: 'U6567',
  label: 'U6567 fixed frame (1000 series)',
  fields: ['pairs', 'welds', 'reinforcement'],
  pairsSupported: true,
  trimsSupported: true,
  glassAreaMin: 0.1,
  glassNote: '6 - 12 mm',
  minGlassMm: 6,
  labourParts: ['window', 'trim', 'develop', 'welding', 'sundry'],
  defaults: { welds: 1 },
  lines: (c) => [
    c.line('frame', 'M. U6567', c.per, 'm', c.ext('U6567')),
    c.anod('anod', 'U6567', c.per),
    c.line('rubber', 'M. GLAZING RUBBER (1256)', c.per, 'm', c.pm('glazing1256')),
    c.line('infill', 'M. INFILL PLASTIC (163)', c.per + c.trimM, 'm', c.pm('screwCover163')),
    c.line('sealant', 'M. SEALANT', c.per, 'm', c.pm('sikaflex')),
    ...trimLine(c, 'U6566'),
  ],
  trimExtraLines: (c) => [c.line('trim', 'M. U6566 TRIM (etch)', c.per, 'm', c.trimRate('U6566')), c.line('trimInfill', 'M. 163 INFILL PLASTIC', c.per, 'm', c.pm('screwCover163'))],
  extraMinutes: (c, m) => {
    const i = c.input;
    // The sheet uses the weld count itself as welding minutes for this section.
    m.welding = count(i.welds);
    if (i.trims !== 'none' && c.t.trim) {
      const tr = c.square ? c.t.trim.square : c.t.trim.offSquare;
      const mitrePerBar = (tr.setup / c.qty + tr.each) / 4;
      m.trim += count(i.welds) * mitrePerBar;
    }
    m.mullion = reinforcementMinutes(c);
  },
  reinforcement: (c, m) => hopperReinforcement(c, m, { bar: 'bar25x12', barLabel: 'M. 25 * 12 BAR', frame: 'U6567', rubber: 'glazing1256' }),
};

const AFB008: WindowTypeConfig = {
  id: 'AFB008',
  label: 'AFB008 / AFB003 slider (G. James)',
  variantLabels: ['AFB008 (1000 slider)', 'AFB003 (medium slider)'],
  fields: ['pairs', 'variant', 'sillFlat', 'locks', 'welds', 'mullions', 'mullionRiviera'],
  pairsSupported: true,
  trimsSupported: true,
  glassAreaMin: 0.2,
  glassNote: '5 - 8 mm',
  packingFlat: 2,
  labourParts: ['window', 'trim', 'develop', 'sillFlat', 'welding', 'mullion', 'sundry'],
  defaults: { mullionKind: 'mullion' },
  labourMultiplier: (c) => (c.input.variant === 1 ? 0.85 : 1),
  lines: (c) => {
    const i = c.input;
    const v0 = i.variant === 0;
    const bars = count(i.mullionCount);
    const locks = count(i.locks);
    const mullionM = bars > 0 ? bars * ((i.mullionKind === 'mullion' ? c.H : c.L) / 1000) : 0;
    const sillM = i.sillFlat ? c.L / 1000 : 0;
    const flatAnod = i.finish === 'etch' ? c.trimEtch('flat80x3') : c.trimBlack('flat80x3');
    return [
      c.line('frame', v0 ? 'M. AFB008' : 'M. AFB003', c.per, 'm', c.ext(v0 ? 'AFB008' : 'AFB003')),
      c.anod('anod', v0 ? 'AFB008' : 'AFB003', c.per + mullionM),
      ...(mullionM > 0
        ? [
            c.line('mullion', i.mullionRiviera ? 'M. AFB006 RIVI MULLION' : 'M. U6626 MULLION', mullionM, 'm', c.ext(i.mullionRiviera ? 'AFB006' : 'U6626')),
            c.line('mullionFittings', 'MULLION FITTINGS', bars, 'set', c.ea(i.mullionRiviera ? 'mullionFitRivi' : 'mullionFit1000')),
          ]
        : []),
      ...(sillM > 0 ? [c.line('sillFlat', 'M. 80 * 3 FLAT (anod)', sillM, 'm', addRates(c.ext('flat80x3'), flatAnod)), c.line('sillScrews', 'No.6 SELF TAPPERS', sillM * 6, 'ea', c.ea('sTapper'))] : []),
      c.line('flock', 'M. FLOCK RUBBER (2209/2)', (c.H * 2 + c.L * 3) / 1000 + mullionM * 2, 'm', c.pm('puTrack2209')),
      c.line('clip', 'M. CLIP CHANNEL (SCHLEGAL)', c.L / 1000, 'm', c.pm('clipSchlegal')),
      c.line('screwCover', v0 ? 'M. 163 SCREW COVER' : 'M. P364 SCREW COVER', c.per + c.trimM, 'm', v0 ? c.pm('screwCover163') : c.pm('screwCoverP364')),
      c.line('trackInfill', v0 ? 'M. T81 TRACK INFILL' : 'M. W115 TRACK INFILL', (bars === 1 ? c.per * 2 : c.per) + mullionM * 2, 'm', v0 ? c.pm('trackT81') : c.pm('infillW115')),
      c.line('wipe', 'M. WIPE BARS (1000)', (bars > 0 && i.mullionKind === 'mullion' ? locks * c.H : c.H) / 1000, 'm', c.pm('wipe1000')),
      c.line('lock', '600 SERIES LOCK', locks, 'ea', c.ea('lockPlunger')),
      ...trimLine(c, 'U6566'),
    ];
  },
  trimExtraLines: (c) => [c.line('trim', 'M. U6566 TRIM (etch)', c.per, 'm', c.trimRate('U6566')), c.line('trimInfill', 'M. 163 INFILL PLASTIC', c.per, 'm', c.pm('screwCover163'))],
  extraMinutes: (c, m) => {
    const i = c.input;
    const t = c.t;
    const bars = count(i.mullionCount);
    const welds = count(i.welds);
    if (i.trims !== 'none' && t.trim) {
      const tr = c.square ? t.trim.square : t.trim.offSquare;
      const mitrePerBar = (tr.setup / c.qty + tr.each) / 5;
      m.trim += (welds + c.glassArea) * mitrePerBar;
    }
    if (i.sillFlat && t.sillFlat) {
      m.sillFlat = t.sillFlat.setup / c.qty + t.sillFlat.each + (c.L / 1000) * 4 + (welds > 3 ? -5 : 0);
    }
    if (bars > 0 && t.transom && t.mullionBar) {
      if (i.mullionKind === 'mullion') {
        m.mullion = bars * (t.mullionBar.setup / c.qty + t.mullionBar.each);
      } else {
        m.mullion =
          (i.qtyToSize > 0 ? bars * (t.transom.square.setup / c.qty + (t.transom.square.each + t.window.perSqm * c.glassArea)) : 0) +
          (i.qtyShaped > 0 ? bars * (t.transom.offSquare.setup / c.qty + (t.transom.offSquare.each + t.window.perSqm * c.glassArea * 0.75)) : 0) +
          (bars > 1 ? t.transom.extraOverOne : 0);
      }
    }
  },
  glazingQty: (c) => {
    const i = c.input;
    const locks = count(i.locks);
    const bars = count(i.mullionCount);
    return {
      holes: c.glassSelected(true) ? locks * 2 : 0,
      shapes: c.glassSelected(false) ? (bars === 1 ? (i.mullionKind === 'mullion' ? locks + 2 : 3) : bars === 2 ? 5 : bars === 3 ? 7 : 2) : 0,
      flatSmoothM: (c.H / 1000) * locks,
    };
  },
};

const TSF: WindowTypeConfig = {
  id: 'TSF',
  label: 'T-section sash & frame',
  fields: ['hinges', 'stays', 'boltSets', 'hopper', 'welds'],
  pairsSupported: false,
  trimsSupported: true,
  glassAreaMin: 0.1,
  glassNote: '5 & 6 mm',
  labourParts: ['window', 'trim', 'develop', 'fittings', 'welding', 'sundry'],
  defaults: { hinges: 2, stays: 1, stayType: 'heavy', boltSets: 2, hopper: 500, welds: 1 },
  lines: (c) => {
    const i = c.input;
    const h500 = i.hopper === 500;
    const hinges = count(i.hinges);
    const stays = count(i.stays);
    const sets = count(i.boltSets);
    const stayKey = i.stayType === 'flat' ? 'staysFlat' : i.stayType === 'medium' ? 'staysMed' : 'staysHeavy';
    const stayLabel = i.stayType === 'flat' ? 'PR. 015-03 FLAT STAYS' : i.stayType === 'medium' ? 'PR. 015-07 MEDIUM STAYS' : 'PR. 015-08 HEAVY DUTY STAYS';
    return [
      c.line('tSection', 'M. 25 * 25 * 3 T', c.per, 'm', c.ext('tSection25')),
      c.line('frame', h500 ? 'M. T5573' : 'M. U6567', c.per, 'm', c.ext(h500 ? 'T5573' : 'U6567')),
      c.anod('anod', 'U6567', c.per * 2, { minMultiplier: 2 }),
      c.line('rubber', h500 ? 'M. 1206 GLAZING RUBBER' : 'M. 1256 GLAZING RUBBER', c.per, 'm', c.pm(h500 ? 'rubber1206' : 'glazing1256')),
      c.line('foam', 'M. FOAM SEALANT K30', c.per, 'm', c.pm('foamK30')),
      c.line('hinges', 'NYLON PIVOT HINGES', hinges, 'ea', c.ea('hingeNylon')),
      c.line('stays', stayLabel, stays, 'pr', c.ea(stayKey)),
      c.line('bolts', 'SETS WOODSTOCK S/BOLTS & KEEPERS', sets, 'set', c.ea('sboltWoodstock')),
      c.line('fixings', 'ASSORTED FIXINGS', hinges * 4 + sets * 4 + stays * 8, 'ea', c.ea('mThread')),
      c.line('nyloc', '5/32 NYLOC NUTS', sets * 4, 'ea', c.ea('nyloc')),
      c.line('infill', h500 ? 'M. 1249 INFILL RUBBER' : 'M. 163 INFILL PLASTIC', c.per + c.trimM, 'm', c.pm(h500 ? 'infill1249' : 'screwCover163')),
      c.line('sealant', 'M. SEALANT', c.per, 'm', c.pm('sikaflex')),
      ...trimLine(c, 'T5574'),
    ];
  },
  trimExtraLines: (c) => [c.line('trim', 'M. T5574 TRIM (etch)', c.per, 'm', c.trimRate('T5574')), c.line('trimInfill', 'M. A49 INFILL RUBBER', c.per, 'm', c.pm('infill1249'))],
  extraMinutes: (c, m) => {
    const i = c.input;
    const t = c.t;
    m.fittings = (t.hingeEach ?? 0) * count(i.hinges) + (t.boltSetEach ?? 0) * count(i.boltSets) - (count(i.stays) === 0 ? t.noStaysCredit ?? 0 : 0);
  },
};

const SF: WindowTypeConfig = {
  id: 'SF',
  label: 'Sash & frame (T2303 / T2482)',
  fields: ['caravanStays'],
  pairsSupported: false,
  trimsSupported: false,
  glassAreaMin: 0.1,
  glassNote: '5 mm',
  labourParts: ['window', 'develop', 'sundry'],
  defaults: { caravanStays: 1 },
  lines: (c) => {
    const stays = count(c.input.caravanStays);
    return [
      c.line('sash', 'M. T2303', c.per, 'm', c.ext('T2303')),
      c.line('frame', 'M. T2482', c.per, 'm', c.ext('T2482')),
      c.anod('anodSash', 'T2303', c.per, { minMultiplier: 2 }),
      c.anod('anodFrame', 'T2482', c.per),
      c.line('rubber', 'M. GLAZING RUBBER (1146)', c.per, 'm', c.pm('caravan1146')),
      c.line('foamTape', 'M. 11 * 6 FOAM TAPE (4708)', c.per, 'm', c.pm('foamTape4708')),
      c.line('hinges', 'PR. OFFSET HINGES', 1, 'pr', c.ea('hingeOffset')),
      c.line('stays', "PR. C'VAN STAYS", stays, 'pr', c.ea('staysRestrictor')),
      c.line('bolts', 'SETS PARKES S/BOLTS', 2, 'set', c.ea('sboltParkes')),
      c.line('keepers', 'KEEPERS (SADDLE)', 2, 'ea', c.ea('keeperSaddle')),
      c.line('fixings', 'ASSORTED FIXINGS', 20 + (stays > 0 ? 8 : 0), 'ea', c.ea('mThread')),
      c.line('sealant', 'M. SEALANT', c.per, 'm', scaleRate(c.pm('sikaflex'), 1 / 3)),
    ];
  },
  trimExtraLines: () => [],
  extraMinutes: (c, m) => {
    if (count(c.input.caravanStays) > 0) {
      m.window += c.t.staysEach ?? 0;
    }
  },
};

export const WINDOW_TYPES: Record<WindowTypeId, WindowTypeConfig> = { T5573, T5836, T4633, T8610, T2482, U6567, AFB008, TSF, SF };

export const WINDOW_TYPE_ORDER: WindowTypeId[] = ['T5573', 'T5836', 'U6567', 'AFB008', 'T4633', 'T8610', 'T2482', 'TSF', 'SF'];

const BASE_INPUT: WindowCostingInput = {
  type: 'T5573',
  productId: null,
  state: 'VIC',
  heightMm: 1000,
  lengthMm: 1000,
  qtyToSize: 1,
  qtyShaped: 0,
  pairs: false,
  finish: 'etch',
  trims: 'none',
  develop: true,
  sundryMinutes: 0,
  mws: false,
  glazingId: 'ap5_clear',
  secondGlazingId: null,
  holes: 0,
  cviewHoles: 0,
  flatSmoothM: 0,
  flatGroundM: 0,
  welds: 0,
  reinforcement: 'none',
  reinforcementCount: 0,
  sillFlat: false,
  lockType: 'none',
  locks: 0,
  wipeBars: 0,
  sliderStop: false,
  variant: 0,
  mullionKind: 'mullion',
  mullionCount: 0,
  mullionRiviera: false,
  hinges: 0,
  stays: 0,
  stayType: 'heavy',
  boltSets: 0,
  hopper: 500,
  caravanStays: 0,
};

const SHARED_FIELDS: Array<keyof WindowCostingInput> = [
  'heightMm',
  'lengthMm',
  'qtyToSize',
  'qtyShaped',
  'pairs',
  'finish',
  'trims',
  'develop',
  'sundryMinutes',
  'mws',
  'glazingId',
  'secondGlazingId',
  'holes',
  'cviewHoles',
  'flatSmoothM',
  'flatGroundM',
];

/** Fresh input for a window type: base values, the type's defaults, then `overrides`. */
export function createWindowInput(type: WindowTypeId, overrides?: Partial<WindowCostingInput>): WindowCostingInput {
  return { ...BASE_INPUT, ...WINDOW_TYPES[type].defaults, ...overrides, type };
}

/** Change window type keeping the shared fields (dimensions, finish, glazing, ...) and resetting type-specific ones. */
export function switchWindowType(current: WindowCostingInput, type: WindowTypeId): WindowCostingInput {
  const keep: Partial<WindowCostingInput> = {};
  for (const field of SHARED_FIELDS) {
    (keep as Record<string, unknown>)[field] = current[field];
  }
  return { ...BASE_INPUT, ...keep, type, ...WINDOW_TYPES[type].defaults };
}

function createCtx(input: WindowCostingInput, rates: WindowRates, cfg: WindowTypeConfig, dims: Pick<Ctx, 'H' | 'L' | 'per' | 'area' | 'glassArea' | 'qty' | 'square' | 'trimM' | 'perMin'>): Ctx {
  const unpriced: UnpricedRate[] = [];
  const anodLines: AnodRef[] = [];
  const c: Ctx = {
    input,
    rates,
    cfg,
    t: rates.labour[input.type],
    ...dims,
    unpriced,
    anodLines,
    line: (key, label, qty, unit, rate, cost) => {
      const ref: RateRef = typeof rate === 'number' || rate === null ? { value: rate, path: null } : rate;
      const resolvedQty = Number.isFinite(qty) ? qty : 0;
      const resolvedCost = cost !== undefined ? cost : resolvedQty * (ref.value ?? 0);
      if (ref.value == null && resolvedQty > 0 && !unpriced.some((entry) => entry.label === label)) {
        unpriced.push({ label, path: ref.path });
      }
      return { key, label, qty: resolvedQty, unit, rate: ref.value, ratePath: ref.path, cost: resolvedCost };
    },
    ext: (code) => rateRef(extrusionRate(rates, code), `extrusions.${code}`),
    pm: (key) => rateRef(rates.perMetre[key], `perMetre.${key}`),
    ea: (key) => rateRef(rates.each[key], `each.${key}`),
    trimEtch: (code) => rateRef(rates.anodising.trimEtch[code], `anodising.trimEtch.${code}`),
    trimBlack: (code) => rateRef(rates.anodising.trimBlack[code], `anodising.trimBlack.${code}`),
    trimRate: (code) => addRates(c.ext(code), c.trimEtch(code)),
    anod: (key, code, metres, opts) => {
      const a = rates.anodising;
      const factor = typeof a.factor[code] === 'number' ? a.factor[code] : null;
      const minMultiplier = opts?.minMultiplier ?? 1;
      const finish = input.finish;
      const m = finish === 'mill' ? 0 : metres;
      let label: string;
      let rate: RateRef;
      let cost: number;
      if (finish === 'mill') {
        label = `ANOD. N/A (${code})`;
        rate = rateRef(0, null);
        cost = 0;
      } else if (finish === 'powder') {
        label = `POWDER COATED (${code})`;
        rate = rateRef(a.powderPerM, 'anodising.powderPerM');
        cost = m * (rate.value ?? 0);
      } else if (finish === 'black') {
        label = `M. BLACK ANOD (${code})`;
        rate = rateRef(a.blackPerSqm == null || factor == null ? null : a.blackPerSqm * factor, a.blackPerSqm == null ? 'anodising.blackPerSqm' : `anodising.factor.${code}`);
        cost = rate.value == null ? 0 : opts?.noMin ? m * rate.value : Math.max(a.blackMin * minMultiplier, m * rate.value);
      } else {
        label = `M. ETCH ANOD (${code})`;
        rate = rateRef(factor == null ? null : a.etchPerSqm * factor, `anodising.factor.${code}`);
        cost = rate.value == null ? 0 : opts?.noMin ? m * rate.value : Math.max(a.etchMin * minMultiplier, m * rate.value);
      }
      const line = c.line(key, label, m, 'm', rate, cost);
      anodLines.push({ line, code, metres: m, minMultiplier: opts?.noMin ? 0 : minMultiplier });
      return line;
    },
    glassSelected: (nonAcrylicOnly) => {
      const option = input.glazingId ? rates.glass.options[input.glazingId] : undefined;
      return !!option && (!nonAcrylicOnly || option.group !== 'acrylic');
    },
  };
  return c;
}

function glazingQuantities(c: Ctx): GlazingQuantities {
  const i = c.input;
  const base: GlazingQuantities = {
    holes: count(i.holes),
    cviewHoles: count(i.cviewHoles),
    shapes: c.glassSelected(false) ? 1 : 0,
    flatSmoothM: nonNegative(i.flatSmoothM),
    flatGroundM: nonNegative(i.flatGroundM),
  };
  if (c.cfg.fields.includes('reinforcement') && i.reinforcement === 'mullion') {
    base.shapes += count(i.reinforcementCount);
  }
  if (c.cfg.glazingQty) {
    const derived = c.cfg.glazingQty(c);
    return { ...base, holes: derived.holes, shapes: derived.shapes, flatSmoothM: derived.flatSmoothM, cviewHoles: 0 };
  }
  return base;
}

function glazingBlock(c: Ctx, glazingId: GlazingId, q: GlazingQuantities): CostLine[] {
  const option = c.rates.glass.options[glazingId];
  const proc = c.rates.glass.processing[option.group];
  const loading = c.input.mws ? c.rates.glass.loadingMws : c.rates.glass.loading;
  const load = (value: number | null, loaded: boolean, path: string): RateRef => rateRef(value == null ? null : loaded ? value * (1 + loading) : value, path);
  const procPath = `glass.processing.${option.group}`;
  const lines = [c.line('glass', option.label, c.glassArea, 'sqm', load(option.list, option.loaded, `glass.options.${glazingId}.list`))];
  if (q.holes > 0) {
    lines.push(c.line('holes', 'HOLES', q.holes, 'ea', load(proc.holes, proc.loaded, `${procPath}.holes`)));
  }
  if (q.cviewHoles > 0) {
    lines.push(c.line('cviewHoles', 'C/VIEW HOLES', q.cviewHoles, 'ea', load(proc.cview, proc.loaded, `${procPath}.cview`)));
  }
  if (q.shapes > 0) {
    lines.push(c.line('shapes', 'SHAPE CUTTING', q.shapes, 'ea', load(proc.shape, proc.loaded, `${procPath}.shape`)));
  }
  if (q.flatSmoothM > 0) {
    lines.push(c.line('flatSmooth', option.group === 'laminate' ? 'METRES ROUGH ARRIS' : 'METRES FLAT SMOOTH', q.flatSmoothM, 'm', load(proc.flatSmooth, proc.loaded, `${procPath}.flatSmooth`)));
  }
  if (q.flatGroundM > 0 && option.group === 'laminate') {
    lines.push(c.line('flatGround', 'METRES FLAT GROUND', q.flatGroundM, 'm', load(proc.flatGround, proc.loaded, `${procPath}.flatGround`)));
  }
  return lines;
}

export function costWindow(input: WindowCostingInput, rates: WindowRates): WindowCostResult {
  const cfg = WINDOW_TYPES[input.type];
  const t = rates.labour[input.type];
  const marginDef = rates.margins[input.type];
  const errors: string[] = [];
  const warnings: string[] = [];

  const H = nonNegative(input.heightMm);
  const L = nonNegative(input.lengthMm);
  const qtyToSize = count(input.qtyToSize);
  const qtyShaped = count(input.qtyShaped);
  const qtyTotal = qtyToSize + qtyShaped;
  const glazingOption = input.glazingId ? rates.glass.options[input.glazingId] : undefined;

  if (H <= 0 || L <= 0) {
    errors.push('Enter the window height and length in mm.');
  }
  if (qtyTotal <= 0) {
    errors.push('Enter a quantity to size or shaped.');
  }
  if (!glazingOption) {
    errors.push('Choose a glazing material.');
  }
  if (qtyToSize > 0 && input.welds > 4) {
    errors.push('More than 4 welds per frame is only allowed for shaped windows.');
  }
  if (glazingOption && cfg.minGlassMm && glazingOption.mm < cfg.minGlassMm) {
    warnings.push(`${cfg.label}: minimum ${cfg.minGlassMm} mm glazing (${glazingOption.label} selected).`);
  }
  if (input.mws) {
    warnings.push('Marine Window Service pricing: reduced margin and glass loading.');
  }

  const qty = Math.max(1, qtyTotal);
  const per = (H / 1000 + L / 1000) * 2;
  const areaLengthMm = cfg.id === 'T4633' && input.wipeBars !== 2 ? L + 35 : L;
  const area = round2((H / 1000) * (areaLengthMm / 1000));
  const glassArea = Math.max(area, cfg.glassAreaMin);
  const square = qtyToSize > qtyShaped;
  const trimM = cfg.trimsSupported && input.trims === 'required' ? per : 0;
  const perMin = rates.labourPerHour / 60;
  const marginRate = input.mws && marginDef.marginMws != null ? marginDef.marginMws : marginDef.margin;
  const c = createCtx(input, rates, cfg, { H, L, per, area, glassArea, qty, square, trimM, perMin });

  const m: LabourMinutes = { window: 0, trim: 0, welding: 0, develop: 0, sundry: nonNegative(input.sundryMinutes), mullion: 0, sillFlat: 0, fittings: 0, wipeBars: 0, total: 0 };
  const w = square ? t.window.square : t.window.offSquare;
  m.window = w.setup / qty + w.each + glassArea * t.window.perSqm;
  if (cfg.windowMultiplier) {
    m.window *= cfg.windowMultiplier(c);
  }
  if (input.develop) {
    m.develop = (qtyToSize > 0 ? t.develop.square / qty : 0) + (qtyShaped > 0 ? (t.develop.offSquare + t.window.perSqm * glassArea * t.develop.areaK) / qty : 0);
  }
  if (cfg.trimsSupported && input.trims !== 'none' && t.trim) {
    const tr = square ? t.trim.square : t.trim.offSquare;
    m.trim = tr.setup / (t.trim.fixedQty ?? qty) + tr.each + glassArea * t.trim.perSqm;
  }
  if (t.weld && input.welds > 0) {
    m.welding = weldingMinutes(t.weld, count(input.welds), qty, glassArea, square);
  }
  cfg.extraMinutes?.(c, m);
  const parts = cfg.labourParts.filter((part) => part !== 'trim' || input.trims === 'required');
  let labourMinutes = parts.reduce((acc, part) => acc + m[part], 0);
  if (cfg.labourMultiplier) {
    labourMinutes *= cfg.labourMultiplier(c);
  }
  m.total = labourMinutes;

  const materialLines = cfg.lines(c);
  const labourLine = c.line('labour', 'MTS. LABOUR', labourMinutes, 'min', perMin);
  const quantities = glazingQuantities(c);
  const glazing = glazingOption && input.glazingId ? glazingBlock(c, input.glazingId, quantities) : [];
  const glazingTotal = sumLines(glazing);
  const glazingLine = c.line('glazing', 'GLAZING MATERIAL', 1, 'ea', glazingTotal);
  const lines = [...materialLines, labourLine, glazingLine];

  const subtotal = sumLines(lines);
  const margin = subtotal * marginRate;
  const block = cfg.reinforcement?.(c, m) ?? null;
  const reinforcement: ReinforcementBlock | null = block ? { ...block, perBar: sumLines(block.lines) * (1 + marginRate) } : null;
  const packing = reinforcement ? reinforcement.perBar * reinforcement.count : cfg.packingFlat ?? round1(glassArea * rates.packingPerSqm);
  const perEach = subtotal + margin + packing;
  const pairs = cfg.pairsSupported && input.pairs;
  const beforeUplift = pairs ? perEach * 2 : perEach;
  const uplift = beforeUplift * marginDef.uplift;
  const pairMultiplier = pairs ? 2 : 1;

  const extras: WindowCostResult['extras'] = {};
  const makeExtra = (label: string, extraLines: CostLine[], base: number | null): CostExtra => {
    const scaledBase = base == null ? 0 : round2(base * pairMultiplier);
    const extraUplift = round2(scaledBase * marginDef.uplift);
    return { label, lines: extraLines, base: scaledBase, uplift: extraUplift, total: base == null ? null : scaledBase + extraUplift };
  };

  if (cfg.trimsSupported && input.trims === 'extra') {
    const extraLines = [...cfg.trimExtraLines(c), c.line('trimLabour', 'MTS. LABOUR', m.trim, 'min', perMin)];
    extras.trims = makeExtra('Add for trims', extraLines, sumLines(extraLines) * (1 + marginRate));
  }

  if (input.finish === 'blackExtra') {
    const a = rates.anodising;
    const blackLines: CostLine[] = [];
    let priced = true;
    let base = 0;
    for (const ref of c.anodLines) {
      const factor = typeof a.factor[ref.code] === 'number' ? a.factor[ref.code] : null;
      const blackValue = a.blackPerSqm == null || factor == null ? null : a.blackPerSqm * factor;
      const blackRate = rateRef(blackValue, a.blackPerSqm == null ? 'anodising.blackPerSqm' : `anodising.factor.${ref.code}`);
      const blackCost = blackValue == null ? 0 : ref.minMultiplier > 0 ? Math.max(a.blackMin * ref.minMultiplier, ref.metres * blackValue) : ref.metres * blackValue;
      if (blackValue == null) {
        priced = false;
      }
      blackLines.push(c.line(`black-${ref.line.key}`, `M. BLACK ANOD (${ref.code})`, ref.metres, 'm', blackRate, blackCost));
      base += (blackCost - ref.line.cost) * (1 + marginRate);
    }
    extras.blackAnodising = makeExtra('Add for black anodising', blackLines, priced ? base : null);
  }

  if (glazingOption && input.secondGlazingId && input.secondGlazingId !== input.glazingId && rates.glass.options[input.secondGlazingId]) {
    const secondLines = glazingBlock(c, input.secondGlazingId, quantities);
    extras.secondGlazing = makeExtra('Add for second choice glazing', secondLines, (sumLines(secondLines) - glazingTotal) * (1 + marginRate));
  }

  return {
    type: input.type,
    perimeterM: per,
    areaSqm: area,
    glassAreaSqm: glassArea,
    unitLabel: pairs ? 'Per Pair' : 'Per Each',
    minutes: m,
    lines,
    glazing,
    glazingTotal,
    reinforcement,
    subtotal,
    marginRate,
    margin,
    packing,
    perEach,
    beforeUplift,
    upliftRate: marginDef.uplift,
    uplift,
    price: errors.length ? null : beforeUplift + uplift,
    extras,
    unpriced: c.unpriced,
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
 * Price per each (or per pair) at several batch sizes. Setup minutes divide across the batch, so a
 * larger batch costs less per window. The batch keeps the shape of the costed window: an all-shaped
 * window stays shaped, anything else is costed as made to size.
 */
export function costWindowBatches(input: WindowCostingInput, rates: WindowRates, batchSizes: number[] = [1, 2, 5, 10]): BatchPrice[] {
  const shapedOnly = count(input.qtyToSize) === 0 && count(input.qtyShaped) > 0;
  const single = costWindow({ ...input, qtyToSize: shapedOnly ? 0 : 1, qtyShaped: shapedOnly ? 1 : 0 }, rates).price;

  return batchSizes.map((batchSize) => {
    const size = Math.max(1, Math.floor(batchSize));
    const result = costWindow({ ...input, qtyToSize: shapedOnly ? 0 : size, qtyShaped: shapedOnly ? size : 0 }, rates);
    return {
      batchSize: size,
      pricePerUnit: result.price,
      saving: single == null || result.price == null ? null : single - result.price,
    };
  });
}

/**
 * One-line description for purchase-order lines and the clipboard summary. Pass the catalogue name
 * when the costing came from the menu, so it reads as the workshop names the window rather than by
 * extrusion code. The engine does not import the catalogue, to keep it free of that dependency.
 */
export function describeWindow(input: WindowCostingInput, rates: WindowRates, nameOverride?: string | null): string {
  const cfg = WINDOW_TYPES[input.type];
  const glazing = input.glazingId ? rates.glass.options[input.glazingId]?.label : undefined;
  const qtyToSize = count(input.qtyToSize);
  const qtyShaped = count(input.qtyShaped);
  const quantity = [qtyToSize > 0 ? `${qtyToSize} to size` : '', qtyShaped > 0 ? `${qtyShaped} shaped` : ''].filter(Boolean).join(', ');
  return [
    nameOverride || (cfg.variantLabels ? cfg.variantLabels[input.variant] : cfg.label),
    `${nonNegative(input.heightMm)} x ${nonNegative(input.lengthMm)} mm`,
    quantity,
    FINISH_LABELS[input.finish],
    TRIM_LABELS[input.trims],
    glazing || 'no glazing',
    cfg.pairsSupported && input.pairs ? 'per pair' : 'per each',
  ]
    .filter(Boolean)
    .join(' | ');
}
