'use client';

import PrintSheet from '@components/PrintSheet';
import { formatCurrency } from '@utils/order-management';

/**
 * Who the quote comes from. The app has no company profile to read this from, so it lives here
 * until one exists. Blank fields print nothing.
 */
export const QUOTE_ISSUER = {
  name: 'Alfab Pty Ltd',
  addressLines: [] as string[],
  abn: '',
  phone: '',
  email: 'nick@alfab.com.au',
};

/** Quoted prices are struck excluding GST; the document states it rather than burying it. */
const GST_RATE = 0.1;

export interface QuoteDocumentLine {
  id: string;
  /** What the customer calls it: "Window 1", "Kitchen awning". */
  description: string;
  /** The specification under the description, in the calculator's own words. */
  spec: string;
  quantity: number;
  /** Null when the calculator could not price the line. Such lines carry no amount. */
  unitPrice: number | null;
  extras?: { label: string; total: number | null }[];
}

interface QuoteDocumentProps {
  quoteName: string;
  customerName: string;
  quoteDate: string;
  notes: string;
  lines: QuoteDocumentLine[];
}

/**
 * The customer's copy of a quote, laid out as an invoice: letterhead, bill-to, one table of lines,
 * and a totals block. Every calculator prints through this, so a customer sees one document
 * whatever priced it.
 *
 * Monospace, like the app it comes out of.
 */
export default function QuoteDocument({ quoteName, customerName, quoteDate, notes, lines }: QuoteDocumentProps) {
  const amounts = lines.map((line) => (line.unitPrice == null ? null : line.unitPrice * line.quantity));
  const subtotal = amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0);
  const gst = subtotal * GST_RATE;
  const anyUnpriced = amounts.some((amount) => amount == null);

  return (
    <PrintSheet audience="customer">
      <div className="quote-doc__rule" />

      <header className="quote-doc__masthead">
        <div>
          <h1 className="quote-doc__title">Quotation</h1>
          <table className="quote-doc__metadata">
            <tbody>
              <tr>
                <td>Quote</td>
                <td>{quoteName.trim() || 'Quotation'}</td>
              </tr>
              <tr>
                <td>Date</td>
                <td>{quoteDate}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="quote-doc__mark">{QUOTE_ISSUER.name}</div>
      </header>

      <div className="quote-doc__parties">
        <div>
          <div className="quote-doc__party-name">{QUOTE_ISSUER.name}</div>
          {QUOTE_ISSUER.addressLines.map((addressLine) => (
            <div key={addressLine}>{addressLine}</div>
          ))}
          {QUOTE_ISSUER.abn ? <div>ABN: {QUOTE_ISSUER.abn}</div> : null}
          {QUOTE_ISSUER.phone ? <div>{QUOTE_ISSUER.phone}</div> : null}
          {QUOTE_ISSUER.email ? <div>{QUOTE_ISSUER.email}</div> : null}
        </div>
        <div>
          <div className="quote-doc__party-name">Bill to</div>
          <div>{customerName.trim() || 'Walk-in / phone'}</div>
        </div>
      </div>

      <div className="quote-doc__headline">{formatCurrency(subtotal + gst)} AUD</div>

      <table className="quote-doc__table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="quote-doc__amount">Qty</th>
            <th className="quote-doc__amount">Unit price</th>
            <th className="quote-doc__amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id} className="quote-doc__line">
              <td>
                <div>{line.description || `Item ${index + 1}`}</div>
                {line.spec ? <div className="quote-doc__spec">{line.spec}</div> : null}
                {(line.extras || []).map((extra) => (
                  <div key={extra.label} className="quote-doc__spec">
                    Add for {extra.label}: {extra.total == null ? 'not priced' : formatCurrency(extra.total)}
                  </div>
                ))}
              </td>
              <td className="quote-doc__amount">{line.quantity}</td>
              <td className="quote-doc__amount">{line.unitPrice == null ? 'not priced' : formatCurrency(line.unitPrice)}</td>
              <td className="quote-doc__amount">{amounts[index] == null ? '—' : formatCurrency(amounts[index])}</td>
            </tr>
          ))}
        </tbody>
        <tbody className="quote-doc__totals">
          <tr>
            <td colSpan={3}>Subtotal (excludes GST)</td>
            <td className="quote-doc__amount">{formatCurrency(subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={3}>GST ({GST_RATE * 100}%)</td>
            <td className="quote-doc__amount">{formatCurrency(gst)}</td>
          </tr>
          <tr className="quote-doc__due">
            <td colSpan={3}>Total</td>
            <td className="quote-doc__amount">{formatCurrency(subtotal + gst)}</td>
          </tr>
        </tbody>
      </table>

      {anyUnpriced ? <p className="quote-doc__note">Lines shown as not priced are quoted separately and are excluded from the total.</p> : null}

      {notes.trim() ? (
        <div className="quote-doc__notes">
          <div className="quote-doc__party-name">Notes</div>
          <p className="quote-doc__note">{notes.trim()}</p>
        </div>
      ) : null}

      <footer className="quote-doc__footer">Confirm sizes before manufacture. Quoted prices hold for 30 days from the date above.</footer>
    </PrintSheet>
  );
}
