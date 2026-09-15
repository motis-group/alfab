'use client';

import '@root/global.scss';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import CustomerPicker from '@components/CustomerPicker';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import QuoteDocument, { documentLines } from '@components/QuoteDocument';
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
import { QuoteDraft, applyQuoteLineResult, clearQuoteDraft, dropPendingLine, emptyQuoteDraft, peekQuoteDraft, persistQuoteDraft, reissueQuoteDraft, setQuoteMargin } from '@utils/quote-draft';
import { quoteEmail } from '@utils/quote-email';
import { QuoteRecord, findQuoteRecord } from '@utils/quote-register';
import { DEFAULT_QUOTE_MARGIN_PERCENT, SavedQuote, SavedQuoteLine, createQuote, findQuote, listQuotes, quoteMarginSummary, quotePaperLines, quoteReference, updateQuote } from '@utils/quote-store';
import { createClient } from '@utils/db-client';
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';

const TABLE_CUSTOMERS = 'customers';

/** The three calculators that price a line. The order is the order that the office uses. */
const LINE_KINDS: { label: string; source: PricingSource }[] = [
  { label: 'Window', source: 'window_calculator' },
  { label: 'Awning', source: 'awning_calculator' },
  { label: 'Cut Glass', source: 'adhoc_calculator' },
];

