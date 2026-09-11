'use client';

import PrintSheet from '@components/PrintSheet';
import PrintedQuote from '@components/PrintedQuote';
import { CustomerQuoteLine } from '@utils/customer-quote-store';
import { formatCurrency } from '@utils/order-management';
import { AwningCostResult, AwningCostingInput, AwningRates, CostLine, describeAwning } from '@utils/awning-costing';

export interface AwningCostingSheetAwning {
  id: string;
  name: string;
  quantity: number;
  input: AwningCostingInput;
  result: AwningCostResult;
}

interface AwningCostingSheetProps {
  /** Internal shows the cost build-up. Customer shows prices only and is safe to hand over. */
  audience: 'internal' | 'customer';
  /** The saved quote's reference, or null while what is on screen has not been saved. */
  reference: string | null;
  quoteName: string;
  customerName: string;
  quoteDate: string;
  notes: string;
  ratesLabel: string;
  rates: AwningRates;
  awnings: AwningCostingSheetAwning[];
}

/** The customer's lines. The page saves these and the sheet prints them, so the record matches the paper. */
export function awningQuoteLines(awnings: AwningCostingSheetAwning[], rates: AwningRates): CustomerQuoteLine[] {
  return awnings.map((awning, index) => ({
    description: awning.name || `Awning ${index + 1}`,
    spec: describeAwning(awning.input, rates),
    quantity: awning.quantity,
    unitPrice: awning.result.price,
    input: awning.input,
  }));
}

function formatQty(line: CostLine): string {
  const qty = Number.isInteger(line.qty) ? String(line.qty) : line.qty.toFixed(2);
  return `${qty} ${line.unit}`;
}

/**
 * Costing sheet for the printer. Hidden on screen; printing hides the app around it. Shares the
 * window sheet's class names, so both bench documents print identically: one awning per page. The
 * customer copy is the shared quote document, with each awning as one of its lines.
 */
export default function AwningCostingSheet({ audience, reference, quoteName, customerName, quoteDate, notes, ratesLabel, rates, awnings }: AwningCostingSheetProps) {
  if (audience === 'customer') {
    return <PrintedQuote reference={reference} quoteName={quoteName} customerName={customerName} quoteDate={quoteDate} notes={notes} lines={awningQuoteLines(awnings, rates)} />;
  }

  return (
    <PrintSheet audience={audience}>
      {awnings.map((awning, index) => {
        const { result } = awning;
        const lineTotal = result.price == null ? null : result.price * awning.quantity;

        return (
          <article key={awning.id} className="window-costing-sheet__window">
            <header className="window-costing-sheet__heading">
              <h1 className="window-costing-sheet__title">{quoteName.trim() || 'Awning costing'}</h1>
              <span>
                {quoteDate}
                {awnings.length > 1 ? ` · awning ${index + 1} of ${awnings.length}` : ''}
              </span>
            </header>

            <div className="window-costing-sheet__meta">
              <span>Customer: {customerName.trim() || 'Walk-in / phone'}</span>
              <span>Awning: {awning.name || `Awning ${index + 1}`}</span>
              <span>Quantity: {awning.quantity}</span>
              <span>Rates: {ratesLabel}</span>
            </div>

            <p className="window-costing-sheet__spec">{describeAwning(awning.input, rates)}</p>

            <table className="window-costing-sheet__table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Quantity</th>
                  <th className="window-costing-sheet__amount">Rate</th>
                  <th className="window-costing-sheet__amount">Cost</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line) => (
                  <tr key={line.key}>
                    <td>{line.label}</td>
                    <td>{formatQty(line)}</td>
                    <td className="window-costing-sheet__amount">{line.rate == null ? 'not priced' : formatCurrency(line.rate)}</td>
                    <td className="window-costing-sheet__amount">{formatCurrency(line.cost)}</td>
                  </tr>
                ))}
                {result.glazing.map((line) => (
                  <tr key={`glazing-${line.key}`}>
                    <td>Glazing: {line.label}</td>
                    <td>{formatQty(line)}</td>
                    <td className="window-costing-sheet__amount">{line.rate == null ? 'not priced' : formatCurrency(line.rate)}</td>
                    <td className="window-costing-sheet__amount">{formatCurrency(line.cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tbody className="window-costing-sheet__totals">
                <tr>
                  <td colSpan={3}>Total cost</td>
                  <td className="window-costing-sheet__amount">{formatCurrency(result.subtotal)}</td>
                </tr>
                <tr>
                  <td colSpan={3}>Margin ({Math.round(result.marginRate * 1000) / 10}% of cost)</td>
                  <td className="window-costing-sheet__amount">{formatCurrency(result.margin)}</td>
                </tr>
                <tr className="window-costing-sheet__grand">
                  <td colSpan={3}>Price each</td>
                  <td className="window-costing-sheet__amount">{result.price == null ? 'not priced' : formatCurrency(result.price)}</td>
                </tr>
                {awning.quantity > 1 ? (
                  <tr className="window-costing-sheet__grand">
                    <td colSpan={3}>Total for {awning.quantity}</td>
                    <td className="window-costing-sheet__amount">{lineTotal == null ? 'not priced' : formatCurrency(lineTotal)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <p className="window-costing-sheet__note">
              Labour: {result.minutes.total.toFixed(1)} minutes each at {rates.labour.perHour == null ? 'no rate' : formatCurrency(rates.labour.perHour)} per hour, including {result.minutes.setup.toFixed(1)} minutes of setup shared across {result.qty}.
            </p>
            {result.unpriced.length ? <p className="window-costing-sheet__note">Not priced, charged as nil: {result.unpriced.map((entry) => entry.label).join(', ')}.</p> : null}
            {notes.trim() ? <p className="window-costing-sheet__note">Notes: {notes.trim()}</p> : null}

            <footer className="window-costing-sheet__footer">Comments:</footer>
          </article>
        );
      })}
    </PrintSheet>
  );
}
