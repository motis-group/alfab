/**
 * Window costing rates, Victorian costing basis, transcribed from the legacy Lotus 1-2-3 sheet
 * (docs/legacy/WINDOWS.12M). Saved overrides live in the window_costing_rates table (row id
 * "default") and are merged over DEFAULT_WINDOW_RATES by mergeWindowRates().
 *
 * Keep this module free of runtime imports: utils/window-costing.spec.ts runs it under plain node.
 * `null` means the source sheet had no usable price (ERR / N/A); the engine reports such lines as
 * "not priced" instead of failing.
 */

export type WindowTypeId = 'T5573' | 'T5836' | 'T4633' | 'T8610' | 'T2482' | 'U6567' | 'AFB008' | 'TSF' | 'SF';

export type GlassGroup = 'ap5-6' | 'ap8-12' | 'laminate' | 'acrylic';

export type GlazingId =
  | 'ap5_clear'
  | 'ap5_tint'
  | 'ap6_clear'
  | 'ap6_tint'
  | 'tsg6_super_grey'
  | 'tsg5_dark_grey'
  | 'ap8_clear'
  | 'ap10_clear'
  | 'ap10_tint'
  | 'ap12_clear'
  | 'ap12_tint'
  | 'lam638_clear'
  | 'lam638_tint'
  | 'acr5_clear'
  | 'acr5_green'
  | 'acr5_grey'
  | 'acr6_clear'
  | 'acr6_grey'
  | 'poly6_clear'
  | 'poly6_tint';

export interface MinutePair {
  setup: number;
  each: number;
}

/** Labour minute tables for one window type. Minutes per window = setup / qty + each + area * perSqm. */
export interface LabourTable {
  develop: { square: number; offSquare: number; areaK: number };
  window: { square: MinutePair; offSquare: MinutePair; perSqm: number };
  trim?: { square: MinutePair; offSquare: MinutePair; perSqm: number; fixedQty?: number };
  weld?: { round: MinutePair; square: MinutePair; offSquare: MinutePair; perSqm: number };
  /** T2482: welding minutes per weld. */
  weldSimple?: { setup: number; each: number; offSquareExtra: number };
  /** T5573 / U6567 reinforcement bars: minutes per window, extra when the window is shaped. */
  mullion?: { each: number; offSquareExtra: number };
  reo?: { each: number; offSquareExtra: number };
  /** T5836 / AFB008 vertical mullion bar. */
  mullionBar?: MinutePair;
  /** T5836 / AFB008 horizontal transom. */
  transom?: { square: MinutePair; offSquare: MinutePair; extraOverOne: number };
  sillFlat?: MinutePair;
  wipeSingle?: MinutePair;
  wipeDouble?: MinutePair;
  hingeEach?: number;
  boltSetEach?: number;
  noStaysCredit?: number;
  staysEach?: number;
}

export type ExtrusionRate =
  | { kgPerM: number; offcut: number; supplier: 'capral' | 'james'; hollow?: boolean }
  | { barPrice: number; barLength: number; offcut: number };

export interface GlazingOption {
  label: string;
  group: GlassGroup;
  mm: number;
  /** $/sqm before glass loading. */
  list: number;
  /** Whether the sheet applies the glass loading (20%, 15% under MWS) to this price. */
  loaded: boolean;
}

export interface GlassProcessing {
  shape: number | null;
  holes: number | null;
  cview: number | null;
  /** Laminate: this is the rough-arris rate. */
  flatSmooth: number | null;
  flatGround: number | null;
  loaded: boolean;
}

export interface WindowRates {
  state: 'VIC';
  labourPerHour: number;
  suppliers: {
    capral: { perKg: number; loading: number };
    james: { perKg: number; loading: number; hollowSurcharge: number };
  };
  extrusions: Record<string, ExtrusionRate>;
  anodising: {
    /** Collins etch (20um) frames, $/sqm basis; per-metre rate = etchPerSqm * factor[code]. */
    etchPerSqm: number;
    blackPerSqm: number | null;
    etchMin: number;
    blackMin: number;
    powderPerM: number;
    factor: Record<string, number>;
    /** $/m etch anodising already applied to trim / flat sections. */
    trimEtch: Record<string, number>;
    trimBlack: Record<string, number>;
  };
  perMetre: Record<string, number>;
  each: Record<string, number | null>;
  glass: {
    loading: number;
    loadingMws: number;
    options: Record<GlazingId, GlazingOption>;
    processing: Record<GlassGroup, GlassProcessing>;
  };
  packingPerSqm: number;
  labour: Record<WindowTypeId, LabourTable>;
  margins: Record<WindowTypeId, { margin: number; marginMws: number | null; uplift: number }>;
}

