// Checks the database gateway's table registries agree with each other. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AUDITED_TABLES, NATURAL_KEY_TABLES, TABLE_COLUMNS, TABLE_PERMISSIONS } from './db-tables';

/**
 * A table reachable through the gateway has to be in both TABLE_COLUMNS and TABLE_PERMISSIONS. A
 * table in only one is refused on every read and every write, which the user sees as an editor that
 * shows the defaults and a save that does nothing. The awning rates shipped that way: they reached
 * NATURAL_KEY_TABLES and AUDITED_TABLES and neither of these two.
 */
test('every table the gateway serves has both columns and permissions', () => {
  assert.deepEqual(Object.keys(TABLE_COLUMNS).sort(), Object.keys(TABLE_PERMISSIONS).sort(), 'a table listed in one registry and not the other is unreachable');
});

test('a table with a natural key or audit columns is a table the gateway can reach', () => {
  for (const table of Array.from(NATURAL_KEY_TABLES)) {
    assert.ok(TABLE_COLUMNS[table], `${table} has a natural key but no column list`);
    assert.ok(TABLE_PERMISSIONS[table], `${table} has a natural key but no permissions`);
  }
  for (const table of Object.keys(AUDITED_TABLES)) {
    assert.ok(TABLE_COLUMNS[table], `${table} is audited but has no column list`);
    assert.ok(TABLE_PERMISSIONS[table], `${table} is audited but has no permissions`);
  }
});

test('a table that carries audit columns allows writing them', () => {
  for (const [table, audit] of Object.entries(AUDITED_TABLES)) {
    assert.ok(TABLE_COLUMNS[table].has('updated_by'), `${table} is stamped with updated_by, so the column has to be allowed`);
    if (audit.createdBy) {
      assert.ok(TABLE_COLUMNS[table].has('created_by'), `${table} is stamped with created_by, so the column has to be allowed`);
    }
  }
});

test('a table with a natural key allows the id its client chooses', () => {
  for (const table of Array.from(NATURAL_KEY_TABLES)) {
    assert.ok(TABLE_COLUMNS[table].has('id'), `${table} is inserted with a chosen id, so "id" has to be allowed`);
  }
});

test('the three rates tables are all reachable, and priced by the same permission', () => {
  for (const table of ['window_costing_rates', 'glass_costing_rates', 'awning_costing_rates']) {
    assert.ok(TABLE_COLUMNS[table]?.has('rates'), `${table} stores its document in "rates"`);
    assert.deepEqual(TABLE_PERMISSIONS[table], { read: 'pricing:read', write: 'pricing:write' }, `${table} is a price list, so it is gated on pricing`);
  }
});
