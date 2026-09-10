/**
 * The quote as electronic mail. A mailto link opens the estimator's own mail client with the
 * quotation already written, so the message leaves the account the customer already corresponds
 * with and no mail service has to be configured.
 *
 * Mail clients drop a link that is too long. A quote with more lines than the link holds is sent
 * with the list cut short and the printed quote attached; `quoteEmailTruncated` tells the caller
 * when that is the case.
 */

import { describeGlassSpecification } from '@utils/calculations';
import { formatCurrency } from '@utils/order-management';
import { QuoteDraft, quoteDraftTotal } from '@utils/quote-draft';

/** The shortest link a mail client is known to refuse is 2000 characters. */
const MAX_HREF_LENGTH = 1800;

interface QuoteEmailLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

function quoteEmailLines(quote: QuoteDraft): QuoteEmailLine[] {
  return [
    ...quote.glassLines.map((line) => ({ description: line.description || describeGlassSpecification(line.spec), quantity: line.quantity, unitPrice: line.unitPrice })),
    ...quote.windowLines.map((line) => ({ description: line.description || 'Window', quantity: line.quantity, unitPrice: line.unitPrice })),
    ...quote.awningLines.map((line) => ({ description: line.description || 'Awning', quantity: line.quantity, unitPrice: line.unitPrice })),
  ];
}

function describeLine(line: QuoteEmailLine): string {
  const quantity = Math.max(1, line.quantity);
  return `${quantity} x ${line.description} — ${formatCurrency(line.unitPrice)} each — ${formatCurrency(line.unitPrice * quantity)}`;
}

function composeBody(quote: QuoteDraft, lines: QuoteEmailLine[], omitted: number): string {
  return [
    `Customer: ${quote.customer.trim() || 'Walk-in / phone'}`,
    `Quote: ${quote.name.trim() || 'Quotation'}`,
    `Date: ${quote.date || 'not dated'}`,
    '',
    ...lines.map(describeLine),
    omitted > 0 ? `${omitted} further ${omitted === 1 ? 'line is' : 'lines are'} on the attached quote.` : '',
    '',
    `Total: ${formatCurrency(quoteDraftTotal(quote))}`,
    'Prices exclude GST. Confirm sizes before manufacture.',
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n');
}

function composeHref(quote: QuoteDraft, to: string, lines: QuoteEmailLine[], omitted: number): string {
  const subject = encodeURIComponent(quoteEmailSubject(quote));
  const body = encodeURIComponent(composeBody(quote, lines, omitted));
  return `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
}

export function quoteEmailSubject(quote: QuoteDraft): string {
  const name = quote.name.trim() || 'Quotation';
  const customer = quote.customer.trim();
  return customer ? `${name} — ${customer}` : name;
}

/** The whole quotation in plain text. The link may carry fewer lines than this. */
export function quoteEmailBody(quote: QuoteDraft): string {
  return composeBody(quote, quoteEmailLines(quote), 0);
}

export function quoteMailtoHref(quote: QuoteDraft, to = ''): string {
  const lines = quoteEmailLines(quote);
  const whole = composeHref(quote, to, lines, 0);

  if (whole.length <= MAX_HREF_LENGTH) {
    return whole;
  }

  for (let kept = lines.length - 1; kept > 0; kept -= 1) {
    const shortened = composeHref(quote, to, lines.slice(0, kept), lines.length - kept);
    if (shortened.length <= MAX_HREF_LENGTH) {
      return shortened;
    }
  }

  return composeHref(quote, to, [], lines.length);
}

/** True when the link carries fewer lines than the quote holds, so the quote must be attached. */
export function quoteEmailTruncated(quote: QuoteDraft): boolean {
  return composeHref(quote, '', quoteEmailLines(quote), 0).length > MAX_HREF_LENGTH;
}
