# Billing Setup (Stripe + Cost Model)

This app now includes a Stripe-based monthly billing flow under `/settings/billing`.

## Default monthly cost model (AUD)

Defaults used by `utils/billing.ts`:

- EC2 `t3.micro` compute: `0.0132` AUD/hour
- RDS `db.t3.micro` compute: `0.028` AUD/hour
- EC2 EBS storage: `8 GB * 0.096` AUD/GB-month
- RDS storage: `20 GB * 0.138` AUD/GB-month
- Ops/misc buffer: `6` AUD/month
- Margin: `35%`
- Hours/month: `730`

With defaults, the app computes approximately:

- Infra subtotal: `39.61` AUD/month
- Margin: `13.86` AUD/month
- Target Stripe subscription: `53.47` AUD/month

## PostgreSQL schema

Run this SQL on your AWS PostgreSQL database:

- `docs/billing-schema.sql`

This creates:

- `billing_accounts` (current billing/subscription state)
- `billing_events` (Stripe webhook event log for idempotency/auditing)

## Environment variables

Required:

- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Recommended:

- `NEXT_PUBLIC_APP_URL` (or `APP_URL`)
- `BILLING_ACCOUNT_KEY` (default: `alfab`)
- `BILLING_COMPANY_NAME` (default: `Alfab Pty Ltd`)
- `BILLING_DEFAULT_EMAIL` (default: `nick@alfab.com.au`)

Optional cost overrides:

- `BILLING_MARGIN_PERCENT`
- `BILLING_MONTHLY_HOURS`
- `BILLING_EC2_HOURLY_AUD`
- `BILLING_RDS_HOURLY_AUD`
- `BILLING_EC2_STORAGE_GB`
- `BILLING_EC2_STORAGE_GB_MONTH_AUD`
- `BILLING_RDS_STORAGE_GB`
- `BILLING_RDS_STORAGE_GB_MONTH_AUD`
- `BILLING_MISC_BUFFER_AUD`

## Stripe dashboard configuration

1. Create and copy API keys:
- Secret key -> `STRIPE_SECRET_KEY`

2. Enable Billing Portal in Stripe (if not already enabled).

3. Create webhook endpoint to:
- `https://<your-domain>/api/billing/webhook`

4. Subscribe webhook to:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

5. Copy webhook signing secret -> `STRIPE_WEBHOOK_SECRET`.

## App flow

1. Open `/settings/billing`.
2. Confirm margin %.
3. Click `Start / Update Stripe Checkout`.
4. Complete checkout in Stripe.
5. Reload billing page to verify status sync.
6. Use `Open Stripe Billing Portal` for customer self-service changes.
