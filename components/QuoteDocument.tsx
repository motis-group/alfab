'use client';

import * as React from 'react';

import ActionButton from '@components/ActionButton';
import PrintedQuote, { QuotePaper, QuotePaperProps } from '@components/PrintedQuote';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Text from '@components/Text';
import Window from '@components/Window';

import { QuoteLine } from '@utils/customer-quote-store';
import { QuoteRecord } from '@utils/quote-register';
import { QUOTE_STATUS_LABELS } from '@utils/quote-status';

interface QuoteDocumentProps {
  quote: QuoteRecord;
  onClose: () => void;
  /** Offered when the quote has something to put on an order. */
  onConvert?: () => void;
}

/** A printed quote has its lines as printed. Any other quote shows the lines it would order. */
function paperLines(quote: QuoteRecord): QuoteLine[] {
  if (quote.printedLines) {
    return quote.printedLines;
  }
  const draft = quote.draft;
  return [...(draft?.glassLines || []), ...(draft?.windowLines || []), ...(draft?.awningLines || [])].map((line) => ({ description: line.description, spec: '', quantity: line.quantity, unitPrice: line.unitPrice }));
}

/**
 * A quote as the customer reads it, rather than as a row in a list: the same paper the calculators
 * print. It does not reprice, because a saved quote holds the number the customer was given.
 */
export default function QuoteDocument({ quote, onClose, onConvert }: QuoteDocumentProps) {
  const lines = paperLines(quote);

  // Both copies below use one set of properties. The paper on screen and the paper in the printer
  // therefore stay the same.
  const paper: QuotePaperProps = {
    reference: quote.reference,
    quoteName: quote.name,
    customerName: quote.customer,
    quoteDate: quote.date ? quote.date.slice(0, 10) : '',
    notes: quote.draft?.quoteNotes || '',
    lines,
  };

  function printQuote() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  return (
    <Window aria-label={`Quote ${quote.reference || quote.name || 'untitled'}`}>
      <Text>Status: {QUOTE_STATUS_LABELS[quote.status]}</Text>
      <br />

      {lines.length ? (
        <>
          <QuotePaper {...paper} />
          {/* The copy for the printer. The print styles keep only a sheet that is a child of
              <body>. Without this sheet, the printer produces a blank page. */}
          <PrintedQuote {...paper} />
        </>
      ) : (
        <Text>This quote has no priced line. Open it in the calculator to price it.</Text>
      )}
      <br />

      <RowSpaceBetween>
        <span>
          <ActionButton hotkey="ESC" onClick={onClose}>
            CLOSE
          </ActionButton>
        </span>
        <span>
          {lines.length ? <ActionButton onClick={printQuote}>PRINT</ActionButton> : null} {onConvert && quote.draft ? <ActionButton onClick={onConvert}>CONVERT TO ORDER</ActionButton> : null}
        </span>
      </RowSpaceBetween>
    </Window>
  );
}
