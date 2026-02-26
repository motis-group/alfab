import { dbQuery } from '@utils/db';

const BILLING_ACCOUNTS_TABLE = 'billing_accounts';
const BILLING_EVENTS_TABLE = 'billing_events';

export interface BillingAccountRecord {
  id: string;
  account_key: string;
  company_name: string;
  billing_email: string | null;
  currency: string;
  estimated_infra_cost: number | null;
  margin_percent: number | null;
  target_monthly_price: number | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  subscription_status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  latest_invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function getBillingAccountByKey(accountKey: string): Promise<BillingAccountRecord | null> {
  const result = await dbQuery<BillingAccountRecord>(`select * from ${BILLING_ACCOUNTS_TABLE} where account_key = $1 limit 1`, [accountKey]);
  return result.rows[0] || null;
}

export async function getBillingAccountByCustomerId(customerId: string): Promise<BillingAccountRecord | null> {
  const result = await dbQuery<BillingAccountRecord>(`select * from ${BILLING_ACCOUNTS_TABLE} where stripe_customer_id = $1 limit 1`, [customerId]);
  return result.rows[0] || null;
}

export async function getBillingAccountBySubscriptionId(subscriptionId: string): Promise<BillingAccountRecord | null> {
  const result = await dbQuery<BillingAccountRecord>(`select * from ${BILLING_ACCOUNTS_TABLE} where stripe_subscription_id = $1 limit 1`, [subscriptionId]);
  return result.rows[0] || null;
}

export async function upsertBillingAccount(values: Partial<BillingAccountRecord> & { account_key: string; company_name: string }) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key);
  const params = entries.map(([, value]) => value);

  columns.push('updated_at');
  params.push(new Date().toISOString());

  const insertColumns = columns.join(', ');
  const placeholders = params.map((_, index) => `$${index + 1}`).join(', ');
  const updateAssignments = columns.filter((column) => column !== 'account_key').map((column) => `${column} = excluded.${column}`).join(', ');

  const sql = `
    insert into ${BILLING_ACCOUNTS_TABLE} (${insertColumns})
    values (${placeholders})
    on conflict (account_key) do update
    set ${updateAssignments}
    returning *
  `;

  const result = await dbQuery<BillingAccountRecord>(sql, params);
  return result.rows[0];
}

export async function hasProcessedStripeEvent(eventId: string): Promise<boolean> {
  const result = await dbQuery<{ id: string }>(`select id from ${BILLING_EVENTS_TABLE} where stripe_event_id = $1 limit 1`, [eventId]);
  return result.rows.length > 0;
}

export async function recordStripeEvent(event: { id: string; type: string; accountKey?: string | null; payload: unknown }) {
  await dbQuery(
    `insert into ${BILLING_EVENTS_TABLE} (stripe_event_id, event_type, account_key, payload, processed_at) values ($1, $2, $3, $4::jsonb, $5)`,
    [event.id, event.type, event.accountKey || null, JSON.stringify(event.payload), new Date().toISOString()]
  );
}
