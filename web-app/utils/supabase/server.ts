import { headers } from 'next/headers';

interface ServerFilter {
  column: string;
  operator: 'eq';
  value: any;
}

interface ServerOrderBy {
  column: string;
  ascending: boolean;
}

class ServerDBQueryBuilder<T = any> implements PromiseLike<{ data: T; error: { message: string } | null }> {
  private table: string;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private values: any = null;
  private filters: ServerFilter[] = [];
  private orderBy: ServerOrderBy | null = null;
  private columns = '*';
  private singleRow = false;
  private executedPromise: Promise<{ data: T; error: { message: string } | null }> | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*') {
    this.columns = columns;
    return this;
  }

  insert(values: any) {
    this.action = 'insert';
    this.values = values;
    return this;
  }

  update(values: any) {
    this.action = 'update';
    this.values = values;
    return this;
  }

  delete() {
    this.action = 'delete';
    this.values = null;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  single() {
    this.singleRow = true;
    return this.execute();
  }

  then<TResult1 = { data: T; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: T; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (this.executedPromise) {
      return this.executedPromise;
    }

    this.executedPromise = (async () => {
      const headerStore = await headers();
      const host = headerStore.get('host');
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const endpoint = `${protocol}://${host}/api/db`;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: this.table,
            action: this.action,
            values: this.values,
            filters: this.filters,
            orderBy: this.orderBy,
            columns: this.columns,
            single: this.singleRow,
          }),
          cache: 'no-store',
        });

        const payload = await response.json();
        if (!response.ok) {
          return {
            data: null as T,
            error: { message: payload?.error?.message || 'Request failed.' },
          };
        }
        return {
          data: payload?.data as T,
          error: payload?.error || null,
        };
      } catch (error: any) {
        return {
          data: null as T,
          error: { message: error?.message || 'Request failed.' },
        };
      }
    })();

    return this.executedPromise;
  }
}

export async function createClient() {
  return {
    from<T = any>(table: string) {
      return new ServerDBQueryBuilder<T>(table);
    },
  };
}