/** The page lists this many lines until the operator asks for all of them, so a long quote keeps its totals in view. */
const LINES_SHOWN = 10;

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
 * The calculator prices a quote line at cost. The quote sets one margin, and the margin prices every
 * line.
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
  /** A quote that a calculator wrote and that has no line this page can edit. */
  const [readOnly, setReadOnly] = useState<QuoteRecord | null>(null);
  /** Set while editing a quote that a calculator wrote. Saving rewrites the row. */
  const [carriedOver, setCarriedOver] = useState<{ from: string; dropped: number } | null>(null);
  /** The quotes saved to a customer. A new quote with no lines lists the ones for its customer. */
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  /** Adding to the customer list needs access to the customer records, not only to quotes. */
  const [canAddCustomer, setCanAddCustomer] = useState(false);
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showAllLines, setShowAllLines] = useState(false);

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
      setCanAddCustomer(userCan(user, 'master_data:write'));
      setUsername(user.username);

      const { data: customerData } = await createClient().from(TABLE_CUSTOMERS).select('*').order('name', { ascending: true });
      setCustomers((customerData as Customer[]) || []);

      // A new quote offers the saved quotes of its customer. A failed read does not stop the new quote.
      if (isNew) {
        const saved = await listQuotes().catch(() => null);
        setSavedQuotes(saved ? saved.filter((quote) => quote.savedToCustomer) : []);
        if (!saved) {
          setError('The saved quotes could not be read.');
        }
      }

      // A line returned from a calculator, or the operator cancelled. The quote waits in a draft.
      const result = consumeLineEditResult();
      const waiting = peekQuoteDraft();
      if (waiting && (waiting.id || null) === (isNew ? null : id)) {
        // Without a result the operator cancelled. A line added for this trip has no price. Remove that line.
        const restored = result && result.origin.kind === 'quote' ? applyQuoteLineResult(waiting, result) : dropPendingLine(waiting);
        // The stored draft follows the page. A second load, such as Reload or the double effect of
        // development mode, then finds the returned line and does not remove it.
        persistQuoteDraft(restored);
        setDraft(restored);
        // A line after the first ten that came back opens the full list, so the operator sees its price.
        // Only a result opens the list. A second load has no result, and leaves the list as it is.
        if (restored.lines.findIndex((line) => line.draft.localId === result?.localId) >= LINES_SHOWN) {
          setShowAllLines(true);
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
        setDraft({ id: quote.id, name: quote.name, customer: quote.customer, customerId: quote.customerId || '', date: quote.date ? quote.date.slice(0, 10) : todayISODate(), notes: quote.notes, marginPercent: quote.marginPercent, lines: quote.lines, pendingLineId: null, savedToCustomer: quote.savedToCustomer });
        return;
      }

      // Not a quote for a job. One of the calculators wrote it.
      const { record, errors } = await findQuoteRecord(id);

      // Its lines carry the calculator input, so this page can edit them. The row keeps its id, so
      // the number the customer holds still finds the quote after it is saved.
      if (record && record.editableLines.length) {
        // Its prices already hold the margin of the calculator, so the margin of the quote prices none of them.
        setDraft({ id: record.id, name: record.name, customer: record.customer, customerId: record.customerId || '', date: record.date ? record.date.slice(0, 10) : todayISODate(), notes: record.draft?.quoteNotes || '', marginPercent: DEFAULT_QUOTE_MARGIN_PERCENT, lines: record.editableLines, pendingLineId: null, savedToCustomer: false });
        setCarriedOver({ from: record.kindLabel, dropped: Math.max(0, record.lineCount - record.editableLines.length) });
        setError(errors.length ? errors.join(' ') : null);
        return;
      }

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
  // The same figures the paper prints. The page must not state a total that the document contradicts.
  const summary = quoteMarginSummary(draft.lines);
  const anyAtCost = draft.lines.some((line) => typeof line.unitCost === 'number');
  const reference = draft.id ? quoteReference(draft.id) : null;
  const selectedCustomer = customers.find((entry) => entry.id === draft.customerId) || null;
  const customerName = selectedCustomer?.name || draft.customer;

  /** Sends one line to the calculator that prices it. The quote waits in its draft. */
  function priceLine(line: LineDraft, lineLabel: string, pending: boolean, unitCost: number | null = null) {
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
      // The calculator prices a quote line at cost. A line with no cost yet is priced from its specification.
      line: { ...line, unitPriceAtOrder: unitCost ?? 0 },
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
    priceLine(line.draft, `Line ${index + 1}`, false, typeof line.unitCost === 'number' ? line.unitCost : null);
  }

  /** Opens a new quote that copies this quote. Nothing is written until Save Quote. */
  function reissue() {
    if (!draft.id) {
      return;
    }
    // The new quote reads the copy from the draft, as it does when a line returns from a calculator.
    persistQuoteDraft(reissueQuoteDraft({ ...draft, id: draft.id }));
    router.push('/glass/quotes/new');
  }

  /** Opens the mail client of the operator with the quotation written. */
  function sendQuote() {
    if (!paperLines.length) {
      setStatus(null);
      setError('A quote with no line is not an offer. Add a line first.');
      return;
    }

    const customer = customers.find((entry) => entry.id === draft.customerId);
    const email = quoteEmail({ reference, quoteName: draft.name, customerName: customer?.name || draft.customer, quoteDate: draft.date, notes: draft.notes, lines: paperLines }, customer?.contact_email || '');

    setError(null);
    setStatus(email.omitted ? `Opening a message. ${email.omitted} ${email.omitted === 1 ? 'line is' : 'lines are'} on the printed quote instead, because the message would be too long to open.` : 'Opening a message in your mail client.');

    if (typeof window !== 'undefined') {
      window.location.href = email.href;
    }
  }

  function removeLine(localId: string) {
    setDraft((current) => ({ ...current, lines: current.lines.filter((line) => line.draft.localId !== localId) }));
  }

  function update(partial: Partial<QuoteDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  /** A customer picked from the list names the quote. The name stays if the operator goes back to a walk-in. */
  function pickCustomer(customerId: string) {
    const picked = customers.find((entry) => entry.id === customerId);
    update(picked ? { customerId, customer: picked.name } : { customerId });
  }

  /** Puts a customer who is not on file on the customer list, and on this quote. */
  async function addCustomer() {
    const name = draft.customer.trim();
    if (!name) {
      setError('Type the name of the customer first.');
      return;
    }

    setError(null);
    setStatus(null);

    // One customer on two records splits their quotes and orders between the two records.
    const key = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
    const onFile = customers.find((entry) => key(entry.name) === key(name));
    if (onFile) {
      pickCustomer(onFile.id);
      setStatus(`${onFile.name} is already a customer. The quote is now for them.`);
      return;
    }

    setIsAddingCustomer(true);
    try {
      const { data, error: insertError } = await createClient().from(TABLE_CUSTOMERS).insert({ name, is_active: true }).select('id').single();
      if (insertError || !data?.id) {
        throw new Error(insertError?.message || 'The customer was saved but no record id came back.');
      }
      const added: Customer = { id: data.id as string, name, is_active: true };
      setCustomers((current) => [...current, added].sort((a, b) => a.name.localeCompare(b.name)));
      update({ customerId: added.id, customer: added.name });
      setStatus(`${added.name} is on the customer list. Save the quote to keep them on it.`);
    } catch (addError: any) {
      setError(addError?.message || 'Unable to add the customer.');
    } finally {
      setIsAddingCustomer(false);
    }
  }

  function setMargin(value: string) {
    const percent = Number(value);
    setDraft((current) => setQuoteMargin(current, Number.isFinite(percent) ? Math.max(0, percent) : 0));
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
      const content = { name: draft.name, customer: customers.find((entry) => entry.id === draft.customerId)?.name || draft.customer, customerId: draft.customerId || null, date: draft.date, notes: draft.notes, marginPercent: draft.marginPercent, lines: draft.lines, savedToCustomer: draft.savedToCustomer };
      const ratesUpdatedAt = draft.lines.map((line) => line.draft.windowRatesUpdatedAt || line.draft.awningRatesUpdatedAt).find(Boolean) || null;

      if (draft.id) {
        await updateQuote(draft.id, { ...content, issuedBy: username, ratesUpdatedAt });
        setStatus(`Quote ${quoteReference(draft.id)} saved.`);
        setCarriedOver(null);
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

  const heading = readOnly ? readOnly.reference || readOnly.name || 'QUOTE' : reference || (isNew ? 'NEW QUOTE' : 'QUOTE');

  // The actions are in the bar at the top. The messages that they show are directly below the bar.
  const printAction = { body: 'Print', onClick: () => window.print() };
  // A read-only quote has no priced line to put on an order, so it offers no Convert.
  const readOnlyActions = readOnly && documentLines(readOnly).length ? [printAction] : [];
  const addLineAction = { body: 'Add Line', items: LINE_KINDS.map((kind) => ({ icon: '⊹', children: kind.label, onClick: () => addLine(kind.source) })) };
  const draftActions = [addLineAction, { body: isSaving ? 'Saving...' : 'Save Quote', onClick: isSaving ? undefined : save }, ...(draft.lines.length ? [printAction, { body: 'Send', onClick: sendQuote }] : []), ...(draft.id && draft.lines.length ? [{ body: 'Reissue', onClick: reissue }] : [])];
  // A new quote with no lines lists the quotes saved to its customer, so the operator can copy one.
  const savedForCustomer = !draft.id && !draft.lines.length && draft.customerId ? savedQuotes.filter((quote) => quote.customerId === draft.customerId) : [];

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      heading={heading}
      badge={isLoading ? 'LOADING' : undefined}
      navRight={<ActionButton onClick={() => router.push('/glass')}>BACK TO QUOTES</ActionButton>}
      actionItems={[
        ...(isLoading ? [] : readOnly ? readOnlyActions : draftActions),
        { body: 'Reload', onClick: load },
        { body: 'Close', onClick: () => router.push('/glass') },
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

      {/* A quote that a calculator wrote, with no priced line to edit or to put on an order. */}
      {!isLoading && readOnly ? <QuoteDocument quote={readOnly} /> : null}

      {!isLoading && !readOnly ? (
        <>
          {draft.reissuedFrom ? (
            <Card title="REISSUED">
              <Text>This quote copies {draft.reissuedFrom.reference} of {draft.reissuedFrom.date}. The lines keep the prices of that quote. Edit a line to price it on today&apos;s rates.</Text>
              <br />
              {/* A copy of the wrong quote, or one left unsaved, is emptied in one step. The customer stays, so the saved quotes show again. */}
              <ActionButton
                onClick={() => {
                  clearQuoteDraft();
                  setDraft({ ...emptyQuoteDraft(), customer: draft.customer, customerId: draft.customerId });
                }}
              >
                Discard Copy
              </ActionButton>
            </Card>
          ) : null}
          {carriedOver ? (
            <Card title="WRITTEN IN THE CALCULATOR">
              <Text>The {carriedOver.from.toLowerCase()} calculator wrote this quote. Its lines are here and can be changed. Saving rewrites the quote in the shape this page uses. It keeps its number, so the copy the customer holds still refers to it.</Text>
              {carriedOver.dropped ? (
                <Text>
                  <span className="status-warning">
                    {carriedOver.dropped} line{carriedOver.dropped === 1 ? '' : 's'} had no price and {carriedOver.dropped === 1 ? 'is' : 'are'} not carried over. Add {carriedOver.dropped === 1 ? 'it' : 'them'} again to put {carriedOver.dropped === 1 ? 'a price on it' : 'prices on them'}.
                  </span>
                </Text>
              ) : null}
            </Card>
          ) : null}

          <CardDouble title="QUOTE">
            <Input label="JOB" name="quote_name" value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="What the job is called" />
            <CustomerPicker label="CUSTOMER" customers={customers} value={draft.customerId} onChange={(customerId) => pickCustomer(customerId)} />
            {selectedCustomer ? (
              <>
                <Text style={{ opacity: 0.7 }}>{[selectedCustomer.contact_name, selectedCustomer.phone].filter(Boolean).join(' · ') || 'No phone on this customer yet.'}</Text>
                <label>
                  <input type="checkbox" checked={draft.savedToCustomer} onChange={(event) => update({ savedToCustomer: event.target.checked })} /> Save to {selectedCustomer.name} to reissue later
                </label>
              </>
            ) : (
              <>
                <Input label="CUSTOMER NAME" name="quote_customer" value={draft.customer} onChange={(event) => update({ customer: event.target.value })} placeholder="Walk-in / company name" />
                {canAddCustomer && draft.customer.trim() ? <ActionButton onClick={isAddingCustomer ? undefined : addCustomer}>{isAddingCustomer ? 'Adding...' : 'Add To Customers'}</ActionButton> : null}
              </>
            )}
            <br />
            <Input label="DATE" type="date" name="quote_date" value={draft.date} onChange={(event) => update({ date: event.target.value })} />
            <Input label="NOTES" name="quote_notes" value={draft.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Anything the customer should read" />
            <Input label="MARGIN ON COST (%)" type="number" name="quote_margin" value={String(draft.marginPercent)} onChange={(event) => setMargin(event.target.value)} min="0" />
          </CardDouble>

          {savedForCustomer.length ? (
            <CardDouble title={`SAVED QUOTES (${savedForCustomer.length})`}>
              <Table>
                <TableRow>
                  <TableColumn>QUOTE</TableColumn>
                  <TableColumn style={{ width: '13ch' }}>DATE</TableColumn>
                  <TableColumn style={{ width: '8ch' }}>LINES</TableColumn>
                  <TableColumn style={{ width: '14ch' }}>TOTAL</TableColumn>
                  <TableColumn style={{ width: '12ch' }}>ACTIONS</TableColumn>
                </TableRow>
                {savedForCustomer.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableColumn>{[quote.reference, quote.name || 'Untitled'].join(' · ')}</TableColumn>
                    <TableColumn>{quote.date.slice(0, 10)}</TableColumn>
                    <TableColumn>{quote.lines.length}</TableColumn>
                    <TableColumn>{formatCurrency(quote.subtotal)}</TableColumn>
                    <TableColumn>
                      <ActionButton onClick={() => setDraft(reissueQuoteDraft(quote))}>Reissue</ActionButton>
                    </TableColumn>
                  </TableRow>
                ))}
              </Table>
            </CardDouble>
          ) : null}

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
                {(showAllLines ? draft.lines : draft.lines.slice(0, LINES_SHOWN)).map((line, index) => (
                  <TableRow key={line.draft.localId}>
                    <TableColumn>
                      {line.draft.lineNote || `${sourceLabel(line.draft.pricingSource)} ${index + 1}`}
                      {line.spec ? <div className="printed-quote__spec">{line.spec}</div> : null}
                      {typeof line.unitCost === 'number' ? null : (
                        <div className="printed-quote__spec">
                          <span className="status-warning">Priced with its own margin. Edit it to use the quote margin.</span>
                        </div>
                      )}
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
              <Text>No lines yet. Pick a kind under Add Line at the top. Its calculator prices the line at cost, and the line comes back here.</Text>
            )}
            {draft.lines.length > LINES_SHOWN ? (
              <>
                <br />
                <ActionButton onClick={() => setShowAllLines(!showAllLines)}>{showAllLines ? `Show First ${LINES_SHOWN} Lines` : `Show All ${draft.lines.length} Lines`}</ActionButton>
              </>
            ) : null}
            <br />
            {anyAtCost ? (
              <>
                <RowSpaceBetween>
                  <Text>COST</Text>
                  <Text>{formatCurrency(summary.cost)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>MARGIN ({draft.marginPercent}%)</Text>
                  <Text>{formatCurrency(summary.margin)}</Text>
                </RowSpaceBetween>
              </>
            ) : null}
            {summary.fixed ? (
              <RowSpaceBetween>
                <Text>LINES AT THEIR OWN MARGIN</Text>
                <Text>{formatCurrency(summary.fixed)}</Text>
              </RowSpaceBetween>
            ) : null}
            <RowSpaceBetween>
              <Text>QUOTE TOTAL (EXCLUDES GST)</Text>
              <Text>
                <span className="status-pill status-pill-success">{formatCurrency(summary.subtotal)}</span>
              </Text>
            </RowSpaceBetween>
          </CardDouble>

          {draft.lines.length ? (
            <CardDouble title="AS THE CUSTOMER READS IT">
              {/* The paper repeats every line, so it starts closed. Print uses the sheet below, so a closed paper still prints. */}
              <details>
                <summary style={{ cursor: 'pointer' }}>The quote on paper</summary>
                <QuotePaper reference={reference} quoteName={draft.name} customerName={customerName} quoteDate={draft.date} notes={draft.notes} lines={paperLines} />
              </details>
              <PrintedQuote reference={reference} quoteName={draft.name} customerName={customerName} quoteDate={draft.date} notes={draft.notes} lines={paperLines} />
            </CardDouble>
          ) : null}
        </>
      ) : null}
    </AppFrame>
  );
}
