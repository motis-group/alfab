'use client';

import PrintSheet from '@components/PrintSheet';
import { formatCurrency, todayISODate } from '@utils/order-management';
import { productFullName } from '@utils/window-catalogue';
import { CostLine, WindowCostResult, WindowCostingInput, describeWindow } from '@utils/window-costing';
import { WindowRates } from '@utils/window-costing-rates';

export interface WindowCostingSheetWindow {
  id: string;
  name: string;
  quantity: number;
  input: WindowCostingInput;
  result: WindowCostResult;
}

interface WindowCostingSheetProps {
  /** The heading of each page. Example: "Line 3 of Q-3F2A9C1E". */
  title: string;
  ratesLabel: string;
  rates: WindowRates;
  windows: WindowCostingSheetWindow[];
}

function formatQty(line: CostLine): string {
  const qty = Number.isInteger(line.qty) ? String(line.qty) : line.qty.toFixed(2);
  return `${qty} ${line.unit}`;
}

/**
 * The costing sheet for the printer. It is hidden on screen, and printing hides the app around it.
 *
 * The sheet shows the cost build-up, so it is for Alfab only. It repeats the heading on every window,
 * because it prints one window per page for the bench.
 */
export default function WindowCostingSheet({ title, ratesLabel, rates, windows }: WindowCostingSheetProps) {
  return (
    <PrintSheet audience="internal">
      {windows.map((window, index) => {
        const { result } = window;
        const lineTotal = result.price == null ? null : result.price * window.quantity;

        return (
          <article key={window.id} className="window-costing-sheet__window">
            <header className="window-costing-sheet__heading">
              <h1 className="window-costing-sheet__title">{title}</h1>
              <span>
                {todayISODate()}
                {windows.length > 1 ? ` · window ${index + 1} of ${windows.length}` : ''}
              </span>
            </header>

            <div className="window-costing-sheet__meta">
              <span>Window: {window.name || `Window ${index + 1}`}</span>
              <span>Quantity: {window.quantity}</span>
              <span>Rates: {ratesLabel}</span>
            </div>

            <p className="window-costing-sheet__spec">{describeWindow(window.input, rates, productFullName(window.input.productId))}</p>

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
                  <td colSpan={3}>Subtotal</td>
                  <td className="window-costing-sheet__amount">{formatCurrency(result.subtotal)}</td>
                </tr>
                {result.marginRate ? (
                  <tr>
                    <td colSpan={3}>Margin ({Math.round(result.marginRate * 1000) / 10}%)</td>
                    <td className="window-costing-sheet__amount">{formatCurrency(result.margin)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td colSpan={3}>{result.reinforcement ? `${result.reinforcement.label} x ${result.reinforcement.count}` : 'Packing'}</td>
                  <td className="window-costing-sheet__amount">{formatCurrency(result.packing)}</td>
                </tr>
                {result.upliftRate ? (
                  <tr>
                    <td colSpan={3}>Uplift ({Math.round(result.upliftRate * 1000) / 10}%)</td>
                    <td className="window-costing-sheet__amount">{formatCurrency(result.uplift)}</td>
                  </tr>
                ) : null}
                <tr className="window-costing-sheet__grand">
                  <td colSpan={3}>Price {result.unitLabel.toLowerCase()}</td>
                  <td className="window-costing-sheet__amount">{result.price == null ? 'not priced' : formatCurrency(result.price)}</td>
                </tr>
                {window.quantity > 1 ? (
                  <tr className="window-costing-sheet__grand">
                    <td colSpan={3}>Total for {window.quantity}</td>
                    <td className="window-costing-sheet__amount">{lineTotal == null ? 'not priced' : formatCurrency(lineTotal)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {Object.values(result.extras).length ? (
              <table className="window-costing-sheet__table">
                <thead>
                  <tr>
                    <th>Add for</th>
                    <th className="window-costing-sheet__amount">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(result.extras).map((extra) => (
                    <tr key={extra.label}>
                      <td>{extra.label}</td>
                      <td className="window-costing-sheet__amount">{extra.total == null ? 'not priced' : formatCurrency(extra.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            <p className="window-costing-sheet__note">
              Labour: {result.minutes.total.toFixed(1)} minutes at {formatCurrency(rates.labourPerHour)} per hour.
            </p>
            {result.unpriced.length ? <p className="window-costing-sheet__note">Not priced, charged as nil: {result.unpriced.map((entry) => entry.label).join(', ')}.</p> : null}

            <footer className="window-costing-sheet__footer">Comments:</footer>
          </article>
        );
      })}
    </PrintSheet>
  );
}
