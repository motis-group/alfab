import { NextResponse } from 'next/server';

import { getAppSession } from '@utils/auth-session';
import { getRolePermissions } from '@utils/authz';

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
      permissions: session.permissions,
      basePermissions: getRolePermissions(session.role),
      canOverrideSessionRole: session.role === 'superadmin',
    },
  });
}
