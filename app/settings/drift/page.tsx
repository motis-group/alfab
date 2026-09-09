'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { usePricing } from '@components/PricingProvider';
import { APP_ACCOUNT_SECTION_ITEMS, APP_NAVIGATION_ITEMS } from '@utils/app-navigation';
import { formatCurrency } from '@utils/order-management';
import { AwningRates, DEFAULT_AWNING_RATES } from '@utils/awning-costing-rates';
import { DEFAULT_WINDOW_RATES, WindowRates } from '@utils/window-costing-rates';
import { loadAwningRates } from '@utils/awning-costing-store';
import { loadWindowRates } from '@utils/window-costing-store';
import { DriftItem, MATERIAL_SPREAD, SOURCE_LABELS, SOURCE_SETTINGS, compareRates, materialDrift } from '@utils/rate-drift';

const navigationItems = APP_NAVIGATION_ITEMS;

function formatSpread(spread: number | null): string {
  return spread == null ? '—' : `${(spread * 100).toFixed(1)}%`;
}

/**
 * Whether every gap leans the same way by roughly the same amount. Ten items disagreeing by a
 * similar margin in a similar direction is one event, not ten, and says so.
 */
function systematicOffset(items: DriftItem[]): { low: number; high: number; count: number } | null {
  const spreads = items.filter((item) => (item.spread ?? 0) >= MATERIAL_SPREAD).map((item) => item.spread as number);
  if (spreads.length < 3) {
    return null;
  }
  const low = Math.min(...spreads);
  const high = Math.max(...spreads);
  // A tight band across many items is the signature of one list taking a price rise the other did not.
  return high - low <= 0.06 ? { low, high, count: spreads.length } : null;
}

