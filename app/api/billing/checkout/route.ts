import { NextResponse } from 'next/server';

import { getAppSession, userHasPermission } from '@utils/auth-session';
import { getBillingEstimate } from '@utils/billing';
import { getBillingDefaults, getRequestOrigin, normalizeMarginPercent } from '@utils/billing-config';
import { getBillingAccountByKey, upsertBillingAccount } from '@utils/billing-db';
import { getStripeClient } from '@utils/stripe';

interface CheckoutRequestBody {
  accountKey?: string;
  companyName?: string;
  billingEmail?: string;
  marginPercent?: number | string;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!userHasPermission(session, 'billing:write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const defaults = getBillingDefaults();
    const body = ((await request.json().catch(() => ({}))) || {}) as CheckoutRequestBody;

    const accountKey = nonEmptyString(body.accountKey) || defaults.accountKey;
    const companyName = nonEmptyString(body.companyName) || defaults.companyName;
    const billingEmail = nonEmptyString(body.billingEmail) || defaults.billingEmail;

    const baselineEstimate = getBillingEstimate();
    const marginPercent = normalizeMarginPercent(body.marginPercent, baselineEstimate.assumptions.marginPercent);
    const estimate = getBillingEstimate({ marginPercent });

    const stripe = getStripeClient();
    const existingAccount = await getBillingAccountByKey(accountKey);

    let stripeCustomerId = existingAccount?.stripe_customer_id || null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: companyName,
        email: billingEmail || undefined,
        metadata: {
          account_key: accountKey,
        },
      });
      stripeCustomerId = customer.id;
    }

    const origin = getRequestOrigin(request);
    const successUrl = `${origin}/settings/billing?checkout=success`;
    const cancelUrl = `${origin}/settings/billing?checkout=cancelled`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        account_key: accountKey,
      },
      subscription_data: {
        metadata: {
          account_key: accountKey,
          company_name: companyName,
          margin_percent: String(marginPercent),
          infra_subtotal_aud: String(estimate.costs.infraSubtotalAud),
          target_monthly_aud: String(estimate.costs.targetMonthlyAud),
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'aud',
            unit_amount: estimate.costs.targetMonthlyCents,
            recurring: {
              interval: 'month',
            },
            product_data: {
              name: `${companyName} App Hosting & Support`,
              description: 'Managed app hosting, database operations, monitoring, and maintenance.',
            },
          },
        },
      ],
    });

    await upsertBillingAccount({
      account_key: accountKey,
      company_name: companyName,
      billing_email: billingEmail,
      currency: 'aud',
      estimated_infra_cost: estimate.costs.infraSubtotalAud,
      margin_percent: marginPercent,
      target_monthly_price: estimate.costs.targetMonthlyAud,
      stripe_customer_id: stripeCustomerId,
      subscription_status: existingAccount?.subscription_status || 'checkout_started',
    });

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
      estimate,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Unable to start Stripe checkout',
      },
      { status: 500 }
    );
  }
}
