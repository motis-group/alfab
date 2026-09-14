/**
 * The quote as electronic mail.
 *
 * A mailto link opens the mail client of the operator with the quotation already written. The
 * message then leaves the account the customer already writes to. Alfab configures no mail service,
 * and no password for one is held here.
 *
 * A mail client drops a link that is too long. A quote with more lines than the link holds is sent
 * with the list cut short, and the message says how many lines are on the printed quote instead.
 */

import { GST_RATE, QuoteLine, quoteTotals } from '@utils/customer-quote-store';

/** The shortest link a mail client is known to refuse is 2000 characters. Stay under it. */
const MAX_HREF_LENGTH = 1800;

/** Amounts as the paper prints them, so the message and the document state one set of figures. */
const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export interface QuoteEmailInput {
  /** The saved quote's reference. Null states that the quote is a draft. */
  reference: string | null;
  quoteName: string;
  customerName: string;
  quoteDate: string;
  notes: string;
  lines: QuoteLine[];
}

export interface QuoteEmail {
  /** The link that opens the mail client. */
  href: string;
  subject: string;
  body: string;
  /** Lines left out of the message because the link would be too long. */
  omitted: number;
}

export function quoteEmailSubject(quote: QuoteEmailInput): string {
  const name = quote.quoteName.trim();
  const parts = ['Quotation', quote.reference, name].filter(Boolean);
  return parts.join(' ');
}

function describeLine(line: QuoteLine, amount: number | null): string {
  const quantity = Math.max(1, line.quantity);
  const unit = line.unitPrice == null ? 'not priced' : AUD.format(line.unitPrice);
  const total = amount == null ? 'not priced' : AUD.format(amount);
  const description = line.description.trim() || 'Item';
  return `${quantity} x ${description} at ${unit} each, ${total}`;
}

function composeBody(quote: QuoteEmailInput, shown: QuoteLine[], omitted: number): string {
  const { amounts, subtotal, gst, total, anyUnpriced } = quoteTotals(quote.lines);

  return [`Quote: ${quote.reference || 'draft, not issued'}`, quote.quoteName.trim() ? `Job: ${quote.quoteName.trim()}` : '', `For: ${quote.customerName.trim() || 'Walk-in / phone'}`, quote.quoteDate ? `Date: ${quote.quoteDate}` : '', '', ...shown.map((line, index) => describeLine(line, amounts[index])), omitted > 0 ? `${omitted} further ${omitted === 1 ? 'line is' : 'lines are'} on the printed quote.` : '', '', `Subtotal, excluding GST: ${AUD.format(subtotal)}`, `GST at ${GST_RATE * 100} percent: ${AUD.format(gst)}`, `Total: ${AUD.format(total)}`, anyUnpriced ? 'A line shown as not priced is not in the total.' : '', quote.notes.trim() ? '' : '', quote.notes.trim() ? `Notes: ${quote.notes.trim()}` : '', '', 'Confirm sizes before manufacture. Quoted prices hold for 30 days from the date above.'].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n');
}

function composeHref(to: string, subject: string, body: string): string {
  const address = to.trim() ? encodeURIComponent(to.trim()) : '';
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * The message for this quote. `to` may be empty, and the operator then addresses it in the mail
 * client. Lines are dropped from the end until the link is short enough to open.
 */
export function quoteEmail(quote: QuoteEmailInput, to = ''): QuoteEmail {
  const subject = quoteEmailSubject(quote);

  let shown = quote.lines.length;
  let body = composeBody(quote, quote.lines, 0);
  let href = composeHref(to, subject, body);

  // Drop one line at a time. The count of what is left out goes in the message, so the reader knows
  // the list is not the whole quote.
  while (href.length > MAX_HREF_LENGTH && shown > 0) {
    shown -= 1;
    body = composeBody(quote, quote.lines.slice(0, shown), quote.lines.length - shown);
    href = composeHref(to, subject, body);
  }

  return { href, subject, body, omitted: quote.lines.length - shown };
}
