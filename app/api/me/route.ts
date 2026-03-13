import { NextResponse } from 'next/server';

import { getAppSession } from '@utils/auth-session';
import { getRolePermissions } from '@utils/authz';
import { applyThemePreferencesCookie, saveUserThemePreferences } from '@utils/theme-preferences-server';
import { normalizeThemePreferences } from '@utils/theme-preferences';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getAppSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: session.userId,
      username: session.username,
      role: session.role,
      effectiveRole: session.effectiveRole,
      assumedRole: session.assumedRole,
      themePreferences: session.themePreferences,
      permissions: session.permissions,
      basePermissions: getRolePermissions(session.role),
      canOverrideSessionRole: session.role === 'superadmin',
    },
  });
}

interface MeUpdateBody {
  themePreferences?: {
    mode?: string;
    tint?: string;
  };
}

export async function PATCH(request: Request) {
  const session = await getAppSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = ((await request.json().catch(() => ({}))) || {}) as MeUpdateBody;
  if (!body.themePreferences) {
    return NextResponse.json({ error: 'Theme preferences are required.' }, { status: 400 });
  }

  const themePreferences = normalizeThemePreferences(body.themePreferences);
  await saveUserThemePreferences(session.userId, themePreferences);

  const response = NextResponse.json({
    success: true,
    user: {
      id: session.userId,
      username: session.username,
      role: session.role,
      effectiveRole: session.effectiveRole,
      assumedRole: session.assumedRole,
      themePreferences,
      permissions: session.permissions,
      basePermissions: getRolePermissions(session.role),
      canOverrideSessionRole: session.role === 'superadmin',
    },
  });

  applyThemePreferencesCookie(response, themePreferences);
  return response;
}
