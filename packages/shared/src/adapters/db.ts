import { Pool, PoolConfig, QueryResultRow } from "pg";
import { env } from "./config";

/**
 * Postgres adapter (diagram: "Amazon RDS"). Locally each service points at its
 * own docker-compose database; on AWS the same env var points at RDS.
 *
 * Env: DATABASE_URL (e.g. postgres://smart:smart@auth-db:5432/smart_auth)
 */

export function createDbPool(overrides: PoolConfig = {}): Pool {
  const connectionString = overrides.connectionString ?? env("DATABASE_URL");
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a database pool");
  }
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    ...overrides,
  });
}

export async function query<T extends QueryResultRow>(
  pool: Pool,
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(text, params as never[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  pool: Pool,
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(pool, text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  pool: Pool,
  fn: (executor: TransactionExecutor) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const executor = {
      query: (text: string, params: unknown[] = []) =>
        client.query(text, params as never[]).then((r) => r.rows),
      queryOne: (text: string, params: unknown[] = []) =>
        client.query(text, params as never[]).then((r) => r.rows[0] ?? null),
    } as TransactionExecutor;
    const result = await fn(executor);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface TransactionExecutor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<R[]>;
  queryOne<R extends QueryResultRow>(text: string, params?: unknown[]): Promise<R | null>;
}
