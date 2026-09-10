#!/usr/bin/env node
// Every table the database gateway serves must exist in the database, and every rates table must
// carry the trigger its archive ids are built from. Run against a database with docs/*.sql applied.
//
//   DATABASE_URL=postgres://... node scripts/check-schema-tables.mjs
//
// CI runs this against a throwaway Postgres.

import pg from 'pg';
import { execFileSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}

// The registries are TypeScript, so they are read through tsx rather than duplicated here.
const registries = JSON.parse(
  execFileSync('npx', ['tsx', '-e', `
    import { TABLE_COLUMNS, TABLE_PERMISSIONS, NATURAL_KEY_TABLES, AUDITED_TABLES } from './utils/db-tables';
    process.stdout.write(JSON.stringify({
      tables: Object.keys(TABLE_COLUMNS),
      permissioned: Object.keys(TABLE_PERMISSIONS),
      columns: Object.fromEntries(Object.entries(TABLE_COLUMNS).map(([t, c]) => [t, [...c]])),
      naturalKey: [...NATURAL_KEY_TABLES],
      audited: Object.keys(AUDITED_TABLES),
    }));
  `], { encoding: 'utf8' })
);

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const failures = [];

const { rows: existing } = await client.query(
  `select table_name from information_schema.tables where table_schema = 'public'`
);
const present = new Set(existing.map((row) => row.table_name));

for (const table of registries.tables) {
  if (!present.has(table)) {
    failures.push(`${table} is served by /api/db but does not exist in the database.`);
    continue;
  }

  const { rows: cols } = await client.query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table]
  );
  const actual = new Set(cols.map((row) => row.column_name));
  for (const column of registries.columns[table]) {
    if (!actual.has(column)) {
      failures.push(`${table}.${column} is allowed by the gateway but is not a column on the table.`);
    }
  }
}

// A column that exists but is not on the gateway's list is refused on every write, silently: the
// feature that writes it appears to work and saves nothing. Quote outcomes and recorded line minutes
// both shipped that way. Nothing is legitimately refused today, so anything here is a defect until
// someone adds it to SERVER_MANAGED_COLUMNS with a reason.
const SERVER_MANAGED_COLUMNS = {};

for (const table of registries.tables) {
  if (!present.has(table)) {
    continue;
  }
  const { rows } = await client.query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table]
  );
  const exempt = SERVER_MANAGED_COLUMNS[table] || [];
  for (const row of rows) {
    if (!registries.columns[table].includes(row.column_name) && !exempt.includes(row.column_name)) {
      failures.push(`${table}.${row.column_name} exists but the gateway refuses it, so any write of it fails.`);
    }
  }
}

// The rates stores build an archive id from updated_at. Without the trigger the stamp never moves,
// the second save collides on that id, and every save after the first archives nothing.
for (const table of registries.tables.filter((name) => name.endsWith('_costing_rates'))) {
  if (!present.has(table)) {
    continue;
  }
  const { rows } = await client.query(
    `select tgname from pg_trigger where tgrelid = $1::regclass and not tgisinternal`,
    [table]
  );
  if (!rows.some((row) => row.tgname.includes('updated_at'))) {
    failures.push(`${table} has no set_updated_at trigger, so saving it would stop archiving after the first write.`);
  }
}

await client.end();

if (failures.length) {
  console.error('Schema does not match what the gateway serves:\n');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`Schema matches the gateway: ${registries.tables.length} tables, columns and rates triggers all present.`);
