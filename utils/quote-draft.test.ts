// Checks the working quote that lets one quote hold glass, windows and awnings. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GlassSpecification } from './calculations';
import { AwningQuoteLine, GlassQuoteLine, WindowQuoteLine } from './quote-to-order';
import { EMPTY_QUOTE_DRAFT, QuoteDraft, clearQuoteDraftIfUnchanged, describeQuoteProducts, normalizeQuoteDraft, quoteDraftKinds, quoteDraftLineCount, quoteDraftTotal, withQuoteDraftLines, writeQuoteDraft } from './quote-draft';

const store = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  },
};

const spec: GlassSpecification = {
  width: 1200,
  height: 600,
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

const glassLine: GlassQuoteLine = { description: 'Side panel', quantity: 2, unitPrice: 100, markupPercent: 20, spec };
const windowLine: WindowQuoteLine = { description: 'Kitchen hopper', quantity: 1, unitPrice: 800, windowSpec: { type: 'T5573', heightMm: 500, lengthMm: 900 } as never, ratesUpdatedAt: null };
const awningLine: AwningQuoteLine = { description: 'Cabin awning', quantity: 3, unitPrice: 50, awningSpec: { heightMm: 400, widthMm: 900, qty: 3 } as never, ratesUpdatedAt: null };

function draftWith(over: Partial<QuoteDraft> = {}): QuoteDraft {
  return { ...EMPTY_QUOTE_DRAFT, ...over };
}

test('the total is every line on the quote, whatever it prices', () => {
  const draft = draftWith({ glassLines: [glassLine], windowLines: [windowLine], awningLines: [awningLine] });

  assert.equal(quoteDraftLineCount(draft), 3);
  assert.equal(quoteDraftTotal(draft), 200 + 800 + 150);
});

test('a line saved with no quantity is one of that line', () => {
  assert.equal(quoteDraftTotal(draftWith({ glassLines: [{ ...glassLine, quantity: 0 }] })), 100);
});

test('the total equals the sum of the amounts printed beside the lines', () => {
  // Three lines carrying sub-cent prices. Summed unrounded they come to 30.005, which prints as
  // $30.01 beside three lines that print $10.00 each.
  const draft = draftWith({
    glassLines: [{ ...glassLine, quantity: 1, unitPrice: 10.001 }],
    windowLines: [{ ...windowLine, quantity: 1, unitPrice: 10.002 }],
    awningLines: [{ ...awningLine, quantity: 1, unitPrice: 10.002 }],
  });

  assert.equal(Math.round(quoteDraftTotal(draft) * 100) / 100, 30);
});

test('products are listed in calculator order, not the order they were priced in', () => {
  const draft = draftWith({ awningLines: [awningLine], glassLines: [glassLine] });

  assert.deepEqual(quoteDraftKinds(draft), ['glass', 'awning']);
  assert.equal(describeQuoteProducts(quoteDraftKinds(draft)), 'Glass + Awning');
});

test('a quote with nothing priced names no product', () => {
  assert.deepEqual(quoteDraftKinds(EMPTY_QUOTE_DRAFT), []);
  assert.equal(describeQuoteProducts([]), '');
  assert.equal(describeQuoteProducts(['window']), 'Window');
  assert.equal(describeQuoteProducts(['glass', 'window', 'awning']), 'Glass + Window + Awning');
});

test('a calculator replaces its own product and leaves the rest of the quote alone', () => {
  const draft = draftWith({ name: 'Boat 12', glassLines: [glassLine], windowLines: [windowLine] });
  const next = withQuoteDraftLines(draft, 'glass', [{ ...glassLine, unitPrice: 150 }], { customer: 'Status Houseboats' });

  assert.equal(next.glassLines[0].unitPrice, 150);
  assert.deepEqual(next.windowLines, [windowLine], 'the window another page priced stays on the quote');
  assert.equal(next.name, 'Boat 12', 'a heading nobody set is not cleared');
  assert.equal(next.customer, 'Status Houseboats');
  assert.equal(draft.glassLines[0].unitPrice, 100, 'the draft handed in is not written to');
});

test('anything but a stored quote reads as an empty one', () => {
  for (const value of [null, undefined, 'not a quote', 42, []]) {
    assert.deepEqual(normalizeQuoteDraft(value), EMPTY_QUOTE_DRAFT);
  }
});

test('a stored quote missing fields keeps what it has', () => {
  const draft = normalizeQuoteDraft({
    name: 'Boat 12',
    customerId: '',
    glassLines: [{ description: 'Side panel', quantity: 2, unitPrice: 100, markupPercent: 20, spec }, { description: 'No specification' }],
    windowLines: 'lost',
  });

  assert.equal(draft.name, 'Boat 12');
  assert.equal(draft.customerId, null);
  assert.equal(draft.date, '');
  assert.equal(draft.glassLines.length, 1, 'a line with no specification cannot be priced and is dropped');
  assert.deepEqual(draft.windowLines, []);
  assert.deepEqual(draft.awningLines, []);
});

test('the quote is emptied only while it still holds what was saved', () => {
  const saved = draftWith({ glassLines: [glassLine] });
  writeQuoteDraft(saved);

  assert.equal(clearQuoteDraftIfUnchanged(saved), true);
  assert.equal(quoteDraftLineCount(normalizeQuoteDraft(null)), 0);
});

test('a line another calculator wrote while the quote saved is kept', () => {
  const saved = draftWith({ glassLines: [glassLine] });
  writeQuoteDraft({ ...saved, windowLines: [windowLine] });

  assert.equal(clearQuoteDraftIfUnchanged(saved), false, 'the window is not on the quote that was filed');
});
