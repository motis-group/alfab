'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { GlassType, EdgeworkType, GlassThickness } from '@utils/calculations';
import { loadGlassRates, mergeGlassRates, resetGlassRates, saveGlassRates } from '@utils/glass-rate-store';

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
    /** The least a piece is charged, however small. 0 until Nick says what it is. */
    minCharge: number;
    /** The smallest area a piece is charged at, in square metres. 0 charges the exact area. */
    minAreaSqm: number;
  };
}

// Default pricing data
export const defaultPricingData: PricingData = {
  basePrices: {
    Clear: {
      4: 83.96,
      5: 87.59,
      6: 92.47,
      8: 200.63,
      10: 221.78,
      12: 270.74,
    },
    Green: {
      4: 102.19,
      5: 104.61,
      6: 109.5,
      8: 242.79,
      10: 267.62,
      12: 292.06,
    },
    Grey: {
      4: 102.19,
      5: 104.61,
      6: 109.5,
      8: 242.79,
      10: 267.62,
      12: 292.06,
    },
    'Dark Grey': {
      5: 128.97,
    },
    'Super Grey': {
      6: 198.12,
    },
  },
  edgeworkPrices: {
    'ROUGH ARRIS': { '4-6': 0, '8-12': 0 },
    'FLAT GRIND - STRAIGHT': { '4-6': 4.31, '8-12': 7.59 },
    'FLAT GRIND - CURVED': { '4-6': 8.85, '8-12': 17.67 },
    'FLAT POLISH - STRAIGHT': { '4-6': 4.56, '8-12': 8.85 },
    'FLAT POLISH - CURVED': { '4-6': 12.66, '8-12': 25.27 },
  },
  otherPrices: {
    holePrice4to6: 6.33,
    holePrice8to12: 8.85,
    shapeSimple4to6: 7.59,
    shapeSimple8to12: 12.65,
    shapeComplex4to6: 12.65,
    shapeComplex8to12: 25.27,
    ceramicBanding: 63.68,
    scanning: 90,
    // Nothing until the shop says otherwise, which is exactly what the calculator did before.
    minCharge: 0,
    minAreaSqm: 0,
  },
};

interface PricingContextType {
  pricingData: PricingData;
  updatePricingData: (data: PricingData) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  /** Whether these are the company's saved rates or the code defaults, and when they were saved. */
  source: 'saved' | 'default';
  updatedAt: string | null;
  isLoading: boolean;
  error: string | null;
}

const PricingContext = createContext<PricingContextType | undefined>(undefined);

interface PricingProviderProps {
  children: ReactNode;
}

export function PricingProvider({ children }: PricingProviderProps) {
  const [pricingData, setPricingData] = useState<PricingData>(defaultPricingData);
  const [source, setSource] = useState<'saved' | 'default'>('default');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Glass rates are company-wide, so they come from the database rather than this browser. A rate
  // kept per browser meant two people could quote different prices and neither could tell.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await loadGlassRates();
        if (cancelled) {
          return;
        }
        setPricingData(loaded.rates);
        setSource(loaded.source);
        setUpdatedAt(loaded.updatedAt);
        setError(loaded.error);
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || 'Unable to load the glass rates.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const updatePricingData = async (data: PricingData) => {
    await saveGlassRates(data, updatedAt);
    const loaded = await loadGlassRates();
    setPricingData(loaded.rates);
    setSource(loaded.source);
    setUpdatedAt(loaded.updatedAt);
  };

  const resetToDefaults = async () => {
    await resetGlassRates();
    setPricingData(mergeGlassRates(null));
    setSource('default');
    setUpdatedAt(null);
  };

  return <PricingContext.Provider value={{ pricingData, updatePricingData, resetToDefaults, source, updatedAt, isLoading, error }}>{children}</PricingContext.Provider>;
}

export function usePricing() {
  const context = useContext(PricingContext);
  if (context === undefined) {
    throw new Error('usePricing must be used within a PricingProvider');
  }
  return context;
}
