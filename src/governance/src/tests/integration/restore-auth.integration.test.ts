import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRouterTransport, createClient, Code, ConnectError, type ConnectRouter } from "@connectrpc/connect";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { SignJWT } from "jose";
import pg from "pg";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GovernanceService } from "@owomide/proto/services/governance/v1/governance_pb.js";
import { insertSnapshot } from "../../repo/snapshot-repo.js";
import { ServiceAuthenticator } from "../../context.js";
import { GovernanceServiceImpl } from "../../service.js";
import type { CatalogRestoreClient } from "../../clients/catalog.js";
import type { ObjectStore } from "../../clients/object-store.js";
import type { RbacClient } from "../../clients/rbac.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../migrations");
const sql = (filename: string) => readFileSync(resolve(migrationsDir, filename), "utf8");

const gatewaySecret = "gateway-integration-secret-that-is-at-least-32-chars";
const ORG_A = "00000000-0000-0000-0000-000000000011";

// Fails deliberately once auth passes, so a test can tell "got past the gate"
// apart from "gate rejected the call" without a real snapshot/object store.
class ThrowingCatalogClient implements CatalogRestoreClient {
  listAllSkus = (): never => {
    throw new Error("should not be reached unless gate passed");
  };
  batchGetCosts = (): never => this.listAllSkus();
  batchGetPrices = (): never => this.listAllSkus();
  listAllChannels = (): never => this.listAllSkus();
  listAllLocations = (): never => this.listAllSkus();
  listAllCustomerSegments = (): never => this.listAllSkus();
  saveChannel = (): never => this.listAllSkus();
  saveLocation = (): never => this.listAllSkus();
  saveCustomerSegment = (): never => this.listAllSkus();
  upsertCanonical = (): never => this.listAllSkus();
}

class NoOpObjectStore implements Pick<ObjectStore, "getObject" | "ready"> {
  async getObject(): Promise<Buffer> {
    throw new Error("should not be reached unless gate passed");
  }
  async ready(): Promise<boolean> {
    return true;
  }
}

class StubRbac implements RbacClient {
  async checkPermission(roles: readonly string[], permission: string): Promise<boolean> {
    return permission === "platform.restore" && roles.includes("account_owner");
  }
}

async function serviceToken(service: string, secret: string, audience: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("owomide-internal")
    .setSubject(service)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}

describe("Governance restore — auth + RBAC gate", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let pool: pg.Pool;
  let client: ReturnType<typeof createClient<typeof GovernanceService>>;
  let gatewayToken: string;
  let snapshotId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("governance_restore_auth_test")
      .start();
    superuser = new pg.Client({ connectionString: container.getConnectionUri() });
    await superuser.connect();
    await superuser.query("CREATE ROLE governance_svc LOGIN PASSWORD 'test-password' NOINHERIT");
    await superuser.query("CREATE SCHEMA IF NOT EXISTS governance");
    await superuser.query("GRANT USAGE ON SCHEMA governance TO governance_svc");
    for (const f of [
      "0001_create_schema.up.sql",
      "0002_audit_log_foundation.up.sql",
      "0003_snapshot.up.sql",
      "0004_restore_request.up.sql",
    ]) {
      await superuser.query(sql(f));
    }

    pool = new pg.Pool({
      connectionString: container
        .getConnectionUri()
        .replace("postgres:postgres@", "governance_svc:test-password@"),
      max: 2,
    });

    snapshotId = crypto.randomUUID();
    await insertSnapshot(pool, {
      id: snapshotId,
      orgId: ORG_A,
      snapshotAt: new Date().toISOString(),
      scope: "catalog",
      storageUrl: `s3://bucket/${snapshotId}.json.gz`,
      rowCounts: { skus: 0 },
      checksum: "aaa",
    });

    const authenticator = new ServiceAuthenticator("owomide-internal", { gateway_svc: gatewaySecret });
    const service = new GovernanceServiceImpl({
      pool,
      objectStore: new NoOpObjectStore() as unknown as ObjectStore,
      catalogClient: new ThrowingCatalogClient(),
      authenticator,
      rbacClient: new StubRbac(),
      logger: pino({ level: "silent" }),
    });
    const transport = createRouterTransport((router: ConnectRouter) =>
      router.service(GovernanceService, service.implementation)
    );
    client = createClient(GovernanceService, transport);
    gatewayToken = await serviceToken("gateway_svc", gatewaySecret, "governance");
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await superuser?.end();
    await container?.stop();
  }, 120_000);

  const req = () => ({
    snapshotId,
    targetTimestamp: { seconds: 0n, nanos: 0 },
    targetEnvironment: "staging",
  });

  it("rejects a call with no service credential at all (the bug this closes)", async () => {
    await expect(
      client.restore(req(), {
        headers: new Headers({ "x-org-id": ORG_A, "x-user-id": "u1", "x-user-roles": "account_owner" }),
      })
    ).rejects.toSatisfy((err: unknown) => err instanceof ConnectError && err.code === Code.Unauthenticated);
  });

  it("rejects a valid gateway caller without platform.restore", async () => {
    await expect(
      client.restore(req(), {
        headers: new Headers({
          authorization: `Bearer ${gatewayToken}`,
          "x-org-id": ORG_A,
          "x-user-id": "u1",
          "x-user-roles": "viewer",
        }),
      })
    ).rejects.toSatisfy((err: unknown) => err instanceof ConnectError && err.code === Code.PermissionDenied);
  });

  it("passes the auth + permission gate for account_owner, then fails downstream (proves the gate is not blocking a legitimate caller)", async () => {
    await expect(
      client.restore(req(), {
        headers: new Headers({
          authorization: `Bearer ${gatewayToken}`,
          "x-org-id": ORG_A,
          "x-user-id": "u1",
          "x-user-roles": "account_owner",
        }),
      })
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConnectError &&
        err.code !== Code.Unauthenticated &&
        err.code !== Code.PermissionDenied
    );
  });
});
