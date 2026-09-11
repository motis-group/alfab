// Checks that a converted quote reaches the order page with every line. Run with `npm test`.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { AwningCostingInput } from './awning-costing';
import { defaultAdhocSpec } from './order-draft';
import { AwningQuoteLine, GlassQuoteLine, QuoteToOrderDraftInput, WindowQuoteLine, consumeQuoteToOrderDraft, persistQuoteToOrderDraft } from './quote-to-order';
import { WindowCostingInput } from './window-costing';

/** Session storage, enough of it for the module under test. */
function installSessionStorage() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
}

beforeEach(installSessionStorage);

type DraftLines = Pick<QuoteToOrderDraftInput, 'glassLines' | 'windowLines' | 'awningLines'>;

const glassLine: GlassQuoteLine = { description: 'Side panel', quantity: 2, unitPrice: 100, markupPercent: 20, spec: defaultAdhocSpec };
const windowLine: WindowQuoteLine = { description: 'Kitchen hopper', quantity: 1, unitPrice: 800, windowSpec: { type: 'T5573', heightMm: 600, lengthMm: 900 } as WindowCostingInput, ratesUpdatedAt: null };
const awningLine: AwningQuoteLine = { description: 'Deck awning', quantity: 3, unitPrice: 450, awningSpec: { heightMm: 500, widthMm: 700, qty: 3 } as AwningCostingInput, ratesUpdatedAt: null };

/** A draft as Convert builds it: the quote details, and whichever lines the quotes carry. */
function draft(lines: DraftLines): QuoteToOrderDraftInput {
  return { quoteName: 'Q-3F2A9C1E Houseboat', customerName: 'Status Houseboats', customerId: 'c1', quoteDate: '2026-09-10', quoteNotes: '', ...lines };
}

const cases: [string, DraftLines][] = [
  ['window only', { windowLines: [windowLine] }],
  ['awning only', { awningLines: [awningLine] }],
  ['window and awning, no glass', { windowLines: [windowLine], awningLines: [awningLine] }],
  ['glass, window and awning', { glassLines: [glassLine], windowLines: [windowLine], awningLines: [awningLine] }],
];

for (const [name, lines] of cases) {
  test(`a draft with ${name} reaches the order page with every line`, () => {
    persistQuoteToOrderDraft(draft(lines));
    const consumed = consumeQuoteToOrderDraft();

    assert.ok(consumed, 'the order page gets the draft, not a blank order');
    assert.deepEqual(consumed.glassLines, lines.glassLines ?? []);
    assert.deepEqual(consumed.windowLines, lines.windowLines ?? []);
    assert.deepEqual(consumed.awningLines, lines.awningLines ?? []);
  });
}

test('a draft with no line is not an order', () => {
  persistQuoteToOrderDraft(draft({}));
  assert.equal(consumeQuoteToOrderDraft(), null);
});

test('the quotes behind a draft reach the order page, so saving the order can link them', () => {
  persistQuoteToOrderDraft({ ...draft({ glassLines: [glassLine] }), quoteIds: ['q-1', 'q-2'] });
  assert.deepEqual(consumeQuoteToOrderDraft()?.quoteIds, ['q-1', 'q-2']);

  persistQuoteToOrderDraft(draft({ glassLines: [glassLine] }));
  assert.deepEqual(consumeQuoteToOrderDraft()?.quoteIds, [], 'a draft from an unsaved calculator quote links nothing');
});
