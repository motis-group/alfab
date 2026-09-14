// Checks the quote as electronic mail. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { QuoteEmailInput, quoteEmail, quoteEmailSubject } from './quote-email';
import { QuoteLine } from './customer-quote-store';

function line(description: string, quantity: number, unitPrice: number | null): QuoteLine {
  return { description, spec: '', quantity, unitPrice };
}

function quote(over: Partial<QuoteEmailInput> = {}): QuoteEmailInput {
  return {
    reference: 'Q-3F2A9C1E',
    quoteName: 'Marina balustrade',
    customerName: 'Harbour Marine',
    quoteDate: '2026-09-14',
    notes: 'Deposit 50% on order.',
    lines: [line('Sliding window 1200x900', 4, 1200), line('Awning window 600x600', 2, 1090)],
    ...over,
  };
}

test('the subject names the quote the customer will quote back', () => {
  assert.equal(quoteEmailSubject(quote()), 'Quotation Q-3F2A9C1E Marina balustrade');
  assert.equal(quoteEmailSubject(quote({ reference: null, quoteName: '' })), 'Quotation');
});

test('the message states the same figures as the paper', () => {
  const { body } = quoteEmail(quote());

  assert.match(body, /Quote: Q-3F2A9C1E/);
  assert.match(body, /For: Harbour Marine/);
  assert.match(body, /4 x Sliding window 1200x900 at \$1,200\.00 each, \$4,800\.00/);
  assert.match(body, /Subtotal, excluding GST: \$6,980\.00/);
  assert.match(body, /GST at 10 percent: \$698\.00/);
  assert.match(body, /Total: \$7,678\.00/);
  assert.match(body, /Deposit 50% on order\./);
});

test('a quote with no number says so, rather than implying one', () => {
  const { body } = quoteEmail(quote({ reference: null }));
  assert.match(body, /Quote: draft, not issued/);
});

test('a line with no price is named and left out of the total', () => {
  const { body } = quoteEmail(quote({ lines: [line('Priced', 1, 100), line('Awaiting sizes', 1, null)] }));

  assert.match(body, /1 x Awaiting sizes at not priced each, not priced/);
  assert.match(body, /Subtotal, excluding GST: \$100\.00/);
  assert.match(body, /A line shown as not priced is not in the total\./);
});

test('the link opens a mail client, addressed when the customer has an address', () => {
  assert.match(quoteEmail(quote(), 'dana@harbourmarine.com.au').href, /^mailto:dana%40harbourmarine\.com\.au\?subject=/);
  assert.match(quoteEmail(quote()).href, /^mailto:\?subject=/, 'the operator addresses it when the customer has none');
});

test('a quote too long for a link is cut short, and the message says so', () => {
  const many = Array.from({ length: 120 }, (_, index) => line(`Window number ${index + 1} with a long description`, 2, 1234.56));
  const email = quoteEmail(quote({ lines: many }));

  assert.ok(email.href.length <= 1800, `the link must open: ${email.href.length}`);
  assert.ok(email.omitted > 0, 'some lines did not fit');
  assert.match(email.body, new RegExp(`${email.omitted} further lines are on the printed quote\\.`));
  assert.match(email.body, /Total: \$325,923\.84/, 'the total is still the whole quote');
});

test('a quote that fits leaves nothing out', () => {
  const email = quoteEmail(quote());
  assert.equal(email.omitted, 0);
  assert.ok(!email.body.includes('further'));
});
