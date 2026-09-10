'use client';

import PrintSheet from '@components/PrintSheet';
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
  quoteName: string;
  customerName: string;
  quoteDate: string;
  notes: string;
  ratesLabel: string;
  rates: AwningRates;
  awnings: AwningCostingSheetAwning[];
}

function formatQty(line: CostLine): string {
  const qty = Number.isInteger(line.qty) ? String(line.qty) : line.qty.toFixed(2);
  return `${qty} ${line.unit}`;
}

/**
 * Costing sheet for the printer. Hidden on screen; printing hides the app around it. Shares the
 * window sheet's class names, so both documents print identically, and splits the same way: the
 * internal sheet is one awning per page, the customer quote is one document with the awnings as its
 * lines.
 */
export default function AwningCostingSheet({ audience, quoteName, customerName, quoteDate, notes, ratesLabel, rates, awnings }: AwningCostingSheetProps) {
  const internal = audience === 'internal';
  const quoteTotal = awnings.reduce((total, entry) => total + (entry.result.price == null ? 0 : entry.result.price * entry.quantity), 0);
  const anyUnpriced = awnings.some((entry) => entry.result.price == null);

  return (
    <PrintSheet audience={audience}>
      {internal ? null : (
        <header className="window-costing-sheet__heading">
          <h1 className="window-costing-sheet__title">{quoteName.trim() || 'Quotation'}</h1>
          <span>{quoteDate}</span>
        </header>
      )}

      {internal ? null : (
        <div className="window-costing-sheet__meta">
          <span>Customer: {customerName.trim() || 'Walk-in / phone'}</span>
          <span>
            {awnings.length} {awnings.length === 1 ? 'awning' : 'awnings'}
          </span>
        </div>
      )}

      {awnings.map((awning, index) => {
        const { result } = awning;
        const lineTotal = result.price == null ? null : result.price * awning.quantity;

        return (
          <article key={awning.id} className="window-costing-sheet__window">
            {internal ? (
              <header className="window-costing-sheet__heading">
                <h1 className="window-costing-sheet__title">{quoteName.trim() || 'Awning costing'}</h1>
                <span>
                  {quoteDate}
                  {awnings.length > 1 ? ` · awning ${index + 1} of ${awnings.length}` : ''}
                </span>
              </header>
            ) : null}

            <div className="window-costing-sheet__meta">
              {internal ? <span>Customer: {customerName.trim() || 'Walk-in / phone'}</span> : null}
              <span>Awning: {awning.name || `Awning ${index + 1}`}</span>
              <span>Quantity: {awning.quantity}</span>
              {internal ? <span>Rates: {ratesLabel}</span> : null}
            </div>

            <p className="window-costing-sheet__spec">{describeAwning(awning.input, rates)}</p>

            <table className="window-costing-sheet__table">
              {internal ? (
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Quantity</th>
                    <th className="window-costing-sheet__amount">Rate</th>
                    <th className="window-costing-sheet__amount">Cost</th>
                  </tr>
                </thead>
              ) : null}
              {internal ? (
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
              ) : null}
              <tbody className="window-costing-sheet__totals">
                {internal ? (
                  <>
                    <tr>
                      <td colSpan={3}>Total cost</td>
                      <td className="window-costing-sheet__amount">{formatCurrency(result.subtotal)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3}>Margin ({Math.round(result.marginRate * 1000) / 10}% of cost)</td>
                      <td className="window-costing-sheet__amount">{formatCurrency(result.margin)}</td>
                    </tr>
                  </>
                ) : null}
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

            {internal ? (
              <p className="window-costing-sheet__note">
                Labour: {result.minutes.total.toFixed(1)} minutes each at {rates.labour.perHour == null ? 'no rate' : formatCurrency(rates.labour.perHour)} per hour, including {result.minutes.setup.toFixed(1)} minutes of setup shared across {result.qty}.
              </p>
            ) : null}
            {internal && result.unpriced.length ? <p className="window-costing-sheet__note">Not priced, charged as nil: {result.unpriced.map((entry) => entry.label).join(', ')}.</p> : null}
            {internal && notes.trim() ? <p className="window-costing-sheet__note">Notes: {notes.trim()}</p> : null}

            {internal ? <footer className="window-costing-sheet__footer">Comments:</footer> : null}
          </article>
        );
      })}

      {internal ? null : (
        <>
          <div className="window-costing-sheet__total">
            <span>Quote total</span>
            <span>{formatCurrency(quoteTotal)}</span>
          </div>
          {anyUnpriced ? <p className="window-costing-sheet__note">Unpriced lines are excluded from the total.</p> : null}
          {notes.trim() ? <p className="window-costing-sheet__note">Notes: {notes.trim()}</p> : null}
          <footer className="window-costing-sheet__footer">Prices exclude GST. Confirm sizes before manufacture.</footer>
        </>
      )}
    </PrintSheet>
  );
}
