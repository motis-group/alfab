'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { APP_NAVIGATION_ITEMS } from '@utils/app-navigation';
import {
  Customer,
  ORDER_STATUS_OPTIONS,
  OrderStatus,
  PurchaseOrder,
  PurchaseOrderLine,
  UserRole,
  calculateOrderTotal,
  formatCurrency,
  statusLabel,
  todayISODate,
} from '@utils/order-management';
import { createClient } from '@utils/db-client';
import { fetchCurrentSessionUser } from '@utils/session-client';

const TABLE_CUSTOMERS = 'customers';
const TABLE_PURCHASE_ORDERS = 'purchase_orders';
const TABLE_PURCHASE_ORDER_LINES = 'purchase_order_lines';

const navigationItems = APP_NAVIGATION_ITEMS;

type ArchiveFilter = 'active' | 'all' | 'archived';

function normalizeDateValue(value?: string | null): string {
  if (!value) {
    return '';
  }

  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  const isoPrefixMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefixMatch) {
    return isoPrefixMatch[1];
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toISOString().slice(0, 10);
}

function displayDate(value?: string | null): string {
  const normalized = normalizeDateValue(value);
  return normalized || '—';
}

function orderDateInRange(order: PurchaseOrder, dateFrom: string, dateTo: string): boolean {
  const orderDate = normalizeDateValue(order.received_date);
  if (dateFrom && orderDate < dateFrom) {
    return false;
  }
  if (dateTo && orderDate > dateTo) {
    return false;
  }
  return true;
}

function orderStatusClassName(status: OrderStatus): string {
  switch (status) {
    case 'fulfilled':
      return 'status-pill status-pill-success';
    case 'cancelled':
      return 'status-pill status-pill-error';
    default:
      return 'status-pill status-pill-warning';
  }
}

function isOrderArchived(order: PurchaseOrder): boolean {
  return Boolean(order.archived_at);
}

function matchesArchiveFilter(order: PurchaseOrder, filter: ArchiveFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'archived') {
    return isOrderArchived(order);
  }

  return !isOrderArchived(order);
}

