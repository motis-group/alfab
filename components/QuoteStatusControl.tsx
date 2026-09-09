'use client';

import { useState } from 'react';

import ActionButton from '@components/ActionButton';
import Card from '@components/Card';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { formatCurrency } from '@utils/order-management';
import { LOST_REASONS, QUOTE_STATUS_LABELS, QUOTE_STATUS_TONE, QuoteStatus, WinRate, lossReasons } from '@utils/quote-status';

interface QuoteStatusControlProps {
  status: QuoteStatus;
  statusReason: string | null;
  disabled?: boolean;
  onChange: (status: QuoteStatus, reason?: string | null) => void;
}

/**
 * Mark a quote won or lost from the list it already appears on. A loss asks why, from a short list:
 * a free-text box gets left empty, and an empty reason cannot tell anyone whether the price is wrong.
 */
export default function QuoteStatusControl({ status, statusReason, disabled, onChange }: QuoteStatusControlProps) {
  const [askingWhy, setAskingWhy] = useState(false);

  if (askingWhy) {
    return (
      <>
        <Text>Why was it lost?</Text>
        {LOST_REASONS.map((reason) => (
          <ActionButton
            key={reason}
            onClick={() => {
              onChange('lost', reason);
              setAskingWhy(false);
            }}
          >
            {reason}
          </ActionButton>
        ))}
        <ActionButton onClick={() => setAskingWhy(false)}>Cancel</ActionButton>
      </>
    );
  }

  return (
    <>
      <Text>
        <span className={QUOTE_STATUS_TONE[status]}>
          {QUOTE_STATUS_LABELS[status]}
          {status === 'lost' && statusReason ? `: ${statusReason}` : ''}
        </span>
      </Text>
      {disabled ? null : (
        <RowSpaceBetween>
          {status !== 'won' ? <ActionButton onClick={() => onChange('won')}>Won</ActionButton> : null}
          {status !== 'lost' ? <ActionButton onClick={() => setAskingWhy(true)}>Lost</ActionButton> : null}
          {status !== 'open' ? <ActionButton onClick={() => onChange('open')}>Reopen</ActionButton> : null}
        </RowSpaceBetween>
      )}
    </>
  );
}

interface WinRateCardProps {
  tally: WinRate;
  quotes: Array<{ status: QuoteStatus; statusReason: string | null }>;
  title?: string;
}

/** What the marked quotes add up to. Empty until somebody has marked one, and says so. */
export function WinRateCard({ tally, quotes, title = 'WIN RATE' }: WinRateCardProps) {
  const reasons = lossReasons(quotes);
  const decided = tally.won + tally.lost;

  return (
    <Card title={title}>
      {tally.rate == null ? (
        <>
          <Text>No quote has been marked won or lost yet.</Text>
          <Text style={{ opacity: 0.7 }}>Mark them as you hear back. After a dozen the rate starts telling you whether the price is right.</Text>
        </>
      ) : (
        <>
          <RowSpaceBetween>
            <Text>WON</Text>
            <Text>
              <span className="status-pill status-pill-success">{Math.round(tally.rate * 100)}%</span>
            </Text>
          </RowSpaceBetween>
          <Text style={{ opacity: 0.7 }}>
            {tally.won} of {decided} decided.
          </Text>
          <RowSpaceBetween>
            <Text>VALUE WON</Text>
            <Text>{formatCurrency(tally.wonValue)}</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>VALUE LOST</Text>
            <Text>{formatCurrency(tally.lostValue)}</Text>
          </RowSpaceBetween>
        </>
      )}

      <RowSpaceBetween>
        <Text>STILL OPEN</Text>
        <Text>{tally.open}</Text>
      </RowSpaceBetween>

      {reasons.length ? (
        <>
          <br />
          <Text>WHY THEY WERE LOST</Text>
          <Table>
            {reasons.map((entry) => (
              <TableRow key={entry.reason}>
                <TableColumn style={{ width: '24ch' }}>{entry.reason}</TableColumn>
                <TableColumn>{entry.count}</TableColumn>
              </TableRow>
            ))}
          </Table>
          {reasons[0].reason === 'Price' ? (
            <Text>
              <span className="status-warning">Price is the commonest reason given. Worth a look at the margin before the next quote goes out.</span>
            </Text>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
