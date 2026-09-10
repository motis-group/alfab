'use client';

import * as React from 'react';

import ActionButton from '@components/ActionButton';
import Card from '@components/Card';
import QuoteSheet from '@components/QuoteSheet';
import RowSpaceBetween from '@components/RowSpaceBetween';
import SimpleTable from '@components/SimpleTable';
import Text from '@components/Text';
import Window from '@components/Window';

import { describeGlassSpecification } from '@utils/calculations';
import { formatCurrency } from '@utils/order-management';
import { QuoteDraft, quoteDraftTotal } from '@utils/quote-draft';
import { quoteEmailTruncated, quoteMailtoHref } from '@utils/quote-email';
import { QuoteRecord, describeQuoteRecordProducts, quoteDraftFromRecord } from '@utils/quote-register';
import { QUOTE_STATUS_LABELS } from '@utils/quote-status';

interface QuoteDocumentProps {
  quote: QuoteRecord;
  onClose: () => void;
  /** Offered when the quote has something to put on an order. */
  onConvert?: () => void;
  /** Opens the calculator the quote was priced in. */
  onOpen?: () => void;
}

/** Every priced line on the quote, described as the printed sheet describes it. */
function lineRows(draft: QuoteDraft): string[][] {
  const lines = [
    ...draft.glassLines.map((line) => ({ description: line.description || describeGlassSpecification(line.spec), quantity: line.quantity, unitPrice: line.unitPrice })),
    ...draft.windowLines.map((line) => ({ description: line.description || 'Window', quantity: line.quantity, unitPrice: line.unitPrice })),
    ...draft.awningLines.map((line) => ({ description: line.description || 'Awning', quantity: line.quantity, unitPrice: line.unitPrice })),
  ];

  return lines.map((line, index) => [
    String(index + 1),
    line.description,
    formatCurrency(line.unitPrice),
    String(Math.max(1, line.quantity)),
    formatCurrency(line.unitPrice * Math.max(1, line.quantity)),
  ]);
}

/**
 * A quote as the customer would read it, rather than as a row in a list.
 *
 * The layout follows the invoice template from sacred.computer, the library the rest of this
 * interface is built from. It shows what was quoted at the price it was quoted at; it does not
 * reprice, because a saved quote holds the number the customer was given.
 */
export default function QuoteDocument({ quote, onClose, onConvert, onOpen }: QuoteDocumentProps) {
  const draft = quoteDraftFromRecord(quote);
  const rows = lineRows(draft);
  const [isSheetMounted, setIsSheetMounted] = React.useState(false);
  const [isMailShortened, setIsMailShortened] = React.useState(false);

  function printQuote() {
    setIsSheetMounted(true);
    if (typeof window !== 'undefined') {
      // Let the sheet reach the page before the print dialog reads it.
      window.setTimeout(() => window.print(), 50);
    }
  }

  function emailQuote() {
    if (typeof window === 'undefined') {
      return;
    }

    setIsMailShortened(quoteEmailTruncated(draft));
    window.location.href = quoteMailtoHref(draft);
  }

  return (
    <Window aria-label={`Quote ${quote.name || 'untitled'}`}>
      {isSheetMounted ? <QuoteSheet quote={draft} /> : null}

      <Card title={`QUOTE — ${(quote.name || 'Untitled').toUpperCase()}`} mode="left">
        Alfab Pty Ltd
        <br />
        alfabvic.com.au
        <br />
        <br />
        Quoted to:
        <br />
        {quote.customer || 'Walk-in'}
        <br />
        <br />
        Product: {describeQuoteRecordProducts(quote) || '—'}
        <br />
        Quote date: {quote.date ? quote.date.slice(0, 10) : 'not dated'}
        <br />
        Status: {QUOTE_STATUS_LABELS[quote.status]}
        {quote.statusReason ? (
          <>
            <br />
            Reason: {quote.statusReason}
          </>
        ) : null}
      </Card>
      <br />

      <Card title="LINE ITEMS" mode="left">
        {rows.length ? (
          <>
            <SimpleTable data={[['#', 'DESCRIPTION', 'UNIT', 'QTY', 'AMOUNT'], ...rows]} align={['left', 'left', 'right', 'right', 'right']} />
            <br />
            <RowSpaceBetween>
              <span>Total</span>
              <span>{formatCurrency(quoteDraftTotal(draft))}</span>
            </RowSpaceBetween>
          </>
        ) : (
          <Text>This quote has no priced line. Open it in the calculator to price it.</Text>
        )}
        <br />
        <Text>Prices exclude GST. Confirm sizes before manufacture.</Text>
        {isMailShortened ? (
          <Text>
            <span className="status-warning">The quote is longer than the message body holds. Attach the printed quote.</span>
          </Text>
        ) : null}
      </Card>
      <br />

      <RowSpaceBetween>
        <span>
          <ActionButton hotkey="ESC" onClick={onClose}>
            CLOSE
          </ActionButton>
        </span>
        <span>
          {rows.length ? <ActionButton onClick={printQuote}>PRINT</ActionButton> : null}{' '}
          {rows.length ? <ActionButton onClick={emailQuote}>ELECTRONIC MAIL</ActionButton> : null}{' '}
          {onOpen ? <ActionButton onClick={onOpen}>OPEN IN CALCULATOR</ActionButton> : null}{' '}
          {onConvert && quote.draft ? <ActionButton onClick={onConvert}>CONVERT TO ORDER</ActionButton> : null}
        </span>
      </RowSpaceBetween>
    </Window>
  );
}
