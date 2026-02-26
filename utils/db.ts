import { Pool, QueryResult, QueryResultRow } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __alfabDbPool: Pool | undefined;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }
  return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
}

function isLocalDatabaseHost(connectionString: string): boolean {
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function sslModeFromConnectionString(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    return (parsed.searchParams.get('sslmode') || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function resolveUseSsl(connectionString: string): boolean {
  if (typeof process.env.DATABASE_SSL !== 'undefined') {
    return parseBoolean(process.env.DATABASE_SSL, false);
  }

  const sslMode = sslModeFromConnectionString(connectionString);
  if (sslMode === 'disable') {
    return false;
  }

  if (sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full') {
    return true;
  }

  if (isLocalDatabaseHost(connectionString)) {
    return false;
  }

  // Default to SSL for non-local hosts to satisfy managed PostgreSQL (RDS/Supabase).
  return true;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL');
  }

  const useSsl = resolveUseSsl(connectionString);
  const rejectUnauthorized = parseBoolean(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, false);

  return new Pool({
    connectionString,
    ssl: useSsl
      ? {
          rejectUnauthorized,
        }
      : undefined,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS || 10000),
  });
}

export function getDbPool(): Pool {
  if (!globalThis.__alfabDbPool) {
    globalThis.__alfabDbPool = createPool();
  }

  return globalThis.__alfabDbPool;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  const pool = getDbPool();
  return pool.query<T>(text, params);
}
