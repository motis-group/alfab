// Checks the counts the dashboard and the order list both report. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PurchaseOrder } from './order-management';
import { QuoteRecord } from './quote-register';
import { openOrdersByCustomer, ordersDueWithin, ordersWithStatus, overdueOrders, recentOrders, tallyQuotes } from './order-metrics';

const TODAY = '2026-09-10';

function order(over: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return { id: 'o1', customer_id: 'c1', po_number: 'PO-1', received_date: '2026-09-01', required_date: '2026-09-20', status: 'open', ...over } as PurchaseOrder;
}

test('an order past its required date and not finished is overdue', () => {
  const late = order({ id: 'late', required_date: '2026-09-09' });
  const today = order({ id: 'today', required_date: TODAY });
  const done = order({ id: 'done', required_date: '2026-09-01', status: 'fulfilled' });
  const cancelled = order({ id: 'cancelled', required_date: '2026-09-01', status: 'cancelled' });

  assert.deepEqual(
    overdueOrders([late, today, done, cancelled], TODAY).map((entry) => entry.id),
    ['late'],
    'due today is not late, and nobody waits on a finished order'
  );
});

test('an order with no required date is never overdue: nobody said when it was wanted', () => {
  assert.deepEqual(overdueOrders([order({ required_date: null })], TODAY), []);
  assert.deepEqual(overdueOrders([order({ required_date: '' })], TODAY), []);
});

test('due within seven days counts from today and excludes what is already late', () => {
  const orders = [
    order({ id: 'yesterday', required_date: '2026-09-09' }),
    order({ id: 'today', required_date: TODAY }),
    order({ id: 'seventh', required_date: '2026-09-17' }),
    order({ id: 'eighth', required_date: '2026-09-18' }),
  ];

  assert.deepEqual(
    ordersDueWithin(orders, TODAY, 7).map((entry) => entry.id),
    ['today', 'seventh'],
    'the seventh day is inside the window, the eighth is not'
  );
});

test('a timestamp in a date column is read as its calendar date', () => {
  assert.deepEqual(overdueOrders([order({ required_date: '2026-09-09T23:59:00Z' })], TODAY).length, 1);
});

test('open orders are counted per customer, busiest first', () => {
  const orders = [
    order({ id: '1', customer_id: 'c1' }),
    order({ id: '2', customer_id: 'c2' }),
    order({ id: '3', customer_id: 'c2' }),
    order({ id: '4', customer_id: 'c3', status: 'fulfilled' }),
  ];

  assert.deepEqual(
    openOrdersByCustomer(orders, (id) => `Customer ${id}`),
    [
      { customerId: 'c2', count: 2, name: 'Customer c2' },
      { customerId: 'c1', count: 1, name: 'Customer c1' },
    ],
    'a fulfilled order is not open'
  );
});

test('recent orders are newest first, by whichever stamp the row carries', () => {
  const orders = [
    order({ id: 'old', updated_at: '2026-09-01T00:00:00Z' } as Partial<PurchaseOrder>),
    order({ id: 'new', updated_at: '2026-09-09T00:00:00Z' } as Partial<PurchaseOrder>),
    order({ id: 'received-only', updated_at: undefined, created_at: undefined, received_date: '2026-09-05' } as Partial<PurchaseOrder>),
  ];

  assert.deepEqual(
    recentOrders(orders, 2).map((entry) => entry.id),
    ['new', 'received-only']
  );
});

test('orders are counted by status', () => {
  const orders = [order({ id: '1' }), order({ id: '2', status: 'in_production' }), order({ id: '3', status: 'in_production' })];

  assert.equal(ordersWithStatus(orders, 'open').length, 1);
  assert.equal(ordersWithStatus(orders, 'in_production').length, 2);
});

test('only open quotes count towards the value still in play', () => {
  const quotes = [
    { status: 'open', total: 100 },
    { status: 'open', total: 250 },
    { status: 'won', total: 900 },
    { status: 'lost', total: 400 },
  ] as QuoteRecord[];

  const tally = tallyQuotes(quotes);

  assert.deepEqual(tally.counts, { open: 2, won: 1, lost: 1, expired: 0 });
  assert.equal(tally.openValue, 350, 'won work is on an order; lost work is not coming back');
});
