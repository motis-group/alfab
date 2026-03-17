import { NextResponse } from 'next/server';

import { clearSessionCookie, readSessionTokenFromCookie, revokeAppSessionByToken } from '@utils/auth-session';
import { getRequestOrigin } from '@utils/billing-config';
import { clearThemePreferencesCookie } from '@utils/theme-preferences-server';

export const runtime = 'nodejs';

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/')) {
    return '/login';
  }

  if (value.startsWith('//')) {
    return '/login';
  }

  return value;
}

async function revokeCurrentSession(): Promise<void> {
  const sessionToken = await readSessionTokenFromCookie();

  if (sessionToken) {
    await revokeAppSessionByToken(sessionToken).catch(() => {
      // Keep signout resilient; cookie will still be cleared.
    });
  }
}

export async function POST() {
  await revokeCurrentSession();

  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  clearThemePreferencesCookie(response);

  return response;
}

export async function GET(request: Request) {
  await revokeCurrentSession();

  const requestUrl = new URL(request.url);
  const nextPath = safeNextPath(requestUrl.searchParams.get('next'));
  const origin = getRequestOrigin(request);
  const redirectUrl = new URL(nextPath, origin);

  const response = NextResponse.redirect(redirectUrl);
  clearSessionCookie(response);
  clearThemePreferencesCookie(response);
  return response;
}
