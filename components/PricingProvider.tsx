'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PricingData, defaultPricingData } from '@utils/glass-rates';
import { LoadedGlassRates, loadGlassRates, mergeGlassRates, resetGlassRates, saveGlassRates } from '@utils/glass-rate-store';

export type { PricingData } from '@utils/glass-rates';
export { defaultPricingData };

interface PricingContextType {
  pricingData: PricingData;
  updatePricingData: (data: PricingData, expectedUpdatedAt?: string | null) => Promise<LoadedGlassRates>;
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

  const updatePricingData = async (data: PricingData, expectedUpdatedAt: string | null = updatedAt) => {
    const loaded = await saveGlassRates(data, expectedUpdatedAt);
    setPricingData(loaded.rates);
    setSource(loaded.source);
    setUpdatedAt(loaded.updatedAt);
    return loaded;
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
