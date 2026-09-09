'use client';

import '@root/global.scss';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import AwningCostingSheet, { AwningCostingSheetAwning } from '@components/AwningCostingSheet';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';
import { RateReviewCard } from '@components/RateAgeNotice';

import QuoteStatusControl, { WinRateCard } from '@components/QuoteStatusControl';
import { QuoteStatus, setQuoteStatus, winRate } from '@utils/quote-status';
import JobPanel, { useJob } from '@components/JobPanel';
import { addToJob, jobLineId } from '@utils/job-basket';
import { APP_NAVIGATION_ITEMS } from '@utils/app-navigation';
import { Customer, UserRole, formatCurrency, todayISODate } from '@utils/order-management';
import { createClient } from '@utils/db-client';
import { AwningQuoteLine, persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { fetchCurrentSessionUser, userCan } from '@utils/session-client';
import { AwningCostingInput, CostLine, GLAZING_ORDER, costAwning, costAwningBatches, createAwningInput, describeAwning } from '@utils/awning-costing';
import { AwningRates, DEFAULT_AWNING_RATES, GlazingId, mergeAwningRates } from '@utils/awning-costing-rates';
import { loadAwningRates, loadAwningRatesVersion } from '@utils/awning-costing-store';
import { SavedAwningCosting, deleteAwningCosting, listAwningCostings, saveAwningCosting } from '@utils/awning-quote-store';

const navigationItems = APP_NAVIGATION_ITEMS;
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
  const [savedCostings, setSavedCostings] = useState<SavedAwningCosting[]>([]);
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

  const outcomes = useMemo(() => winRate(savedCostings), [savedCostings]);
  const [job, setJob] = useJob();

  const selectedCustomer = customers.find((entry) => entry.id === customerId) || null;

  const refreshSavedCostings = useCallback(async () => {
    try {
      setSavedCostings(await listAwningCostings());
    } catch (loadError: any) {
      setStatus({ tone: 'warning', message: loadError?.message || 'Unable to load saved costings.' });
    }
  }, []);

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

        const { data: customerData } = await createClient().from('customers').select('*').order('name', { ascending: true });
        setCustomers((customerData as Customer[]) || []);

        const loaded = await loadAwningRates();
        setRates(loaded.rates);
        setRatesSource(loaded.source);
        setRatesUpdatedAt(loaded.updatedAt);
        setRatesError(loaded.error);

        await refreshSavedCostings();
      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load awning costing.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshSavedCostings, router]);

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
    setStatus({ tone: 'success', message: 'Loaded back into the form. Add it to the quote when you are done.' });
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
      setStatus({ tone: 'warning', message: 'Copied the cost build-up. It shows your margin, so keep it internal.' });
    } catch {
      setStatus({ tone: 'warning', message: 'Clipboard copy failed.' });
    }
  }

  function printSheet(audience: 'internal' | 'customer') {
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
      await refreshSavedCostings();
      setStatus({ tone: 'success', message: 'Costing saved. Load it again from Saved costings.' });
    } catch (saveError: any) {
      setStatus({ tone: 'warning', message: saveError?.message || 'Unable to save the costing.' });
    }
  }

  /** What was quoted, what it costs today, and what it recomputes to on the rates that priced it. */
  async function compareCosting(costing: SavedAwningCosting) {
    // No stamp means it was priced on the code defaults, which are still reproducible.
    const original = costing.ratesUpdatedAt ? await loadAwningRatesVersion(costing.ratesUpdatedAt).catch(() => null) : mergeAwningRates(null);
    setComparison({
      id: costing.id,
      quoted: costing.price,
      today: costAwning(costing.input, rates).price,
      onOriginal: original ? costAwning(costing.input, original).price : null,
    });
  }

  function loadSavedCosting(costing: SavedAwningCosting) {
    setInput({ ...costing.input });
    setAwningName(costing.name);
    if (costing.customer) {
      setCustomerName(costing.customer);
    }
    setStatus({
      tone: costing.ratesUpdatedAt === ratesUpdatedAt ? 'success' : 'warning',
      message: costing.ratesUpdatedAt === ratesUpdatedAt ? `Loaded "${costing.name}".` : `Loaded "${costing.name}". It was priced on older rates, so the price here may differ from ${formatCurrency(costing.price)}.`,
    });
  }

  async function markCosting(id: string, status: QuoteStatus, reason?: string | null) {
    try {
      await setQuoteStatus(id, status, reason);
      await refreshSavedCostings();
    } catch (markError: any) {
      setStatus({ tone: 'warning', message: markError?.message || 'Unable to mark the costing.' });
    }
  }

  async function removeSavedCosting(costing: SavedAwningCosting) {
    try {
      await deleteAwningCosting(costing.id);
      await refreshSavedCostings();
    } catch (deleteError: any) {
      setStatus({ tone: 'warning', message: deleteError?.message || 'Unable to delete the costing.' });
    }
  }

  function addJobLines() {
    const lines = quoteLines.length ? quoteLines.filter((line) => line.result.price != null).map((line) => ({ id: jobLineId('awning'), kind: 'awning' as const, description: line.item.name || describe(line.item.input), quantity: line.result.qty, unitPrice: line.result.price as number, awningSpec: line.item.input, ratesUpdatedAt })) : result.price == null ? [] : [{ id: jobLineId('awning'), kind: 'awning' as const, description: awningName.trim() || describe(input), quantity: result.qty, unitPrice: result.price, awningSpec: input, ratesUpdatedAt }];

    if (!lines.length) {
      return;
    }

    setJob(addToJob(lines, { name: quoteName, customerName: selectedCustomer?.name || customerName, customerId: customerId || null, notes: quoteNotes }));
    setQuoteItems([]);
    setStatus({ tone: 'success', message: `Added to the job. Price windows or cut glass and they land on the same order.` });
  }

  function createOrderForJob() {
    if (!job.lines.length) {
      return;
    }
    persistQuoteToOrderDraft({ kind: 'job', quoteName: job.name || quoteName, customerName: job.customerName || customerName, customerId: job.customerId, quoteDate, quoteNotes: job.notes || quoteNotes, jobLines: job.lines });
    router.push('/glass/new?fromQuote=1');
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
      navigationItems={navigationItems}
      navLabel="AWNING COSTING"
      navRight={<ActionButton onClick={() => router.push('/glass')}>ORDER DASHBOARD</ActionButton>}
      heading="AWNING COSTING"
      badge={isLoading ? 'LOADING' : `${role.toUpperCase()} SESSION`}
      sidebarWidthCh={48}
      sidebarMobileOrder="top"
      sidebar={
        <>
          <Card title="QUICK ACTIONS">
            <ActionButton onClick={addToQuote}>Add Awning To Quote</ActionButton>
            <br />
            <ActionButton onClick={addJobLines}>Add To Job</ActionButton>
            <br />
            <ActionButton onClick={handleCreatePurchaseOrder}>Create Purchase Order</ActionButton>
            <br />
            <ActionButton onClick={() => printSheet('customer')}>Print Quote For Customer</ActionButton>
            <br />
            <ActionButton onClick={() => printSheet('internal')}>Print Costing Sheet (internal)</ActionButton>
            <br />
            <ActionButton onClick={copySummary}>Copy Prices For Customer</ActionButton>
            <br />
            <ActionButton onClick={copyCostBreakdown}>Copy Cost Build-up (internal)</ActionButton>
            <br />
            <ActionButton onClick={canSaveCostings ? handleSaveCosting : undefined}>{canSaveCostings ? 'Save Costing' : 'Saving Needs Access'}</ActionButton>
            <br />
            <ActionButton onClick={resetCalculator}>Reset</ActionButton>
            {status ? (
              <>
                <br />
                <Text>
                  <span className={status.tone === 'success' ? 'status-success' : 'status-warning'}>{status.message}</span>
                </Text>
              </>
            ) : null}
          </Card>

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
                <span className="status-warning">These lines have no rate and are charged as nil.</span>
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

          {batches.length ? (
            <Card title="BATCH PRICE">
              <Text>Setup labour is shared across a run, so a larger run costs less each.</Text>
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
            <Text style={{ opacity: 0.7 }}>The frame, the rubber seal, the track infill and the flat polish are all cut to the glass perimeter.</Text>
          </Card>

          <WinRateCard tally={outcomes} quotes={savedCostings} />

          <RateReviewCard asAt={rates.asAt} label={(key) => ({ parts: 'Parts', quantities: 'Fixed quantities', labour: 'Labour', glass: 'Glass', marginRate: 'Margin' })[key] || key} action={<ActionButton onClick={() => router.push('/settings/awnings')}>Review Awning Rates</ActionButton>} />

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
      }
      actionItems={[
        { body: 'Reset', onClick: resetCalculator },
        { body: 'Add To Quote', onClick: addToQuote },
        { body: 'Print For Customer', onClick: () => printSheet('customer') },
        { body: 'Copy Prices', onClick: copySummary },
        { body: 'New PO', onClick: handleCreatePurchaseOrder },
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
        <Text style={{ opacity: 0.7 }}>Sizes are the glass, not the opening. The frame is cut to the glass.</Text>
        <br />
        <Input label="GLASS HEIGHT (MM)" type="number" name="awning_height" value={String(input.heightMm)} onChange={(event) => updateNumber('heightMm', event.target.value)} min="0" />
        <Input label="GLASS WIDTH (MM)" type="number" name="awning_width" value={String(input.widthMm)} onChange={(event) => updateNumber('widthMm', event.target.value)} min="0" />
        <Input label="QTY OF THIS SIZE" type="number" name="awning_qty" value={String(input.qty)} onChange={(event) => updateNumber('qty', event.target.value, 1)} min="1" />
        <Text style={{ opacity: 0.7 }}>
          Setup labour divides across the run, so the price for each falls as the quantity grows. {result.qty} off shares {rates.labour.setupMinutes} minutes of setup.
        </Text>
        <br />

        <Input label="AWNING NAME (OPTIONAL)" name="awning_name" value={awningName} onChange={(event) => setAwningName(event.target.value)} placeholder="Port side, cabin window..." />
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
          <input type="checkbox" checked={input.banding} onChange={(event) => update({ banding: event.target.checked })} /> Ceramic banding (set price, whatever the size)
        </label>
        <br />
        <label>
          <input type="checkbox" checked={input.flatPolish} onChange={(event) => update({ flatPolish: event.target.checked })} /> Flat polish on the glass perimeter
        </label>
        <br />
        <label>
          <input type="checkbox" checked={input.flyscreen} onChange={(event) => update({ flyscreen: event.target.checked })} /> Flyscreen and clips
        </label>
        <Text style={{ opacity: 0.7 }}>The flyscreen line is a selling price in the source sheet and is still inside the cost the margin is taken on, so it is marked up twice. Kept as the sheet had it.</Text>
      </CardDouble>

      <CardDouble title="QUOTE DETAILS">
        <Input label="QUOTE NAME" name="quote_name" value={quoteName} onChange={(event) => setQuoteName(event.target.value)} placeholder="Boat name, job reference..." />
        <br />
        <Text>CUSTOMER</Text>
        <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          <option value="">Walk-in / phone (type a name)</option>
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
        <Input label="NOTES" name="quote_notes" value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} />
      </CardDouble>

      <CardDouble title={`QUOTE (${quoteLines.length} AWNING${quoteLines.length === 1 ? '' : 'S'})`}>
        {quoteLines.length ? (
          <>
            <Table>
              <TableRow>
                <TableColumn style={{ width: '34ch' }}>AWNING</TableColumn>
                <TableColumn style={{ width: '8ch' }}>QTY</TableColumn>
                <TableColumn style={{ width: '14ch' }}>EACH</TableColumn>
                <TableColumn style={{ width: '14ch' }}>TOTAL</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableRow>
              {quoteLines.map((line) => (
                <TableRow key={line.item.localId}>
                  <TableColumn>{line.item.name}</TableColumn>
                  <TableColumn>{line.result.qty}</TableColumn>
                  <TableColumn>{formatCurrency(line.result.price)}</TableColumn>
                  <TableColumn>{formatCurrency(line.total)}</TableColumn>
                  <TableColumn>
                    <RowSpaceBetween>
                      <ActionButton onClick={() => editQuoteItem(line.item.localId)}>Edit</ActionButton>
                      <ActionButton onClick={() => removeQuoteItem(line.item.localId)}>Remove</ActionButton>
                    </RowSpaceBetween>
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
          <Text>No awnings on this quote yet. Add the awning above to build a quote with several; one purchase order line is created for each.</Text>
        )}
      </CardDouble>

      <JobPanel job={job} onChange={setJob} onCreateOrder={createOrderForJob} />

      <CardDouble title="SAVED COSTINGS">
        {savedCostings.length ? (
          <Table>
            <TableRow>
              <TableColumn style={{ width: '30ch' }}>NAME</TableColumn>
              <TableColumn style={{ width: '20ch' }}>CUSTOMER</TableColumn>
              <TableColumn style={{ width: '14ch' }}>PRICE</TableColumn>
              <TableColumn style={{ width: '22ch' }}>OUTCOME</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>
            {savedCostings.map((costing) => (
              <TableRow key={costing.id}>
                <TableColumn>{costing.name}</TableColumn>
                <TableColumn>{costing.customer || '—'}</TableColumn>
                <TableColumn>{formatCurrency(costing.price)}</TableColumn>
                <TableColumn>
                  <QuoteStatusControl status={costing.status} statusReason={costing.statusReason} disabled={!canSaveCostings} onChange={(next, reason) => markCosting(costing.id, next, reason)} />
                </TableColumn>
                <TableColumn>
                  <RowSpaceBetween>
                    <ActionButton onClick={() => loadSavedCosting(costing)}>Load</ActionButton>
                    <ActionButton onClick={() => compareCosting(costing)}>Compare</ActionButton>
                    <ActionButton onClick={canSaveCostings ? () => removeSavedCosting(costing) : undefined}>Delete</ActionButton>
                  </RowSpaceBetween>
                </TableColumn>
              </TableRow>
            ))}
          </Table>
        ) : (
          <Text>No saved costings. Save one to reuse it as a template for a repeat customer.</Text>
        )}

        {comparison ? (
          <>
            <br />
            <Text>
              <strong>{savedCostings.find((costing) => costing.id === comparison.id)?.name}</strong>
            </Text>
            <RowSpaceBetween>
              <Text>QUOTED</Text>
              <Text>{formatCurrency(comparison.quoted)}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>ON TODAY&apos;S RATES</Text>
              <Text>{formatCurrency(comparison.today)}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>ON THE RATES THAT PRICED IT</Text>
              <Text>{comparison.onOriginal == null ? 'those rates are not kept' : formatCurrency(comparison.onOriginal)}</Text>
            </RowSpaceBetween>
            {comparison.onOriginal != null && comparison.quoted != null && Math.abs(comparison.onOriginal - comparison.quoted) > 0.01 ? (
              <Text>
                <span className="status-warning">The recalculation does not match what was quoted, so the costing itself changed, not just the rates.</span>
              </Text>
            ) : null}
          </>
        ) : null}
      </CardDouble>

      <AwningCostingSheet audience={sheetAudience} quoteName={quoteName} customerName={selectedCustomer?.name || customerName} quoteDate={quoteDate} notes={quoteNotes} ratesLabel={ratesLabel} rates={rates} awnings={sheetAwnings} />
    </AppFrame>
  );
}
