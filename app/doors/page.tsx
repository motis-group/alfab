'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
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
  calculateLineTotal,
  calculateOrderTotal,
  formatCurrency,
  parseLineNotes,
  statusLabel,
  todayISODate,
} from '@utils/order-management';
import { createClient } from '@utils/db-client';
import { fetchCurrentSessionUser } from '@utils/session-client';

const TABLE_CUSTOMERS = 'customers';
const TABLE_PURCHASE_ORDERS = 'purchase_orders';
const TABLE_PURCHASE_ORDER_LINES = 'purchase_order_lines';

const navigationItems = APP_NAVIGATION_ITEMS;

function numberOrFallback(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function orderDateInRange(order: PurchaseOrder, dateFrom: string, dateTo: string): boolean {
  const orderDate = order.received_date || '';
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

type ArchiveFilter = 'active' | 'all' | 'archived';

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

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [queryOrderId, setQueryOrderId] = useState('');
  const [lineFulfillmentDrafts, setLineFulfillmentDrafts] = useState<Record<string, number>>({});

  const canEditOrders = role !== 'readonly';
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

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) || null, [orders, selectedOrderId]);

  const selectedOrderLines = useMemo(() => {
    if (!selectedOrder) {
      return [];
    }
    return linesByOrder[selectedOrder.id] || [];
  }, [selectedOrder, linesByOrder]);

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
      const requiredDate = order.required_date || '';
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

  useEffect(() => {
    if (!selectedOrder) {
      setLineFulfillmentDrafts({});
      return;
    }

    const nextDrafts: Record<string, number> = {};
    selectedOrderLines.forEach((line) => {
      if (line.id) {
        nextDrafts[line.id] = line.quantity_fulfilled || 0;
      }
    });
    setLineFulfillmentDrafts(nextDrafts);
  }, [selectedOrder, selectedOrderLines]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setQueryOrderId(params.get('orderId') || '');
  }, []);

  useEffect(() => {
    if (!queryOrderId || !orders.length) {
      return;
    }

    if (orders.some((order) => order.id === queryOrderId)) {
      setSelectedOrderId(queryOrderId);
    }
  }, [queryOrderId, orders]);

  async function updateOrderStatus(orderId: string, status: OrderStatus) {
    if (!canEditOrders) {
      return;
    }

    try {
      const db = createClient();
      const { error } = await db.from(TABLE_PURCHASE_ORDERS).update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
      if (error) throw error;

      setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status, updated_at: new Date().toISOString() } : order)));
    } catch (error: any) {
      setFormError(error?.message || 'Failed to update order status.');
    }
  }

  async function setOrderArchived(orderId: string, archived: boolean) {
    if (!canEditOrders) {
      return;
    }

    setFormError(null);

    try {
      const db = createClient();
      const archivedAt = archived ? new Date().toISOString() : null;
      const { error } = await db.from(TABLE_PURCHASE_ORDERS).update({ archived_at: archivedAt, updated_at: new Date().toISOString() }).eq('id', orderId);
      if (error) {
        throw error;
      }

      setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, archived_at: archivedAt, updated_at: new Date().toISOString() } : order)));

      if (selectedOrderId === orderId) {
        const stillVisible = archived ? archiveFilter !== 'active' : archiveFilter !== 'archived';
        if (!stillVisible) {
          setSelectedOrderId(null);
        }
      }
    } catch (error: any) {
      setFormError(error?.message || 'Failed to update order archive status.');
    }
  }

  async function saveFulfillmentUpdates() {
    if (!selectedOrder || !canEditOrders) {
      return;
    }

    setFormError(null);

    try {
      const db = createClient();
      const updates = Object.entries(lineFulfillmentDrafts).map(([lineId, qty]) =>
        db
          .from(TABLE_PURCHASE_ORDER_LINES)
          .update({ quantity_fulfilled: Math.max(0, Number(qty) || 0) })
          .eq('id', lineId)
          .eq('purchase_order_id', selectedOrder.id)
      );

      const results = await Promise.all(updates);
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        throw failed.error;
      }

      await loadData();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to update line fulfillment.');
    }
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navigationItems={navigationItems}
      navLabel="ORDER DASHBOARD"
      navRight={<ActionButton onClick={() => router.push('/doors/new')}>NEW ORDER</ActionButton>}
      heading="PURCHASE ORDER DASHBOARD"
      badge={`${ordersInScope.length} TOTAL`}
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
        <Text>RECENTLY UPDATED ORDERS</Text>
        <Table>
          <TableRow>
            <TableColumn style={{ width: '16ch' }}>PO</TableColumn>
            <TableColumn style={{ width: '22ch' }}>CUSTOMER</TableColumn>
            <TableColumn style={{ width: '16ch' }}>STATUS</TableColumn>
            <TableColumn>UPDATED</TableColumn>
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
              <TableColumn>{(order.updated_at || order.created_at || '').replace('T', ' ').slice(0, 16) || '—'}</TableColumn>
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
                  <TableColumn onClick={() => setSelectedOrderId(order.id)}>{order.po_number}</TableColumn>
                  <TableColumn onClick={() => setSelectedOrderId(order.id)}>{customerMap[order.customer_id]?.name || 'Unknown Customer'}</TableColumn>
                  <TableColumn onClick={() => setSelectedOrderId(order.id)}>{order.received_date || '—'}</TableColumn>
                  <TableColumn onClick={() => setSelectedOrderId(order.id)}>{order.required_date || '—'}</TableColumn>
                  <TableColumn onClick={() => setSelectedOrderId(order.id)}>
                    <>
                      <span className={orderStatusClassName(order.status)}>{statusLabel(order.status)}</span>
                      {isOrderArchived(order) ? <span className="status-pill status-pill-warning">ARCHIVED</span> : null}
                    </>
                  </TableColumn>
                  <TableColumn onClick={() => setSelectedOrderId(order.id)}>{lines.length}</TableColumn>
                  <TableColumn onClick={() => setSelectedOrderId(order.id)}>{formatCurrency(total)}</TableColumn>
                  <TableColumn>
                    <RowSpaceBetween>
                      <ActionButton onClick={() => setSelectedOrderId(order.id)}>View</ActionButton>
                      <ActionButton onClick={() => router.push(`/doors/new?orderId=${order.id}`)}>Edit</ActionButton>
                      <ActionButton onClick={() => setOrderArchived(order.id, !isOrderArchived(order))}>{isOrderArchived(order) ? 'Unarchive' : 'Archive'}</ActionButton>
                      <ActionButton onClick={() => updateOrderStatus(order.id, 'cancelled')}>Cancel</ActionButton>
                    </RowSpaceBetween>
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

      {selectedOrder && (
        <CardDouble title={`ORDER DETAIL — ${selectedOrder.po_number}`}>
          <RowSpaceBetween>
            <Text>CUSTOMER</Text>
            <Text>{customerMap[selectedOrder.customer_id]?.name || 'Unknown Customer'}</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>STATUS</Text>
            <Text>
              <>
                <span className={orderStatusClassName(selectedOrder.status)}>{statusLabel(selectedOrder.status)}</span>
                {isOrderArchived(selectedOrder) ? <span className="status-pill status-pill-warning">ARCHIVED</span> : null}
              </>
            </Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>ARCHIVE</Text>
            <Text>{isOrderArchived(selectedOrder) ? 'ARCHIVED' : 'ACTIVE'}</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>RECEIVED DATE</Text>
            <Text>{selectedOrder.received_date || '—'}</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>REQUIRED DATE</Text>
            <Text>{selectedOrder.required_date || '—'}</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>ORDER TOTAL</Text>
            <Text>{formatCurrency(calculateOrderTotal(selectedOrderLines))}</Text>
          </RowSpaceBetween>

          <br />
          <Text>UPDATE STATUS</Text>
          <select value={selectedOrder.status} onChange={(event) => updateOrderStatus(selectedOrder.id, event.target.value as OrderStatus)} disabled={!canEditOrders}>
            {ORDER_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>

          <br />
          <Text>LINE ITEMS</Text>
          <Table>
            <TableRow>
              <TableColumn style={{ width: '24ch' }}>ITEM</TableColumn>
              <TableColumn style={{ width: '10ch' }}>QTY</TableColumn>
              <TableColumn style={{ width: '14ch' }}>UNIT PRICE</TableColumn>
              <TableColumn style={{ width: '16ch' }}>LINE TOTAL</TableColumn>
              <TableColumn style={{ width: '12ch' }}>FULFILLED</TableColumn>
              <TableColumn>NOTES</TableColumn>
            </TableRow>

            {selectedOrderLines.map((line) => {
              const parsedNotes = parseLineNotes(line.line_notes);
              const isAdhocLine = parsedNotes.pricingSource === 'adhoc_calculator' || !line.product_id;
              const itemName = isAdhocLine ? parsedNotes.productLabel || 'AD HOC ITEM' : parsedNotes.productLabel || 'Customer Product';

              return (
                <TableRow key={line.id}>
                  <TableColumn>{itemName}</TableColumn>
                  <TableColumn>{line.quantity_ordered}</TableColumn>
                  <TableColumn>{formatCurrency(line.unit_price_at_order || 0)}</TableColumn>
                  <TableColumn>{formatCurrency(calculateLineTotal(line))}</TableColumn>
                  <TableColumn>
                    <Input
                      name={`line_fulfilled_${line.id}`}
                      type="number"
                      value={lineFulfillmentDrafts[line.id] ?? line.quantity_fulfilled ?? 0}
                      min={0}
                      disabled={!canEditOrders}
                      onChange={(event) => {
                        const nextValue = Math.max(0, numberOrFallback(event.target.value, 0));
                        setLineFulfillmentDrafts((prev) => ({ ...prev, [line.id]: nextValue }));
                      }}
                    />
                  </TableColumn>
                  <TableColumn>{parsedNotes.note || '—'}</TableColumn>
                </TableRow>
              );
            })}

            {!selectedOrderLines.length && (
              <TableRow>
                <TableColumn colSpan={6} style={{ textAlign: 'center' }}>
                  No lines found on this purchase order.
                </TableColumn>
              </TableRow>
            )}
          </Table>

          <br />
          <RowSpaceBetween>
            <ActionButton onClick={saveFulfillmentUpdates}>Save Fulfillment</ActionButton>
            <ActionButton onClick={() => setOrderArchived(selectedOrder.id, !isOrderArchived(selectedOrder))}>{isOrderArchived(selectedOrder) ? 'Unarchive Order' : 'Archive Order'}</ActionButton>
            <ActionButton onClick={() => router.push(`/doors/new?orderId=${selectedOrder.id}`)}>Edit Order</ActionButton>
          </RowSpaceBetween>
        </CardDouble>
      )}
    </AppFrame>
  );
}
