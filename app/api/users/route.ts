import { NextResponse } from 'next/server';

import { getAppSession } from '@utils/auth-session';
import { AppRole, isAppRole } from '@utils/authz';
import { dbQuery } from '@utils/db';
import { hashPassword } from '@utils/password';

export const runtime = 'nodejs';

interface UserRow {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface CreateUserBody {
  username?: string;
  password?: string;
  role?: AppRole;
  isActive?: boolean;
}

interface UpdateUserBody {
  id?: string;
  username?: string;
  password?: string;
  role?: AppRole;
  isActive?: boolean;
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

function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8;
}

async function requireSuperadmin() {
  const session = await getAppSession();
  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (session.role !== 'superadmin') {
    return {
      session,
      response: NextResponse.json({ error: 'Only superadmin can manage users and roles.' }, { status: 403 }),
    };
  }

  return {
    session,
    response: null,
  };
}

export async function GET() {
  const { response } = await requireSuperadmin();
  if (response) {
    return response;
  }

  const result = await dbQuery<UserRow>(
    `
      select id, username, role, is_active, created_at
      from users
      order by created_at asc
    `
  );

  return NextResponse.json({
    users: result.rows,
  });
}

export async function POST(request: Request) {
  const { response } = await requireSuperadmin();
  if (response) {
    return response;
  }

  const body = ((await request.json().catch(() => ({}))) || {}) as CreateUserBody;
  const username = sanitizeUsername(body.username);
  const role: AppRole = isAppRole(body.role) ? body.role : 'standard';
  const isActive = typeof body.isActive === 'boolean' ? body.isActive : true;

  if (username.length < 3) {
    return NextResponse.json({ error: 'Username must be at least 3 characters.' }, { status: 400 });
  }

  if (!validPassword(body.password)) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const existing = await dbQuery<{ id: string }>('select id from users where lower(username) = $1 limit 1', [username]);
  if (existing.rowCount) {
    return NextResponse.json({ error: 'Username already exists.' }, { status: 409 });
  }

  const passwordHash = hashPassword(body.password);
  const result = await dbQuery<UserRow>(
    `
      insert into users (username, password_hash, role, is_active)
      values ($1, $2, $3, $4)
      returning id, username, role, is_active, created_at
    `,
    [username, passwordHash, role, isActive]
  );

  return NextResponse.json({
    success: true,
    user: result.rows[0],
  });
}

export async function PATCH(request: Request) {
  const { response, session } = await requireSuperadmin();
  if (response || !session) {
    return response;
  }

  const body = ((await request.json().catch(() => ({}))) || {}) as UpdateUserBody;
  const targetId = typeof body.id === 'string' ? body.id : '';

  if (!targetId) {
    return NextResponse.json({ error: 'User id is required.' }, { status: 400 });
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (typeof body.username !== 'undefined') {
    const username = sanitizeUsername(body.username);
    if (username.length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters.' }, { status: 400 });
    }
    params.push(username);
    updates.push(`username = $${params.length}`);
  }

  if (typeof body.role !== 'undefined') {
    if (!isAppRole(body.role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }

    if (targetId === session.userId && body.role !== 'superadmin') {
      return NextResponse.json({ error: 'You cannot remove your own superadmin role.' }, { status: 400 });
    }

    params.push(body.role);
    updates.push(`role = $${params.length}`);
  }

  if (typeof body.isActive !== 'undefined') {
    if (targetId === session.userId && body.isActive === false) {
      return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 400 });
    }

    params.push(Boolean(body.isActive));
    updates.push(`is_active = $${params.length}`);
  }

  if (typeof body.password !== 'undefined') {
    if (!validPassword(body.password)) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const passwordHash = hashPassword(body.password);
    params.push(passwordHash);
    updates.push(`password_hash = $${params.length}`);
  }

  if (!updates.length) {
    return NextResponse.json({ error: 'No updates supplied.' }, { status: 400 });
  }

  params.push(targetId);

  const result = await dbQuery<UserRow>(
    `
      update users
      set ${updates.join(', ')}
      where id = $${params.length}
      returning id, username, role, is_active, created_at
    `,
    params
  );

  if (!result.rowCount) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    user: result.rows[0],
  });
}
