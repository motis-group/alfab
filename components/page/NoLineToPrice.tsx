'use client';

import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import Text from '@components/Text';

/**
 * The page of a calculator that has no line to price.
 *
 * A calculator prices one line that a quote or an order sends. The calculator keeps no quote of its
 * own. Without a line, it has nothing to price and no place to put a price. This page shows the way
 * to a quote.
 */
export default function NoLineToPrice({ heading, isLoading, error }: { heading: string; isLoading: boolean; error: string | null }) {
  const router = useRouter();

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      heading={heading}
      badge={isLoading ? 'LOADING' : undefined}
      navRight={<ActionButton onClick={() => router.push('/glass')}>BACK TO QUOTES</ActionButton>}
      actionItems={[{ body: 'New Quote', onClick: () => router.push('/glass/quotes/new') }]}
    >
      {error ? (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      ) : null}
      {isLoading ? null : (
        <Card title="OPEN A QUOTE FIRST">
          <Text>A calculator prices one line of a quote. Open the quote, or click New Quote at the top. On the quote, pick the kind of line under Add Line. The priced line goes back to the quote.</Text>
        </Card>
      )}
    </AppFrame>
  );
}
