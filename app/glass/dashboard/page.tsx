'use client';

import '@root/global.scss';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import QuoteDocument from '@components/QuoteDocument';
import CardDouble from '@components/CardDouble';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { Customer, PurchaseOrder, formatCurrency, statusLabel, todayISODate } from '@utils/order-management';
import { openOrdersByCustomer, ordersDueWithin, ordersWithStatus, overdueOrders, recentOrders, tallyQuotes } from '@utils/order-metrics';
import { QUOTE_KIND_HREFS, QUOTE_KIND_LABELS, QuoteRecord, isMergeRefusal, listQuoteRecords, mergeQuotesForOrder } from '@utils/quote-register';
import { QUOTE_STATUS_LABELS, setQuoteStatus, winRate } from '@utils/quote-status';
import { persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { createClient } from '@utils/db-client';
import { fetchCurrentSessionUser } from '@utils/session-client';

const TABLE_CUSTOMERS = 'customers';
const TABLE_PURCHASE_ORDERS = 'purchase_orders';

export default function DashboardPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openQuote, setOpenQuote] = useState<QuoteRecord | null>(null);

  const today = todayISODate();

  // Archived orders are out of scope: nobody is waiting on one.
  const live = useMemo(() => orders.filter((order) => !order.archived_at), [orders]);

  const overdue = useMemo(() => overdueOrders(live, today), [live, today]);
  const dueSoon = useMemo(() => ordersDueWithin(live, today, 7), [live, today]);
  const open = useMemo(() => ordersWithStatus(live, 'open'), [live]);
  const inProduction = useMemo(() => ordersWithStatus(live, 'in_production'), [live]);
  const recent = useMemo(() => recentOrders(live, 5), [live]);

  const customerName = useCallback((id: string) => customers.find((entry) => entry.id === id)?.name || 'Unknown customer', [customers]);
  const byCustomer = useMemo(() => openOrdersByCustomer(live, customerName), [live, customerName]);

  const quoteTally = useMemo(() => tallyQuotes(quotes), [quotes]);
  const outcomes = useMemo(() => winRate(quotes.map((quote) => ({ status: quote.status, price: quote.total }))), [quotes]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const user = await fetchCurrentSessionUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const db = createClient();
      const [customerRows, orderRows, quoteRecords] = await Promise.all([db.from(TABLE_CUSTOMERS).select('*'), db.from(TABLE_PURCHASE_ORDERS).select('*'), listQuoteRecords()]);

      if (customerRows.error || orderRows.error) {
        setError(customerRows.error?.message || orderRows.error?.message || 'Unable to read the orders.');
        return;
      }

      setCustomers((customerRows.data as Customer[]) || []);
      setOrders((orderRows.data as PurchaseOrder[]) || []);
      setQuotes(quoteRecords.records);
      if (quoteRecords.errors.length) {
        setError(quoteRecords.errors.join(' '));
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to read the orders.');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  /** A quote reads better as the document the customer was sent than as a row. */
  async function convertOpenQuote(quote: QuoteRecord) {
    const merged = mergeQuotesForOrder([quote]);
    if (!merged || isMergeRefusal(merged)) {
      setError(merged && isMergeRefusal(merged) ? merged.reason : 'That quote has no priced line to put on an order.');
      return;
    }

    if (quote.status !== 'won') {
      await setQuoteStatus(quote.id, 'won');
    }
    persistQuoteToOrderDraft(merged.draft);
    router.push('/glass/new?fromQuote=1');
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      heading="DASHBOARD"
      badge={isLoading ? 'LOADING' : overdue.length ? `${overdue.length} OVERDUE` : undefined}
      navRight={<ActionButton onClick={() => router.push('/glass')}>ORDERS</ActionButton>}
      actionItems={[
        { body: 'Orders', onClick: () => router.push('/glass') },
        { body: 'New Order', onClick: () => router.push('/glass/new') },
        { body: 'Reload', onClick: load },
      ]}
      sidebarWidthCh={46}
      sidebarMobileOrder="top"
      sidebar={
        <>
          {error ? (
            <Card title="ERROR">
              <Text>
                <span className="status-error">{error}</span>
              </Text>
            </Card>
          ) : null}

          <Card title="ORDERS">
            <RowSpaceBetween>
              <Text>OPEN</Text>
              <Text>{open.length}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>IN PRODUCTION</Text>
              <Text>{inProduction.length}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>DUE WITHIN 7 DAYS</Text>
              <Text>
                <span className={dueSoon.length ? 'status-warning' : undefined}>{dueSoon.length}</span>
              </Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>OVERDUE</Text>
              <Text>
                <span className={overdue.length ? 'status-error' : undefined}>{overdue.length}</span>
              </Text>
            </RowSpaceBetween>
          </Card>

          <Card title="QUOTES">
            <RowSpaceBetween>
              <Text>OPEN</Text>
              <Text>{quoteTally.counts.open}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>OPEN VALUE</Text>
              <Text>{formatCurrency(quoteTally.openValue)}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>WON</Text>
              <Text>{quoteTally.counts.won}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>LOST</Text>
              <Text>{quoteTally.counts.lost}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>WIN RATE</Text>
              <Text>{outcomes.rate == null ? '—' : `${Math.round(outcomes.rate * 100)}%`}</Text>
            </RowSpaceBetween>
          </Card>

          <Card title="OPEN ORDERS BY CUSTOMER">
            {byCustomer.length ? (
              <Table>
                <TableRow>
                  <TableColumn>CUSTOMER</TableColumn>
                  <TableColumn style={{ width: '8ch' }}>OPEN</TableColumn>
                </TableRow>
                {byCustomer.map((entry) => (
                  <TableRow key={entry.customerId}>
                    <TableColumn>{entry.name}</TableColumn>
                    <TableColumn>{entry.count}</TableColumn>
                  </TableRow>
                ))}
              </Table>
            ) : (
              <Text>No open orders.</Text>
            )}
          </Card>
        </>
      }
    >
      {openQuote ? (
        <>
          <QuoteDocument
            quote={openQuote}
            onClose={() => setOpenQuote(null)}
            onOpen={() => router.push(QUOTE_KIND_HREFS[openQuote.kind])}
            onConvert={() => convertOpenQuote(openQuote)}
          />
          <br />
        </>
      ) : null}

      {/* Only what is late or nearly late. A row here is a phone call, so an empty card says so. */}
      <CardDouble title={overdue.length ? `OVERDUE (${overdue.length})` : 'NOTHING OVERDUE'}>
        {overdue.length ? (
          <Table>
            <TableRow>
              <TableColumn style={{ width: '16ch' }}>PO NUMBER</TableColumn>
              <TableColumn>CUSTOMER</TableColumn>
              <TableColumn style={{ width: '14ch' }}>REQUIRED</TableColumn>
              <TableColumn style={{ width: '16ch' }}>STATUS</TableColumn>
              <TableColumn style={{ width: '10ch' }}>ACTIONS</TableColumn>
            </TableRow>
            {overdue.map((order) => (
              <TableRow key={order.id}>
                <TableColumn>{order.po_number}</TableColumn>
                <TableColumn>{customerName(order.customer_id)}</TableColumn>
                <TableColumn>
                  <span className="status-error">{order.required_date?.slice(0, 10)}</span>
                </TableColumn>
                <TableColumn>{statusLabel(order.status)}</TableColumn>
                <TableColumn>
                  <ActionButton onClick={() => router.push(`/glass/new?orderId=${order.id}`)}>View</ActionButton>
                </TableColumn>
              </TableRow>
            ))}
          </Table>
        ) : (
          <Text>Every order is inside its required date.</Text>
        )}
      </CardDouble>

      <CardDouble title={dueSoon.length ? `DUE WITHIN 7 DAYS (${dueSoon.length})` : 'NOTHING DUE THIS WEEK'}>
        {dueSoon.length ? (
          <Table>
            <TableRow>
              <TableColumn style={{ width: '16ch' }}>PO NUMBER</TableColumn>
              <TableColumn>CUSTOMER</TableColumn>
              <TableColumn style={{ width: '14ch' }}>REQUIRED</TableColumn>
              <TableColumn style={{ width: '16ch' }}>STATUS</TableColumn>
              <TableColumn style={{ width: '10ch' }}>ACTIONS</TableColumn>
            </TableRow>
            {dueSoon.map((order) => (
              <TableRow key={order.id}>
                <TableColumn>{order.po_number}</TableColumn>
                <TableColumn>{customerName(order.customer_id)}</TableColumn>
                <TableColumn>{order.required_date?.slice(0, 10)}</TableColumn>
                <TableColumn>{statusLabel(order.status)}</TableColumn>
                <TableColumn>
                  <ActionButton onClick={() => router.push(`/glass/new?orderId=${order.id}`)}>View</ActionButton>
                </TableColumn>
              </TableRow>
            ))}
          </Table>
        ) : (
          <Text>Nothing is due in the next seven days.</Text>
        )}
      </CardDouble>

      <CardDouble title="OPEN QUOTES">
        {quotes.filter((quote) => quote.status === 'open').length ? (
          <Table>
            <TableRow>
              <TableColumn>QUOTE</TableColumn>
              <TableColumn style={{ width: '10ch' }}>PRODUCT</TableColumn>
              <TableColumn style={{ width: '22ch' }}>CUSTOMER</TableColumn>
              <TableColumn style={{ width: '13ch' }}>DATE</TableColumn>
              <TableColumn style={{ width: '13ch' }}>TOTAL</TableColumn>
              <TableColumn style={{ width: '9ch' }}>ACTIONS</TableColumn>
            </TableRow>
            {quotes
              .filter((quote) => quote.status === 'open')
              .slice(0, 10)
              .map((quote) => (
                <TableRow key={quote.id}>
                  <TableColumn>{quote.name || 'Untitled'}</TableColumn>
                  <TableColumn>{QUOTE_KIND_LABELS[quote.kind]}</TableColumn>
                  <TableColumn>{quote.customer || 'Walk-in'}</TableColumn>
                  <TableColumn>{quote.date ? quote.date.slice(0, 10) : '—'}</TableColumn>
                  <TableColumn>{formatCurrency(quote.total)}</TableColumn>
                  <TableColumn>
                    <ActionButton onClick={() => setOpenQuote(quote)}>View</ActionButton>
                  </TableColumn>
                </TableRow>
              ))}
          </Table>
        ) : (
          <Text>No open quotes. {QUOTE_STATUS_LABELS.won} quotes are on the Orders page.</Text>
        )}
      </CardDouble>

      <CardDouble title="RECENT ORDERS">
        {recent.length ? (
          <Table>
            <TableRow>
              <TableColumn style={{ width: '16ch' }}>PO NUMBER</TableColumn>
              <TableColumn>CUSTOMER</TableColumn>
              <TableColumn style={{ width: '16ch' }}>STATUS</TableColumn>
              <TableColumn style={{ width: '10ch' }}>ACTIONS</TableColumn>
            </TableRow>
            {recent.map((order) => (
              <TableRow key={order.id}>
                <TableColumn>{order.po_number}</TableColumn>
                <TableColumn>{customerName(order.customer_id)}</TableColumn>
                <TableColumn>{statusLabel(order.status)}</TableColumn>
                <TableColumn>
                  <ActionButton onClick={() => router.push(`/glass/new?orderId=${order.id}`)}>View</ActionButton>
                </TableColumn>
              </TableRow>
            ))}
          </Table>
        ) : (
          <Text>No orders yet.</Text>
        )}
      </CardDouble>
    </AppFrame>
  );
}
