'use client';

import '@root/global.scss';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import AwningCostingSheet, { AwningCostingSheetAwning, awningQuoteLines } from '@components/AwningCostingSheet';
import { CustomerQuoteContent, quoteFingerprint, quoteReference, saveCustomerQuote } from '@utils/customer-quote-store';
import Card from '@components/Card';
import SidebarTabs from '@components/SidebarTabs';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { Customer, UserRole, formatCurrency, todayISODate } from '@utils/order-management';
import { createClient } from '@utils/db-client';
import { AwningQuoteLine, persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';
import { AwningCostingInput, CostLine, GLAZING_ORDER, costAwning, costAwningBatches, createAwningInput, describeAwning } from '@utils/awning-costing';
import { AwningRates, DEFAULT_AWNING_RATES, GlazingId, mergeAwningRates } from '@utils/awning-costing-rates';
import { loadAwningRates, loadAwningRatesVersion } from '@utils/awning-costing-store';
import { saveAwningCosting } from '@utils/awning-quote-store';

const BATCH_SIZES = [1, 2, 5, 10];

interface QuoteItem {
  localId: string;
  name: string;
  input: AwningCostingInput;
}

function numberOrFallback(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatQty(line: CostLine): string {
  const qty = Number.isInteger(line.qty) ? String(line.qty) : line.qty.toFixed(2);
  return `${qty} ${line.unit}`;
}

function formatRate(rate: number | null): string {
  return rate == null ? 'not priced' : formatCurrency(rate);
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

function formatStamp(stamp: string | null): string {
  if (!stamp) {
    return 'code defaults';
  }
  const parsed = new Date(stamp);
  return Number.isNaN(parsed.getTime()) ? stamp : `saved ${parsed.toLocaleDateString()}`;
}

export default function AwningCostingPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('readonly');
  const [canSaveCostings, setCanSaveCostings] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  // The quote last saved for the customer, and the content it was saved with.
  const [issued, setIssued] = useState<{ id: string; fingerprint: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'warning'; message: string } | null>(null);

  const [rates, setRates] = useState<AwningRates>(DEFAULT_AWNING_RATES);
  const [ratesSource, setRatesSource] = useState<'saved' | 'default'>('default');
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [input, setInput] = useState<AwningCostingInput>(() => createAwningInput());
  const [awningName, setAwningName] = useState('');
  const [quoteName, setQuoteName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [quoteDate, setQuoteDate] = useState(todayISODate());
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  // Customer by default, so a browser Cmd+P prints the safe document. The internal button raises it
  // for one print and `afterprint` puts it back.
  const [sheetAudience, setSheetAudience] = useState<'internal' | 'customer'>('customer');
  const [comparison, setComparison] = useState<{ id: string; quoted: number | null; today: number | null; onOriginal: number | null } | null>(null);

  const describe = useCallback((forInput: AwningCostingInput) => describeAwning(forInput, rates), [rates]);
  const result = useMemo(() => costAwning(input, rates), [input, rates]);
  const batches = useMemo(() => (result.errors.length ? [] : costAwningBatches(input, rates, BATCH_SIZES)), [input, rates, result.errors.length]);
  const ratesLabel = ratesSource === 'saved' ? formatStamp(ratesUpdatedAt) : 'code defaults';

  const quoteLines = useMemo(
    () =>
      quoteItems.map((item) => {
        const itemResult = costAwning(item.input, rates);
        return { item, result: itemResult, total: itemResult.runTotal };
      }),
    [quoteItems, rates]
  );
  const quoteTotal = quoteLines.reduce((sum, line) => sum + (line.total ?? 0), 0);

  // The quote prints the awnings it holds; a quote with none prints the awning on screen.
  const sheetAwnings: AwningCostingSheetAwning[] = quoteLines.length ? quoteLines.map((line) => ({ id: line.item.localId, name: line.item.name, quantity: line.result.qty, input: line.item.input, result: line.result })) : [{ id: 'current', name: awningName, quantity: result.qty, input, result }];

  const summary = useMemo(() => {
    if (result.price == null) {
      return '';
    }

    const header = [`${quoteName.trim() || 'Awning quote'}`, `Customer: ${customerName.trim() || 'Walk-in / Phone'}`, `Date: ${quoteDate}`];

    if (quoteLines.length) {
      return [...header, ...quoteLines.map((line, index) => `${index + 1}. ${line.item.name || describe(line.item.input)} | ${line.result.qty} x ${formatCurrency(line.result.price)} = ${formatCurrency(line.total)}`), `Quote total: ${formatCurrency(quoteTotal)}`, quoteNotes.trim() ? `Notes: ${quoteNotes.trim()}` : ''].filter(Boolean).join('\n');
    }

    return [...header, `Awning: ${describe(input)}`, `Price each: ${formatCurrency(result.price)}`, `Qty: ${result.qty} | Total: ${formatCurrency(result.runTotal)}`, quoteNotes.trim() ? `Notes: ${quoteNotes.trim()}` : ''].filter(Boolean).join('\n');
  }, [customerName, describe, input, quoteDate, quoteLines, quoteName, quoteNotes, quoteTotal, result]);

  // Put the sheet back to the customer copy once a print finishes, so the next Cmd+P is safe.
  useEffect(() => {
    const restore = () => setSheetAudience('customer');
    window.addEventListener('afterprint', restore);
    return () => window.removeEventListener('afterprint', restore);
  }, []);


  const selectedCustomer = customers.find((entry) => entry.id === customerId) || null;

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const user = await fetchCurrentSessionUser();
        if (!user) {
          router.push('/login');
          return;
        }

        setRole(user.effectiveRole as UserRole);
        setCanSaveCostings(userCan(user, 'quotes:write'));
        setUsername(user.username);

        const { data: customerData } = await createClient().from('customers').select('*').order('name', { ascending: true });
        setCustomers((customerData as Customer[]) || []);

        const loaded = await loadAwningRates();
        setRates(loaded.rates);
        setRatesSource(loaded.source);
        setRatesUpdatedAt(loaded.updatedAt);
        setRatesError(loaded.error);

      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load awning costing.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  function update(patch: Partial<AwningCostingInput>) {
    setInput((prev) => ({ ...prev, ...patch }));
  }

  function updateNumber(field: keyof AwningCostingInput, value: string, minimum = 0) {
    update({ [field]: Math.max(minimum, numberOrFallback(value, minimum)) } as Partial<AwningCostingInput>);
  }

  function resetCalculator() {
    setInput(createAwningInput());
    setAwningName('');
    setQuoteName('');
    setCustomerName('');
    setCustomerId('');
    setQuoteDate(todayISODate());
    setQuoteNotes('');
    setQuoteItems([]);
    setStatus(null);
  }

  function addToQuote() {
    if (result.price == null) {
      return;
    }

    setQuoteItems((prev) => [
      ...prev,
      {
        localId: `awning-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: awningName.trim() || describe(input),
        input: { ...input },
      },
    ]);
    setStatus({ tone: 'success', message: `Added to the quote. ${quoteItems.length + 1} awning${quoteItems.length ? 's' : ''} on this quote.` });
  }

  function editQuoteItem(localId: string) {
    const item = quoteItems.find((entry) => entry.localId === localId);
    if (!item) {
      return;
    }

    setInput({ ...item.input });
    setAwningName(item.name);
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
    setStatus({ tone: 'success', message: 'Loaded into the form.' });
  }

  function removeQuoteItem(localId: string) {
    setQuoteItems((prev) => prev.filter((entry) => entry.localId !== localId));
  }

  async function copySummary() {
    if (!summary) {
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setStatus({ tone: 'success', message: 'Copied. Prices only, safe to send to a customer.' });
    } catch {
      setStatus({ tone: 'warning', message: 'Clipboard copy failed.' });
    }
  }

  /** The cost build-up, for Alfab only. Never paste this to a customer. */
  async function copyCostBreakdown() {
    if (result.price == null) {
      return;
    }

    const text = [`INTERNAL — ${quoteName.trim() || 'Awning costing'} — do not send to a customer`, `Awning: ${describe(input)}`, `Rates: ${ratesLabel}`, `Total cost: ${formatCurrency(result.subtotal)} | Margin ${formatPercent(result.marginRate)}: ${formatCurrency(result.margin)}`, `Price each: ${formatCurrency(result.price)} | ${result.qty} off: ${formatCurrency(result.runTotal)}`, result.unpriced.length ? `Not priced (charged as nil): ${result.unpriced.map((entry) => entry.label).join(', ')}` : ''].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setStatus({ tone: 'warning', message: 'Copied the cost build-up (internal).' });
    } catch {
      setStatus({ tone: 'warning', message: 'Clipboard copy failed.' });
    }
  }

  // The customer copy on screen, as a print would record it. A reprint of unchanged content reuses
  // the quote already saved; any change is a different offer and prints as a draft until it is saved.
  const printedQuote: CustomerQuoteContent = { kind: 'awning-quote', name: quoteName, customer: selectedCustomer?.name || customerName, customerId: customerId || null, date: quoteDate, notes: quoteNotes, lines: awningQuoteLines(sheetAwnings, rates) };
  const printedFingerprint = quoteFingerprint(printedQuote);
  const reference = issued && issued.fingerprint === printedFingerprint ? quoteReference(issued.id) : null;

  /** Saves the customer copy so the print carries a number. False, with the reason on screen, when it cannot. */
  async function issueQuote(): Promise<boolean> {
    if (!canSaveCostings) {
      setStatus({ tone: 'warning', message: 'A numbered quote is saved as it prints, and saving quotes needs access. Cmd+P prints a draft.' });
      return false;
    }
    if (!printedQuote.lines.some((line) => line.unitPrice != null)) {
      setStatus({ tone: 'warning', message: 'Nothing on this quote has a price, so there is no offer to print.' });
      return false;
    }

    try {
      const id = await saveCustomerQuote({ ...printedQuote, issuedBy: username, ratesUpdatedAt });
      setIssued({ id, fingerprint: printedFingerprint });
      setStatus({ tone: 'success', message: `Quote ${quoteReference(id)} saved. It is in the order list.` });
      return true;
    } catch (saveError: any) {
      setStatus({ tone: 'warning', message: `The quote was not saved, so it was not printed. ${saveError?.message || ''}`.trim() });
      return false;
    }
  }

  async function printSheet(audience: 'internal' | 'customer') {
    if (audience === 'customer' && !reference && !(await issueQuote())) {
      return;
    }
    setSheetAudience(audience);
    if (typeof window !== 'undefined') {
      // Let the sheet re-render for the chosen audience before the print dialog reads the page.
      window.setTimeout(() => window.print(), 50);
    }
  }

  async function handleSaveCosting() {
    if (!canSaveCostings || result.price == null) {
      return;
    }

    try {
      await saveAwningCosting({
        name: awningName.trim() || quoteName.trim() || describe(input),
        customer: selectedCustomer?.name || customerName,
        input,
        result,
        ratesUpdatedAt,
      });
      setStatus({ tone: 'success', message: 'Costing saved. Load it again from Saved costings.' });
    } catch (saveError: any) {
      setStatus({ tone: 'warning', message: saveError?.message || 'Unable to save the costing.' });
    }
  }

  function handleCreatePurchaseOrder() {
    const lines: AwningQuoteLine[] = quoteLines.length
      ? quoteLines
          .filter((line) => line.result.price != null)
          .map((line) => ({
            description: line.item.name || describe(line.item.input),
            quantity: line.result.qty,
            unitPrice: line.result.price as number,
            awningSpec: line.item.input,
            ratesUpdatedAt,
          }))
      : result.price == null
        ? []
        : [
            {
              description: awningName.trim() || describe(input),
              quantity: result.qty,
              unitPrice: result.price,
              awningSpec: input,
              ratesUpdatedAt,
            },
          ];

    if (!lines.length) {
      router.push('/glass/new');
      return;
    }

    persistQuoteToOrderDraft({
      kind: 'awning',
      quoteName,
      customerName: selectedCustomer?.name || customerName,
      customerId: customerId || null,
      quoteDate,
      quoteNotes,
      awningLines: lines,
    });
    router.push('/glass/new?fromQuote=1');
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navRight={<ActionButton onClick={() => router.push('/glass')}>ORDER DASHBOARD</ActionButton>}
      heading="AWNING COSTING"
      badge={isLoading ? 'LOADING' : `${role.toUpperCase()} SESSION`}
      sidebarWidthCh={48}
      sidebarMobileOrder="top"
      sidebar={
        <>
          {/* Actions are on the toolbar. */}
          {status ? (
            <Card title="LAST ACTION">
              <Text>
                <span className={status.tone === 'success' ? 'status-success' : 'status-warning'}>{status.message}</span>
              </Text>
            </Card>
          ) : null}

          <Card title="PRICE">
            {result.errors.length ? (
              result.errors.map((message) => (
                <Text key={message}>
                  <span className="status-error">{message}</span>
                </Text>
              ))
            ) : (
              <>
                <RowSpaceBetween>
                  <Text>TOTAL COST</Text>
                  <Text>{formatCurrency(result.subtotal)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>MARGIN ({formatPercent(result.marginRate)} OF COST)</Text>
                  <Text>{formatCurrency(result.margin)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>PRICE EACH</Text>
                  <Text>
                    <span className="status-pill status-pill-success">{formatCurrency(result.price)}</span>
                  </Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>THIS RUN ({result.qty} x)</Text>
                  <Text>{formatCurrency(result.runTotal)}</Text>
                </RowSpaceBetween>
              </>
            )}

            {result.warnings.map((message) => (
              <Text key={message}>
                <span className="status-warning">{message}</span>
              </Text>
            ))}
          </Card>

          {result.unpriced.length ? (
            <Card title="NOT PRICED">
              <Text>
                <span className="status-warning">No rate; charged as nil.</span>
              </Text>
              <Table>
                {result.unpriced.map((entry) => (
                  <TableRow key={entry.label}>
                    <TableColumn style={{ width: '28ch' }}>{entry.label}</TableColumn>
                    <TableColumn>{entry.path ? <ActionButton onClick={() => router.push(`/settings/awnings#rate-${entry.path}`)}>Set Rate</ActionButton> : null}</TableColumn>
                  </TableRow>
                ))}
              </Table>
            </Card>
          ) : null}





          {/* Analysis cards are tabbed; only the open panel is rendered. */}
          <SidebarTabs
            aria-label="Costing detail"
            tabs={[
              {
                id: 'breakdown',
                label: 'Breakdown',
                content: (
                  <>
                    <Card title="BREAKDOWN">
                      <Table>
                        <TableRow>
                          <TableColumn style={{ width: '26ch' }}>COMPONENT</TableColumn>
                          <TableColumn style={{ width: '10ch' }}>QTY</TableColumn>
                          <TableColumn style={{ width: '10ch' }}>RATE</TableColumn>
                          <TableColumn>COST</TableColumn>
                        </TableRow>
                        {result.lines.map((line) => (
                          <TableRow key={line.key}>
                            <TableColumn>{line.label}</TableColumn>
                            <TableColumn>{formatQty(line)}</TableColumn>
                            <TableColumn>{formatRate(line.rate)}</TableColumn>
                            <TableColumn>{formatCurrency(line.cost)}</TableColumn>
                          </TableRow>
                        ))}
                      </Table>

                      {result.glazing.length ? (
                        <>
                          <br />
                          <Text>GLAZING</Text>
                          <Table>
                            {result.glazing.map((line) => (
                              <TableRow key={line.key}>
                                <TableColumn style={{ width: '26ch' }}>{line.label}</TableColumn>
                                <TableColumn style={{ width: '10ch' }}>{formatQty(line)}</TableColumn>
                                <TableColumn style={{ width: '10ch' }}>{formatRate(line.rate)}</TableColumn>
                                <TableColumn>{formatCurrency(line.cost)}</TableColumn>
                              </TableRow>
                            ))}
                          </Table>
                        </>
                      ) : null}

                      <br />
                      <Text>LABOUR MINUTES</Text>
                      <Table>
                        <TableRow>
                          <TableColumn style={{ width: '26ch' }}>SETUP, SHARED ACROSS {result.qty}</TableColumn>
                          <TableColumn>{result.minutes.setup.toFixed(1)}</TableColumn>
                        </TableRow>
                        <TableRow>
                          <TableColumn>PER AWNING</TableColumn>
                          <TableColumn>{result.minutes.each.toFixed(1)}</TableColumn>
                        </TableRow>
                        {result.minutes.sundry ? (
                          <TableRow>
                            <TableColumn>SUNDRY</TableColumn>
                            <TableColumn>{result.minutes.sundry.toFixed(1)}</TableColumn>
                          </TableRow>
                        ) : null}
                        <TableRow>
                          <TableColumn>TOTAL EACH</TableColumn>
                          <TableColumn>{result.minutes.total.toFixed(1)}</TableColumn>
                        </TableRow>
                      </Table>
                    </Card>
                    <Card title="SIZE">
                      <RowSpaceBetween>
                        <Text>GLASS AREA</Text>
                        <Text>{result.areaSqm.toFixed(3)} m²</Text>
                      </RowSpaceBetween>
                      <RowSpaceBetween>
                        <Text>PERIMETER</Text>
                        <Text>{result.perimeterM.toFixed(3)} m</Text>
                      </RowSpaceBetween>
                      <Text style={{ opacity: 0.7 }}>Frame, seal, track infill and flat polish are priced on the glass perimeter.</Text>
                    </Card>
                  </>
                ),
              },
              {
                id: 'batch',
                label: 'Batch',
                content: (
                  <>
                    {batches.length ? (
                      <Card title="BATCH PRICE">
                        <Text>Setup labour is divided across the run.</Text>
                        <Table>
                          <TableRow>
                            <TableColumn style={{ width: '12ch' }}>RUN</TableColumn>
                            <TableColumn style={{ width: '16ch' }}>PER EACH</TableColumn>
                            <TableColumn>SAVING</TableColumn>
                          </TableRow>
                          {batches.map((batch) => (
                            <TableRow key={batch.batchSize}>
                              <TableColumn>{batch.batchSize}</TableColumn>
                              <TableColumn>{formatCurrency(batch.pricePerUnit)}</TableColumn>
                              <TableColumn>{batch.batchSize === 1 ? '—' : formatCurrency(batch.saving)}</TableColumn>
                            </TableRow>
                          ))}
                        </Table>
                      </Card>
                    ) : null}
                  </>
                ),
              },
              {
                id: 'rates',
                label: 'Rates',
                content: (
                  <>
                    <Card title="RATES">
                      <Text>{ratesSource === 'saved' ? `Using awning rates ${ratesLabel}.` : 'Using the default awning rates.'}</Text>
                      {ratesError ? (
                        <Text>
                          <span className="status-warning">{ratesError}</span>
                        </Text>
                      ) : null}
                      <br />
                      <ActionButton onClick={() => router.push('/settings/awnings')}>Open Awning Rates</ActionButton>
                    </Card>
                  </>
                ),
              },
            ]}
          />


        </>
      }
      actionItems={[
        {
          body: 'Add',
          items: [
            { icon: '⊹', children: 'Add Awning To Quote', onClick: addToQuote },
            { icon: '⊹', children: 'Create Purchase Order', onClick: handleCreatePurchaseOrder },
          ],
        },
        {
          body: 'Print',
          items: [
            { icon: '⊹', children: 'Quote For Customer', onClick: () => printSheet('customer') },
            { icon: '⊹', children: 'Costing Sheet (internal)', onClick: () => printSheet('internal') },
          ],
        },
        {
          body: 'Copy',
          items: [
            { icon: '⊹', children: 'Prices For Customer', onClick: copySummary },
            { icon: '⊹', children: 'Cost Build-up (internal)', onClick: copyCostBreakdown },
          ],
        },
        { body: canSaveCostings ? 'Save Costing' : 'Saving Needs Access', onClick: canSaveCostings ? handleSaveCosting : undefined },
        { body: 'Reset', onClick: resetCalculator },
      ]}
    >
      {error && (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      )}

      <CardDouble title="AWNING">
        <Text style={{ opacity: 0.7 }}>Glass size, not opening size.</Text>
        <br />
        <Input label="GLASS HEIGHT (MM)" type="number" name="awning_height" value={String(input.heightMm)} onChange={(event) => updateNumber('heightMm', event.target.value)} min="0" />
        <Input label="GLASS WIDTH (MM)" type="number" name="awning_width" value={String(input.widthMm)} onChange={(event) => updateNumber('widthMm', event.target.value)} min="0" />
        <Input label="QTY OF THIS SIZE" type="number" name="awning_qty" value={String(input.qty)} onChange={(event) => updateNumber('qty', event.target.value, 1)} min="1" />
        <Text style={{ opacity: 0.7 }}>
          Setup labour divides across the run, so the price for each falls as the quantity grows. {result.qty} off shares {rates.labour.setupMinutes} minutes of setup.
        </Text>
        <br />

        <Input label="SUNDRY LABOUR (MINUTES)" type="number" name="awning_sundry" value={String(input.sundryMinutes)} onChange={(event) => updateNumber('sundryMinutes', event.target.value)} min="0" />
      </CardDouble>

      <CardDouble title="GLAZING & OPTIONS">
        <Text>GLASS</Text>
        <select value={input.glazingId ?? ''} onChange={(event) => update({ glazingId: (event.target.value || null) as GlazingId | null })}>
          <option value="">No glass</option>
          {GLAZING_ORDER.map((id) => (
            <option key={id} value={id}>
              {rates.glass.options[id].label}
              {rates.glass.options[id].list == null ? ' (no rate yet)' : ''}
            </option>
          ))}
        </select>
        <br />

        <label>
          <input type="checkbox" checked={input.banding} onChange={(event) => update({ banding: event.target.checked })} /> Ceramic banding (fixed price)
        </label>
        <br />
        <label>
          <input type="checkbox" checked={input.flatPolish} onChange={(event) => update({ flatPolish: event.target.checked })} /> Flat polish on the glass perimeter
        </label>
        <br />
        <label>
          <input type="checkbox" checked={input.flyscreen} onChange={(event) => update({ flyscreen: event.target.checked })} /> Flyscreen and clips
        </label>
        <Text style={{ opacity: 0.7 }}>Flyscreen is a selling price in the source sheet and is marked up again. Kept as the sheet had it.</Text>
        <br />
        <Input label="AWNING NAME (OPTIONAL)" name="awning_name" value={awningName} onChange={(event) => setAwningName(event.target.value)} placeholder="Port side, cabin window..." />
        <br />
        <ActionButton onClick={addToQuote}>Add Awning To Quote</ActionButton>
      </CardDouble>

      <CardDouble title="QUOTE">
        <Input label="QUOTE NAME" name="quote_name" value={quoteName} onChange={(event) => setQuoteName(event.target.value)} placeholder="Job reference" />
        <br />
        <Text>CUSTOMER</Text>
        <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          <option value="">Walk-in / not on file</option>
          {customers
            .filter((customer) => customer.is_active !== false)
            .map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
        </select>
        {selectedCustomer ? <Text style={{ opacity: 0.7 }}>{[selectedCustomer.contact_name, selectedCustomer.phone].filter(Boolean).join(' · ') || 'No phone on this customer yet.'}</Text> : <Input label="CUSTOMER NAME" name="quote_customer" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in / company name" />}
        <br />
        <Input label="QUOTE DATE" type="date" name="quote_date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} />
        <Input label="QUOTE NOTES" name="quote_notes" value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} />
      </CardDouble>

      <CardDouble title={`QUOTE LINES (${quoteLines.length})`}>
        {quoteLines.length ? (
          <>
            <Table>
              <TableRow>
                <TableColumn>AWNING</TableColumn>
                <TableColumn style={{ width: '8ch' }}>QTY</TableColumn>
                <TableColumn style={{ width: '14ch' }}>EACH</TableColumn>
                <TableColumn style={{ width: '14ch' }}>TOTAL</TableColumn>
                <TableColumn style={{ width: '18ch' }}>ACTIONS</TableColumn>
              </TableRow>
              {quoteLines.map((line) => (
                <TableRow key={line.item.localId}>
                  <TableColumn>{line.item.name}</TableColumn>
                  <TableColumn>{line.result.qty}</TableColumn>
                  <TableColumn>{formatCurrency(line.result.price)}</TableColumn>
                  <TableColumn>{formatCurrency(line.total)}</TableColumn>
                  <TableColumn style={{ whiteSpace: 'nowrap' }}>
                    <ActionButton onClick={() => editQuoteItem(line.item.localId)}>Edit</ActionButton> <ActionButton onClick={() => removeQuoteItem(line.item.localId)}>Remove</ActionButton>
                  </TableColumn>
                </TableRow>
              ))}
            </Table>
            <br />
            <RowSpaceBetween>
              <Text>QUOTE TOTAL</Text>
              <Text>
                <span className="status-pill status-pill-success">{formatCurrency(quoteTotal)}</span>
              </Text>
            </RowSpaceBetween>
          </>
        ) : (
          <Text>No awnings on this quote.</Text>
        )}
      </CardDouble>

      <AwningCostingSheet audience={sheetAudience} reference={reference} quoteName={quoteName} customerName={selectedCustomer?.name || customerName} quoteDate={quoteDate} notes={quoteNotes} ratesLabel={ratesLabel} rates={rates} awnings={sheetAwnings} />
    </AppFrame>
  );
}
