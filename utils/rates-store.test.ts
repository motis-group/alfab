// Checks a rates save is proved before it is announced. Run with `npm test`.
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { createRatesStore } from './rates-store';

interface Rates {
  perHour: number;
}

const merge = (saved: unknown): Rates => ({ perHour: 75, ...((saved as Rates | null) || {}) });

interface StubbedCall {
  table: string;
  action: string;
  values?: Record<string, unknown>;
}

/**
 * Answers the `/api/db` gateway in place of the network. `rows` is the table; a select reads it and
 * a write mutates it, so a stub that refuses to write behaves like the gateway refusing the table.
 */
function stubGateway(options: { rows: Map<string, { rates: unknown; updated_at: string }>; onWrite?: (call: StubbedCall) => void; selectErrorAfterWrite?: string }) {
  const calls: StubbedCall[] = [];
  let written = false;

  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const payload = JSON.parse(init.body) as { table: string; action: string; filters?: Array<{ value: unknown }>; values?: Record<string, unknown> };
    calls.push({ table: payload.table, action: payload.action, values: payload.values });

    if (payload.action === 'select') {
      if (written && options.selectErrorAfterWrite) {
        return { ok: false, status: 400, json: async () => ({ data: null, error: { message: options.selectErrorAfterWrite } }) };
      }
      const id = String(payload.filters?.[0]?.value ?? '');
      const row = options.rows.get(id);
      return { ok: true, status: 200, json: async () => ({ data: row ? [{ ...row }] : [], error: null }) };
    }

    written = true;
    options.onWrite?.({ table: payload.table, action: payload.action, values: payload.values });
    return { ok: true, status: 200, json: async () => ({ data: null, error: null }) };
  }) as unknown as typeof fetch;

  return calls;
}

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

test('a save that lands is read back and returned', async () => {
  const rows = new Map<string, { rates: unknown; updated_at: string }>([['default', { rates: { perHour: 75 }, updated_at: '2026-01-01T00:00:00Z' }]]);
  stubGateway({
    rows,
    onWrite: (call) => {
      if (call.action === 'update') {
        rows.set('default', { rates: call.values?.rates, updated_at: '2026-02-01T00:00:00Z' });
      }
    },
  });

  const loaded = await createRatesStore<Rates>('t', merge).saveAndReload({ perHour: 90 }, '2026-01-01T00:00:00Z');

  assert.equal(loaded.source, 'saved');
  assert.equal(loaded.rates.perHour, 90, 'what comes back is what the table holds, not what was sent');
  assert.equal(loaded.updatedAt, '2026-02-01T00:00:00Z');
});

test('a write the gateway swallows is reported, not announced as saved', async () => {
  // The awning rates behaved this way: the table was not registered with the gateway, so nothing
  // was written and the editor kept showing the defaults while saying the rates were saved.
  const rows = new Map<string, { rates: unknown; updated_at: string }>();
  stubGateway({ rows });

  await assert.rejects(() => createRatesStore<Rates>('t', merge).saveAndReload({ perHour: 90 }, null), /Save failed: no saved rates/);
});

test('a stamp that has not moved means the row was not touched', async () => {
  // Without the set_updated_at trigger the stamp never advances, so the archive row that keeps the
  // replaced prices is never written either.
  const rows = new Map<string, { rates: unknown; updated_at: string }>([['default', { rates: { perHour: 75 }, updated_at: '2026-01-01T00:00:00Z' }]]);
  stubGateway({
    rows,
    onWrite: (call) => {
      if (call.action === 'update') {
        rows.set('default', { rates: call.values?.rates, updated_at: '2026-01-01T00:00:00Z' });
      }
    },
  });

  await assert.rejects(() => createRatesStore<Rates>('t', merge).saveAndReload({ perHour: 90 }, '2026-01-01T00:00:00Z'), /stored rates did not change/);
});

test('a read that fails after the write says the save is not certain', async () => {
  // The write lands, then the read back fails. Nothing can be said about what the table holds, so
  // the save is not announced either way.
  const rows = new Map<string, { rates: unknown; updated_at: string }>([['default', { rates: { perHour: 75 }, updated_at: '2026-01-01T00:00:00Z' }]]);
  stubGateway({
    rows,
    selectErrorAfterWrite: 'connection reset',
    onWrite: (call) => rows.set('default', { rates: call.values?.rates, updated_at: '2026-02-01T00:00:00Z' }),
  });

  await assert.rejects(() => createRatesStore<Rates>('t', merge).saveAndReload({ perHour: 90 }, '2026-01-01T00:00:00Z'), /read-back failed: connection reset/);
});
