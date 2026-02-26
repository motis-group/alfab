-- Order Management + Costing schema for PostgreSQL (AWS RDS recommended).
-- Run this against your AWS PostgreSQL database before using /doors and costing pages.

create extension if not exists pgcrypto;

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text not null default 'No Client',
  specification jsonb not null,
  cost jsonb not null,
  date timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('superadmin', 'admin', 'standard', 'readonly')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
begin
  alter table users drop constraint if exists users_role_check;
  alter table users add constraint users_role_check check (role in ('superadmin', 'admin', 'standard', 'readonly'));
exception
  when undefined_table then
    null;
end $$;

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  assumed_role text check (assumed_role in ('superadmin', 'admin', 'standard', 'readonly')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

do $$
begin
  alter table auth_sessions add column if not exists assumed_role text;
  alter table auth_sessions add column if not exists last_seen_at timestamptz;
  update auth_sessions
  set assumed_role = null
  where assumed_role is not null
    and assumed_role not in ('superadmin', 'admin', 'standard', 'readonly');
  alter table auth_sessions drop constraint if exists auth_sessions_assumed_role_check;
  alter table auth_sessions add constraint auth_sessions_assumed_role_check check (assumed_role in ('superadmin', 'admin', 'standard', 'readonly'));
exception
  when undefined_table then
    null;
end $$;

create table if not exists user_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text,
  role text not null check (role in ('admin', 'standard', 'readonly')) default 'standard',
  invited_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references product_categories(id) on delete set null,
  sku text,
  unit_price numeric(12,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists customer_products (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null default 'Unnamed Product',
  product_id uuid references products(id) on delete set null,
  customer_part_ref text,
  default_qty integer,
  notes text
);

do $$
begin
  alter table customer_products add column if not exists name text;
exception
  when undefined_table then
    null;
end $$;

-- Backfill customer product names from old columns/catalog.
update customer_products cp
set name = coalesce(nullif(trim(cp.customer_part_ref), ''), nullif(trim(p.name), ''), 'Unnamed Product')
from products p
where cp.product_id = p.id
  and (cp.name is null or trim(cp.name) = '');

update customer_products
set name = coalesce(nullif(trim(name), ''), 'Unnamed Product')
where name is null or trim(name) = '';

do $$
begin
  alter table customer_products alter column name set default 'Unnamed Product';
  alter table customer_products alter column name set not null;
exception
  when undefined_table then
    null;
end $$;

do $$
begin
  alter table customer_products drop constraint if exists customer_products_product_id_fkey;
  alter table customer_products add constraint customer_products_product_id_fkey
    foreign key (product_id) references products(id) on delete set null;
exception
  when undefined_table then
    null;
end $$;

do $$
begin
  alter table customer_products alter column product_id drop not null;
exception
  when undefined_table then
    null;
end $$;

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  po_number text not null,
  received_date date not null,
  required_date date,
  status text not null default 'open' check (status in ('open', 'in_production', 'fulfilled', 'cancelled')),
  notes text,
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_fulfilled integer not null default 0 check (quantity_fulfilled >= 0),
  unit_price_at_order numeric(12,2),
  line_notes text
);

create index if not exists idx_auth_sessions_user_id on auth_sessions(user_id);
create index if not exists idx_auth_sessions_expires_at on auth_sessions(expires_at);
create index if not exists idx_user_invites_expires_at on user_invites(expires_at);
create index if not exists idx_user_invites_invited_by on user_invites(invited_by);
create index if not exists idx_user_invites_accepted_at on user_invites(accepted_at);
create index if not exists idx_products_category_id on products(category_id);
create index if not exists idx_customer_products_customer_id on customer_products(customer_id);
create index if not exists idx_customer_products_product_id on customer_products(product_id);
create index if not exists idx_purchase_orders_customer_id on purchase_orders(customer_id);
create index if not exists idx_purchase_orders_status on purchase_orders(status);
create index if not exists idx_purchase_orders_received_date on purchase_orders(received_date);
create index if not exists idx_purchase_order_lines_purchase_order_id on purchase_order_lines(purchase_order_id);
create index if not exists idx_purchase_order_lines_product_id on purchase_order_lines(product_id);
create index if not exists idx_quotes_date on quotes(date desc);

create unique index if not exists idx_purchase_orders_customer_po_unique on purchase_orders(customer_id, po_number);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_purchase_orders_updated_at on purchase_orders;
create trigger trg_purchase_orders_updated_at
before update on purchase_orders
for each row
execute function set_updated_at();
