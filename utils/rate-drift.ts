/**
 * Where the three price lists disagree.
 *
 * Glass, window and awning costings each hold their own rates. Several items appear in more than
 * one list — the same pane of glass, the same hour of labour, the same ceramic banding — and
 * nothing tells anyone when they drift apart. This finds the overlaps and measures the gap.
 *
 * **The gap is not automatically an error.** The lists do not all mean the same thing by a price:
 * the glass calculator's is a base a per-piece markup is applied to, while the window costing's
 * feeds a manufactured window that then carries margin and uplift. A difference may be correct.
 * What is not defensible is nobody being able to say which. This module reports; it does not judge.
 *
 * Equivalences are declared by hand below rather than matched on label, because "6 mm Tint A/P" and
 * "Grey" may or may not be the same product and a wrong match is worse than a missing one.
 *
 * Keep this module free of runtime imports: utils/rate-drift.test.ts runs it under tsx.
 */

import type { PricingData } from '@components/PricingProvider';
import type { AwningRates } from '@utils/awning-costing-rates';
import type { WindowRates } from '@utils/window-costing-rates';

export type RateSource = 'glass' | 'window' | 'awning';

export const SOURCE_LABELS: Record<RateSource, string> = {
  glass: 'Glass calculator',
  window: 'Window costing',
  awning: 'Awning costing',
};

export const SOURCE_SETTINGS: Record<RateSource, string> = {
  glass: '/settings',
  window: '/settings/windows',
  awning: '/settings/awnings',
};

export interface DriftPrice {
  source: RateSource;
  /** The number as the list holds it. */
  value: number;
  /** What it becomes once that list's own loading is applied. Compared on this. */
  effective: number;
  /** Set when effective and value differ, saying why. */
  note?: string;
}

export interface DriftItem {
  key: string;
  label: string;
  unit: string;
  prices: DriftPrice[];
  low: number | null;
  high: number | null;
  /** How much higher the dearest is than the cheapest, as a fraction. Null below two prices. */
  spread: number | null;
}

/** Below this a gap is rounding, not drift. */
export const MATERIAL_SPREAD = 0.02;

type Getter = (rates: { glass: PricingData; window: WindowRates; awning: AwningRates }) => DriftPrice | null;

interface Equivalence {
  key: string;
  label: string;
  unit: string;
  getters: Getter[];
}

function glassBase(type: keyof PricingData['basePrices'], mm: number): Getter {
  return ({ glass }) => {
    const value = glass.basePrices[type]?.[mm as keyof (typeof glass.basePrices)[typeof type]];
    return typeof value === 'number' && value > 0 ? { source: 'glass', value, effective: value } : null;
  };
}

function windowGlass(id: keyof WindowRates['glass']['options']): Getter {
  return ({ window }) => {
    const option = window.glass.options[id];
    if (!option || typeof option.list !== 'number') {
      return null;
    }
    // Some window glass carries the glass loading before it reaches a cost line; some does not.
    const effective = option.loaded ? option.list * (1 + window.glass.loading) : option.list;
    return {
      source: 'window',
      value: option.list,
      effective,
      note: option.loaded ? `list ${option.list.toFixed(2)} plus the ${Math.round(window.glass.loading * 100)}% glass loading` : undefined,
    };
  };
}

function awningGlass(id: keyof AwningRates['glass']['options']): Getter {
  return ({ awning }) => {
    const value = awning.glass.options[id]?.list;
    return typeof value === 'number' ? { source: 'awning', value, effective: value } : null;
  };
}

function plain(source: RateSource, read: (rates: { glass: PricingData; window: WindowRates; awning: AwningRates }) => number | null | undefined): Getter {
  return (rates) => {
    const value = read(rates);
    return typeof value === 'number' ? { source, value, effective: value } : null;
  };
}

/**
 * Items that genuinely appear in more than one list. Add to this when a new shared item is found;
 * an item that appears once has nothing to drift against and is left out.
 */
const EQUIVALENCES: Equivalence[] = [
  { key: 'glass_clear_5', label: '5 mm Clear', unit: '$ per m²', getters: [glassBase('Clear', 5), windowGlass('ap5_clear')] },
  { key: 'glass_clear_6', label: '6 mm Clear', unit: '$ per m²', getters: [glassBase('Clear', 6), windowGlass('ap6_clear')] },
  { key: 'glass_clear_8', label: '8 mm Clear', unit: '$ per m²', getters: [glassBase('Clear', 8), windowGlass('ap8_clear')] },
  { key: 'glass_clear_10', label: '10 mm Clear', unit: '$ per m²', getters: [glassBase('Clear', 10), windowGlass('ap10_clear')] },
  { key: 'glass_clear_12', label: '12 mm Clear', unit: '$ per m²', getters: [glassBase('Clear', 12), windowGlass('ap12_clear')] },
  { key: 'glass_dark_grey_5', label: '5 mm Dark Grey toughened', unit: '$ per m²', getters: [glassBase('Dark Grey', 5), windowGlass('tsg5_dark_grey')] },
  { key: 'glass_super_grey_6', label: '6 mm Super Grey toughened', unit: '$ per m²', getters: [glassBase('Super Grey', 6), windowGlass('tsg6_super_grey'), awningGlass('supergrey_tgn')] },
  {
    key: 'labour_per_hour',
    label: 'Labour',
    unit: '$ per hour',
    getters: [plain('window', ({ window }) => window.labourPerHour), plain('awning', ({ awning }) => awning.labour.perHour)],
  },
  {
    key: 'ceramic_banding',
    label: 'Ceramic banding',
    unit: '$ per piece',
    getters: [plain('glass', ({ glass }) => glass.otherPrices.ceramicBanding), plain('awning', ({ awning }) => awning.glass.bandingSet)],
  },
  {
    key: 'flat_polish',
    label: 'Flat polish, straight, 4–6 mm',
    unit: '$ per m',
    getters: [plain('glass', ({ glass }) => glass.edgeworkPrices['FLAT POLISH - STRAIGHT']?.['4-6']), plain('awning', ({ awning }) => awning.glass.flatPolishPerM)],
  },
];

/** Every shared item, dearest spread first. Items found in only one list are dropped. */
export function compareRates(glass: PricingData, window: WindowRates, awning: AwningRates): DriftItem[] {
  const rates = { glass, window, awning };

  return EQUIVALENCES.map((equivalence) => {
    const prices = equivalence.getters.map((getter) => getter(rates)).filter(Boolean) as DriftPrice[];
    const effectives = prices.map((price) => price.effective);
    const low = effectives.length ? Math.min(...effectives) : null;
    const high = effectives.length ? Math.max(...effectives) : null;

    return {
      key: equivalence.key,
      label: equivalence.label,
      unit: equivalence.unit,
      prices,
      low,
      high,
      spread: prices.length > 1 && low && low > 0 && high != null ? high / low - 1 : null,
    };
  })
    .filter((item) => item.prices.length > 1)
    .sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0));
}

/** The items worth a conversation, as opposed to rounding. */
export function materialDrift(items: DriftItem[]): DriftItem[] {
  return items.filter((item) => (item.spread ?? 0) >= MATERIAL_SPREAD);
}
