import { createHash } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { applySessionCookie, createAppSession } from '@utils/auth-session';
import { AppRole } from '@utils/authz';
import { getDbPool } from '@utils/db';
import { hashPassword } from '@utils/password';
import { applyThemePreferencesCookie, loadUserThemePreferences } from '@utils/theme-preferences-server';

export const runtime = 'nodejs';

interface InviteRow {
  id: string;
  email: string | null;
  role: string;
  expires_at: string;
  accepted_at: string | null;
}

interface AcceptInviteBody {
  token?: string;
  username?: string;
  password?: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sanitizeUsername(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

function normalizeInviteRole(role: string): AppRole {
  if (role === 'admin' || role === 'standard' || role === 'readonly') {
    return role;
  }

  return 'standard';
}

async function findInviteByToken(rawToken: string): Promise<InviteRow | null> {
  const tokenHash = hashToken(rawToken);
  const pool = getDbPool();

  const result = await pool.query<InviteRow>(
    `
      select id, email, role, expires_at, accepted_at
      from user_invites
      where token_hash = $1
      limit 1
    `,
    [tokenHash]
  );

  if (!result.rowCount) {
    return null;
  }

  return result.rows[0];
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';

  if (!token) {
    return NextResponse.json({ valid: false, error: 'Missing invite token.' }, { status: 400 });
  }

  const invite = await findInviteByToken(token);
  if (!invite) {
    return NextResponse.json({ valid: false, error: 'Invite link is invalid.' }, { status: 404 });
  }

  if (invite.accepted_at) {
    return NextResponse.json({ valid: false, error: 'Invite has already been used.' }, { status: 409 });
  }

  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ valid: false, error: 'Invite has expired.' }, { status: 410 });
  }

  return NextResponse.json({
    valid: true,
    invite: {
      email: invite.email,
      role: normalizeInviteRole(invite.role),
      expiresAt: invite.expires_at,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = ((await request.json().catch(() => ({}))) || {}) as AcceptInviteBody;

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const username = sanitizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!token) {
    return NextResponse.json({ error: 'Invite token is required.' }, { status: 400 });
  }

  if (username.length < 3) {
    return NextResponse.json({ error: 'Username must be at least 3 characters.' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const tokenHash = hashToken(token);
  const passwordHash = hashPassword(password);

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query('begin');

    const inviteResult = await client.query<InviteRow>(
      `
        select id, email, role, expires_at, accepted_at
        from user_invites
        where token_hash = $1
        for update
      `,
      [tokenHash]
    );

    if (!inviteResult.rowCount) {
      await client.query('rollback');
      return NextResponse.json({ error: 'Invite link is invalid.' }, { status: 404 });
    }

    const invite = inviteResult.rows[0];

    if (invite.accepted_at) {
      await client.query('rollback');
      return NextResponse.json({ error: 'Invite has already been used.' }, { status: 409 });
    }

    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      await client.query('rollback');
      return NextResponse.json({ error: 'Invite has expired.' }, { status: 410 });
    }

    const existingUser = await client.query<{ id: string }>('select id from users where lower(username) = $1 limit 1', [username]);
    if (existingUser.rowCount) {
      await client.query('rollback');
      return NextResponse.json({ error: 'Username is already in use.' }, { status: 409 });
    }

    const role = normalizeInviteRole(invite.role);

    const userResult = await client.query<{ id: string; username: string; role: string }>(
      `
        insert into users (username, password_hash, role, is_active)
        values ($1, $2, $3, true)
        returning id, username, role
      `,
      [username, passwordHash, role]
    );

    const createdUser = userResult.rows[0];

    await client.query('update user_invites set accepted_at = now(), accepted_user_id = $1 where id = $2', [createdUser.id, invite.id]);

    await client.query('commit');

    const sessionToken = await createAppSession(createdUser.id);
    const themePreferences = await loadUserThemePreferences(createdUser.id);
    const response = NextResponse.json({
      success: true,
      user: {
        id: createdUser.id,
        username: createdUser.username,
        role,
        themePreferences,
      },
    });

    applySessionCookie(response, sessionToken);
    applyThemePreferencesCookie(response, themePreferences);

    return response;
  } catch (error: any) {
    await client.query('rollback').catch(() => {
      // Ignore rollback errors.
    });

    return NextResponse.json(
      {
        error: error?.message || 'Unable to accept invite.',
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
