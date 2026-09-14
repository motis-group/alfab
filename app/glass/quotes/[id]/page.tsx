'use client';

import '@root/global.scss';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import QuoteDocument from '@components/QuoteDocument';
import Text from '@components/Text';

import { QuoteRecord, findQuoteRecord, isMergeRefusal, mergeQuotesForOrder } from '@utils/quote-register';
import { persistQuoteToOrderDraft } from '@utils/quote-to-order';
import { fetchCurrentSessionUser } from '@utils/session-client';

/**
 * One saved quote, at its own address. The register lists quotes; this is where one is read, and
 * the only place a quote is a page rather than a row.
 *
 * A quote needs a URL because the calculators return to one: pricing a line sends the estimator to
 * the calculator that prices it and back here, the way an order line already works.
 */
export default function QuotePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const user = await fetchCurrentSessionUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { record, errors } = await findQuoteRecord(id);
      setQuote(record);
      // A store that failed to read is named rather than reported as a quote that does not exist,
      // because the quote may be in the store that failed.
      setError(errors.length ? errors.join(' ') : record ? null : 'No quote has that reference. It may have been deleted.');
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to read the quote.');
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  function convert() {
    if (!quote) {
      return;
    }

    const merged = mergeQuotesForOrder([quote]);
    if (!merged) {
      setError('That quote has no priced line to put on an order.');
      return;
    }
    if (isMergeRefusal(merged)) {
      setError(merged.reason);
      return;
    }

    persistQuoteToOrderDraft(merged.draft);
    router.push('/glass/new?fromQuote=1');
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      heading={quote?.reference || quote?.name || 'QUOTE'}
      badge={isLoading ? 'LOADING' : undefined}
      navRight={<ActionButton onClick={() => router.push('/glass')}>BACK TO QUOTES</ActionButton>}
      actionItems={[
        { body: 'Quotes', onClick: () => router.push('/glass') },
        { body: 'Reload', onClick: load },
      ]}
    >
      {error ? (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      ) : null}

      {isLoading ? <Text>Loading the quote...</Text> : null}

      {!isLoading && quote ? <QuoteDocument quote={quote} onClose={() => router.push('/glass')} onConvert={convert} /> : null}
    </AppFrame>
  );
}
