'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

const navigationItems = [
  { icon: '⊹', children: 'Glass Costing', href: '/' },
  { icon: '⊹', children: 'Order Management', href: '/doors' },
  { icon: '⊹', children: 'Customers', href: '/doors/clients' },
  { icon: '⊹', children: 'Pricing Settings', href: '/settings' },
  { icon: '⊹', children: 'Billing', href: '/settings/billing' },
];

interface BillingEstimateResponse {
  assumptions: {
    marginPercent: number;
  };
  costs: {
    ec2ComputeAud: number;
    rdsComputeAud: number;
    ec2StorageAud: number;
    rdsStorageAud: number;
    miscBufferAud: number;
    infraSubtotalAud: number;
    marginAud: number;
    targetMonthlyAud: number;
  };
}

interface BillingAccountResponse {
  account_key: string;
  company_name: string;
  billing_email: string | null;
  margin_percent: number | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface BillingStatusResponse {
  defaults: {
    accountKey: string;
    companyName: string;
    billingEmail: string;
  };
  estimate: BillingEstimateResponse;
  account: BillingAccountResponse | null;
}

function formatAud(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function shortDate(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleDateString('en-AU');
}

export default function BillingSettingsPage() {
  const router = useRouter();

  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [marginPercent, setMarginPercent] = useState('35');
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutState, setCheckoutState] = useState<string>('');

  const account = status?.account || null;
  const estimate = status?.estimate || null;
  const defaults = status?.defaults || null;

  const badgeLabel = useMemo(() => {
    if (!account?.subscription_status) {
      return 'NOT CONFIGURED';
    }
    return account.subscription_status.toUpperCase();
  }, [account?.subscription_status]);

  async function loadStatus() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/status', { cache: 'no-store' });
      if (response.status === 401) {
        router.push('/login');
        return;
      }

      const data = (await response.json()) as BillingStatusResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load billing status.');
      }

