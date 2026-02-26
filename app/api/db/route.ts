import { NextResponse } from 'next/server';

import { getAppSession, userHasPermission } from '@utils/auth-session';
import { AppPermission } from '@utils/authz';
import { dbQuery } from '@utils/db';

export const runtime = 'nodejs';

type Operation = 'select' | 'insert' | 'update' | 'delete';

interface Filter {
  column: string;
  op: 'eq';
  value: unknown;
}

interface OrderBy {
  column: string;
  ascending?: boolean;
}

interface DbRequestPayload {
  table: string;
  action: Operation;
  columns?: string;
  filters?: Filter[];
  order?: OrderBy | null;
  values?: Record<string, unknown> | Array<Record<string, unknown>>;
  returning?: string | null;
}

const TABLE_COLUMNS: Record<string, Set<string>> = {
  quotes: new Set(['id', 'name', 'client', 'specification', 'cost', 'date']),
  customers: new Set(['id', 'name', 'contact_name', 'contact_email', 'is_active', 'created_at']),
  product_categories: new Set(['id', 'name', 'description']),
  products: new Set(['id', 'name', 'category_id', 'sku', 'unit_price', 'is_active', 'created_at']),
  customer_products: new Set(['id', 'customer_id', 'name', 'product_id', 'customer_part_ref', 'default_qty', 'notes']),
  purchase_orders: new Set(['id', 'customer_id', 'po_number', 'received_date', 'required_date', 'status', 'notes', 'created_by', 'updated_by', 'created_at', 'updated_at']),
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
};

const TABLE_PERMISSIONS: Record<string, { read: AppPermission; write: AppPermission }> = {
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
};

function getAllowedColumns(table: string): Set<string> {
  const allowed = TABLE_COLUMNS[table];
  if (!allowed) {
    throw new Error(`Table "${table}" is not allowed`);
  }
  return allowed;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function requireAllowedColumn(table: string, column: string): string {
  const allowed = getAllowedColumns(table);
  if (!allowed.has(column)) {
    throw new Error(`Column "${column}" is not allowed for table "${table}"`);
  }
  return quoteIdentifier(column);
}

function parseColumns(table: string, rawColumns?: string | null): string {
  if (!rawColumns || rawColumns.trim() === '*' || rawColumns.trim() === '') {
    return '*';
  }

  const requested = rawColumns
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);

  if (!requested.length) {
    return '*';
  }

  return requested.map((column) => requireAllowedColumn(table, column)).join(', ');
}

function toDbValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

function buildWhereClause(table: string, filters: Filter[], params: unknown[]): string {
  if (!filters.length) {
    return '';
  }

  const fragments = filters.map((filter) => {
    if (filter.op !== 'eq') {
      throw new Error(`Filter op "${filter.op}" is not supported`);
    }
    params.push(toDbValue(filter.value));
    return `${requireAllowedColumn(table, filter.column)} = $${params.length}`;
  });

  return ` where ${fragments.join(' and ')}`;
}

function normalizeRows(input: Record<string, unknown> | Array<Record<string, unknown>> | undefined): Array<Record<string, unknown>> {
  if (!input) {
    return [];
  }
  return Array.isArray(input) ? input : [input];
}

function requireWritableColumns(table: string, row: Record<string, unknown>): string[] {
  const keys = Object.keys(row).filter((key) => key !== 'id');
  if (!keys.length) {
    throw new Error(`No writable values supplied for table "${table}"`);
  }
  keys.forEach((key) => requireAllowedColumn(table, key));
  return keys;
}

function normalizeTableName(table: string): string {
  const normalized = table.trim();
  if (!normalized) {
    throw new Error('Missing table name');
  }
  getAllowedColumns(normalized);
  return normalized;
}

function requiredPermission(table: string, action: Operation): AppPermission {
  const permissionSet = TABLE_PERMISSIONS[table];
  if (!permissionSet) {
    throw new Error(`No permission mapping configured for table "${table}"`);
  }

  return action === 'select' ? permissionSet.read : permissionSet.write;
}

