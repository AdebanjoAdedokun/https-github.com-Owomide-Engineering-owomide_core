import pg from "pg";

export class Database {
  readonly pool: pg.Pool;

  constructor(connectionString: string, poolSize = 10) {
    this.pool = new pg.Pool({ connectionString, max: poolSize });
  }

  /** Runs `work` in one transaction with the tenant set, so forced RLS scopes every statement. */
  async withOrgTransaction<T>(
    orgId: string,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
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
