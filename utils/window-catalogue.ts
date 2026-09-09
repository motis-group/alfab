/**
 * The window menu, as the workshop names it: a commercial series, then the window within it.
 *
 * The costing engine names its nine types by extrusion code (T5573, AFB008), which is what the
 * legacy sheet used. Nobody orders a "T4633". They order a 650 series slider. This maps one to the
 * other, so the picker reads the way the job comes in.
 *
 * One extrusion can serve several series: 5573 is the fixed window in both the 750 and the 500.
 * That is why a product points at a type rather than the other way round.
 */

import { WindowCostingInput, WindowTypeId } from '@utils/window-costing';

export interface WindowProduct {
  id: string;
  /** The code the workshop uses, e.g. "037". */
  code: string;
  /** What the window is, e.g. "Slider". */
  name: string;
  /** The costing recipe behind it, or null when the recipe does not exist yet. */
  type: WindowTypeId | null;
  /** Which section of a two-section type, where the type has one. */
  variant?: 0 | 1;
  note?: string;
}

export interface WindowSeries {
  id: string;
  name: string;
  products: WindowProduct[];
  /**
   * Off the menu, but still priced. The recipes stay in the engine so a costing saved against one
   * still opens, and so bringing a window back is a one-line change here.
   */
  retired?: boolean;
}

export const WINDOW_SERIES: WindowSeries[] = [
  {
    id: '1000',
    name: '1000 Series',
    products: [
      { id: '1000-008', code: '015/008', name: 'Slider', type: 'AFB008', variant: 0, note: 'Priced on the AFB008 section. Confirm the 015 Riviera slider costs the same, since its section is lighter.' },
      { id: '1000-6567', code: '6567', name: 'Fixed', type: 'U6567' },
      { id: '1000-035', code: '035', name: 'Hopper', type: 'AFB035', note: 'Costed on Nick\'s description, not on the legacy sheet, which never priced an 035. The frame runs on the 015 / AFB008 section and the labour is borrowed from the 1000 slider. The stainless hinge, the struts and the Vitus handle have no price yet. Gas struts, manual struts and no struts are one costing with an option, not three windows.' },
    ],
  },
  {
    id: '750',
    name: '750 Series',
    products: [
      { id: '750-5573', code: '5573', name: 'Fixed', type: 'T5573' },
      { id: '750-003', code: '003', name: 'Slider', type: 'AFB008', variant: 1, note: 'The sheet calls this the medium slider and prices it with 1000 series track, clip channel and wipe. Confirm a 750 uses the same parts.' },
    ],
  },
  {
    id: '650',
    name: '650 Series',
    products: [{ id: '650-037', code: '037', name: 'Slider', type: 'T4633', variant: 1, note: 'The shop\'s most common slider. No trim fits it, it takes no plunger lock, and nothing thicker than 6 mm goes in. The sheet priced the 037 frame at the T4633 rate, not the lighter AFB037 die. Confirm which is bought.' }],
  },
  {
    id: '500',
    name: '500 Series',
    products: [
      { id: '500-5573', code: '5573', name: 'Fixed', type: 'T5573' },
      { id: '500-5836', code: '5836', name: 'Slider', type: 'T5836' },
      { id: '500-4633', code: '4633', name: 'Slider, horse float', type: 'T4633', variant: 0 },
      { id: '500-023', code: '023', name: 'Fixed, horse float front', type: null, note: 'No costing has ever existed for the 023: quotes were estimated off another window. Nick is writing up the extrusion cost, the materials and the labour.' },
    ],
  },
  {
    // Nick: "we don't really use 8610, 2482, the T section sash and frame and the 2303/2482 sash and
    // frame". Kept and priced, off the menu. The 2482 caravan may come back for standard sizes.
    id: 'other',
    name: 'Other windows (off the menu)',
    retired: true,
    products: [
      { id: 'other-8610', code: '8610', name: 'Flat sash', type: 'T8610' },
      { id: 'other-2482', code: '2482', name: 'Caravan', type: 'T2482' },
      { id: 'other-tsf', code: 'T section', name: 'Sash & frame, hopper', type: 'TSF' },
      { id: 'other-sf', code: '2303', name: 'Sash & frame', type: 'SF' },
    ],
  },
];

export const ALL_PRODUCTS: WindowProduct[] = WINDOW_SERIES.flatMap((series) => series.products);

/** The series the picker offers. A retired series appears only while a costing is using it. */
export function visibleSeries(currentSeriesId?: string | null): WindowSeries[] {
  return WINDOW_SERIES.filter((series) => !series.retired || series.id === currentSeriesId);
}

export function findSeries(seriesId: string): WindowSeries | null {
  return WINDOW_SERIES.find((series) => series.id === seriesId) || null;
}

export function findProduct(productId: string | null): WindowProduct | null {
  return productId ? ALL_PRODUCTS.find((product) => product.id === productId) || null : null;
}

export function seriesOfProduct(productId: string | null): WindowSeries | null {
  return productId ? WINDOW_SERIES.find((series) => series.products.some((product) => product.id === productId)) || null : null;
}

export function productLabel(product: WindowProduct): string {
  return `${product.code} — ${product.name}`;
}

/** Full name for a costing, e.g. "650 Series 037 — Slider". */
export function productFullName(productId: string | null): string | null {
  const product = findProduct(productId);
  const series = seriesOfProduct(productId);
  return product && series ? `${series.name} ${productLabel(product)}` : null;
}

/**
 * The product a costing was priced as. Falls back to the first product using the same recipe, so a
 * costing saved before the menu existed still shows a name a fabricator recognises.
 */
export function productForInput(input: Pick<WindowCostingInput, 'type' | 'variant' | 'productId'>): WindowProduct | null {
  const exact = findProduct(input.productId ?? null);
  if (exact) {
    return exact;
  }
  return ALL_PRODUCTS.find((product) => product.type === input.type && (product.variant ?? 0) === input.variant) || null;
}
