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

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL');
  }

  const useSsl = parseBoolean(process.env.DATABASE_SSL, false);
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
