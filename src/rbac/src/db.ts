import pg, { type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import type { RbacConfig } from "./config.js";

export type DbClient = Pick<PoolClient, "query">;

export class Database {
  readonly pool: pg.Pool;

  constructor(
    config: Pick<RbacConfig, "databaseUrl" | "databasePoolSize" | "databaseStatementTimeoutMs">
  ) {
    this.pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolSize,
      statement_timeout: config.databaseStatementTimeoutMs,
      query_timeout: config.databaseStatementTimeoutMs,
      idle_in_transaction_session_timeout: config.databaseStatementTimeoutMs,
      application_name: "owomide-rbac",
    });
  }

  async withOrgTransaction<T>(orgId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!orgId.trim()) throw new Error("org_id is required");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, [...values]);
  }

  async ready(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