function applyServerAuditColumns(table: string, action: Operation, rows: Array<Record<string, unknown>>, sessionUserId: string): void {
  if (!rows.length || table !== 'purchase_orders') {
    return;
  }

  if (action === 'insert') {
    rows.forEach((row) => {
      if (!row.created_by) {
        row.created_by = sessionUserId;
      }
      row.updated_by = sessionUserId;
    });
  }

  if (action === 'update') {
    rows.forEach((row) => {
      row.updated_by = sessionUserId;
    });
  }
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: { message: 'Unauthorized' }, data: null }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as DbRequestPayload;
    const table = normalizeTableName(payload.table);
    const action = payload.action;

    const permission = requiredPermission(table, action);
    if (!userHasPermission(session, permission)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: 'Forbidden',
          },
        },
        { status: 403 }
      );
    }

    const filters = payload.filters || [];
    const params: unknown[] = [];

    const tableSql = quoteIdentifier(table);

    if (action === 'select') {
      const columnSql = parseColumns(table, payload.columns || '*');
      const whereSql = buildWhereClause(table, filters, params);
      let orderSql = '';

      if (payload.order?.column) {
        const orderColumn = requireAllowedColumn(table, payload.order.column);
        orderSql = ` order by ${orderColumn} ${payload.order.ascending === false ? 'desc' : 'asc'}`;
      }

      const sql = `select ${columnSql} from ${tableSql}${whereSql}${orderSql}`;
      const result = await dbQuery(sql, params);
      return NextResponse.json({ data: result.rows, error: null });
    }

    if (action === 'insert') {
      const rows = normalizeRows(payload.values);
      if (!rows.length) {
        throw new Error('Insert payload is empty');
      }

      applyServerAuditColumns(table, action, rows, session.userId);

      const columns = requireWritableColumns(table, rows[0]);
      const columnSql = columns.map((column) => requireAllowedColumn(table, column)).join(', ');
      const valuesSql = rows
        .map((row) => {
          const placeholders = columns.map((column) => {
            params.push(toDbValue(row[column]));
            return `$${params.length}`;
          });
          return `(${placeholders.join(', ')})`;
        })
        .join(', ');

      const returningSql = payload.returning ? ` returning ${parseColumns(table, payload.returning)}` : '';
      const sql = `insert into ${tableSql} (${columnSql}) values ${valuesSql}${returningSql}`;
      const result = await dbQuery(sql, params);
      return NextResponse.json({ data: payload.returning ? result.rows : null, error: null });
    }

    if (action === 'update') {
      const rows = normalizeRows(payload.values);
      if (rows.length !== 1) {
        throw new Error('Update expects a single object payload');
      }
      if (!filters.length) {
        throw new Error('Update requires at least one filter');
      }

      applyServerAuditColumns(table, action, rows, session.userId);

      const values = rows[0];
      const columns = requireWritableColumns(table, values);
      const setSql = columns
        .map((column) => {
          params.push(toDbValue(values[column]));
          return `${requireAllowedColumn(table, column)} = $${params.length}`;
        })
        .join(', ');

      const whereSql = buildWhereClause(table, filters, params);
      const returningSql = payload.returning ? ` returning ${parseColumns(table, payload.returning)}` : '';
      const sql = `update ${tableSql} set ${setSql}${whereSql}${returningSql}`;
      const result = await dbQuery(sql, params);
      return NextResponse.json({ data: payload.returning ? result.rows : null, error: null });
    }

    if (action === 'delete') {
      if (!filters.length) {
        throw new Error('Delete requires at least one filter');
      }

      const whereSql = buildWhereClause(table, filters, params);
      const returningSql = payload.returning ? ` returning ${parseColumns(table, payload.returning)}` : '';
      const sql = `delete from ${tableSql}${whereSql}${returningSql}`;
      const result = await dbQuery(sql, params);
      return NextResponse.json({ data: payload.returning ? result.rows : null, error: null });
    }

    return NextResponse.json({ error: { message: `Unsupported action "${action}"` }, data: null }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || 'Database request failed',
        },
      },
      { status: 500 }
    );
  }
}
