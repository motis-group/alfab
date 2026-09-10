'use client';

import * as React from 'react';

import ActionButton from '@components/ActionButton';
import Card from '@components/Card';
import RowSpaceBetween from '@components/RowSpaceBetween';
import SimpleTable from '@components/SimpleTable';
import Text from '@components/Text';
import Window from '@components/Window';

import { formatCurrency } from '@utils/order-management';
import { QUOTE_KIND_LABELS, QuoteRecord } from '@utils/quote-register';
import { QUOTE_STATUS_LABELS } from '@utils/quote-status';

interface QuoteDocumentProps {
  quote: QuoteRecord;
  onClose: () => void;
  /** Offered when the quote has something to put on an order. */
  onConvert?: () => void;
  /** Opens the calculator the quote was priced in. */
  onOpen?: () => void;
}

/** Every priced line on the quote, whichever calculator wrote it. */
function lineRows(quote: QuoteRecord): string[][] {
  const draft = quote.draft;
  if (!draft) {
    return [];
  }

  const lines = [
    ...(draft.glassLines || []).map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })),
    ...(draft.windowLines || []).map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })),
    ...(draft.awningLines || []).map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })),
  ];

  return lines.map((line, index) => [
    String(index + 1),
    line.description || `${QUOTE_KIND_LABELS[quote.kind]} item`,
    formatCurrency(line.unitPrice),
    String(line.quantity),
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
  const rows = lineRows(quote);
  const lineTotal = rows.reduce((sum, row) => sum + Number(row[4].replace(/[^0-9.-]/g, '')), 0);

  return (
    <Window aria-label={`Quote ${quote.name || 'untitled'}`}>
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
        Product: {QUOTE_KIND_LABELS[quote.kind]}
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
              <span>{formatCurrency(lineTotal)}</span>
            </RowSpaceBetween>
          </>
        ) : (
          <Text>This quote has no priced line. Open it in the calculator to price it.</Text>
        )}
        <br />
        <Text>Prices exclude GST. Confirm sizes before manufacture.</Text>
      </Card>
      <br />

      <RowSpaceBetween>
        <span>
          <ActionButton hotkey="ESC" onClick={onClose}>
            CLOSE
          </ActionButton>
        </span>
        <span>
          {onOpen ? <ActionButton onClick={onOpen}>OPEN IN CALCULATOR</ActionButton> : null}{' '}
          {onConvert && quote.draft ? <ActionButton onClick={onConvert}>CONVERT TO ORDER</ActionButton> : null}
        </span>
      </RowSpaceBetween>
    </Window>
  );
}