export default function OrderDashboardPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('readonly');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [orderLines, setOrderLines] = useState<PurchaseOrderLine[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [customerFilter, setCustomerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');

  const customerMap = useMemo(() => {
    const map: Record<string, Customer> = {};
    customers.forEach((customer) => {
      map[customer.id] = customer;
    });
    return map;
  }, [customers]);

  const linesByOrder = useMemo(() => {
    const map: Record<string, PurchaseOrderLine[]> = {};
    orderLines.forEach((line) => {
      if (!map[line.purchase_order_id]) {
        map[line.purchase_order_id] = [];
      }
      map[line.purchase_order_id].push(line);
    });
    return map;
  }, [orderLines]);

  const activeCustomers = useMemo(() => customers.filter((customer) => customer.is_active !== false), [customers]);

  const ordersInScope = useMemo(() => orders.filter((order) => matchesArchiveFilter(order, archiveFilter)), [orders, archiveFilter]);

  const filteredOrders = useMemo(() => {
    return ordersInScope.filter((order) => {
      if (customerFilter && order.customer_id !== customerFilter) {
        return false;
      }
      if (statusFilter && order.status !== statusFilter) {
        return false;
      }
      if (!orderDateInRange(order, dateFromFilter, dateToFilter)) {
        return false;
      }
      return true;
    });
  }, [ordersInScope, customerFilter, statusFilter, dateFromFilter, dateToFilter]);

  const openOrdersByCustomer = useMemo(() => {
    const counts: Record<string, number> = {};
    ordersInScope.forEach((order) => {
      if (order.status !== 'open') {
        return;
      }
      counts[order.customer_id] = (counts[order.customer_id] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([customerId, count]) => ({
        customerId,
        count,
        name: customerMap[customerId]?.name || 'Unknown Customer',
      }));
  }, [ordersInScope, customerMap]);

  const dueInSevenDays = useMemo(() => {
    const today = todayISODate();
    const inSevenDays = new Date();
    inSevenDays.setDate(inSevenDays.getDate() + 7);
    const maxDate = inSevenDays.toISOString().split('T')[0];

    return ordersInScope.filter((order) => {
      const requiredDate = normalizeDateValue(order.required_date);
      if (!requiredDate) {
        return false;
      }
      if (order.status === 'fulfilled' || order.status === 'cancelled') {
        return false;
      }
      return requiredDate >= today && requiredDate <= maxDate;
    });
  }, [ordersInScope]);

  const recentOrders = useMemo(() => {
    return [...ordersInScope]
      .sort((a, b) => {
        const aDate = a.updated_at || a.created_at || a.received_date || '';
        const bDate = b.updated_at || b.created_at || b.received_date || '';
        return bDate.localeCompare(aDate);
      })
      .slice(0, 5);
  }, [ordersInScope]);

  async function loadData() {
    setIsLoading(true);
    setSchemaError(null);

    try {
      const db = createClient();
      const [customerRes, orderRes, lineRes] = await Promise.all([
        db.from(TABLE_CUSTOMERS).select('*').order('name', { ascending: true }),
        db.from(TABLE_PURCHASE_ORDERS).select('*').order('received_date', { ascending: false }),
        db.from(TABLE_PURCHASE_ORDER_LINES).select('*'),
      ]);

      if (customerRes.error) throw customerRes.error;
      if (orderRes.error) throw orderRes.error;
      if (lineRes.error) throw lineRes.error;

      setCustomers((customerRes.data as Customer[]) || []);
      setOrders((orderRes.data as PurchaseOrder[]) || []);
      setOrderLines((lineRes.data as PurchaseOrderLine[]) || []);
    } catch (error: any) {
      setSchemaError(error?.message || 'Unable to load order management tables.');
      setCustomers([]);
      setOrders([]);
      setOrderLines([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSessionUser() {
    const nextUser = await fetchCurrentSessionUser();
    if (!nextUser) {
      router.push('/login');
      return null;
    }

    setRole(nextUser.effectiveRole as UserRole);
    return nextUser;
  }

  useEffect(() => {
    (async () => {
      const nextUser = await loadSessionUser();
      if (!nextUser) {
        return;
      }

      await loadData();
    })();
  }, []);

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navigationItems={navigationItems}
      navLabel="ORDER DASHBOARD"
      navRight={<ActionButton onClick={() => router.push('/doors/new')}>NEW ORDER</ActionButton>}
      heading="PURCHASE ORDER DASHBOARD"
      badge={`${ordersInScope.length} TOTAL`}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
          <Card title="ORDER DASHBOARD">
            <RowSpaceBetween>
              <Text>OPEN ORDERS</Text>
              <Text>
                <span className="status-warning">{ordersInScope.filter((order) => order.status === 'open').length}</span>
              </Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>IN PRODUCTION</Text>
              <Text>
                <span className="status-warning">{ordersInScope.filter((order) => order.status === 'in_production').length}</span>
              </Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>DUE WITHIN 7 DAYS</Text>
              <Text>
                <span className="status-warning">{dueInSevenDays.length}</span>
              </Text>
            </RowSpaceBetween>

            <br />
            <Text>OPEN ORDERS BY CUSTOMER</Text>
            <Table>
              <TableRow>
                <TableColumn style={{ width: '26ch' }}>CUSTOMER</TableColumn>
                <TableColumn>OPEN ORDERS</TableColumn>
              </TableRow>
              {openOrdersByCustomer.map((entry) => (
                <TableRow key={entry.customerId}>
                  <TableColumn>{entry.name}</TableColumn>
                  <TableColumn>{entry.count}</TableColumn>
                </TableRow>
              ))}
              {!openOrdersByCustomer.length && (
                <TableRow>
                  <TableColumn colSpan={2} style={{ textAlign: 'center' }}>
                    No open orders.
                  </TableColumn>
                </TableRow>
              )}
            </Table>

            <br />
            <Text>RECENT ORDERS</Text>
            <Table>
              <TableRow>
                <TableColumn style={{ width: '16ch' }}>PO</TableColumn>
                <TableColumn style={{ width: '22ch' }}>CUSTOMER</TableColumn>
                <TableColumn style={{ width: '16ch' }}>STATUS</TableColumn>
              </TableRow>
              {recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableColumn>{order.po_number}</TableColumn>
                  <TableColumn>{customerMap[order.customer_id]?.name || 'Unknown'}</TableColumn>
                  <TableColumn>
                    <>
                      <span className={orderStatusClassName(order.status)}>{statusLabel(order.status)}</span>
                      {isOrderArchived(order) ? <span className="status-pill status-pill-warning">ARCHIVED</span> : null}
                    </>
                  </TableColumn>
                </TableRow>
              ))}
            </Table>
          </Card>

          <Card title="ORDER LIST FILTERS">
            <Text>CUSTOMER</Text>
            <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
              <option value="">All customers</option>
              {activeCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <br />

            <Text>STATUS</Text>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OrderStatus | '')}>
              <option value="">All statuses</option>
              {ORDER_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
            <br />

            <Text>ARCHIVE</Text>
            <select value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value as ArchiveFilter)}>
              <option value="active">Active orders only</option>
              <option value="all">All orders</option>
              <option value="archived">Archived only</option>
            </select>
            <br />

            <Input label="RECEIVED DATE FROM" type="date" name="received_from" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} />
            <Input label="RECEIVED DATE TO" type="date" name="received_to" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} />
          </Card>
        </>
      }
      actionItems={[
        {
          hotkey: '⌘+N',
          body: 'New PO',
          onClick: () => router.push('/doors/new'),
        },
        {
          hotkey: '⌘+R',
          body: 'Reload Data',
          onClick: () => loadData(),
        },
        {
          hotkey: '⌘+C',
          body: 'Customers',
          onClick: () => router.push('/doors/clients'),
        },
      ]}
    >
      {schemaError && (
        <Card title="DATABASE ERROR">
          <Text>
            <span className="status-error">{schemaError}</span>
          </Text>
          <br />
          <Text>
            <span className="status-warning">Run `docs/order-management-schema.sql` on your AWS PostgreSQL database, then reload.</span>
          </Text>
        </Card>
      )}

      {formError && (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{formError}</span>
          </Text>
        </Card>
      )}

      <Card title="PURCHASE ORDERS">
        {isLoading ? (
          <Text>Loading order data...</Text>
        ) : (
          <Table>
            <TableRow>
              <TableColumn style={{ width: '16ch' }}>PO NUMBER</TableColumn>
              <TableColumn style={{ width: '24ch' }}>CUSTOMER</TableColumn>
              <TableColumn style={{ width: '14ch' }}>RECEIVED</TableColumn>
              <TableColumn style={{ width: '14ch' }}>REQUIRED</TableColumn>
              <TableColumn style={{ width: '16ch' }}>STATUS</TableColumn>
              <TableColumn style={{ width: '12ch' }}>LINES</TableColumn>
              <TableColumn style={{ width: '14ch' }}>TOTAL</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>

            {filteredOrders.map((order) => {
              const lines = linesByOrder[order.id] || [];
              const total = calculateOrderTotal(lines);

              return (
                <TableRow key={order.id}>
                  <TableColumn>{order.po_number}</TableColumn>
                  <TableColumn>{customerMap[order.customer_id]?.name || 'Unknown Customer'}</TableColumn>
                  <TableColumn>{displayDate(order.received_date)}</TableColumn>
                  <TableColumn>{displayDate(order.required_date)}</TableColumn>
                  <TableColumn>
                    <>
                      <span className={orderStatusClassName(order.status)}>{statusLabel(order.status)}</span>
                      {isOrderArchived(order) ? <span className="status-pill status-pill-warning">ARCHIVED</span> : null}
                    </>
                  </TableColumn>
                  <TableColumn>{lines.length}</TableColumn>
                  <TableColumn>{formatCurrency(total)}</TableColumn>
                  <TableColumn>
                    <ActionButton onClick={() => router.push(`/doors/new?orderId=${order.id}`)}>View</ActionButton>
                  </TableColumn>
                </TableRow>
              );
            })}

            {!filteredOrders.length && (
              <TableRow>
                <TableColumn colSpan={8} style={{ textAlign: 'center' }}>
                  No purchase orders match your current filters.
                </TableColumn>
              </TableRow>
            )}
          </Table>
        )}
      </Card>
    </AppFrame>
  );
}