export const DEFAULT_WINDOW_RATES: WindowRates = {
  state: 'VIC',
  labourPerHour: 85,
  suppliers: {
    capral: { perKg: 12, loading: 0.2 },
    james: { perKg: 8, loading: 0.333, hollowSurcharge: 1 },
  },
  extrusions: {
    T5573: { kgPerM: 0.441, offcut: 0.2, supplier: 'capral' },
    T5836: { kgPerM: 0.548, offcut: 0.2, supplier: 'capral' },
    T4633: { kgPerM: 0.477, offcut: 0.2, supplier: 'capral' },
    T8610: { kgPerM: 0.263, offcut: 0.2, supplier: 'capral' },
    T2482: { kgPerM: 0.425, offcut: 0.2, supplier: 'capral' },
    T2303: { kgPerM: 0.254, offcut: 0.15, supplier: 'capral' },
    T5574: { kgPerM: 0.19, offcut: 0.2, supplier: 'capral' },
    U6567: { kgPerM: 0.724, offcut: 0.175, supplier: 'capral' },
    U6566: { kgPerM: 0.235, offcut: 0.175, supplier: 'capral' },
    U6626: { kgPerM: 1.477, offcut: 0.2, supplier: 'capral' },
    AFB008: { kgPerM: 1.258, offcut: 0.175, supplier: 'james' },
    AFB003: { kgPerM: 0.868, offcut: 0.175, supplier: 'james' },
    AFB006: { kgPerM: 2.685, offcut: 0.15, supplier: 'james', hollow: true },
    AFB037: { kgPerM: 0.564, offcut: 0.15, supplier: 'james' },
    flat40x3: { kgPerM: 0.325, offcut: 0.25, supplier: 'james' },
    flat80x3: { kgPerM: 0.65, offcut: 0.25, supplier: 'james' },
    tSection25: { barPrice: 16.7, barLength: 6.5, offcut: 0.5 },
    bar40x10: { barPrice: 29.17, barLength: 4, offcut: 0.25 },
    bar25x12: { barPrice: 21.9, barLength: 4, offcut: 0.1 },
  },
  anodising: {
    etchPerSqm: 40,
    blackPerSqm: null,
    etchMin: 10,
    blackMin: 10.44,
    powderPerM: 7,
    factor: {
      L25x3: 0.1,
      T2303: 0.12,
      T2482: 0.14,
      T4633: 0.162,
      T5573: 0.159,
      T5836: 0.176,
      T8610: 0.132,
      U6567: 0.217,
      AFB008: 0.367,
      AFB003: 0.301,
    },
    trimEtch: { T5574: 1.8, U6566: 1.725, flat40x3: 1.8, flat80x3: 3.1125 },
    trimBlack: { flat40x3: 3.0, flat80x3: 5.1875 },
  },
  perMetre: {
    caravan1146: 5,
    rubber1206: 6,
    infill1249: 2.5,
    foamTape4708: 2.5,
    puTrack2209: 5,
    glazing1256: 3,
    puTrack2339: 3.5,
    foamK30: 4,
    sealantHopper: 3,
    wedgeA174: 0.6,
    channelC5: 0.77,
    trackInfillMP024: 1.25,
    screwCover163: 0.825,
    trackT81: 1.551,
    clipSchlegal: 2,
    screwCoverP364: 3,
    infillW115: 3,
    sikaflex: 15,
    wipeBlack: 25,
    wipeDouble: 26,
    wipe1000: 30,
    felt: 3,
  },
  each: {
    sTapper: 0.088,
    mThread: 0.165,
    nyloc: 0.231,
    lockComb: 8,
    lockPlunger: 21.5,
    hingeNylon: 20,
    hingeOffset: 10,
    staysFlat: null,
    staysMed: null,
    staysHeavy: 100,
    staysRestrictor: 35,
    sboltWoodstock: 30,
    sboltParkes: 30,
    keeperSaddle: null,
    mullionFit1000: 25,
    mullionFitRivi: 50,
  },
  glass: {
    loading: 0.2,
    loadingMws: 0.15,
    options: {
      ap5_clear: { label: '5 mm Clear A/P', group: 'ap5-6', mm: 5, list: 75, loaded: false },
      ap5_tint: { label: '5 mm Tint A/P', group: 'ap5-6', mm: 5, list: 90, loaded: false },
      ap6_clear: { label: '6 mm Clear A/P', group: 'ap5-6', mm: 6, list: 80, loaded: false },
      ap6_tint: { label: '6 mm Tint A/P', group: 'ap5-6', mm: 6, list: 93, loaded: false },
      tsg6_super_grey: { label: '6 mm Super Grey TSG', group: 'ap5-6', mm: 6, list: 170, loaded: false },
      tsg5_dark_grey: { label: '5 mm Dark Grey TSG', group: 'ap5-6', mm: 5, list: 110, loaded: false },
      ap8_clear: { label: '8 mm Clear A/P', group: 'ap8-12', mm: 8, list: 145.02, loaded: true },
      ap10_clear: { label: '10 mm Clear A/P', group: 'ap8-12', mm: 10, list: 160.31, loaded: true },
      ap10_tint: { label: '10 mm Tint A/P', group: 'ap8-12', mm: 10, list: 175.49, loaded: true },
      ap12_clear: { label: '12 mm Clear A/P', group: 'ap8-12', mm: 12, list: 195.7, loaded: true },
      ap12_tint: { label: '12 mm Tint A/P', group: 'ap8-12', mm: 12, list: 211, loaded: true },
      lam638_clear: { label: '6.38 mm Clear Laminate', group: 'laminate', mm: 6.38, list: 48.8, loaded: true },
      lam638_tint: { label: '6.38 mm Tint Laminate', group: 'laminate', mm: 6.38, list: 56.4, loaded: true },
      acr5_clear: { label: '5 mm Clear Acrylic', group: 'acrylic', mm: 5, list: 45.75, loaded: false },
      acr5_green: { label: '5 mm Green Acrylic', group: 'acrylic', mm: 5, list: 51.66, loaded: false },
      acr5_grey: { label: '5 mm Grey Acrylic', group: 'acrylic', mm: 5, list: 56.7, loaded: false },
      acr6_clear: { label: '6 mm Clear Acrylic', group: 'acrylic', mm: 6, list: 60.96, loaded: false },
      acr6_grey: { label: '6 mm Grey Acrylic', group: 'acrylic', mm: 6, list: 86.94, loaded: false },
      poly6_clear: { label: '6 mm Clear XL Polycarb', group: 'acrylic', mm: 6, list: 120.86, loaded: false },
      poly6_tint: { label: '6 mm Tint XL Polycarb', group: 'acrylic', mm: 6, list: 143.95, loaded: false },
    },
    processing: {
      'ap5-6': { shape: 3.8, holes: 3.39, cview: 19.52, flatSmooth: 4.47, flatGround: null, loaded: true },
      'ap8-12': { shape: 10.07, holes: 4.83, cview: 19.52, flatSmooth: 6.15, flatGround: null, loaded: true },
      laminate: { shape: 3.15, holes: 3.17, cview: null, flatSmooth: 1, flatGround: 2.86, loaded: true },
      acrylic: { shape: 5, holes: 0, cview: 0, flatSmooth: 0, flatGround: 0, loaded: false },
    },
  },
  packingPerSqm: 2.5,
  labour: {
    T5573: {
      develop: { square: 15, offSquare: 40, areaK: 0.8 },
      window: { square: { setup: 20, each: 40 }, offSquare: { setup: 30, each: 50 }, perSqm: 30 },
      trim: { square: { setup: 15, each: 30 }, offSquare: { setup: 20, each: 30 }, perSqm: 10 },
      weld: { round: { setup: 5, each: 8 }, square: { setup: 2, each: 6 }, offSquare: { setup: 3, each: 7 }, perSqm: 15 },
      mullion: { each: 80, offSquareExtra: 25 },
      reo: { each: 47, offSquareExtra: 10 },
    },
    T5836: {
      develop: { square: 20, offSquare: 45, areaK: 0.7 },
      window: { square: { setup: 30, each: 100 }, offSquare: { setup: 45, each: 120 }, perSqm: 20 },
      trim: { square: { setup: 9, each: 10 }, offSquare: { setup: 12, each: 20 }, perSqm: 4 },
      sillFlat: { setup: 10, each: 8 },
      weld: { round: { setup: 3, each: 9 }, square: { setup: 3, each: 4 }, offSquare: { setup: 3, each: 7 }, perSqm: 15 },
      transom: { square: { setup: 20, each: 35 }, offSquare: { setup: 45, each: 55 }, extraOverOne: 50 },
      mullionBar: { setup: 35, each: 45 },
    },
    T4633: {
      develop: { square: 15, offSquare: 40, areaK: 0.2 },
      window: { square: { setup: 21, each: 55 }, offSquare: { setup: 33, each: 75 }, perSqm: 20 },
      trim: { square: { setup: 11, each: 30 }, offSquare: { setup: 14, each: 35 }, perSqm: 10, fixedQty: 10 },
      wipeSingle: { setup: 5, each: 15 },
      wipeDouble: { setup: 10, each: 10 },
    },
    T8610: {
      develop: { square: 15, offSquare: 40, areaK: 0.2 },
      window: { square: { setup: 30, each: 35 }, offSquare: { setup: 35, each: 35 }, perSqm: 18 },
      // The sheet's trim formula references blank cells for the area term, so perSqm is 0.
      trim: { square: { setup: 15, each: 20 }, offSquare: { setup: 16, each: 25 }, perSqm: 0 },
    },
    T2482: {
      develop: { square: 15, offSquare: 26, areaK: 0.2 },
      window: { square: { setup: 15, each: 40 }, offSquare: { setup: 30, each: 50 }, perSqm: 15 },
      trim: { square: { setup: 20, each: 25 }, offSquare: { setup: 25, each: 25 }, perSqm: 6 },
      weldSimple: { setup: 5, each: 8, offSquareExtra: 3 },
    },
    U6567: {
      develop: { square: 15, offSquare: 35, areaK: 0.3 },
      window: { square: { setup: 15, each: 50 }, offSquare: { setup: 30, each: 55 }, perSqm: 20 },
      trim: { square: { setup: 15, each: 20 }, offSquare: { setup: 15, each: 25 }, perSqm: 10 },
      mullion: { each: 80, offSquareExtra: 40 },
      reo: { each: 47, offSquareExtra: 10 },
    },
    AFB008: {
      develop: { square: 20, offSquare: 37, areaK: 0.2 },
      window: { square: { setup: 20, each: 105 }, offSquare: { setup: 40, each: 120 }, perSqm: 35 },
      // The sheet uses a fixed 10 minutes per each and prices the area through the mitre term.
      trim: { square: { setup: 9, each: 10 }, offSquare: { setup: 20, each: 10 }, perSqm: 0 },
      weld: { round: { setup: 3, each: 12 }, square: { setup: 3, each: 4 }, offSquare: { setup: 5, each: 10 }, perSqm: 15 },
      transom: { square: { setup: 15, each: 50 }, offSquare: { setup: 45, each: 60 }, extraOverOne: 50 },
      sillFlat: { setup: 20, each: 20 },
      mullionBar: { setup: 25, each: 45 },
    },
    TSF: {
      develop: { square: 5, offSquare: 15, areaK: 0.6 },
      window: { square: { setup: 25, each: 92 }, offSquare: { setup: 28, each: 92 }, perSqm: 40 },
      trim: { square: { setup: 9, each: 10 }, offSquare: { setup: 12, each: 12 }, perSqm: 4 },
      weld: { round: { setup: 4, each: 17 }, square: { setup: 6, each: 11 }, offSquare: { setup: 7, each: 14 }, perSqm: 11 },
      hingeEach: 15,
      boltSetEach: 15,
      noStaysCredit: 30,
    },
    SF: {
      develop: { square: 6, offSquare: 40, areaK: 0 },
      window: { square: { setup: 55, each: 55 }, offSquare: { setup: 75, each: 75 }, perSqm: 15 },
      staysEach: 15,
    },
  },
  margins: {
    T5573: { margin: 0.4, marginMws: null, uplift: 0.075 },
    T5836: { margin: 0.35, marginMws: 0.225, uplift: 0.075 },
    T4633: { margin: 0.4, marginMws: null, uplift: 0.1 },
    T8610: { margin: 0.35, marginMws: 0.225, uplift: 0.075 },
    T2482: { margin: 0.4, marginMws: null, uplift: 0.075 },
    U6567: { margin: 0.4, marginMws: null, uplift: 0.075 },
    AFB008: { margin: 0.4, marginMws: null, uplift: 0.075 },
    TSF: { margin: 0.4, marginMws: null, uplift: 0.075 },
    SF: { margin: 0.35, marginMws: 0.225, uplift: 0.075 },
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeValue(base: unknown, saved: unknown): unknown {
  if (isPlainObject(base)) {
    if (!isPlainObject(saved)) {
      return cloneValue(base);
    }
    const merged: Record<string, unknown> = {};
    for (const key of Object.keys(base)) {
      merged[key] = key in saved ? mergeValue(base[key], saved[key]) : cloneValue(base[key]);
    }
    return merged;
  }
  if (typeof base === 'number' || base === null) {
    return typeof saved === 'number' && Number.isFinite(saved) ? saved : saved === null ? null : base;
  }
  return base;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Overlay a saved rates document on the defaults. Only numeric leaves (and null = not priced) are
 * taken from the saved document; unknown keys are dropped, missing keys keep their default.
 */
export function mergeWindowRates(saved: unknown): WindowRates {
  return mergeValue(DEFAULT_WINDOW_RATES, saved) as WindowRates;
}
