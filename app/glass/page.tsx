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

import {
  Customer,
  ORDER_STATUS_OPTIONS,
  OrderStatus,
  PurchaseOrder,
  PurchaseOrderLine,
  UserRole,
  calculateOrderTotal,
  formatCurrency,
  orderDeleteRefusal,
  statusLabel,
  todayISODate,
  localISODate,
} from '@utils/order-management';
import { QUOTE_KIND_HREFS, QUOTE_KIND_LABELS, QuoteRecord, isMergeRefusal, listQuoteRecords, mergeQuotesForOrder } from '@utils/quote-register';
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_ORDER, QUOTE_STATUS_TONE, QuoteStatus, deleteQuote, quoteDeleteRefusal } from '@utils/quote-status';
import { persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { overdueOrders } from '@utils/order-metrics';
import { useConfirm } from '@components/modals/ModalConfirm';
import { createClient } from '@utils/db-client';
import { fetchCurrentSessionUser } from '@utils/session-client';

const TABLE_CUSTOMERS = 'customers';
const TABLE_PURCHASE_ORDERS = 'purchase_orders';
const TABLE_PURCHASE_ORDER_LINES = 'purchase_order_lines';


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

  return localISODate(parsed);
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
  const confirm = useConfirm();

  const [role, setRole] = useState<UserRole>('readonly');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [orderLines, setOrderLines] = useState<PurchaseOrderLine[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // Quotes ticked for one order. A boat's windows, awnings and cut glass are three quotes.
  const [selectedQuotes, setSelectedQuotes] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Shown in the purchase orders card, beside the row it is about, not at the top of the page.
  const [orderNotice, setOrderNotice] = useState<string | null>(null);

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

  const [quoteStatusFilter, setQuoteStatusFilter] = useState<QuoteStatus | ''>('');

  const filteredQuotes = useMemo(() => {
    return quotes.filter((quote) => {
      if (customerFilter && quote.customerId !== customerFilter) {
        return false;
      }
      if (quoteStatusFilter && quote.status !== quoteStatusFilter) {
        return false;
      }
      return true;
    });
  }, [quotes, customerFilter, quoteStatusFilter]);

  const overdue = useMemo(() => overdueOrders(ordersInScope, todayISODate()), [ordersInScope]);

  const overdueIds = useMemo(() => new Set(overdue.map((order) => order.id)), [overdue]);

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
      await refreshQuotes();
    } catch (error: any) {
      setSchemaError(error?.message || 'Unable to load order management tables.');
      setCustomers([]);
      setOrders([]);
      setOrderLines([]);
    } finally {
      setIsLoading(false);
    }
  }

  /** Saved quotes from all three calculators. A calculator that cannot be read is named, not hidden. */
  /** Deleting is for a quote nobody answered or one made by mistake. A won quote goes with its order. */
  async function removeQuote(quote: QuoteRecord) {
    const label = quote.reference || quote.name || 'This quote';
    const refusal = quoteDeleteRefusal({ status: quote.status, label });
    if (refusal) {
      setQuoteError(refusal);
      return;
    }
    const warning = quote.reference ? `Delete ${quote.reference}? It was printed for a customer, so the number they hold will point at nothing. This cannot be undone.` : `Delete ${label}? This cannot be undone.`;
    if (!(await confirm('DELETE QUOTE', warning))) {
      return;
    }
    try {
      await deleteQuote(quote.id);
      await refreshQuotes();
    } catch (error: any) {
      setQuoteError(error?.message || 'Unable to delete the quote.');
    }
  }

  async function refreshQuotes() {
    const { records, errors } = await listQuoteRecords();
    setQuotes(records);
    setQuoteError(errors.length ? errors.join(' ') : null);
  }

  /** Archiving hides an order from the working lists and can be undone. */
  async function setOrderArchived(order: PurchaseOrder, archived: boolean) {
    const now = new Date().toISOString();
    const { error } = await createClient()
      .from(TABLE_PURCHASE_ORDERS)
      .update({ archived_at: archived ? now : null, updated_at: now })
      .eq('id', order.id);
    if (error) {
      setOrderNotice(error.message || 'Unable to archive the order.');
      return;
    }
    setOrderNotice(null);
    await loadData();
  }

  /** Deleting is for an order entered by mistake. One with work recorded is archived instead. */
  async function deleteOrder(order: PurchaseOrder) {
    const lines = linesByOrder[order.id] || [];
    const refusal = orderDeleteRefusal(order, lines);
    if (refusal) {
      setOrderNotice(refusal);
      return;
    }
    if (!(await confirm('DELETE ORDER', `Delete PO ${order.po_number} and its ${lines.length} line${lines.length === 1 ? '' : 's'}? This cannot be undone. Archive hides it instead and can be undone.`))) {
      return;
    }
    const { error } = await createClient().from(TABLE_PURCHASE_ORDERS).delete().eq('id', order.id);
    if (error) {
      setOrderNotice(error.message || 'Unable to delete the order.');
      return;
    }
    setOrderNotice(null);
    await loadData();
  }

  /**
   * A purchase order is an approved quote, so converting is a deliberate act rather than something
   * that happens when a quote is marked won. Several quotes convert into one order, which is how a
   * boat's windows, awnings and cut glass reach the customer as one number. Each is marked won.
   */
  async function convertQuotes(records: QuoteRecord[]) {
    const merged = mergeQuotesForOrder(records);
    if (!merged) {
      setFormError('Those quotes have no priced line to put on an order.');
      return;
    }
    if (isMergeRefusal(merged)) {
      setFormError(merged.reason);
      return;
    }

    setFormError(merged.warnings.length ? merged.warnings.join(' ') : null);
    persistQuoteToOrderDraft(merged.draft);
    router.push('/glass/new?fromQuote=1');
  }

  const selectedRecords = quotes.filter((quote) => selectedQuotes.has(quote.id));
  const selectedCount = selectedRecords.length;
  const selectedTotal = selectedRecords.reduce((sum, quote) => sum + quote.total, 0);
  // Checked before the button is offered, so a selection that cannot become one order says why
  // instead of failing on the click.
  const selectionMerge = selectedCount > 1 ? mergeQuotesForOrder(selectedRecords) : null;
  const selectionRefusal = selectionMerge && isMergeRefusal(selectionMerge) ? selectionMerge.reason : null;

  function toggleQuote(id: string) {
    setSelectedQuotes((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
      navRight={<ActionButton onClick={() => router.push('/glass/new')}>NEW ORDER</ActionButton>}
      heading="PURCHASE ORDER DASHBOARD"
      badge={`${ordersInScope.length} TOTAL`}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
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

            <Text>QUOTE STATUS</Text>
            <select value={quoteStatusFilter} onChange={(event) => setQuoteStatusFilter(event.target.value as QuoteStatus | '')}>
              <option value="">All quote statuses</option>
              {QUOTE_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {QUOTE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <br />

            <Text>ORDER STATUS</Text>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OrderStatus | '')}>
              <option value="">All order statuses</option>
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
          onClick: () => router.push('/glass/new'),
        },
        {
          hotkey: '⌘+R',
          body: 'Reload Data',
          onClick: () => loadData(),
        },
        {
          hotkey: '⌘+C',
          body: 'Customers',
          onClick: () => router.push('/glass/clients'),
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
            <span className="status-warning">Apply docs/order-management-schema.sql to the database, then reload.</span>
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

      <Card title={`QUOTES (${filteredQuotes.length})`}>
        <RowSpaceBetween>
          <Text>
            {selectionRefusal ? <span className="status-warning">{selectionRefusal}</span> : selectedCount ? `${selectedCount} ticked${selectedTotal ? ` · ${formatCurrency(selectedTotal)}` : ''}` : 'Tick more than one to put them on a single order. They must be for the same customer.'}
          </Text>
          <Text>
            {selectedCount > 1 && !selectionRefusal ? (
              <>
                <ActionButton onClick={role === 'readonly' ? undefined : () => convertQuotes(selectedRecords)}>Convert {selectedCount} To One Order</ActionButton>{' '}
              </>
            ) : null}
            {selectedCount ? <ActionButton onClick={() => setSelectedQuotes(new Set())}>Clear</ActionButton> : null}
          </Text>
        </RowSpaceBetween>
        {quoteError ? (
          <Text>
            <span className="status-warning">{quoteError}</span>
          </Text>
        ) : null}
        {isLoading ? (
          <Text>Loading quotes...</Text>
        ) : (
          <Table>
            <TableRow>
              <TableColumn style={{ width: '4ch' }}>ON</TableColumn>
              <TableColumn>QUOTE</TableColumn>
              <TableColumn style={{ width: '10ch' }}>PRODUCT</TableColumn>
              <TableColumn style={{ width: '22ch' }}>CUSTOMER</TableColumn>
              <TableColumn style={{ width: '13ch' }}>DATE</TableColumn>
              <TableColumn style={{ width: '8ch' }}>LINES</TableColumn>
              <TableColumn style={{ width: '13ch' }}>TOTAL</TableColumn>
              <TableColumn style={{ width: '22ch' }}>STATUS</TableColumn>
              <TableColumn style={{ width: '32ch' }}>ACTIONS</TableColumn>
            </TableRow>

            {filteredQuotes.map((quote) => (
              <TableRow key={quote.id}>
                <TableColumn>
                  <input type="checkbox" checked={selectedQuotes.has(quote.id)} disabled={!quote.draft} aria-label={`Put ${quote.name || 'this quote'} on an order`} onChange={() => toggleQuote(quote.id)} />
                </TableColumn>
                <TableColumn>{[quote.reference, quote.name || 'Untitled'].filter(Boolean).join(' · ')}</TableColumn>
                <TableColumn>{QUOTE_KIND_LABELS[quote.kind]}</TableColumn>
                <TableColumn>{quote.customer || 'Walk-in'}</TableColumn>
                <TableColumn>{quote.date ? quote.date.slice(0, 10) : '—'}</TableColumn>
                <TableColumn>{quote.lineCount}</TableColumn>
                <TableColumn>{formatCurrency(quote.total)}</TableColumn>
                <TableColumn>
                  <span className={QUOTE_STATUS_TONE[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</span>
                </TableColumn>
                <TableColumn style={{ whiteSpace: 'nowrap' }}>
                  <ActionButton onClick={() => router.push(QUOTE_KIND_HREFS[quote.kind])}>Open</ActionButton>{' '}
                  <ActionButton onClick={role === 'readonly' ? undefined : () => convertQuotes([quote])}>Convert</ActionButton>{' '}
                  <ActionButton onClick={role === 'readonly' ? undefined : () => removeQuote(quote)}>Delete</ActionButton>
                </TableColumn>
              </TableRow>
            ))}

            {!filteredQuotes.length && (
              <TableRow>
                <TableColumn colSpan={9} style={{ textAlign: 'center' }}>
                  No quotes match the filters.
                </TableColumn>
              </TableRow>
            )}
          </Table>
        )}
      </Card>


      <Card title="PURCHASE ORDERS">
        {orderNotice ? (
          <Text>
            <span className="status-error">{orderNotice}</span>
          </Text>
        ) : null}
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
              <TableColumn style={{ width: '30ch' }}>ACTIONS</TableColumn>
            </TableRow>

            {filteredOrders.map((order) => {
              const lines = linesByOrder[order.id] || [];
              const total = calculateOrderTotal(lines);
              const isOverdue = overdueIds.has(order.id);

              return (
                <TableRow key={order.id}>
                  <TableColumn>{order.po_number}</TableColumn>
                  <TableColumn>{customerMap[order.customer_id]?.name || 'Unknown Customer'}</TableColumn>
                  <TableColumn>{displayDate(order.received_date)}</TableColumn>
                  <TableColumn>
                    <span className={isOverdue ? 'status-error' : undefined}>{displayDate(order.required_date)}</span>
                    {isOverdue ? <span className="status-pill status-pill-error">LATE</span> : null}
                  </TableColumn>
                  <TableColumn>
                    <>
                      <span className={orderStatusClassName(order.status)}>{statusLabel(order.status)}</span>
                      {isOrderArchived(order) ? <span className="status-pill status-pill-warning">ARCHIVED</span> : null}
                    </>
                  </TableColumn>
                  <TableColumn>{lines.length}</TableColumn>
                  <TableColumn>{formatCurrency(total)}</TableColumn>
                  <TableColumn style={{ whiteSpace: 'nowrap' }}>
                    <ActionButton onClick={() => router.push(`/glass/new?orderId=${order.id}`)}>View</ActionButton>{' '}
                    <ActionButton onClick={role === 'readonly' ? undefined : () => setOrderArchived(order, !isOrderArchived(order))}>{isOrderArchived(order) ? 'Restore' : 'Archive'}</ActionButton>{' '}
                    <ActionButton onClick={role === 'readonly' ? undefined : () => deleteOrder(order)}>Delete</ActionButton>
                  </TableColumn>
                </TableRow>
              );
            })}

            {!filteredOrders.length && (
              <TableRow>
                <TableColumn colSpan={8} style={{ textAlign: 'center' }}>
                  No purchase orders match the filters.
                </TableColumn>
              </TableRow>
            )}
          </Table>
        )}
      </Card>
    </AppFrame>
  );
}
