'use client';

import * as React from 'react';

import { ThemeMode, ThemePreferences, ThemeTint, applyThemePreferencesToDocument, normalizeThemePreferences } from '@utils/theme-preferences';

interface ThemeContextValue {
  themePreferences: ThemePreferences;
  isSaving: boolean;
  error: string | null;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setThemeTint: (tint: ThemeTint) => Promise<void>;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  initialThemePreferences: ThemePreferences;
}

interface ThemeUpdateResponse {
  user?: {
    themePreferences?: Partial<ThemePreferences>;
  };
  error?: string;
}

export function ThemeProvider({ children, initialThemePreferences }: ThemeProviderProps) {
  const initialState = React.useRef(normalizeThemePreferences(initialThemePreferences));
  const [themePreferences, setThemePreferences] = React.useState<ThemePreferences>(initialState.current);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const themePreferencesRef = React.useRef(themePreferences);
  const saveRequestId = React.useRef(0);

  React.useEffect(() => {
    themePreferencesRef.current = themePreferences;
    applyThemePreferencesToDocument(themePreferences);
  }, [themePreferences]);

  React.useEffect(() => {
    const nextThemePreferences = normalizeThemePreferences(initialThemePreferences);
    initialState.current = nextThemePreferences;
    setThemePreferences(nextThemePreferences);
    setError(null);
  }, [initialThemePreferences]);

  async function persistThemePreferences(nextThemePreferences: ThemePreferences) {
    const previousThemePreferences = themePreferencesRef.current;
    const requestId = saveRequestId.current + 1;
    saveRequestId.current = requestId;

    setThemePreferences(nextThemePreferences);
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          themePreferences: nextThemePreferences,
        }),
      });

      const data = ((await response.json().catch(() => ({}))) || {}) as ThemeUpdateResponse;
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save theme preferences.');
      }

      if (requestId !== saveRequestId.current) {
        return;
      }

      const savedThemePreferences = normalizeThemePreferences(data.user?.themePreferences || nextThemePreferences);
      setThemePreferences(savedThemePreferences);
    } catch (saveError: any) {
      if (requestId !== saveRequestId.current) {
        return;
      }

      setThemePreferences(previousThemePreferences);
      setError(saveError?.message || 'Unable to save theme preferences.');
    } finally {
      if (requestId === saveRequestId.current) {
        setIsSaving(false);
      }
    }
  }

  async function setThemeMode(mode: ThemeMode) {
    await persistThemePreferences({
      ...themePreferencesRef.current,
      mode,
    });
  }

  async function setThemeTint(tint: ThemeTint) {
    await persistThemePreferences({
      ...themePreferencesRef.current,
      tint,
    });
  }

  return <ThemeContext.Provider value={{ themePreferences, isSaving, error, setThemeMode, setThemeTint }}>{children}</ThemeContext.Provider>;
}

export function useThemePreferences(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemePreferences must be used within ThemeProvider');
  }

  return context;
}
