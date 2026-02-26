import { NextResponse } from 'next/server';

import { hasAppSession } from '@utils/auth-session';
import { getBillingDefaults, getRequestOrigin } from '@utils/billing-config';
import { getBillingAccountByKey } from '@utils/billing-db';
import { getStripeClient } from '@utils/stripe';

interface PortalRequestBody {
  accountKey?: string;
}

export async function POST(request: Request) {
  const isSignedIn = await hasAppSession();
  if (!isSignedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const defaults = getBillingDefaults();
    const body = ((await request.json().catch(() => ({}))) || {}) as PortalRequestBody;
    const accountKey = typeof body.accountKey === 'string' && body.accountKey.trim().length ? body.accountKey.trim() : defaults.accountKey;

    const account = await getBillingAccountByKey(accountKey);
    if (!account?.stripe_customer_id) {
      return NextResponse.json(
        {
          error: 'No Stripe customer found. Start checkout first.',
        },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const origin = getRequestOrigin(request);
    const portal = await stripe.billingPortal.sessions.create({
      customer: account.stripe_customer_id,
      return_url: `${origin}/settings/billing`,
    });

    return NextResponse.json({
      portalUrl: portal.url,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Unable to open Stripe billing portal',
      },
      { status: 500 }
    );
  }
}