      setStatus(data);
      const safeMargin = data.account?.margin_percent ?? data.estimate.assumptions.marginPercent;
      setMarginPercent(String(safeMargin));
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load billing status.');
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      setCheckoutState(urlParams.get('checkout') || '');
    }

    loadStatus();
  }, []);

  async function startCheckout() {
    if (!defaults) {
      return;
    }

    setIsCheckoutLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountKey: defaults.accountKey,
          companyName: defaults.companyName,
          billingEmail: defaults.billingEmail,
          marginPercent: Number(marginPercent) || 0,
        }),
      });

      const data = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || 'Unable to start Stripe checkout');
      }

      window.location.href = data.checkoutUrl;
    } catch (checkoutError: any) {
      setError(checkoutError?.message || 'Unable to start checkout');
      setIsCheckoutLoading(false);
    }
  }

  async function openPortal() {
    if (!defaults) {
      return;
    }

    setIsPortalLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountKey: defaults.accountKey,
        }),
      });

      const data = (await response.json()) as { portalUrl?: string; error?: string };
      if (!response.ok || !data.portalUrl) {
        throw new Error(data.error || 'Unable to open billing portal');
      }

      window.location.href = data.portalUrl;
    } catch (portalError: any) {
      setError(portalError?.message || 'Unable to open billing portal');
      setIsPortalLoading(false);
    }
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⚙"
      navigationItems={navigationItems}
      navLabel="BILLING"
      navRight={<ActionButton onClick={() => router.push('/settings')}>BACK TO SETTINGS</ActionButton>}
      heading="HOSTING BILLING"
      badge={badgeLabel}
      showThemeControls
      actionItems={[
        {
          hotkey: '⌘+R',
          body: 'Reload',
          onClick: loadStatus,
        },
        {
          hotkey: '⌘+B',
          body: 'Back',
          onClick: () => router.push('/settings'),
        },
      ]}
    >
      {(checkoutState === 'success' || checkoutState === 'cancelled') && (
        <Card title="CHECKOUT STATUS">
          <Text>
            {checkoutState === 'success' ? <span className="status-pill status-pill-success">Stripe checkout completed. Wait up to a few seconds, then reload.</span> : <span className="status-pill status-pill-warning">Stripe checkout was cancelled.</span>}
          </Text>
        </Card>
      )}

      {error && (
        <Card title="BILLING ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      )}

      <CardDouble title="MONTHLY COST MODEL (AUD)">
        {isLoading || !estimate ? (
          <Text>Loading billing estimate...</Text>
        ) : (
          <>
            <Text>Estimated infrastructure baseline plus margin for managed operation.</Text>
            <br />
            <Table>
              <TableRow>
                <TableColumn style={{ width: '32ch' }}>COST COMPONENT</TableColumn>
                <TableColumn>MONTHLY COST</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>EC2 Compute</TableColumn>
                <TableColumn>{formatAud(estimate.costs.ec2ComputeAud)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>RDS Compute</TableColumn>
                <TableColumn>{formatAud(estimate.costs.rdsComputeAud)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>EC2 Storage (EBS)</TableColumn>
                <TableColumn>{formatAud(estimate.costs.ec2StorageAud)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>RDS Storage</TableColumn>
                <TableColumn>{formatAud(estimate.costs.rdsStorageAud)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Ops Buffer</TableColumn>
                <TableColumn>{formatAud(estimate.costs.miscBufferAud)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>
                  <strong>Infra Subtotal</strong>
                </TableColumn>
                <TableColumn>
                  <strong>{formatAud(estimate.costs.infraSubtotalAud)}</strong>
                </TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>
                  <strong>Margin</strong>
                </TableColumn>
                <TableColumn>
                  <strong>{formatAud(estimate.costs.marginAud)}</strong>
                </TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>
                  <strong>Target Monthly Charge</strong>
                </TableColumn>
                <TableColumn>
                  <strong>{formatAud(estimate.costs.targetMonthlyAud)}</strong>
                </TableColumn>
              </TableRow>
            </Table>
          </>
        )}
      </CardDouble>

      <CardDouble title="STRIPE SUBSCRIPTION">
        {isLoading ? (
          <Text>Loading subscription status...</Text>
        ) : (
          <>
            <Text>Set the margin and create a monthly Stripe subscription for Alfab.</Text>
            <br />
            <Input label="MARGIN PERCENT (%)" type="number" step="0.1" min="0" value={marginPercent} onChange={(event) => setMarginPercent(event.target.value)} />
            <br />
            <Table>
              <TableRow>
                <TableColumn style={{ width: '24ch' }}>FIELD</TableColumn>
                <TableColumn>VALUE</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Account Key</TableColumn>
                <TableColumn>{account?.account_key || defaults?.accountKey || '-'}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Company</TableColumn>
                <TableColumn>{account?.company_name || defaults?.companyName || '-'}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Billing Email</TableColumn>
                <TableColumn>{account?.billing_email || defaults?.billingEmail || '-'}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Subscription Status</TableColumn>
                <TableColumn>{account?.subscription_status || 'not_started'}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Current Period</TableColumn>
                <TableColumn>
                  {shortDate(account?.current_period_start || null)} - {shortDate(account?.current_period_end || null)}
                </TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Cancel At Period End</TableColumn>
                <TableColumn>{account?.cancel_at_period_end ? 'yes' : 'no'}</TableColumn>
              </TableRow>
            </Table>
            <br />
            <RowSpaceBetween>
              <ActionButton onClick={isCheckoutLoading ? undefined : startCheckout}>{isCheckoutLoading ? 'Starting Stripe checkout...' : 'Start / Update Stripe Checkout'}</ActionButton>
              <ActionButton onClick={isPortalLoading ? undefined : openPortal}>{isPortalLoading ? 'Opening portal...' : 'Open Stripe Billing Portal'}</ActionButton>
            </RowSpaceBetween>
          </>
        )}
      </CardDouble>
    </AppFrame>
  );
}
