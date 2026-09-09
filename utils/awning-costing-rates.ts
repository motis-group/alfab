/**
 * Awning costing rates, transcribed from the legacy Excel sheet
 * (projects/costing/discovery/AWNING COSTING Feb 16 20201.xlsx, build date 17 Feb 2020). Saved
 * overrides live in the awning_costing_rates table (row id "default") and are merged over
 * DEFAULT_AWNING_RATES by mergeAwningRates().
 *
 * Keep this module free of runtime imports: utils/awning-costing.test.ts runs it under tsx.
 * `null` means the sheet had no usable price; the engine reports such lines as "not priced"
 * instead of failing.
 */

export type GlazingId = 'supergrey_tgn' | 'clear_tgn' | 'grey_tgn';

export interface GlazingOption {
  label: string;
  /** $/sqm. */
  list: number | null;
}

export interface AwningRates {
  /** Parts the sheet held as a flat price. The sheet's list already carries its 10 percent loading. */
  parts: {
    /** AFB035 awning frame, $/m. */
    frame: number | null;
    /** $/m. */
    anchorPlate: number | null;
    /** $/m. */
    rubberSeal: number | null;
    /** $/m. */
    trackInfill: number | null;
    /** $ each. */
    winder: number | null;
    /** $ per pair. */
    hinges: number | null;
    /** $ each. */
    winderMountPlate: number | null;
    /** $ each. */
    glassWinderPlate: number | null;
    /** $ per set of a screw and a lock nut. */
    fixingSet: number | null;
    /** $ each. */
    sealant: number | null;
    /** $ each, already a selling price in the sheet. */
    flyscreen: number | null;
  };
  /** Quantities the sheet fixed rather than deriving from the size. */
  quantities: {
    /** Metres of anchor plate per awning. */
    anchorPlateM: number;
    /** Sets of fixings per awning. */
    fixingSets: number;
  };
  labour: {
    /** Minutes to set up a run, divided across the quantity made. */
    setupMinutes: number;
    /** Minutes per awning. */
    eachMinutes: number;
    perHour: number | null;
  };
  glass: {
    options: Record<GlazingId, GlazingOption>;
    /** Ceramic banding, a set price per awning whatever the size. */
    bandingSet: number | null;
    /** Flat polish, $/m of glass perimeter. */
    flatPolishPerM: number | null;
  };
  /** Markup on the total cost. The sheet's "MARGIN" is cost x rate, not a gross margin. */
  marginRate: number;
  /** The date each group of prices was last known good, for the rates editor. */
  asAt: Record<'parts' | 'quantities' | 'labour' | 'glass' | 'marginRate', string>;
}

export const GLAZING_ORDER: GlazingId[] = ['supergrey_tgn', 'clear_tgn', 'grey_tgn'];

export const DEFAULT_AWNING_RATES: AwningRates = {
  parts: {
    frame: 10,
    anchorPlate: 4,
    rubberSeal: 6.6,
    trackInfill: 3.5,
    // The sheet prices the winder at 52 in the costing and 38.5 in its own parts list. 52 is the
    // number the sheet actually charged, so it is the one kept. See the spec's open questions.
    winder: 52,
    hinges: 38.5,
    winderMountPlate: 25,
    glassWinderPlate: 25,
    fixingSet: 1,
    sealant: 10,
    flyscreen: 75,
  },
  quantities: {
    anchorPlateM: 1.2,
    fixingSets: 20,
  },
  labour: {
    setupMinutes: 60,
    eachMinutes: 330,
    // The sheet costs labour at $1.25 a minute. The window sheet uses $85 an hour; see the spec.
    perHour: 75,
  },
  glass: {
    options: {
      supergrey_tgn: { label: 'Super Grey Toughened', list: 198 },
      // The sheet quoted Super Grey only. These two are on the menu and unpriced until the shop
      // says what they cost, rather than being quoted off the Super Grey price.
      clear_tgn: { label: 'Clear Toughened', list: null },
      grey_tgn: { label: 'Grey Toughened', list: null },
    },
    bandingSet: 63.68,
    flatPolishPerM: 4.56,
  },
  marginRate: 0.4,
  asAt: {
    parts: 'Feb 2020',
    quantities: 'Feb 2020',
    labour: 'Feb 2020',
    glass: 'Feb 2020',
    marginRate: 'Feb 2020',
  },
};

/**
 * Overlay a saved document on the defaults. Keys added to the defaults later keep their default,
 * and unknown keys are dropped. A blank on a rate that has a default price falls back to that
 * price: read as zero it would quote the job short without saying so.
 */
export function mergeAwningRates(saved: unknown): AwningRates {
  const base = JSON.parse(JSON.stringify(DEFAULT_AWNING_RATES)) as AwningRates;
  if (!saved || typeof saved !== 'object') {
    return base;
  }

  const merge = (target: Record<string, unknown>, source: Record<string, unknown>, defaults: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(source)) {
      const fallback = defaults[key];

      if (typeof fallback === 'string') {
        if (typeof value === 'string') {
          target[key] = value;
        }
        continue;
      }

      if (typeof fallback === 'number' || fallback === null) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          target[key] = value;
          continue;
        }
        // Only a rate that is blank by default may be saved blank.
        if (value == null && fallback === null) {
          target[key] = null;
        }
        continue;
      }

      if (fallback && typeof fallback === 'object' && value && typeof value === 'object') {
        merge(target[key] as Record<string, unknown>, value as Record<string, unknown>, fallback as Record<string, unknown>);
      }
    }
  };

  merge(base as unknown as Record<string, unknown>, saved as Record<string, unknown>, DEFAULT_AWNING_RATES as unknown as Record<string, unknown>);
  return base;
}
