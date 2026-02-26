import { Pool, PoolClient, QueryResult } from 'pg';

let pool: Pool | null = null;

function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_URL is not configured.');
  }
  return value;
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query<T = any>(text: string, values?: any[]): Promise<QueryResult<T>> {
  const instance = getPool();
  return instance.query<T>(text, values);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const instance = getPool();
  const client = await instance.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

