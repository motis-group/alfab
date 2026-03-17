export const THEME_MODE_VALUES = ['light', 'dark', 'system'] as const;
export const THEME_TINT_VALUES = ['none', 'blue', 'green', 'orange', 'purple', 'red', 'yellow', 'pink'] as const;

export type ThemeMode = (typeof THEME_MODE_VALUES)[number];
export type ThemeTint = (typeof THEME_TINT_VALUES)[number];

export interface ThemePreferences {
  mode: ThemeMode;
  tint: ThemeTint;
}

export interface ThemePreferenceInput {
  mode?: string | null;
  tint?: string | null;
}

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  mode: 'light',
  tint: 'none',
};

export const THEME_MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export const THEME_TINT_OPTIONS: Array<{ value: ThemeTint; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'orange', label: 'Orange' },
  { value: 'purple', label: 'Purple' },
  { value: 'red', label: 'Red' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'pink', label: 'Pink' },
];

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && THEME_MODE_VALUES.includes(value as ThemeMode);
}

export function isThemeTint(value: unknown): value is ThemeTint {
  return typeof value === 'string' && THEME_TINT_VALUES.includes(value as ThemeTint);
}

export function normalizeThemePreferences(value: ThemePreferenceInput | null | undefined): ThemePreferences {
  return {
    mode: isThemeMode(value?.mode) ? value.mode : DEFAULT_THEME_PREFERENCES.mode,
    tint: isThemeTint(value?.tint) ? value.tint : DEFAULT_THEME_PREFERENCES.tint,
  };
}

export function themeModeToClassName(mode: ThemeMode): string {
  return `theme-${mode}`;
}

export function themeTintToClassName(tint: ThemeTint): string {
  return tint === 'none' ? '' : `tint-${tint}`;
}

export function themePreferencesToBodyClassName(themePreferences: ThemePreferences): string {
  return [themeModeToClassName(themePreferences.mode), themeTintToClassName(themePreferences.tint)].filter(Boolean).join(' ');
}

export function applyThemePreferencesToDocument(themePreferences: ThemePreferences): void {
  if (typeof document === 'undefined') {
    return;
  }

  const body = document.body;

  body.classList.forEach((className) => {
    if (className.startsWith('theme-') || className.startsWith('tint-')) {
      body.classList.remove(className);
    }
  });

  const className = themePreferencesToBodyClassName(themePreferences);
  if (!className) {
    return;
  }

  className.split(' ').forEach((token) => {
    if (token) {
      body.classList.add(token);
    }
  });
}
