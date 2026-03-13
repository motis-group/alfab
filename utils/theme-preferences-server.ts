import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { dbQuery } from '@utils/db';
import { DEFAULT_THEME_PREFERENCES, ThemePreferences, normalizeThemePreferences } from '@utils/theme-preferences';

const THEME_PREFERENCES_COOKIE = 'alfab-theme-preferences';
const THEME_PREFERENCES_TTL_SECONDS = 7 * 24 * 60 * 60;

interface ThemePreferenceRow {
  theme_mode: string | null;
  theme_tint: string | null;
}

function serializeThemePreferences(themePreferences: ThemePreferences): string {
  return `${themePreferences.mode}|${themePreferences.tint}`;
}

function parseThemePreferences(value: string | null | undefined): ThemePreferences {
  if (!value) {
    return DEFAULT_THEME_PREFERENCES;
  }

  const [mode, tint] = value.split('|');
  return normalizeThemePreferences({ mode, tint });
}

export async function readThemePreferencesFromCookie(): Promise<ThemePreferences> {
  const cookieStore = await cookies();
  return parseThemePreferences(cookieStore.get(THEME_PREFERENCES_COOKIE)?.value);
}

export function applyThemePreferencesCookie(response: NextResponse, themePreferences: ThemePreferences): void {
  response.cookies.set({
    name: THEME_PREFERENCES_COOKIE,
    value: serializeThemePreferences(themePreferences),
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: THEME_PREFERENCES_TTL_SECONDS,
  });
}

export function clearThemePreferencesCookie(response: NextResponse): void {
  response.cookies.set({
    name: THEME_PREFERENCES_COOKIE,
    value: '',
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
}

export async function loadUserThemePreferences(userId: string): Promise<ThemePreferences> {
  try {
    const result = await dbQuery<ThemePreferenceRow>(
      `
        select theme_mode, theme_tint
        from users
        where id = $1
        limit 1
      `,
      [userId]
    );

    if (!result.rowCount) {
      return DEFAULT_THEME_PREFERENCES;
    }

    const row = result.rows[0];
    return normalizeThemePreferences({
      mode: row.theme_mode,
      tint: row.theme_tint,
    });
  } catch (error: any) {
    if (error?.code === '42703') {
      return DEFAULT_THEME_PREFERENCES;
    }

    throw error;
  }
}

export async function saveUserThemePreferences(userId: string, themePreferences: ThemePreferences): Promise<void> {
  await dbQuery(
    `
      update users
      set theme_mode = $1,
          theme_tint = $2
      where id = $3
    `,
    [themePreferences.mode, themePreferences.tint, userId]
  );
}
