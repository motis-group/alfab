// Checks the quotation a mail client is handed. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GlassSpecification } from './calculations';
import { EMPTY_QUOTE_DRAFT, QuoteDraft } from './quote-draft';
import { AwningQuoteLine, GlassQuoteLine, WindowQuoteLine } from './quote-to-order';
import { quoteEmailBody, quoteEmailSubject, quoteEmailTruncated, quoteMailtoHref } from './quote-email';

const spec: GlassSpecification = {
  width: 1200,
  height: 800,
  thickness: 6,
  glassType: 'Clear',
  edgework: 'ROUGH ARRIS',
  ceramicBand: false,
  shape: 'RECTANGLE',
  holes: false,
  numHoles: 0,
  radiusCorners: false,
  scanning: false,
};

const glassLine: GlassQuoteLine = { description: '1200 x 800 clear toughened', quantity: 2, unitPrice: 145, markupPercent: 20, spec };
const windowLine: WindowQuoteLine = { description: 'Kitchen hopper', quantity: 1, unitPrice: 800, windowSpec: { type: 'T5573', heightMm: 500, lengthMm: 900 } as never, ratesUpdatedAt: null };
const awningLine: AwningQuoteLine = { description: 'Cabin awning', quantity: 3, unitPrice: 50, awningSpec: { heightMm: 400, widthMm: 900, qty: 3 } as never, ratesUpdatedAt: null };

function draftWith(over: Partial<QuoteDraft> = {}): QuoteDraft {
  return { ...EMPTY_QUOTE_DRAFT, ...over };
}

/** The body the link carries, which is the whole quote only when it fits. */
function bodyFromHref(href: string): string {
  return decodeURIComponent(href.slice(href.indexOf('&body=') + '&body='.length));
}

test('a quote with nothing on it still reads as a quotation', () => {
  assert.equal(quoteEmailSubject(EMPTY_QUOTE_DRAFT), 'Quotation');
  assert.equal(
    quoteEmailBody(EMPTY_QUOTE_DRAFT),
    ['Customer: Walk-in / phone', 'Quote: Quotation', 'Date: not dated', '', 'Total: $0.00', 'Prices exclude GST. Confirm sizes before manufacture.'].join('\n')
  );
});

test('every product on the quote is one line, in calculator order', () => {
  const quote = draftWith({ name: 'Boat 12', customer: 'Status Houseboats', date: '2026-04-01', glassLines: [glassLine], windowLines: [windowLine], awningLines: [awningLine] });

  assert.equal(quoteEmailSubject(quote), 'Boat 12 — Status Houseboats');
  assert.equal(
    quoteEmailBody(quote),
    [
      'Customer: Status Houseboats',
      'Quote: Boat 12',
      'Date: 2026-04-01',
      '',
      '2 x 1200 x 800 clear toughened — $145.00 each — $290.00',
      '1 x Kitchen hopper — $800.00 each — $800.00',
      '3 x Cabin awning — $50.00 each — $150.00',
      '',
      'Total: $1240.00',
      'Prices exclude GST. Confirm sizes before manufacture.',
    ].join('\n')
  );
});

test('a line saved with no quantity is charged as one of that line', () => {
  const body = quoteEmailBody(draftWith({ glassLines: [{ ...glassLine, quantity: 0 }] }));

  assert.ok(body.includes('1 x 1200 x 800 clear toughened — $145.00 each — $145.00'));
  assert.ok(body.includes('Total: $145.00'));
});

test('a line with no description of its own is described by its specification', () => {
  assert.ok(quoteEmailBody(draftWith({ glassLines: [{ ...glassLine, description: '' }] })).includes('2 x 1200 x 800 mm | 6 mm Clear | rough arris —'));
});

test('a customer name the link would otherwise break is encoded', () => {
  const href = quoteMailtoHref(draftWith({ customer: 'Ward & Sons', name: 'Deck glass' }), 'orders@example.com');

  assert.ok(href.startsWith('mailto:orders%40example.com?subject='));
  assert.ok(href.includes('Ward%20%26%20Sons'));
  assert.ok(!href.includes('&Sons'));
  assert.equal(quoteEmailSubject(draftWith({ customer: 'Ward & Sons', name: 'Deck glass' })), 'Deck glass — Ward & Sons');
});

test('a quote short enough to send whole is sent whole', () => {
  const quote = draftWith({ glassLines: [glassLine], windowLines: [windowLine] });
  const href = quoteMailtoHref(quote);

  assert.equal(quoteEmailTruncated(quote), false);
  assert.equal(bodyFromHref(href), quoteEmailBody(quote));
});

test('a quote too long for the link is cut short and its remainder counted', () => {
  const lines = Array.from({ length: 40 }, (item, index) => ({ ...glassLine, description: `Cabin light ${index + 1}` }));
  const quote = draftWith({ glassLines: lines });
  const href = quoteMailtoHref(quote, 'orders@example.com');
  const body = bodyFromHref(href);
  const sent = body.split('\n').filter((line) => line.startsWith('2 x Cabin light ')).length;

  assert.equal(quoteEmailTruncated(quote), true);
  assert.ok(href.length <= 1800);
  assert.ok(sent > 0 && sent < 40);
  assert.ok(body.includes(`${40 - sent} further lines are on the attached quote.`));
  assert.ok(body.includes('Total: $11600.00'));
});

test('the quote that first outgrows the link is the only one cut short', () => {
  const lines = Array.from({ length: 40 }, (item, index) => ({ ...glassLine, description: `Cabin light ${index + 1}` }));
  const quoteOf = (count: number) => draftWith({ glassLines: lines.slice(0, count) });
  const first = lines.findIndex((line, index) => quoteEmailTruncated(quoteOf(index + 1))) + 1;

  assert.ok(first > 1, 'a quote of one line fits the link');
  assert.equal(quoteEmailTruncated(quoteOf(first - 1)), false);
  assert.equal(bodyFromHref(quoteMailtoHref(quoteOf(first - 1))), quoteEmailBody(quoteOf(first - 1)));
  assert.ok(bodyFromHref(quoteMailtoHref(quoteOf(first))).includes('further'));
  assert.ok(quoteMailtoHref(quoteOf(first)).length <= 1800);
});
