'use client';

type DBAction = 'select' | 'insert' | 'update' | 'delete';

interface Filter {
  column: string;
  operator: 'eq';
  value: any;
}

interface OrderBy {
  column: string;
  ascending: boolean;
}

interface DBResponse<T = any> {
  data: T;
  error: { message: string } | null;
}

class DBQueryBuilder<T = any> implements PromiseLike<DBResponse<T>> {
  private table: string;
  private action: DBAction = 'select';
  private values: any = null;
  private filters: Filter[] = [];
  private orderBy: OrderBy | null = null;
  private columns = '*';
  private singleRow = false;
  private executedPromise: Promise<DBResponse<T>> | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*'): DBQueryBuilder<T> {
    this.columns = columns;
    if (!this.action) {
      this.action = 'select';
    }
    return this;
  }

  insert(values: any): DBQueryBuilder<T> {
    this.action = 'insert';
    this.values = values;
    return this;
  }

  update(values: any): DBQueryBuilder<T> {
    this.action = 'update';
    this.values = values;
    return this;
  }

  delete(): DBQueryBuilder<T> {
    this.action = 'delete';
    this.values = null;
    return this;
  }

  eq(column: string, value: any): DBQueryBuilder<T> {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): DBQueryBuilder<T> {
    this.orderBy = {
      column,
      ascending: options?.ascending !== false,
    };
    return this;
  }

  single(): Promise<DBResponse<T>> {
    this.singleRow = true;
    return this.execute();
  }

  then<TResult1 = DBResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: DBResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): Promise<DBResponse<T> | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<DBResponse<T>> {
    return this.execute().finally(onfinally || undefined);
  }

  async execute(): Promise<DBResponse<T>> {
    if (this.executedPromise) {
      return this.executedPromise;
    }

    this.executedPromise = fetch('/api/db', {
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
    })
      .then(async (response) => {
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
      })
      .catch((error) => {
        return {
          data: null as T,
          error: { message: error?.message || 'Network error' },
        };
      });

    return this.executedPromise;
  }
}

export function createClient() {
  return {
    from<T = any>(table: string) {
      return new DBQueryBuilder<T>(table);
    },
  };
}

