import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DescMessage, MessageInitShape } from "@bufbuild/protobuf";
import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type CallOptions,
  type ConnectRouter,
} from "@connectrpc/connect";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { SignJWT } from "jose";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CheckPermissionRequestSchema,
  Permission,
  RbacService,
  type CheckPermissionResponse,
} from "@owomide/proto/services/rbac/v1/rbac_pb.js";
import { ServiceAuthenticator } from "../../context.js";
import { Database } from "../../db.js";
import { RbacServiceImpl } from "../../service.js";

const gatewaySecret = "gateway-integration-secret-that-is-at-least-32-chars";
const orgA = "org-integration-a";
const orgB = "org-integration-b";

const MIGRATIONS = [
  "0001_create_schema.up.sql",
  "0002_rbac_foundation.up.sql",
  "0003_seed_system_roles.up.sql",
];

type UnaryClient<I extends DescMessage, O> = (
  request: MessageInitShape<I>,
  options?: CallOptions
) => Promise<O>;

interface RbacTestClient {
  checkPermission: UnaryClient<typeof CheckPermissionRequestSchema, CheckPermissionResponse>;
}

async function serviceToken(service: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("owomide-internal")
    .setSubject(service)
    .setAudience("rbac")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}

describe("RBAC service integration", () => {
  let container: StartedPostgreSqlContainer;
  let admin: pg.Client;
  let database: Database;
  let client: RbacTestClient;
  let gatewayToken: string;

  const headers = (roles: string, orgId = orgA) =>
    new Headers({
      authorization: `Bearer ${gatewayToken}`,
      "x-org-id": orgId,
      "x-user-id": "user-integration",
      "x-user-roles": roles,
    });

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("owomide_rbac_test")
      .start();
    admin = new pg.Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    await admin.query("CREATE ROLE rbac_svc LOGIN PASSWORD 'rbac_test'");
    await admin.query("CREATE SCHEMA rbac");
    await admin.query("GRANT USAGE ON SCHEMA rbac TO rbac_svc");
    for (const filename of MIGRATIONS) {
      await admin.query(readFileSync(resolve(process.cwd(), "migrations", filename), "utf8"));
    }

    const runtimeUrl = new URL(container.getConnectionUri());
    runtimeUrl.username = "rbac_svc";
    runtimeUrl.password = "rbac_test";
    database = new Database({
      databaseUrl: runtimeUrl.toString(),
      databasePoolSize: 10,
      databaseStatementTimeoutMs: 20_000,
    });
    const authenticator = new ServiceAuthenticator("owomide-internal", {
      gateway_svc: gatewaySecret,
    });
    const service = new RbacServiceImpl(database, authenticator);
    const transport = createRouterTransport((router: ConnectRouter) =>
      router.service(RbacService, service.implementation)
    );
    client = createClient(RbacService, transport) as unknown as RbacTestClient;
    gatewayToken = await serviceToken("gateway_svc", gatewaySecret);
  }, 120_000);

  afterAll(async () => {
    await database?.close();
    await admin?.end();
    await container?.stop();
  }, 120_000);

  it("seeds 11 global system roles and 194 grants", async () => {
    const roles = await admin.query("SELECT count(*)::int AS n FROM rbac.role WHERE org_id IS NULL");
    expect(roles.rows[0].n).toBe(11);
    const grants = await admin.query(
      `SELECT count(*)::int AS n FROM rbac.role_permission rp
       JOIN rbac.role r ON r.id = rp.role_id WHERE r.org_id IS NULL`
    );
    expect(grants.rows[0].n).toBe(194);
  });

  it("re-running the seed migration is idempotent", async () => {
    await admin.query(
      readFileSync(resolve(process.cwd(), "migrations", "0003_seed_system_roles.up.sql"), "utf8")
    );
    const roles = await admin.query("SELECT count(*)::int AS n FROM rbac.role WHERE org_id IS NULL");
    expect(roles.rows[0].n).toBe(11);
  });

  it("allows a permission the role holds", async () => {
    const res = await client.checkPermission(
      { roles: ["finance_approver"], permission: Permission.APPROVAL_APPROVE },
      { headers: headers("finance_approver") }
    );
    expect(res.allowed).toBe(true);
  });

  it("denies a permission the role does not hold", async () => {
    const res = await client.checkPermission(
      { roles: ["pricing_analyst"], permission: Permission.PROPOSAL_SUBMIT },
      { headers: headers("pricing_analyst") }
    );
    expect(res.allowed).toBe(false);
  });

  it("is additive across multiple roles", async () => {
    const res = await client.checkPermission(
      { roles: ["pricing_analyst", "pricing_manager"], permission: Permission.PROPOSAL_SUBMIT },
      { headers: headers("pricing_analyst,pricing_manager") }
    );
    expect(res.allowed).toBe(true);
  });

  it("denies when no roles are supplied", async () => {
    const res = await client.checkPermission(
      { roles: [], permission: Permission.PROPOSAL_READ },
      { headers: headers("") }
    );
    expect(res.allowed).toBe(false);
  });

  it("rejects PERMISSION_UNSPECIFIED", async () => {
    await expect(
      client.checkPermission(
        { roles: ["account_owner"], permission: Permission.UNSPECIFIED },
        { headers: headers("account_owner") }
      )
    ).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  it("rejects a permission value newer than this server knows about (forward-compat)", async () => {
    await expect(
      client.checkPermission(
        { roles: ["account_owner"], permission: 9_999 as Permission },
        { headers: headers("account_owner") }
      )
    ).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  it("rejects a caller without a valid service credential", async () => {
    await expect(
      client.checkPermission(
        { roles: ["account_owner"], permission: Permission.PROPOSAL_READ },
        {
          headers: new Headers({
            "x-org-id": orgA,
            "x-user-roles": "account_owner",
          }),
        }
      )
    ).rejects.toBeInstanceOf(ConnectError);
  });

  it("global system roles resolve identically for any org", async () => {
    const res = await client.checkPermission(
      { roles: ["auditor"], permission: Permission.AUDIT_PACK_EXPORT },
      { headers: headers("auditor", orgB) }
    );
    expect(res.allowed).toBe(true);
  });
});
