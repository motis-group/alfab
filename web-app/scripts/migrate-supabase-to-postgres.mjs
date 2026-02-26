#!/usr/bin/env node

import { Pool } from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL and/or SUPABASE_ANON_KEY.');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL.');
  process.exit(1);
}

const TABLES = ['quotes', 'product_categories', 'products', 'customers', 'customer_products', 'purchase_orders', 'purchase_order_lines'];
const PAGE_SIZE = 1000;

function quoteIdent(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function fetchSupabaseTable(table) {
  const rows = [];
  let offset = 0;

  while (true) {
    const end = offset + PAGE_SIZE - 1;
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Range-Unit': 'items',
        Range: `${offset}-${end}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase fetch failed for ${table}: ${response.status} ${body}`);
    }

    const chunk = await response.json();
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }

    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return rows;
}

async function upsertRows(pool, table, rows) {
  if (!rows.length) {
    console.log(`Table ${table}: no rows to migrate.`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const originalRow of rows) {
      const row = Object.fromEntries(Object.entries(originalRow).map(([key, value]) => [key, value === undefined ? null : value]));
      const columns = Object.keys(row);
      if (!columns.length) {
        continue;
      }

      const values = columns.map((column) => row[column]);
      const columnSql = columns.map(quoteIdent).join(', ');
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');

      if (columns.includes('id')) {
        const updateColumns = columns.filter((column) => column !== 'id');
        const updateSql = updateColumns.length ? ` ON CONFLICT ("id") DO UPDATE SET ${updateColumns.map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`).join(', ')}` : ' ON CONFLICT ("id") DO NOTHING';
        const sql = `INSERT INTO ${quoteIdent(table)} (${columnSql}) VALUES (${placeholders})${updateSql}`;
        await client.query(sql, values);
      } else {
        const sql = `INSERT INTO ${quoteIdent(table)} (${columnSql}) VALUES (${placeholders})`;
        await client.query(sql, values);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log(`Table ${table}: migrated ${rows.length} row(s).`);
}

async function run() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });

  try {
    for (const table of TABLES) {
      const rows = await fetchSupabaseTable(table);
      await upsertRows(pool, table, rows);
    }
    console.log('Migration complete.');
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

