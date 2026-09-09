'use client';

import Card from '@components/Card';
import Text from '@components/Text';
import { RateFreshness, RateGroupAge, describeAge, gradeAsAt, needsReview, parseAsAt } from '@utils/rate-age';

const TONE: Record<RateFreshness, string | undefined> = {
  stale: 'status-error',
  unknown: 'status-warning',
  ageing: 'status-warning',
  current: 'status-success',
};

/** How old one group of prices is, for the field it sits beside in a rates editor. */
export function RateAgeBadge({ text }: { text: string }) {
  const age = parseAsAt(text);
  return (
    <Text>
      <span className={TONE[age.freshness]}>
        {describeAge(age)}
        {age.freshness === 'stale' ? ' — check this before quoting on it' : ''}
        {age.freshness === 'unknown' ? ' — nobody recorded when this was last checked' : ''}
      </span>
    </Text>
  );
}

interface RateReviewCardProps {
  asAt: Record<string, string>;
  /** What to call each group in the interface. */
  label: (key: string) => string;
  /** Where to send someone to fix them. */
  action?: React.ReactNode;
  title?: string;
}

/**
 * The price groups nobody has checked in years. Shown on the costing pages as well as the rates
 * editors, because the person quoting is the one who needs to know the price is old.
 */
export function RateReviewCard({ asAt, label, action, title = 'RATE AGE' }: RateReviewCardProps) {
  const graded = gradeAsAt(asAt, label);
  const review = needsReview(graded);

  if (!review.length) {
    return null;
  }

  const dated = review.filter((group) => group.months != null);
  const oldest: RateGroupAge | undefined = dated[0];

  return (
    <Card title={title}>
      <Text>
        <span className="status-warning">
          {review.length} price {review.length === 1 ? 'group has' : 'groups have'} not been checked in a long time.
          {oldest ? ` The oldest is ${oldest.label}, ${describeAge(oldest)}.` : ''}
        </span>
      </Text>
      {review.map((group) => (
        <Text key={group.key}>
          <span className={TONE[group.freshness]}>
            {group.label}: {describeAge(group)}
            {group.text && group.text !== 'unknown' ? ` (${group.text})` : ''}
          </span>
        </Text>
      ))}
      <Text style={{ opacity: 0.7 }}>A quote built on these still prints a confident price. Nothing here blocks it.</Text>
      {action}
    </Card>
  );
}
