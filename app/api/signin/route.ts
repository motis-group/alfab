import { NextRequest, NextResponse } from 'next/server';

import { applySessionCookie, createAppSession } from '@utils/auth-session';
import { normalizeAppRole } from '@utils/authz';
import { dbQuery } from '@utils/db';
import { hashPassword, verifyPassword } from '@utils/password';
import { applyThemePreferencesCookie, loadUserThemePreferences } from '@utils/theme-preferences-server';

export const runtime = 'nodejs';

interface SignInBody {
  username?: string;
  password?: string;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  is_active: boolean;
}

function baseHeaders(): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  });
}

function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9._-]/g, '');
}

async function ensureBootstrapSuperadmin(username: string): Promise<UserRow> {
  const existing = await dbQuery<UserRow>('select id, username, password_hash, role, is_active from users where lower(username) = $1 limit 1', [username]);

  if (existing.rowCount) {
    const current = existing.rows[0];
    if (current.role !== 'superadmin' || current.is_active === false) {
      const updated = await dbQuery<UserRow>(
        `
          update users
          set role = 'superadmin',
              is_active = true
          where id = $1
          returning id, username, password_hash, role, is_active
        `,
        [current.id]
      );
      return updated.rows[0];
    }

    return current;
  }

  const inserted = await dbQuery<UserRow>(
    `
      insert into users (username, password_hash, role, is_active)
      values ($1, $2, 'superadmin', true)
      returning id, username, password_hash, role, is_active
    `,
    [username, 'admin-password-bootstrap']
  );

  return inserted.rows[0];
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: baseHeaders(),
  });
}

export async function POST(request: NextRequest) {
  const headers = baseHeaders();

  try {
    const body = ((await request.json().catch(() => ({}))) || {}) as SignInBody;
    const username = normalizeUsername(body.username);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!password) {
      return new NextResponse(JSON.stringify({ error: 'Password is required.' }), {
        status: 400,
        headers,
      });
    }

    const adminPassword = process.env.ADMIN_PASSWORD || '';
    const bootstrapUsername = normalizeUsername(process.env.SUPERADMIN_USERNAME || 'superadmin') || 'superadmin';

    let user: UserRow | null = null;

    if (adminPassword && password === adminPassword) {
      user = await ensureBootstrapSuperadmin(bootstrapUsername);
    } else {
      if (!username) {
        return new NextResponse(JSON.stringify({ error: 'Username is required.' }), {
          status: 400,
          headers,
        });
      }

      const result = await dbQuery<UserRow>('select id, username, password_hash, role, is_active from users where lower(username) = $1 limit 1', [username]);
      user = result.rowCount ? result.rows[0] : null;

      if (!user || user.is_active === false || !verifyPassword(password, user.password_hash)) {
        return new NextResponse(JSON.stringify({ error: 'Invalid username or password.' }), {
          status: 401,
          headers,
        });
      }

      if (!user.password_hash.startsWith('scrypt$')) {
        const upgradedHash = hashPassword(password);
        await dbQuery('update users set password_hash = $1 where id = $2', [upgradedHash, user.id]);
      }
    }

    if (!user) {
      return new NextResponse(JSON.stringify({ error: 'Unable to sign in.' }), {
        status: 401,
        headers,
      });
    }

    const token = await createAppSession(user.id);
    const themePreferences = await loadUserThemePreferences(user.id);
    const response = new NextResponse(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: normalizeAppRole(user.role, 'readonly'),
          themePreferences,
        },
      }),
      {
        status: 200,
        headers,
      }
    );

    applySessionCookie(response, token);
    applyThemePreferencesCookie(response, themePreferences);

    return response;
  } catch (error: any) {
    return new NextResponse(
      JSON.stringify({
        error: error?.message || 'Sign in failed.',
      }),
      {
        status: 500,
        headers,
      }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST to sign in.' }, { status: 405 });
}
