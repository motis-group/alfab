/**
 * The one place a shared rate is chosen.
 *
 * The same pane of glass appeared in three price lists and each list picked its own number: 6 mm
 * Clear was $92.47 to the glass calculator and $80 to the window costing, a 15.6% gap on identical
 * material. Every shared item is now held once, in the glass price list, and the window and awning
 * rates derive theirs from it. The rates editors show a derived field as read-only.
 *
 * A window or awning price that has no glass-calculator equivalent — laminate, acrylic, polycarb,
 * the tints — is not shared and keeps its own number.
 *
 * Two lists do not have to hold the same *number* to hold the same *price*. The window costing
 * applies a glass loading to some of its list prices, so a derived list price is the shared price
 * divided by that loading, and the two agree once the loading is applied. `utils/rate-drift.ts`
 * compares on the loaded figure and is what proves this.
 *
 * Keep this module free of runtime imports beyond utils/calculations: utils/shared-rates.test.ts
 * runs it under tsx.
 */

import type { PricingData } from '@components/PricingProvider';
import type { AwningRates } from '@utils/awning-costing-rates';
import type { WindowRates } from '@utils/window-costing-rates';
import { GlassThickness, GlassType, defaultBasePrices, defaultEdgeworkPrices } from '@utils/calculations';

/** A glass-calculator entry, by the two things that identify it. */
export interface GlassListRef {
  type: GlassType;
  mm: GlassThickness;
}

/** Window glazing options that are the same product as a glass-calculator entry. */
export const WINDOW_GLASS_FROM_LIST: Record<string, GlassListRef> = {
  ap5_clear: { type: 'Clear', mm: 5 },
  ap6_clear: { type: 'Clear', mm: 6 },
  ap8_clear: { type: 'Clear', mm: 8 },
  ap10_clear: { type: 'Clear', mm: 10 },
  ap12_clear: { type: 'Clear', mm: 12 },
  tsg5_dark_grey: { type: 'Dark Grey', mm: 5 },
  tsg6_super_grey: { type: 'Super Grey', mm: 6 },
};

/**
 * The hourly rate both costings charge labour at. The window costing owns the editable value; the
 * awning derives it. One shop, one hourly rate — the two lists held $85 and $75.
 */
export const DEFAULT_SHARED_LABOUR_PER_HOUR = 85;

/** Awning glazing options that are the same product as a glass-calculator entry. */
export const AWNING_GLASS_FROM_LIST: Record<string, GlassListRef> = {
  supergrey_tgn: { type: 'Super Grey', mm: 6 },
};

/** Awning rates other than glass that the glass price list also holds. */
export const AWNING_DERIVED_LABELS: Record<string, string> = {
  'glass.bandingSet': 'Ceramic banding',
  'glass.flatPolishPerM': 'Flat polish',
  'labour.perHour': 'Labour rate',
};

function priceFrom(basePrices: PricingData['basePrices'], ref: GlassListRef): number | null {
  const value = basePrices[ref.type]?.[ref.mm];
  return typeof value === 'number' && value > 0 ? value : null;
}

/**
 * Window rates with every shared glass price taken from the glass list. A price the window costing
 * loads is divided by that loading first, so the loaded figure matches the shared price.
 */
export function applySharedRatesToWindow(rates: WindowRates, basePrices: PricingData['basePrices']): WindowRates {
  const options = { ...rates.glass.options };
  let changed = false;

  for (const [id, ref] of Object.entries(WINDOW_GLASS_FROM_LIST)) {
    const option = options[id as keyof typeof options];
    const shared = priceFrom(basePrices, ref);
    if (!option || shared == null) {
      continue;
    }

    const list = option.loaded ? shared / (1 + rates.glass.loading) : shared;
    const rounded = Math.round(list * 100) / 100;
    if (option.list !== rounded) {
      options[id as keyof typeof options] = { ...option, list: rounded };
      changed = true;
    }
  }

  return changed ? { ...rates, glass: { ...rates.glass, options } } : rates;
}

/**
 * Awning rates with every shared rate taken from the glass list, and the labour rate from the
 * window costing. The awning sheet is the smaller of the two and never had a labour rate of its own
 * that the shop recognised as different.
 */
/** The rates an awning shares with another list, and where each is chosen. */
export interface SharedAwningRates {
  basePrices: PricingData['basePrices'];
  /** Glass calculator, otherPrices.ceramicBanding. */
  ceramicBanding: number | null;
  /** Glass calculator, edgeworkPrices FLAT POLISH - STRAIGHT 4-6. */
  flatPolishPerM: number | null;
  /** Window costing, labourPerHour. One shop, one hourly rate. */
  labourPerHour: number | null;
}

export function applySharedRatesToAwning(rates: AwningRates, shared: SharedAwningRates): AwningRates {
  const options = { ...rates.glass.options };
  for (const [id, ref] of Object.entries(AWNING_GLASS_FROM_LIST)) {
    const option = options[id as keyof typeof options];
    const price = priceFrom(shared.basePrices, ref);
    if (option && price != null) {
      options[id as keyof typeof options] = { ...option, list: price };
    }
  }

  return {
    ...rates,
    glass: {
      ...rates.glass,
      options,
      bandingSet: shared.ceramicBanding ?? rates.glass.bandingSet,
      flatPolishPerM: shared.flatPolishPerM ?? rates.glass.flatPolishPerM,
    },
    labour: { ...rates.labour, perHour: shared.labourPerHour ?? rates.labour.perHour },
  };
}

/** Every shared rate at its code default, for the merge functions to apply before anything is saved. */
export const DEFAULT_SHARED_AWNING_RATES: SharedAwningRates = {
  basePrices: defaultBasePrices,
  ceramicBanding: 63.68,
  flatPolishPerM: defaultEdgeworkPrices['FLAT POLISH - STRAIGHT']['4-6'],
  labourPerHour: DEFAULT_SHARED_LABOUR_PER_HOUR,
};

