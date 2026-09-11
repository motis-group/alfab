'use client';

import * as React from 'react';

import PrintSheet from '@components/PrintSheet';
import { GST_RATE, QuoteLine, quoteTotals } from '@utils/customer-quote-store';

/**
 * Who the quote comes from. The app has no company profile to read this from, so it lives here
 * until one exists. Blank fields print nothing.
 */
export const QUOTE_ISSUER = {
  name: 'Alfab Pty Ltd',
  addressLines: ['130 Bamfield Road', 'Heidelberg West VIC 3081'],
  abn: '70 649 036 966',
  phone: '(03) 9459 1333',
  email: 'nick@alfab.com.au',
};

/** Amounts as an invoice prints them, grouped: $7,678.00. The app's own tables do not group. */
const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const formatMoney = (value: number | null) => AUD.format(value ?? 0);

/** Declared in styles/global-fonts.scss, where the app's font picker also reaches it. */
const QUOTE_FONT = 'Berkeley Mono';

export interface QuotePaperProps {
  /** The saved quote's reference. Null prints a draft: content nobody has recorded is not an offer. */
  reference: string | null;
  quoteName: string;
  customerName: string;
  quoteDate: string;
  notes: string;
  lines: QuoteLine[];
}

/**
 * The customer's copy of a quote, laid out as an invoice: letterhead, the customer, one table of
 * lines, and a totals block. The calculators print it and the dashboard shows it, so the office
 * reads the same document the customer was given.
 *
 * Monospace, like the app it comes out of.
 */
export function QuotePaper({ reference, quoteName, customerName, quoteDate, notes, lines }: QuotePaperProps) {
  const { amounts, subtotal, gst, total, anyUnpriced } = quoteTotals(lines);

  return (
    <div className="printed-quote">
      <div className="printed-quote__rule" />

      <header className="printed-quote__masthead">
        <div>
          <h1 className="printed-quote__title">{reference ? 'Quotation' : 'Draft quotation'}</h1>
          <table className="printed-quote__metadata">
            <tbody>
              <tr>
                <td>Quote no.</td>
                <td>{reference || 'Draft, not issued'}</td>
              </tr>
              {quoteName.trim() ? (
                <tr>
                  <td>Job</td>
                  <td>{quoteName.trim()}</td>
                </tr>
              ) : null}
              <tr>
                <td>Date</td>
                <td>{quoteDate}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="printed-quote__mark">{QUOTE_ISSUER.name}</div>
      </header>

      <div className="printed-quote__parties">
        <div>
          <div className="printed-quote__party-name">{QUOTE_ISSUER.name}</div>
          {QUOTE_ISSUER.addressLines.map((addressLine) => (
            <div key={addressLine}>{addressLine}</div>
          ))}
          {QUOTE_ISSUER.abn ? <div>ABN: {QUOTE_ISSUER.abn}</div> : null}
          {QUOTE_ISSUER.phone ? <div>{QUOTE_ISSUER.phone}</div> : null}
          {QUOTE_ISSUER.email ? <div>{QUOTE_ISSUER.email}</div> : null}
        </div>
        <div>
          <div className="printed-quote__party-name">Quote for</div>
          <div>{customerName.trim() || 'Walk-in / phone'}</div>
        </div>
      </div>

      <div className="printed-quote__headline">{formatMoney(total)} AUD</div>

      <table className="printed-quote__table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="printed-quote__amount">Qty</th>
            <th className="printed-quote__amount">Unit price</th>
            <th className="printed-quote__amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className="printed-quote__line">
              <td>
                <div className="printed-quote__item">{line.description || `Item ${index + 1}`}</div>
                {line.spec ? <div className="printed-quote__spec">{line.spec}</div> : null}
                {(line.extras || []).map((extra) => (
                  <div key={extra.label} className="printed-quote__spec">
                    Add for {extra.label}: {extra.total == null ? 'not priced' : formatMoney(extra.total)}
                  </div>
                ))}
              </td>
              <td className="printed-quote__amount">{line.quantity}</td>
              <td className="printed-quote__amount">{line.unitPrice == null ? 'not priced' : formatMoney(line.unitPrice)}</td>
              <td className="printed-quote__amount">{amounts[index] == null ? '—' : formatMoney(amounts[index])}</td>
            </tr>
          ))}
        </tbody>
        <tbody className="printed-quote__totals">
          <tr>
            <td colSpan={3}>Subtotal (excludes GST)</td>
            <td className="printed-quote__amount">{formatMoney(subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={3}>GST ({GST_RATE * 100}%)</td>
            <td className="printed-quote__amount">{formatMoney(gst)}</td>
          </tr>
          <tr className="printed-quote__due">
            <td colSpan={3}>Total</td>
            <td className="printed-quote__amount">{formatMoney(total)}</td>
          </tr>
        </tbody>
      </table>

      {anyUnpriced ? <p className="printed-quote__note">Lines shown as not priced are excluded from the total.</p> : null}

      {notes.trim() ? (
        <div className="printed-quote__notes">
          <div className="printed-quote__party-name">Notes</div>
          <p className="printed-quote__note">{notes.trim()}</p>
        </div>
      ) : null}

      <footer className="printed-quote__footer">Confirm sizes before manufacture. Quoted prices hold for 30 days from the date above.</footer>
    </div>
  );
}

/** The paper, for the printer. Hidden on screen; printing hides the app around it. */
export default function PrintedQuote(props: QuotePaperProps) {
  // The sheet is display: none until the print dialog opens, and a hidden element fetches no font.
  // Ask for it on mount, or the first print of a session comes out in the fallback monospace.
  React.useEffect(() => {
    document.fonts?.load(`9pt "${QUOTE_FONT}"`);
  }, []);

  return (
    <PrintSheet audience="customer">
      <QuotePaper {...props} />
    </PrintSheet>
  );
}
