import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getBillingDefaults } from '@utils/billing-config';
import { getBillingAccountByCustomerId, getBillingAccountByKey, getBillingAccountBySubscriptionId, hasProcessedStripeEvent, recordStripeEvent, upsertBillingAccount } from '@utils/billing-db';
import { getStripeClient } from '@utils/stripe';

export const runtime = 'nodejs';

function unixToIso(value: number | null | undefined): string | null {
  if (!value || !Number.isFinite(value)) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function stringFromExpandable(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return (value as any).id || null;
}

async function upsertFromSubscription(params: {
  accountKey?: string | null;
  subscription: Stripe.Subscription;
  billingEmail?: string | null;
  companyName?: string | null;
}) {
  const defaults = getBillingDefaults();
  const customerId = stringFromExpandable(params.subscription.customer as any);
  const subscriptionId = params.subscription.id;
  const latestInvoiceId = stringFromExpandable(params.subscription.latest_invoice as any);
  const firstItem = params.subscription.items.data[0];
  const priceId = firstItem?.price?.id || null;

  let existing = params.accountKey ? await getBillingAccountByKey(params.accountKey) : null;
  if (!existing && customerId) {
    existing = await getBillingAccountByCustomerId(customerId);
  }
  if (!existing && subscriptionId) {
    existing = await getBillingAccountBySubscriptionId(subscriptionId);
  }

  const accountKey = params.accountKey || existing?.account_key || defaults.accountKey;
  const companyName = params.companyName || existing?.company_name || defaults.companyName;
  const billingEmail = params.billingEmail || existing?.billing_email || defaults.billingEmail;

  await upsertBillingAccount({
    account_key: accountKey,
    company_name: companyName,
    billing_email: billingEmail,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_price_id: priceId,
    subscription_status: params.subscription.status,
    current_period_start: unixToIso(params.subscription.current_period_start),
    current_period_end: unixToIso(params.subscription.current_period_end),
    cancel_at_period_end: params.subscription.cancel_at_period_end,
    latest_invoice_id: latestInvoiceId,
  });

  return accountKey;
}

async function upsertFromCheckoutSession(session: Stripe.Checkout.Session) {
  const defaults = getBillingDefaults();
  const accountKey = session.metadata?.account_key || defaults.accountKey;
  const customerId = stringFromExpandable(session.customer as any);
  const subscriptionId = stringFromExpandable(session.subscription as any);
  const companyName = session.customer_details?.name || defaults.companyName;
  const billingEmail = session.customer_details?.email || defaults.billingEmail;

  if (!subscriptionId) {
    await upsertBillingAccount({
      account_key: accountKey,
      company_name: companyName,
      billing_email: billingEmail,
      stripe_customer_id: customerId,
      subscription_status: 'checkout_completed',
    });

    return accountKey;
  }

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return upsertFromSubscription({
    accountKey,
    subscription,
    billingEmail,
    companyName,
  });
}

async function upsertFromInvoice(invoice: Stripe.Invoice) {
  const defaults = getBillingDefaults();
  const customerId = stringFromExpandable(invoice.customer as any);
  const subscriptionId = stringFromExpandable(invoice.subscription as any);

  let existing = customerId ? await getBillingAccountByCustomerId(customerId) : null;
  if (!existing && subscriptionId) {
    existing = await getBillingAccountBySubscriptionId(subscriptionId);
  }

  const accountKey = existing?.account_key || defaults.accountKey;
  const companyName = existing?.company_name || defaults.companyName;

  await upsertBillingAccount({
    account_key: accountKey,
    company_name: companyName,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    latest_invoice_id: invoice.id,
    subscription_status: invoice.paid ? existing?.subscription_status || 'active' : 'past_due',
  });

  return accountKey;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Missing STRIPE_WEBHOOK_SECRET' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const stripe = getStripeClient();
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Webhook signature verification failed: ${error?.message || 'unknown error'}`,
      },
      { status: 400 }
    );
  }

  try {
    const duplicate = await hasProcessedStripeEvent(event.id);
    if (duplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    let accountKey: string | null = null;

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        accountKey = await upsertFromCheckoutSession(session);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        accountKey = await upsertFromSubscription({
          accountKey: subscription.metadata?.account_key || null,
          subscription,
        });
        break;
      }
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        accountKey = await upsertFromInvoice(invoice);
        break;
      }
      default: {
        accountKey = (event.data.object as any)?.metadata?.account_key || null;
      }
    }

    await recordStripeEvent({
      id: event.id,
      type: event.type,
      accountKey,
      payload: event,
    });

    return NextResponse.json({ received: true });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Webhook processing failed',
      },
      { status: 500 }
    );
  }
}
