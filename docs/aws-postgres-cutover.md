# AWS PostgreSQL Cutover

This app now uses direct PostgreSQL access through `DATABASE_URL` and does not require Supabase.

## 1. Provision PostgreSQL in AWS

- Use Amazon RDS PostgreSQL in the same VPC as the EC2 app.
- Allow inbound Postgres (`5432`) from the EC2 instance security group.
- Keep public access disabled where possible.

## 2. Set application environment on EC2

Set at least:

- `DATABASE_URL=postgres://<user>:<password>@<rds-endpoint>:5432/<database>`
- `DATABASE_SSL=true`
- `DATABASE_SSL_REJECT_UNAUTHORIZED=false` (set to `true` if you manage CA trust explicitly)
- `STRIPE_SECRET_KEY=<stripe-secret>`
- `STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret>`
- `ADMIN_PASSWORD=<app-login-password>`

## 3. Apply schema to AWS PostgreSQL

From the app root:

```bash
export DATABASE_URL='postgres://<user>:<password>@<rds-endpoint>:5432/<database>'
./scripts/apply-aws-postgres-schema.sh
```

This applies:

- `docs/order-management-schema.sql`
- `docs/billing-schema.sql`

## 4. Deploy app to EC2

Deploy your normal release artifact so EC2 runs this code version.

## 5. Verify in production

- Login works (`/login`).
- Costing page can create/update/delete quotes.
- Order management CRUD works.
- Billing page (`/settings/billing`) loads status/estimate.
- Stripe webhook endpoint responds: `/api/billing/webhook`.
