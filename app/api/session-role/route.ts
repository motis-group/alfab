import { NextResponse } from 'next/server';

import { getAppSession, setSessionRoleForCurrentSession } from '@utils/auth-session';
import { getRolePermissions, isAppRole } from '@utils/authz';

export const runtime = 'nodejs';

interface SessionRoleBody {
  role?: string;
}

export async function POST(request: Request) {
  const session = await getAppSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Only superadmin can override session role.' }, { status: 403 });
  }

  const body = ((await request.json().catch(() => ({}))) || {}) as SessionRoleBody;
  const requestedRole = body.role;

  if (!isAppRole(requestedRole)) {
    return NextResponse.json({ error: 'Invalid role override.' }, { status: 400 });
  }

  await setSessionRoleForCurrentSession(session.sessionId, session.role, requestedRole);

  const effectiveRole = requestedRole;

  return NextResponse.json({
    success: true,
    user: {
      ...session,
      assumedRole: requestedRole === 'superadmin' ? null : requestedRole,
      effectiveRole,
      permissions: getRolePermissions(effectiveRole),
    },
  });
}
