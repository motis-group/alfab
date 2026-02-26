type DbAction = 'select' | 'insert' | 'update' | 'delete';

interface DbFilter {
  column: string;
  op: 'eq';
  value: unknown;
}

interface DbOrderBy {
  column: string;
  ascending?: boolean;
}

interface DbPayload {
  table: string;
  action: DbAction;
  columns?: string;
  filters?: DbFilter[];
  order?: DbOrderBy | null;
  values?: Record<string, unknown> | Array<Record<string, unknown>>;
  returning?: string | null;
}

interface DbErrorShape {
  message: string;
}

interface DbApiResponse<TData> {
  data: TData | null;
  error: DbErrorShape | null;
}

class DbQueryBuilder<TData = any> implements PromiseLike<DbApiResponse<TData>> {
  private readonly table: string;

  private action: DbAction | null = null;

  private selectedColumns = '*';

  private filters: DbFilter[] = [];

  private orderBy: DbOrderBy | null = null;

  private values: Record<string, unknown> | Array<Record<string, unknown>> | undefined;

  private returningColumns: string | null = null;

  private expectMode: 'many' | 'single' | 'maybeSingle' = 'many';

  private executionPromise: Promise<DbApiResponse<TData>> | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*') {
    if (this.action && this.action !== 'select') {
      this.returningColumns = columns;
      return this as any;
    }

    this.action = 'select';
    this.selectedColumns = columns;
    return this as any;
  }

  insert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.action = 'insert';
    this.values = values;
    return this as any;
  }

  update(values: Record<string, unknown>) {
    this.action = 'update';
    this.values = values;
    return this as any;
  }

  delete() {
    this.action = 'delete';
    return this as any;
  }

  eq(column: string, value: unknown) {
    this.filters.push({
      column,
      op: 'eq',
      value,
    });
    return this as any;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = {
      column,
      ascending: options?.ascending !== false,
    };
    return this as any;
  }

  single() {
    this.expectMode = 'single';
    return this as any;
  }

  maybeSingle() {
    this.expectMode = 'maybeSingle';
    return this as any;
  }

  then<TResult1 = DbApiResponse<TData>, TResult2 = never>(
    onfulfilled?: ((value: DbApiResponse<TData>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): Promise<DbApiResponse<TData> | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<DbApiResponse<TData>> {
    return this.execute().finally(onfinally || undefined);
  }

  private async execute(): Promise<DbApiResponse<TData>> {
    if (this.executionPromise) {
      return this.executionPromise;
    }

    this.executionPromise = this.executeInternal();
    return this.executionPromise;
  }

  private async executeInternal(): Promise<DbApiResponse<TData>> {
    const action = this.action || 'select';
    const payload: DbPayload = {
      table: this.table,
      action,
      columns: action === 'select' ? this.selectedColumns : undefined,
      filters: this.filters,
      order: this.orderBy,
      values: this.values,
      returning: action !== 'select' ? this.returningColumns : null,
    };

    try {
      const response = await fetch('/api/db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const parsed = (await response.json().catch(() => null)) as DbApiResponse<any> | null;
      if (!response.ok) {
        return {
          data: null,
          error: {
            message: parsed?.error?.message || `DB request failed with status ${response.status}`,
          },
        };
      }

      if (!parsed) {
        return {
          data: null,
          error: {
            message: 'DB request returned an empty response',
          },
        };
      }

      if (parsed.error) {
        return {
          data: null,
          error: parsed.error,
        };
      }

      let nextData: any = parsed.data;

      if (this.expectMode === 'single') {
        if (!Array.isArray(nextData) || nextData.length !== 1) {
          return {
            data: null,
            error: {
              message: 'Expected a single row but received a different result size',
            },
          };
        }
        nextData = nextData[0];
      } else if (this.expectMode === 'maybeSingle') {
        if (!Array.isArray(nextData)) {
          nextData = nextData || null;
        } else {
          if (nextData.length > 1) {
            return {
              data: null,
              error: {
                message: 'Expected at most one row but received multiple rows',
              },
            };
          }
          nextData = nextData[0] || null;
        }
      }

      return {
        data: nextData as TData,
        error: null,
      };
    } catch (error: any) {
      return {
        data: null,
        error: {
          message: error?.message || 'DB request failed',
        },
      };
    }
  }
}

export function createClient() {
  return {
    from(table: string) {
      return new DbQueryBuilder(table);
    },
  };
}
