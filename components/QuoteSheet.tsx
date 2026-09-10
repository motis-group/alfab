'use client';

import PrintSheet from '@components/PrintSheet';
import { describeGlassSpecification } from '@utils/calculations';
import { formatCurrency } from '@utils/order-management';
import { QuoteDraft, quoteDraftTotal } from '@utils/quote-draft';

interface QuoteSheetProps {
  quote: QuoteDraft;
}

interface QuoteSheetLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

/** Every priced line on the quote, glass first, then windows, then awnings. */
function quoteSheetLines(quote: QuoteDraft): QuoteSheetLine[] {
  return [
    ...quote.glassLines.map((line) => ({ description: line.description || describeGlassSpecification(line.spec), quantity: line.quantity, unitPrice: line.unitPrice })),
    ...quote.windowLines.map((line) => ({ description: line.description || 'Window', quantity: line.quantity, unitPrice: line.unitPrice })),
    ...quote.awningLines.map((line) => ({ description: line.description || 'Awning', quantity: line.quantity, unitPrice: line.unitPrice })),
  ];
}

/**
 * The quotation the customer receives, whatever mix of products it holds.
 *
 * One document, not one page per item: the heading, the total and the notes are printed once and
 * every line is a row, so a quote of ordinary length is a single page. The costing sheets print the
 * build-up behind these prices, one piece per page, and stay inside the shop.
 */
export default function QuoteSheet({ quote }: QuoteSheetProps) {
  const lines = quoteSheetLines(quote);
  const notes = quote.notes.trim();

  return (
    <PrintSheet audience="customer">
      <header className="window-costing-sheet__heading">
        <h1 className="window-costing-sheet__title">{quote.name.trim() || 'Quotation'}</h1>
        <span>{quote.date || 'not dated'}</span>
      </header>

      <div className="window-costing-sheet__meta">
        <span>Customer: {quote.customer.trim() || 'Walk-in / phone'}</span>
        <span>
          {lines.length} {lines.length === 1 ? 'line' : 'lines'}
        </span>
      </div>

      <table className="window-costing-sheet__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th className="window-costing-sheet__amount">Unit</th>
            <th className="window-costing-sheet__amount">Qty</th>
            <th className="window-costing-sheet__amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const quantity = Math.max(1, line.quantity);

            return (
              <tr key={`${index}-${line.description}`}>
                <td>{index + 1}</td>
                <td>{line.description}</td>
                <td className="window-costing-sheet__amount">{formatCurrency(line.unitPrice)}</td>
                <td className="window-costing-sheet__amount">{quantity}</td>
                <td className="window-costing-sheet__amount">{formatCurrency(line.unitPrice * quantity)}</td>
              </tr>
            );
          })}
        </tbody>
        <tbody className="window-costing-sheet__totals">
          <tr className="window-costing-sheet__grand">
            <td colSpan={4}>Quote total</td>
            <td className="window-costing-sheet__amount">{formatCurrency(quoteDraftTotal(quote))}</td>
          </tr>
        </tbody>
      </table>

      {notes ? <p className="window-costing-sheet__note">Notes: {notes}</p> : null}

      <footer className="window-costing-sheet__footer">Prices exclude GST. Confirm sizes before manufacture.</footer>
    </PrintSheet>
  );
}
