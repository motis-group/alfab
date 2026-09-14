'use client';

import '@root/global.scss';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import QuoteDocument from '@components/QuoteDocument';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';
import { QuotePaper } from '@components/PrintedQuote';
import PrintedQuote from '@components/PrintedQuote';

import { consumeLineEditResult, calculatorFor, persistLineEditRequest } from '@utils/line-editing';
import { Customer, PricingSource, formatCurrency, todayISODate } from '@utils/order-management';
import { LineDraft, createLineDraft } from '@utils/order-draft';
import { QuoteDraft, applyQuoteLineResult, clearQuoteDraft, dropPendingLine, emptyQuoteDraft, peekQuoteDraft, persistQuoteDraft } from '@utils/quote-draft';
import { QuoteRecord, findQuoteRecord, isMergeRefusal, mergeQuotesForOrder } from '@utils/quote-register';
import { SavedQuoteLine, createQuote, findQuote, quotePaperLines, quoteReference, updateQuote } from '@utils/quote-store';
import { createClient } from '@utils/db-client';
import { persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';

const TABLE_CUSTOMERS = 'customers';

/** The three calculators that price a line. The order is the order that the office uses. */
const LINE_KINDS: { label: string; source: PricingSource }[] = [
  { label: 'Window', source: 'window_calculator' },
  { label: 'Awning', source: 'awning_calculator' },
  { label: 'Cut Glass', source: 'adhoc_calculator' },
];

function sourceLabel(source: PricingSource): string {
  return LINE_KINDS.find((kind) => kind.source === source)?.label || 'Line';
}

/**
 * The page of one quote. The operator writes the quote here.
 *
 * A quote holds lines of any kind. No single calculator owns the quote. The operator prices each
 * line in the calculator for its kind. The line then returns to this page. An order line uses the
 * same procedure.
 *
 * The quote waits in a draft while a line is away, because the operator edits the line on another
 * page.
 */
export default function QuotePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';
  const isNew = id === 'new';

  const [draft, setDraft] = useState<QuoteDraft>(emptyQuoteDraft);
  /** A quote that a calculator wrote. This page shows the quote but cannot change it. */
  const [readOnly, setReadOnly] = useState<QuoteRecord | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const user = await fetchCurrentSessionUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCanWrite(userCan(user, 'quotes:write'));
      setUsername(user.username);

      const { data: customerData } = await createClient().from(TABLE_CUSTOMERS).select('*').order('name', { ascending: true });
      setCustomers((customerData as Customer[]) || []);

      // A line returned from a calculator, or the operator cancelled. The quote waits in a draft.
      const result = consumeLineEditResult();
      const waiting = peekQuoteDraft();
      if (waiting && (waiting.id || null) === (isNew ? null : id)) {
        if (result && result.origin.kind === 'quote') {
          setDraft(applyQuoteLineResult(waiting, result));
        } else {
          // The operator cancelled. A line added for this trip has no price. Remove that line.
          setDraft(dropPendingLine(waiting));
        }
        clearURLFlag();
        return;
      }

      if (isNew) {
        setDraft(emptyQuoteDraft());
        return;
      }

      const quote = await findQuote(id);
      if (quote) {
        setDraft({ id: quote.id, name: quote.name, customer: quote.customer, customerId: quote.customerId || '', date: quote.date ? quote.date.slice(0, 10) : todayISODate(), notes: quote.notes, lines: quote.lines, pendingLineId: null });
        return;
      }

      // Not a quote for a job. A calculator wrote it. This page shows it and does not change it.
      const { record, errors } = await findQuoteRecord(id);
      setReadOnly(record);
      setError(errors.length ? errors.join(' ') : record ? null : 'No quote has that reference. It may have been deleted.');
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to read the quote.');
    } finally {
      setIsLoading(false);
    }
  }, [id, isNew, router]);

  useEffect(() => {
    load();
  }, [load]);

  function clearURLFlag() {
    if (typeof window === 'undefined') {
      return;
    }
    const next = new URL(window.location.href);
    next.searchParams.delete('lineEdited');
    window.history.replaceState({}, '', `${next.pathname}${next.search}${next.hash}`);
  }

  const paperLines = quotePaperLines(draft.lines);
  const total = paperLines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0);
  const reference = draft.id ? quoteReference(draft.id) : null;

  /** Sends one line to the calculator that prices it. The quote waits in its draft. */
  function priceLine(line: LineDraft, lineLabel: string, pending: boolean) {
    const href = calculatorFor(line.pricingSource);
    if (!href) {
      setError('That line has no calculator.');
      return;
    }

    const lines = draft.lines.some((entry) => entry.draft.localId === line.localId) ? draft.lines : [...draft.lines, { draft: line, spec: '', extras: [] }];
    const next: QuoteDraft = { ...draft, lines, pendingLineId: pending ? line.localId : null };
    persistQuoteDraft(next);
    setDraft(next);

    persistLineEditRequest({
      origin: { kind: 'quote', label: reference || draft.name.trim() || 'a new quote' },
      localId: line.localId,
      line,
      customerId: draft.customerId,
      lineLabel,
      returnTo: `/glass/quotes/${draft.id || 'new'}?lineEdited=1`,
    });
    router.push(`${href}?editLine=1`);
  }

  function addLine(source: PricingSource) {
    priceLine(createLineDraft({ pricingSource: source }), `A new ${sourceLabel(source).toLowerCase()} line`, true);
  }

  function editLine(line: SavedQuoteLine, index: number) {
    priceLine(line.draft, `Line ${index + 1}`, false);
  }

  function removeLine(localId: string) {
    setDraft((current) => ({ ...current, lines: current.lines.filter((line) => line.draft.localId !== localId) }));
  }

  function update(partial: Partial<QuoteDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  async function save() {
    if (!canWrite) {
      setError('Saving a quote needs access.');
      return;
    }
    if (!draft.lines.length) {
      setError('A quote with no line is not an offer. Add a line first.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const content = { name: draft.name, customer: customers.find((entry) => entry.id === draft.customerId)?.name || draft.customer, customerId: draft.customerId || null, date: draft.date, notes: draft.notes, lines: draft.lines };
      const ratesUpdatedAt = draft.lines.map((line) => line.draft.windowRatesUpdatedAt || line.draft.awningRatesUpdatedAt).find(Boolean) || null;

      if (draft.id) {
        await updateQuote(draft.id, { ...content, issuedBy: username, ratesUpdatedAt });
        setStatus(`Quote ${quoteReference(draft.id)} saved.`);
        clearQuoteDraft();
      } else {
        const newId = await createQuote({ ...content, issuedBy: username, ratesUpdatedAt });
        clearQuoteDraft();
        setStatus(`Quote ${quoteReference(newId)} saved.`);
        router.replace(`/glass/quotes/${newId}`);
      }
    } catch (saveError: any) {
      setError(saveError?.message || 'Unable to save the quote.');
    } finally {
      setIsSaving(false);
    }
  }

  function convert(record: QuoteRecord) {
    const merged = mergeQuotesForOrder([record]);
    if (!merged) {
      setError('That quote has no priced line to put on an order.');
      return;
    }
    if (isMergeRefusal(merged)) {
      setError(merged.reason);
      return;
    }
    persistQuoteToOrderDraft(merged.draft);
    router.push('/glass/new?fromQuote=1');
  }

  const heading = readOnly ? readOnly.reference || readOnly.name || 'QUOTE' : reference || (isNew ? 'NEW QUOTE' : 'QUOTE');

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      heading={heading}
      badge={isLoading ? 'LOADING' : undefined}
      navRight={<ActionButton onClick={() => router.push('/glass')}>BACK TO QUOTES</ActionButton>}
      actionItems={[
        { body: 'Quotes', onClick: () => router.push('/glass') },
        { body: 'Reload', onClick: load },
      ]}
    >
      {error ? (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      ) : null}
      {status ? (
        <Card title="SAVED">
          <Text>
            <span className="status-success">{status}</span>
          </Text>
        </Card>
      ) : null}

      {isLoading ? <Text>Loading the quote...</Text> : null}

      {/* A quote that a calculator wrote. It is the offer that went out. The page does not edit it. */}
      {!isLoading && readOnly ? <QuoteDocument quote={readOnly} onClose={() => router.push('/glass')} onConvert={() => convert(readOnly)} /> : null}

      {!isLoading && !readOnly ? (
        <>
          <CardDouble title="QUOTE">
            <Input label="JOB" name="quote_name" value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="What the job is called" />
            <Text>CUSTOMER</Text>
            <select value={draft.customerId} onChange={(event) => update({ customerId: event.target.value })}>
              <option value="">Walk-in / phone</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <br />
            <Input label="DATE" type="date" name="quote_date" value={draft.date} onChange={(event) => update({ date: event.target.value })} />
            <Input label="NOTES" name="quote_notes" value={draft.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Anything the customer should read" />
          </CardDouble>

          <CardDouble title={`LINES (${draft.lines.length})`}>
            {draft.lines.length ? (
              <Table>
                <TableRow>
                  <TableColumn>ITEM</TableColumn>
                  <TableColumn style={{ width: '12ch' }}>PRICED IN</TableColumn>
                  <TableColumn style={{ width: '6ch' }}>QTY</TableColumn>
                  <TableColumn style={{ width: '14ch' }}>UNIT</TableColumn>
                  <TableColumn style={{ width: '14ch' }}>AMOUNT</TableColumn>
                  <TableColumn style={{ width: '16ch' }}>ACTIONS</TableColumn>
                </TableRow>
                {draft.lines.map((line, index) => (
                  <TableRow key={line.draft.localId}>
                    <TableColumn>
                      {line.draft.lineNote || `${sourceLabel(line.draft.pricingSource)} ${index + 1}`}
                      {line.spec ? <div className="printed-quote__spec">{line.spec}</div> : null}
                    </TableColumn>
                    <TableColumn>{sourceLabel(line.draft.pricingSource)}</TableColumn>
                    <TableColumn>{line.draft.quantityOrdered}</TableColumn>
                    <TableColumn>{formatCurrency(line.draft.unitPriceAtOrder)}</TableColumn>
                    <TableColumn>{formatCurrency(line.draft.unitPriceAtOrder * line.draft.quantityOrdered)}</TableColumn>
                    <TableColumn style={{ whiteSpace: 'nowrap' }}>
                      <ActionButton onClick={() => editLine(line, index)}>Edit</ActionButton> <ActionButton onClick={() => removeLine(line.draft.localId)}>Remove</ActionButton>
                    </TableColumn>
                  </TableRow>
                ))}
              </Table>
            ) : (
              <Text>No lines yet. Add one and the calculator for its kind prices it.</Text>
            )}
            <br />
            <RowSpaceBetween>
              <Text>QUOTE TOTAL (EXCLUDES GST)</Text>
              <Text>
                <span className="status-pill status-pill-success">{formatCurrency(total)}</span>
              </Text>
            </RowSpaceBetween>
          </CardDouble>

          <CardDouble title="ADD A LINE">
            <Text>Each line is priced in the calculator that knows its kind, and comes back here.</Text>
            <br />
            <span>
              {LINE_KINDS.map((kind) => (
                <span key={kind.source}>
                  <ActionButton onClick={() => addLine(kind.source)}>{kind.label}</ActionButton>{' '}
                </span>
              ))}
            </span>
          </CardDouble>

          {draft.lines.length ? (
            <CardDouble title="AS THE CUSTOMER READS IT">
              <QuotePaper reference={reference} quoteName={draft.name} customerName={customers.find((entry) => entry.id === draft.customerId)?.name || draft.customer} quoteDate={draft.date} notes={draft.notes} lines={paperLines} />
              <PrintedQuote reference={reference} quoteName={draft.name} customerName={customers.find((entry) => entry.id === draft.customerId)?.name || draft.customer} quoteDate={draft.date} notes={draft.notes} lines={paperLines} />
            </CardDouble>
          ) : null}

          <RowSpaceBetween>
            <span>
              <ActionButton onClick={() => router.push('/glass')}>CLOSE</ActionButton>
            </span>
            <span>
              {draft.lines.length ? <ActionButton onClick={() => window.print()}>PRINT</ActionButton> : null} <ActionButton onClick={save}>{isSaving ? 'SAVING...' : 'SAVE QUOTE'}</ActionButton>
            </span>
          </RowSpaceBetween>
        </>
      ) : null}
    </AppFrame>
  );
}
