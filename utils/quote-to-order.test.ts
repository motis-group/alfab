// Checks the draft a quote becomes on its way to a purchase order. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AwningQuoteLine, WindowQuoteLine, consumeQuoteToOrderDraft, persistQuoteToOrderDraft } from './quote-to-order';

const store = new Map<string, string>();
(globalThis as any).window = {
  sessionStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  },
};

const windowLine: WindowQuoteLine = { description: 'Bow window', quantity: 1, unitPrice: 800, windowSpec: { type: 'T5573', heightMm: 500, lengthMm: 900 } as never, ratesUpdatedAt: null };
const awningLine: AwningQuoteLine = { description: 'Cabin awning', quantity: 2, unitPrice: 50, awningSpec: { heightMm: 400, widthMm: 900, qty: 2 } as never, ratesUpdatedAt: null };

test('a quote of windows and awnings reaches the order, though it holds no glass', () => {
  persistQuoteToOrderDraft({ quoteName: 'Hull 214', customerName: 'Status Houseboats', quoteDate: '2025-04-09', quoteNotes: '', windowLines: [windowLine], awningLines: [awningLine] });

  const draft = consumeQuoteToOrderDraft();

  assert.ok(draft, 'a draft with no glass line is still an order');
  assert.equal(draft.windowLines.length, 1);
  assert.equal(draft.awningLines.length, 1);
  assert.equal(draft.kind, 'window', 'the lines name the kind when the caller does not');
});

test('a draft with nothing priced is not an order', () => {
  persistQuoteToOrderDraft({ quoteName: 'Hull 214', customerName: '', quoteDate: '', quoteNotes: '' });

  assert.equal(consumeQuoteToOrderDraft(), null);
});
