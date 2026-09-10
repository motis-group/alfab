/**
 * Tables the database gateway serves. A table is reachable only when it appears in both
 * TABLE_COLUMNS and TABLE_PERMISSIONS. NATURAL_KEY_TABLES and AUDITED_TABLES are subsets.
 * `utils/db-tables.test.ts` checks the registries agree.
 */

import { AppPermission } from '@utils/authz';

export const TABLE_COLUMNS: Record<string, Set<string>> = {
  quotes: new Set(['id', 'name', 'client', 'specification', 'cost', 'date']),
  customers: new Set(['id', 'name', 'contact_name', 'contact_email', 'phone', 'delivery_address', 'is_active', 'created_at']),
  product_categories: new Set(['id', 'name', 'description']),
  products: new Set(['id', 'name', 'category_id', 'sku', 'unit_price', 'is_active', 'created_at']),
  customer_products: new Set(['id', 'customer_id', 'name', 'product_id', 'customer_part_ref', 'default_qty', 'notes']),
  purchase_orders: new Set(['id', 'customer_id', 'po_number', 'received_date', 'required_date', 'status', 'notes', 'archived_at', 'created_by', 'updated_by', 'created_at', 'updated_at']),
  purchase_order_lines: new Set(['id', 'purchase_order_id', 'product_id', 'quantity_ordered', 'quantity_fulfilled', 'unit_price_at_order', 'line_notes']),
  billing_accounts: new Set([
    'id',
    'account_key',
    'company_name',
    'billing_email',
    'currency',
    'estimated_infra_cost',
    'margin_percent',
    'target_monthly_price',
    'stripe_customer_id',
    'stripe_subscription_id',
    'stripe_price_id',
    'subscription_status',
    'current_period_start',
    'current_period_end',
    'cancel_at_period_end',
    'latest_invoice_id',
    'created_at',
    'updated_at',
  ]),
  billing_events: new Set(['id', 'stripe_event_id', 'event_type', 'account_key', 'payload', 'processed_at']),
  window_costing_rates: new Set(['id', 'rates', 'updated_by', 'updated_at']),
  glass_costing_rates: new Set(['id', 'rates', 'updated_by', 'updated_at']),
  awning_costing_rates: new Set(['id', 'rates', 'updated_by', 'updated_at']),
};

export const TABLE_PERMISSIONS: Record<string, { read: AppPermission; write: AppPermission }> = {
  quotes: {
    read: 'quotes:read',
    write: 'quotes:write',
  },
  customers: {
    read: 'master_data:read',
    write: 'master_data:write',
  },
  product_categories: {
    read: 'master_data:read',
    write: 'master_data:write',
  },
  products: {
    read: 'master_data:read',
    write: 'master_data:write',
  },
  customer_products: {
    read: 'master_data:read',
    write: 'master_data:write',
  },
  purchase_orders: {
    read: 'orders:read',
    write: 'orders:write',
  },
  purchase_order_lines: {
    read: 'orders:read',
    write: 'orders:write',
  },
  billing_accounts: {
    read: 'billing:read',
    write: 'billing:write',
  },
  billing_events: {
    read: 'billing:read',
    write: 'billing:write',
  },
  window_costing_rates: {
    read: 'pricing:read',
    write: 'pricing:write',
  },
  glass_costing_rates: {
    read: 'pricing:read',
    write: 'pricing:write',
  },
  awning_costing_rates: {
    read: 'pricing:read',
    write: 'pricing:write',
  },
};

// Tables keyed by a text id the client chooses, rather than a generated uuid. Inserts into these
// may set "id"; everywhere else it stays server-generated.
export const NATURAL_KEY_TABLES = new Set(['window_costing_rates', 'glass_costing_rates', 'awning_costing_rates']);

export const AUDITED_TABLES: Record<string, { createdBy: boolean }> = {
  purchase_orders: { createdBy: true },
  window_costing_rates: { createdBy: false },
  glass_costing_rates: { createdBy: false },
  awning_costing_rates: { createdBy: false },
};
