-- Stripe billing schema for Alfab app hosting/subscription tracking.
-- Run this on your AWS PostgreSQL database after order-management-schema.sql.

create extension if not exists pgcrypto;

create table if not exists billing_accounts (
  id uuid primary key default gen_random_uuid(),
  account_key text not null unique,
  company_name text not null,
  billing_email text,
  currency text not null default 'aud',
  estimated_infra_cost numeric(12,2),
  margin_percent numeric(8,2),
  target_monthly_price numeric(12,2),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  subscription_status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  latest_invoice_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  account_key text,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_billing_accounts_account_key on billing_accounts(account_key);
create index if not exists idx_billing_accounts_customer_id on billing_accounts(stripe_customer_id);
create index if not exists idx_billing_accounts_subscription_id on billing_accounts(stripe_subscription_id);
create index if not exists idx_billing_events_account_key on billing_events(account_key);
create index if not exists idx_billing_events_event_type on billing_events(event_type);

create or replace function set_billing_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_billing_accounts_updated_at on billing_accounts;
create trigger trg_billing_accounts_updated_at
before update on billing_accounts
for each row
execute function set_billing_updated_at();
