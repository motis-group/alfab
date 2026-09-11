/**
 * What the shop needs to look at, counted from the orders and quotes it already holds.
 *
 * The order list and the dashboard both report these, so they are computed here rather than twice.
 * Every function takes today's date rather than reading the clock, so a test can state the day.
 *
 * Keep this module free of browser and React imports: utils/order-metrics.test.ts runs it under tsx.
 */

import { OrderStatus, PurchaseOrder, localISODate } from '@utils/order-management';
import { QuoteRecord } from '@utils/quote-register';
import { QuoteStatus } from '@utils/quote-status';

/** A date column as `YYYY-MM-DD`, or empty when the column holds nothing usable. */
function dateOnly(value?: string | null): string {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : '';
}

/** An order nobody is waiting on any more. */
function isFinished(status: OrderStatus): boolean {
  return status === 'fulfilled' || status === 'cancelled';
}

/**
 * Past its required date and not finished. An order with no required date is not overdue: nobody
 * ever said when it was wanted.
 */
export function overdueOrders(orders: PurchaseOrder[], today: string): PurchaseOrder[] {
  return orders.filter((order) => {
    const requiredDate = dateOnly(order.required_date);
    return Boolean(requiredDate) && !isFinished(order.status) && (requiredDate as string) < today;
  });
}

/** Due from today up to and including `days` ahead. Overdue orders are not included; they are past. */
export function ordersDueWithin(orders: PurchaseOrder[], today: string, days: number): PurchaseOrder[] {
  const limit = new Date(`${today}T00:00:00`);
  limit.setDate(limit.getDate() + days);
  const maxDate = localISODate(limit);

  return orders.filter((order) => {
    const requiredDate = dateOnly(order.required_date);
    if (!requiredDate || isFinished(order.status)) {
      return false;
    }
    return requiredDate >= today && requiredDate <= maxDate;
  });
}

export function ordersWithStatus(orders: PurchaseOrder[], status: OrderStatus): PurchaseOrder[] {
  return orders.filter((order) => order.status === status);
}

export interface CustomerOrderCount {
  customerId: string;
  name: string;
  count: number;
}

/** Open orders per customer, busiest first. */
export function openOrdersByCustomer(orders: PurchaseOrder[], nameFor: (customerId: string) => string): CustomerOrderCount[] {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (order.status === 'open') {
      counts.set(order.customer_id, (counts.get(order.customer_id) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([customerId, count]) => ({ customerId, count, name: nameFor(customerId) }));
}

/** The orders touched most recently, newest first. */
export function recentOrders(orders: PurchaseOrder[], limit: number): PurchaseOrder[] {
  return [...orders]
    .sort((a, b) => {
      const aDate = a.updated_at || a.created_at || a.received_date || '';
      const bDate = b.updated_at || b.created_at || b.received_date || '';
      return bDate.localeCompare(aDate);
    })
    .slice(0, limit);
}

export interface QuoteTally {
  counts: Record<QuoteStatus, number>;
  /** What the open quotes are worth. Won work is on an order; expired quotes are not coming back. */
  openValue: number;
}

export function tallyQuotes(quotes: QuoteRecord[]): QuoteTally {
  const counts: Record<QuoteStatus, number> = { open: 0, won: 0, expired: 0 };
  let openValue = 0;

  for (const quote of quotes) {
    counts[quote.status] += 1;
    if (quote.status === 'open') {
      openValue += quote.total;
    }
  }

  return { counts, openValue };
}
