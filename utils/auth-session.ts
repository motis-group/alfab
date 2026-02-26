import { createHash, randomBytes } from 'crypto';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { AppPermission, AppRole, getRolePermissions, isAppRole, normalizeAppRole, roleHasPermission } from '@utils/authz';
import { dbQuery } from '@utils/db';

const SESSION_COOKIE = 'session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface RawSessionRow {
  session_id: string;
  user_id: string;
  username: string;
  role: string;
  is_active: boolean;
  assumed_role?: string | null;
  expires_at: string;
}

export interface AppSession {
  sessionId: string;
  userId: string;
  username: string;
  role: AppRole;
  effectiveRole: AppRole;
  assumedRole: AppRole | null;
  permissions: AppPermission[];
  expiresAt: string;
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function readSessionTokenFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || token.length < 16) {
    return null;
  }
  return token;
}

function mapRawSession(row: RawSessionRow): AppSession {
  const role = normalizeAppRole(row.role, 'readonly');
  const assumedRole = role === 'superadmin' && row.assumed_role && isAppRole(row.assumed_role) ? row.assumed_role : null;
  const effectiveRole = assumedRole || role;

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    username: row.username,
    role,
    effectiveRole,
    assumedRole,
    permissions: getRolePermissions(effectiveRole),
    expiresAt: row.expires_at,
  };
}

async function loadSessionByToken(sessionToken: string): Promise<AppSession | null> {
  const tokenHash = hashSessionToken(sessionToken);

  let result;

  try {
    result = await dbQuery<RawSessionRow>(
      `
        select
          s.id as session_id,
          s.user_id,
          s.assumed_role,
          s.expires_at,
          u.username,
          u.role,
          u.is_active
        from auth_sessions s
        join users u on u.id = s.user_id
        where s.token_hash = $1
          and s.expires_at > now()
        limit 1
      `,
      [tokenHash]
    );
  } catch (error: any) {
    // Backward compatibility for pre-migration schemas without auth_sessions.assumed_role.
    if (error?.code !== '42703' || !String(error?.message || '').includes('assumed_role')) {
      throw error;
    }

    result = await dbQuery<RawSessionRow>(
      `
        select
          s.id as session_id,
          s.user_id,
          null::text as assumed_role,
          s.expires_at,
          u.username,
          u.role,
          u.is_active
        from auth_sessions s
        join users u on u.id = s.user_id
        where s.token_hash = $1
          and s.expires_at > now()
        limit 1
      `,
      [tokenHash]
    );
  }

  if (!result.rowCount) {
    return null;
  }

  const row = result.rows[0];
  if (!row || row.is_active === false) {
    await dbQuery('delete from auth_sessions where token_hash = $1', [tokenHash]);
    return null;
  }

  const mapped = mapRawSession(row);

  // Keep session fresh for audit/troubleshooting without changing expiry.
  await dbQuery('update auth_sessions set last_seen_at = now() where id = $1', [mapped.sessionId]).catch(() => {
    // Ignore if schema is old and column does not exist.
  });

  return mapped;
}

export async function getAppSession(): Promise<AppSession | null> {
  try {
    const sessionToken = await readSessionTokenFromCookie();
    if (!sessionToken) {
      return null;
    }

    return await loadSessionByToken(sessionToken);
  } catch {
    return null;
  }
}

export async function hasAppSession(): Promise<boolean> {
  const session = await getAppSession();
  return Boolean(session);
}

export async function requireAppSession(): Promise<AppSession> {
  const session = await getAppSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function requireSessionPermission(permission: AppPermission): Promise<AppSession> {
  const session = await requireAppSession();
  if (!roleHasPermission(session.effectiveRole, permission)) {
    throw new Error('Forbidden');
  }
  return session;
}

export function userHasPermission(session: AppSession, permission: AppPermission): boolean {
  return roleHasPermission(session.effectiveRole, permission);
}

export async function createAppSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);

  await dbQuery(
    `
      insert into auth_sessions (user_id, token_hash, expires_at)
      values ($1, $2, now() + interval '7 days')
    `,
    [userId, tokenHash]
  );

  return token;
}

export async function revokeAppSessionByToken(sessionToken: string | null | undefined): Promise<void> {
  if (!sessionToken) {
    return;
  }

  const tokenHash = hashSessionToken(sessionToken);
  await dbQuery('delete from auth_sessions where token_hash = $1', [tokenHash]);
}

export async function setSessionRoleForCurrentSession(sessionId: string, sessionUserRole: AppRole, requestedRole: AppRole): Promise<void> {
  if (sessionUserRole !== 'superadmin') {
    throw new Error('Only superadmin can override session role');
  }

  const assumedRole = requestedRole === 'superadmin' ? null : requestedRole;
  await dbQuery('update auth_sessions set assumed_role = $1 where id = $2', [assumedRole, sessionId]);
}

export function applySessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
}
