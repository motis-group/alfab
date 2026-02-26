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
  role text not null check (role in ('admin', 'standard', 'readonly')),
  is_active boolean not null default true,
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
  product_id uuid not null references products(id) on delete cascade,
  customer_part_ref text,
  default_qty integer,
  notes text
);

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
