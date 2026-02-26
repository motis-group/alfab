import { createHash, randomBytes } from 'crypto';

import { NextResponse } from 'next/server';

import { getAppSession } from '@utils/auth-session';
import { AppRole, isAppRole } from '@utils/authz';
import { dbQuery } from '@utils/db';

export const runtime = 'nodejs';

interface InviteRow {
  id: string;
  email: string | null;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  invited_by: string;
  invited_by_username: string | null;
  accepted_user_id: string | null;
}

interface CreateInviteBody {
  email?: string;
  role?: AppRole;
  expiresHours?: number;
}

function canInvite(baseRole: string, effectiveRole: string): boolean {
  return baseRole === 'superadmin' || effectiveRole === 'superadmin' || effectiveRole === 'admin';
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized.length) {
    return null;
  }

  return normalized;
}

function resolveOrigin(request: Request): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (fromEnv.length) {
    return fromEnv.replace(/\/$/, '');
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canInvite(session.role, session.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params: unknown[] = [];
  let whereSql = '';

  if (session.role !== 'superadmin') {
    params.push(session.userId);
    whereSql = `where i.invited_by = $${params.length}`;
  }

  const result = await dbQuery<InviteRow>(
    `
      select
        i.id,
        i.email,
        i.role,
        i.expires_at,
        i.accepted_at,
        i.created_at,
        i.invited_by,
        i.accepted_user_id,
        u.username as invited_by_username
      from user_invites i
      left join users u on u.id = i.invited_by
      ${whereSql}
      order by i.created_at desc
      limit 200
    `,
    params
  );

  return NextResponse.json({ invites: result.rows });
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canInvite(session.role, session.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = ((await request.json().catch(() => ({}))) || {}) as CreateInviteBody;
  const email = normalizeEmail(body.email);

  const inviteRole: AppRole = (() => {
    if (session.role !== 'superadmin') {
      return 'standard';
    }

    if (isAppRole(body.role) && body.role !== 'superadmin') {
      return body.role;
    }

    return 'standard';
  })();

  const expiresHours = Number(body.expiresHours);
  const safeExpiresHours = Number.isFinite(expiresHours) ? Math.min(168, Math.max(1, Math.round(expiresHours))) : 72;

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  const result = await dbQuery<InviteRow>(
    `
      insert into user_invites (token_hash, email, role, invited_by, expires_at)
      values ($1, $2, $3, $4, now() + ($5 || ' hours')::interval)
      returning id, email, role, expires_at, accepted_at, created_at, invited_by, accepted_user_id, null::text as invited_by_username
    `,
    [tokenHash, email, inviteRole, session.userId, String(safeExpiresHours)]
  );

  const origin = resolveOrigin(request);
  const inviteUrl = `${origin}/join?token=${rawToken}`;

  return NextResponse.json({
    success: true,
    inviteUrl,
    invite: result.rows[0],
  });
}
