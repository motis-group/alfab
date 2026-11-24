import { EdgeworkType, GlassThickness, GlassType, defaultBasePrices, defaultEdgeworkPrices } from '@utils/calculations';

export interface PricingData {
  basePrices: Record<GlassType, Partial<Record<GlassThickness, number>>>;
  edgeworkPrices: Record<EdgeworkType, Record<'4-6' | '8-12', number>>;
  otherPrices: {
    holePrice4to6: number;
    holePrice8to12: number;
    shapeSimple4to6: number;
    shapeSimple8to12: number;
    shapeComplex4to6: number;
    shapeComplex8to12: number;
    ceramicBanding: number;
    scanning: number;
    minCharge: number;
    minAreaSqm: number;
  };
  asAt: Record<'basePrices' | 'edgeworkPrices' | 'otherPrices', string>;
}

export const defaultPricingData: PricingData = {
  asAt: {
    basePrices: 'unknown',
    edgeworkPrices: 'unknown',
    otherPrices: 'unknown',
  },
  basePrices: defaultBasePrices,
  edgeworkPrices: defaultEdgeworkPrices,
  otherPrices: {
    holePrice4to6: 6.33,
    holePrice8to12: 8.85,
    shapeSimple4to6: 7.59,
    shapeSimple8to12: 12.65,
    shapeComplex4to6: 12.65,
    shapeComplex8to12: 25.27,
    ceramicBanding: 63.68,
    scanning: 90,
    minCharge: 0,
    minAreaSqm: 0,
  },
};
