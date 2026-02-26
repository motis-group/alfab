import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, query } from '@utils/postgres';

type DBAction = 'select' | 'insert' | 'update' | 'delete';

interface Filter {
  column: string;
  operator?: 'eq';
  value: any;
}

interface OrderBy {
  column: string;
  ascending?: boolean;
}

interface DBRequest {
  table: string;
  action: DBAction;
  values?: Record<string, any> | Array<Record<string, any>>;
  filters?: Filter[];
  orderBy?: OrderBy | null;
  columns?: string;
  single?: boolean;
}

const TABLE_COLUMNS: Record<string, string[]> = {
  quotes: ['id', 'name', 'client', 'specification', 'cost', 'date'],
  doors: ['id', 'price', 'order_date', 'delivery_date', 'client', 'notes'],
  customers: ['id', 'name', 'contact_name', 'contact_email', 'is_active', 'created_at'],
  product_categories: ['id', 'name', 'description'],
  products: ['id', 'name', 'category_id', 'sku', 'unit_price', 'is_active', 'created_at'],
  customer_products: ['id', 'customer_id', 'product_id', 'customer_part_ref', 'default_qty', 'notes'],
  purchase_orders: ['id', 'customer_id', 'po_number', 'received_date', 'required_date', 'status', 'notes', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  purchase_order_lines: ['id', 'purchase_order_id', 'product_id', 'quantity_ordered', 'quantity_fulfilled', 'unit_price_at_order', 'line_notes'],
};

function assertTable(table: string): string[] {
  const columns = TABLE_COLUMNS[table];
  if (!columns) {
    throw new Error(`Table not allowed: ${table}`);
  }
  return columns;
}

function isValidIdentifier(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

function quoteIdent(identifier: string): string {
  if (!isValidIdentifier(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function assertColumn(tableColumns: string[], column: string): void {
  if (!tableColumns.includes(column)) {
    throw new Error(`Column not allowed: ${column}`);
  }
}

function parseColumns(requestedColumns: string | undefined, tableColumns: string[]): string {
  if (!requestedColumns || requestedColumns.trim() === '*' || requestedColumns.trim() === '') {
    return '*';
  }

  const split = requestedColumns
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!split.length) {
    return '*';
  }

  split.forEach((column) => assertColumn(tableColumns, column));
  return split.map(quoteIdent).join(', ');
}

function parseFilters(filters: Filter[] | undefined, tableColumns: string[], startingIndex = 1): { clause: string; values: any[]; nextIndex: number } {
  if (!filters || !filters.length) {
    return { clause: '', values: [], nextIndex: startingIndex };
  }

  const values: any[] = [];
  const conditions: string[] = [];
  let index = startingIndex;

  filters.forEach((filter) => {
    if ((filter.operator || 'eq') !== 'eq') {
      throw new Error('Only eq filter operator is supported.');
    }
    assertColumn(tableColumns, filter.column);
    conditions.push(`${quoteIdent(filter.column)} = $${index}`);
    values.push(filter.value);
    index += 1;
  });

  return {
    clause: ` WHERE ${conditions.join(' AND ')}`,
    values,
    nextIndex: index,
  };
}

function parseOrderBy(orderBy: OrderBy | null | undefined, tableColumns: string[]): string {
  if (!orderBy || !orderBy.column) {
    return '';
  }
  assertColumn(tableColumns, orderBy.column);
  const direction = orderBy.ascending === false ? 'DESC' : 'ASC';
  return ` ORDER BY ${quoteIdent(orderBy.column)} ${direction}`;
}

async function runSelect(payload: DBRequest, tableColumns: string[]): Promise<any[]> {
  const selectedColumns = parseColumns(payload.columns, tableColumns);
  const where = parseFilters(payload.filters, tableColumns);
  const orderBy = parseOrderBy(payload.orderBy, tableColumns);
  const limit = payload.single ? ' LIMIT 1' : '';
  const sql = `SELECT ${selectedColumns} FROM ${quoteIdent(payload.table)}${where.clause}${orderBy}${limit}`;
  const result = await query(sql, where.values);
  return result.rows;
}

async function runInsert(payload: DBRequest, tableColumns: string[]): Promise<any[]> {
  const incoming = Array.isArray(payload.values) ? payload.values : payload.values ? [payload.values] : [];
  if (!incoming.length) {
    throw new Error('Insert requires values.');
  }

  return withTransaction(async (client) => {
    const insertedRows: any[] = [];
    for (const row of incoming) {
      const keys = Object.keys(row || {});
      if (!keys.length) {
        throw new Error('Insert row cannot be empty.');
      }
      keys.forEach((key) => assertColumn(tableColumns, key));
      const columnsSql = keys.map(quoteIdent).join(', ');
      const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
      const values = keys.map((key) => (row as any)[key]);
      const sql = `INSERT INTO ${quoteIdent(payload.table)} (${columnsSql}) VALUES (${placeholders}) RETURNING *`;
      const result = await client.query(sql, values);
      insertedRows.push(...result.rows);
    }
    return insertedRows;
  });
}

async function runUpdate(payload: DBRequest, tableColumns: string[]): Promise<any[]> {
  const valuesObject = (payload.values || {}) as Record<string, any>;
  const keys = Object.keys(valuesObject);
  if (!keys.length) {
    throw new Error('Update requires values.');
  }
  keys.forEach((key) => assertColumn(tableColumns, key));

  if (!payload.filters || !payload.filters.length) {
    throw new Error('Update requires filters.');
  }

  const setSql = keys.map((key, index) => `${quoteIdent(key)} = $${index + 1}`).join(', ');
  const setValues = keys.map((key) => valuesObject[key]);
  const where = parseFilters(payload.filters, tableColumns, setValues.length + 1);

  const sql = `UPDATE ${quoteIdent(payload.table)} SET ${setSql}${where.clause} RETURNING *`;
  const result = await query(sql, [...setValues, ...where.values]);
  return result.rows;
}

async function runDelete(payload: DBRequest, tableColumns: string[]): Promise<any[]> {
  if (!payload.filters || !payload.filters.length) {
    throw new Error('Delete requires filters.');
  }
  const where = parseFilters(payload.filters, tableColumns);
  const sql = `DELETE FROM ${quoteIdent(payload.table)}${where.clause} RETURNING *`;
  const result = await query(sql, where.values);
  return result.rows;
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as DBRequest;
    if (!payload || !payload.table || !payload.action) {
      return NextResponse.json({ data: null, error: { message: 'Invalid request payload.' } }, { status: 200 });
    }

    const tableColumns = assertTable(payload.table);

    let rows: any[] = [];
    switch (payload.action) {
      case 'select':
        rows = await runSelect(payload, tableColumns);
        break;
      case 'insert':
        rows = await runInsert(payload, tableColumns);
        break;
      case 'update':
        rows = await runUpdate(payload, tableColumns);
        break;
      case 'delete':
        rows = await runDelete(payload, tableColumns);
        break;
      default:
        return NextResponse.json({ data: null, error: { message: 'Unsupported action.' } }, { status: 200 });
    }

    const data = payload.single ? (rows.length ? rows[0] : null) : rows;
    return NextResponse.json({ data, error: null }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ data: null, error: { message: error?.message || 'Database request failed.' } }, { status: 200 });
  }
}