export default function RateDriftReport() {
  const router = useRouter();
  const { pricingData, updatedAt: glassUpdatedAt } = usePricing();

  const [windowRates, setWindowRates] = useState<WindowRates>(DEFAULT_WINDOW_RATES);
  const [awningRates, setAwningRates] = useState<AwningRates>(DEFAULT_AWNING_RATES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [windowLoaded, awningLoaded] = await Promise.all([loadWindowRates(), loadAwningRates()]);
        setWindowRates(windowLoaded.rates);
        setAwningRates(awningLoaded.rates);
        setError(windowLoaded.error || awningLoaded.error);
      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load the rate documents.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const items = useMemo(() => compareRates(pricingData, windowRates, awningRates), [pricingData, windowRates, awningRates]);
  const material = useMemo(() => materialDrift(items), [items]);
  const offset = useMemo(() => systematicOffset(items), [items]);

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⚙"
      navigationItems={navigationItems}
      navLabel="COSTING"
      navRight={<ActionButton onClick={() => router.push('/settings')}>BACK TO RATES</ActionButton>}
      heading="PRICE DRIFT"
      sectionNavigationItems={APP_ACCOUNT_SECTION_ITEMS}
      badge={isLoading ? 'LOADING' : material.length ? `${material.length} TO REVIEW` : 'LISTS AGREE'}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
          <Card title="WHAT THIS IS">
            <Text>Three calculators hold their own prices. Several items appear in more than one list. This is where they disagree.</Text>
            <Text style={{ opacity: 0.7 }}>Only items held in at least two lists appear. An item priced once has nothing to drift against.</Text>
          </Card>

          <Card title="A GAP IS NOT AUTOMATICALLY WRONG">
            <Text>The lists do not all mean the same thing by a price.</Text>
            <Text style={{ opacity: 0.7 }}>The glass calculator&apos;s price is a base a per-piece markup is added to. The window costing&apos;s feeds a manufactured window that then carries margin and uplift. The same pane can honestly be worth two numbers.</Text>
            <Text>
              <span className="status-warning">What is not defensible is that nobody can say which. That is the thing to fix.</span>
            </Text>
          </Card>

          {offset ? (
            <Card title="THIS LOOKS LIKE ONE EVENT">
              <Text>
                <span className="status-warning">
                  {offset.count} items disagree, all in the same direction, all between {formatSpread(offset.low)} and {formatSpread(offset.high)}.
                </span>
              </Text>
              <Text>A band that tight across that many items is not drift item by item. It reads as one list taking a price rise the other never got.</Text>
              <Text style={{ opacity: 0.7 }}>Worth checking against a supplier invoice before either list is edited.</Text>
            </Card>
          ) : null}

          <Card title="THE LISTS">
            <Text>Glass: {glassUpdatedAt ? `saved ${new Date(glassUpdatedAt).toLocaleDateString()}` : 'code defaults'}</Text>
            <Text>Window and awning rates load from their own tables.</Text>
            {error ? (
              <Text>
                <span className="status-warning">{error}</span>
              </Text>
            ) : null}
            <br />
            <ActionButton onClick={() => router.push('/settings')}>Glass Rates</ActionButton>
            <br />
            <ActionButton onClick={() => router.push('/settings/windows')}>Window Rates</ActionButton>
            <br />
            <ActionButton onClick={() => router.push('/settings/awnings')}>Awning Rates</ActionButton>
          </Card>
        </>
      }
    >
      <CardDouble title={material.length ? `DISAGREE BY MORE THAN ${(MATERIAL_SPREAD * 100).toFixed(0)}%` : 'NOTHING MATERIAL'}>
        {material.length ? (
          <>
            <Text>Dearest gap first. The percentage is how much higher the dearest list is than the cheapest, after each list&apos;s own loading is applied.</Text>
            <br />
            <Table>
              <TableRow>
                <TableColumn style={{ width: '30ch' }}>ITEM</TableColumn>
                <TableColumn style={{ width: '10ch' }}>GAP</TableColumn>
                <TableColumn>PRICES</TableColumn>
              </TableRow>
              {material.map((item) => (
                <TableRow key={item.key}>
                  <TableColumn>
                    {item.label}
                    <br />
                    <span style={{ opacity: 0.6 }}>{item.unit}</span>
                  </TableColumn>
                  <TableColumn>
                    <span className="status-warning">{formatSpread(item.spread)}</span>
                  </TableColumn>
                  <TableColumn>
                    {item.prices.map((price) => (
                      <div key={price.source}>
                        {SOURCE_LABELS[price.source]}: <strong>{formatCurrency(price.effective)}</strong>
                        {price.note ? <span style={{ opacity: 0.6 }}> ({price.note})</span> : null}
                      </div>
                    ))}
                  </TableColumn>
                </TableRow>
              ))}
            </Table>
          </>
        ) : (
          <Text>Every shared item agrees across the lists that hold it.</Text>
        )}
      </CardDouble>

      <CardDouble title="EVERY SHARED ITEM">
        <Text>Including the ones that agree, so a list that has just been reconciled can be seen to be reconciled.</Text>
        <br />
        <Table>
          <TableRow>
            <TableColumn style={{ width: '30ch' }}>ITEM</TableColumn>
            <TableColumn style={{ width: '10ch' }}>GAP</TableColumn>
            <TableColumn style={{ width: '14ch' }}>CHEAPEST</TableColumn>
            <TableColumn style={{ width: '14ch' }}>DEAREST</TableColumn>
            <TableColumn>IN</TableColumn>
          </TableRow>
          {items.map((item) => (
            <TableRow key={item.key}>
              <TableColumn>{item.label}</TableColumn>
              <TableColumn>
                <span className={(item.spread ?? 0) >= MATERIAL_SPREAD ? 'status-warning' : 'status-success'}>{formatSpread(item.spread)}</span>
              </TableColumn>
              <TableColumn>{formatCurrency(item.low)}</TableColumn>
              <TableColumn>{formatCurrency(item.high)}</TableColumn>
              <TableColumn>{item.prices.map((price) => SOURCE_LABELS[price.source]).join(', ')}</TableColumn>
            </TableRow>
          ))}
        </Table>
      </CardDouble>

      <CardDouble title="WHAT TO DO WITH THIS">
        <Text>
          <strong>1. Decide what each list means.</strong> Is the window glass price a cost in, or a price out? Write the answer down. Every other question here depends on it.
        </Text>
        <Text>
          <strong>2. Check one item against a supplier invoice.</strong> One real invoice settles which list is right, and probably settles all of them at once.
        </Text>
        <Text>
          <strong>3. Then reconcile.</strong> Either the lists merge, or each keeps its own number with the reason recorded beside it.
        </Text>
        <br />
        <Text style={{ opacity: 0.7 }}>
          Equivalences are declared by hand in <code>utils/rate-drift.ts</code>. Items whose products may not be the same, such as A/P Tint against Grey, are deliberately left unmatched: a wrong match is worse than a missing one.
        </Text>
      </CardDouble>
    </AppFrame>
  );
}
