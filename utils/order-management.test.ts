// Checks which orders may be deleted. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OrderStatus, orderDeleteRefusal } from './order-management';

const order = (status: OrderStatus) => ({ po_number: 'PO-1001', status });
const line = (quantity_fulfilled: number | null = 0, actual_minutes: number | string | null = null) => ({ quantity_fulfilled, actual_minutes });

test('an open or cancelled order with nothing recorded can be deleted', () => {
  assert.equal(orderDeleteRefusal(order('open'), [line(), line()]), null);
  assert.equal(orderDeleteRefusal(order('cancelled'), [line()]), null);
  assert.equal(orderDeleteRefusal(order('open'), []), null, 'an order with no lines holds nothing');
});

test('an order in production or fulfilled is archived instead', () => {
  assert.match(orderDeleteRefusal(order('in_production'), [line()]) || '', /PO-1001 is in production, so it can only be archived/);
  assert.match(orderDeleteRefusal(order('fulfilled'), [line()]) || '', /only be archived/);
});

test('any quantity made or minutes recorded keeps an order from being deleted', () => {
  assert.match(orderDeleteRefusal(order('open'), [line(), line(2)]) || '', /work recorded/);
  assert.match(orderDeleteRefusal(order('cancelled'), [line(0, '45.00')]) || '', /work recorded/, 'numeric columns arrive as strings');
  assert.match(orderDeleteRefusal(order('open'), [line(0, 0)]) || '', /work recorded/, 'zero minutes is still a recorded value');
  assert.equal(orderDeleteRefusal(order('open'), [line(null, '')]), null, 'an empty field records nothing');
});
