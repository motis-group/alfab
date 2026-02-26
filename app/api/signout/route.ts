import { NextResponse } from 'next/server';

import { clearSessionCookie, readSessionTokenFromCookie, revokeAppSessionByToken } from '@utils/auth-session';

export const runtime = 'nodejs';

export async function POST() {
  const sessionToken = await readSessionTokenFromCookie();

  if (sessionToken) {
    await revokeAppSessionByToken(sessionToken).catch(() => {
      // Keep signout resilient; cookie will still be cleared.
    });
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);

  return response;
}
