'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { GlassType, EdgeworkType, GlassThickness } from '@utils/calculations';

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
  },
};

interface PricingContextType {
  pricingData: PricingData;
  updatePricingData: (data: PricingData) => void;
  resetToDefaults: () => void;
}

const PricingContext = createContext<PricingContextType | undefined>(undefined);

interface PricingProviderProps {
  children: ReactNode;
}

export function PricingProvider({ children }: PricingProviderProps) {
  const [pricingData, setPricingData] = useState<PricingData>(defaultPricingData);

  // Load pricing data from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPricing = localStorage.getItem('glassPricingData');
      if (savedPricing) {
        try {
          const parsed = JSON.parse(savedPricing);
          setPricingData(parsed);
        } catch (error) {
          console.error('Error loading saved pricing data:', error);
        }
      }
    }
  }, []);

  const updatePricingData = (data: PricingData) => {
    setPricingData(data);
    if (typeof window !== 'undefined') {
      localStorage.setItem('glassPricingData', JSON.stringify(data));
    }
  };

  const resetToDefaults = () => {
    setPricingData(defaultPricingData);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('glassPricingData');
    }
  };

  return <PricingContext.Provider value={{ pricingData, updatePricingData, resetToDefaults }}>{children}</PricingContext.Provider>;
}

export function usePricing() {
  const context = useContext(PricingContext);
  if (context === undefined) {
    throw new Error('usePricing must be used within a PricingProvider');
  }
  return context;
}
