import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Database } from "../../db.js";
import { ProposalRepository } from "../../repo/proposal-repository.js";
import { ProposalState } from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { create } from "@bufbuild/protobuf";
import {
  CreateProposalRequestSchema,
  UpdateDraftRequestSchema,
  ListProposalsRequestSchema,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { MoneySchema } from "@owomide/proto/common/v1/common_pb.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../../migrations");

function sql(filename: string): string {
  return readFileSync(resolve(migrationsDir, filename), "utf8");
}

async function applyMigrations(client: pg.Client): Promise<void> {
  await client.query("CREATE SCHEMA IF NOT EXISTS proposal");
  await client.query("GRANT USAGE ON SCHEMA proposal TO proposal_svc");
  await client.query(sql("0001_create_schema.up.sql"));
  await client.query(sql("0002_proposal_foundation.up.sql"));
}

describe("Proposal CRUD", () => {
  let container: StartedPostgreSqlContainer;
  let superuser: pg.Client;
  let db: Database;
  let repo: ProposalRepository;

  const ORG_A = "00000000-0000-0000-0000-000000000001";
  const ORG_B = "00000000-0000-0000-0000-000000000002";
  const USER_1 = "00000000-0000-0000-0000-000000000011";
  const USER_2 = "00000000-0000-0000-0000-000000000012";

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("proposal_test")
      .withUsername("postgres")
      .withPassword("postgres")
      .start();

    superuser = new pg.Client({ connectionString: container.getConnectionUri() });
    await superuser.connect();

    await superuser.query(
      "CREATE ROLE proposal_svc LOGIN PASSWORD 'test-password' NOINHERIT"
    );
    await applyMigrations(superuser);

    db = new Database({
      databaseUrl: container
        .getConnectionUri()
        .replace("postgres:postgres@", "proposal_svc:test-password@"),
      databasePoolSize: 5,
      databaseStatementTimeoutMs: 15_000,
    });
    repo = new ProposalRepository();
  }, 120_000);

  afterAll(async () => {
    await db.close();
    await superuser.end();
    await container.stop();
  });

  it("createProposal inserts a draft with lines and a transition log entry", async () => {
    const req = create(CreateProposalRequestSchema, {
      title: "Q3 Price Increase",
      lines: [
        {
          skuId: "00000000-0000-0000-0000-000000000101",
          channelId: "00000000-0000-0000-0000-000000000201",
          currentPrice: create(MoneySchema, { amount: 10_00n, currency: "NGN" }),
          proposedPrice: create(MoneySchema, { amount: 11_00n, currency: "NGN" }),
          reason: "Cost increase",
        },
      ],
    });

    const result = await db.withOrgTransaction(ORG_A, (client) =>
      repo.createProposal(client, ORG_A, USER_1, req)
    );

    expect(result.row.state).toBe("draft");
    expect(result.row.actor_id).toBe(USER_1);
    expect(result.row.title).toBe("Q3 Price Increase");
    expect(result.row.org_id).toBe(ORG_A);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.sku_id).toBe("00000000-0000-0000-0000-000000000101");

    const { rows: transitions } = await superuser.query(
      `SELECT * FROM proposal.proposal_transition WHERE proposal_id = $1`,
      [result.row.id]
    );
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.from_state).toBeNull();
    expect(transitions[0]!.to_state).toBe("draft");
  });

  it("getProposal returns the created proposal with lines", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Get Test" });
    const created = await db.withOrgTransaction(ORG_A, (client) =>
      repo.createProposal(client, ORG_A, USER_1, req)
    );

    const found = await db.withOrgTransaction(ORG_A, (client) =>
      repo.getProposal(client, created.row.id)
    );

    expect(found).not.toBeNull();
    expect(found!.row.id).toBe(created.row.id);
    expect(found!.row.title).toBe("Get Test");
    expect(found!.lines).toHaveLength(0);
  });

  it("getProposal returns null for non-existent id", async () => {
    const result = await db.withOrgTransaction(ORG_A, (client) =>
      repo.getProposal(client, "00000000-0000-0000-0000-000000009999")
    );
    expect(result).toBeNull();
  });

  it("getProposal returns null when org does not match (RLS isolation)", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Org A Only" });
    const created = await db.withOrgTransaction(ORG_A, (client) =>
      repo.createProposal(client, ORG_A, USER_1, req)
    );

    const fromOrgB = await db.withOrgTransaction(ORG_B, (client) =>
      repo.getProposal(client, created.row.id)
    );
    expect(fromOrgB).toBeNull();
  });

  it("updateDraft replaces title and lines", async () => {
    const req = create(CreateProposalRequestSchema, {
      title: "Original Title",
      lines: [
        {
          skuId: "00000000-0000-0000-0000-000000000101",
          channelId: "00000000-0000-0000-0000-000000000201",
          currentPrice: create(MoneySchema, { amount: 10_00n, currency: "NGN" }),
          proposedPrice: create(MoneySchema, { amount: 11_00n, currency: "NGN" }),
          reason: "initial",
        },
      ],
    });
    const created = await db.withOrgTransaction(ORG_A, (client) =>
      repo.createProposal(client, ORG_A, USER_1, req)
    );

    const updateReq = create(UpdateDraftRequestSchema, {
      id: created.row.id,
      title: "Updated Title",
      lines: [],
    });
    const updated = await db.withOrgTransaction(ORG_A, (client) =>
      repo.updateDraft(client, created.row.id, updateReq)
    );

    expect(updated.row.title).toBe("Updated Title");
    expect(updated.lines).toHaveLength(0);
  });

  it("updateDraft rejects proposals not in draft state", async () => {
    const req = create(CreateProposalRequestSchema, { title: "Submitted Proposal" });
    const created = await db.withOrgTransaction(ORG_A, (client) =>
      repo.createProposal(client, ORG_A, USER_1, req)
    );

    await superuser.query(
      `UPDATE proposal.proposal SET state = 'submitted' WHERE id = $1`,
      [created.row.id]
    );

    const updateReq = create(UpdateDraftRequestSchema, {
      id: created.row.id,
      title: "Should Fail",
      lines: [],
    });
    await expect(
      db.withOrgTransaction(ORG_A, (client) =>
        repo.updateDraft(client, created.row.id, updateReq)
      )
    ).rejects.toThrow(/submitted/);
  });

  it("listProposals returns all proposals for the org", async () => {
    const orgId = "00000000-0000-0000-0000-000000000003";

    const r1 = create(CreateProposalRequestSchema, { title: "List Test A" });
    const r2 = create(CreateProposalRequestSchema, { title: "List Test B" });
    await db.withOrgTransaction(orgId, (c) => repo.createProposal(c, orgId, USER_1, r1));
    await db.withOrgTransaction(orgId, (c) => repo.createProposal(c, orgId, USER_2, r2));

    const result = await db.withOrgTransaction(orgId, (client) =>
      repo.listProposals(client, create(ListProposalsRequestSchema, {}))
    );

    expect(result.totalCount).toBe(2);
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals.every((p) => p.row.org_id === orgId)).toBe(true);
  });

  it("listProposals filters by state", async () => {
    const orgId = "00000000-0000-0000-0000-000000000004";
    const r1 = create(CreateProposalRequestSchema, { title: "Draft Proposal" });
    const created = await db.withOrgTransaction(orgId, (c) =>
      repo.createProposal(c, orgId, USER_1, r1)
    );

    await superuser.query(
      `INSERT INTO proposal.proposal (org_id, state, actor_id, title)
       VALUES ($1, 'submitted', $2, 'Submitted Proposal')`,
      [orgId, USER_1]
    );

    const draftOnly = await db.withOrgTransaction(orgId, (client) =>
      repo.listProposals(
        client,
        create(ListProposalsRequestSchema, { state: ProposalState.DRAFT })
      )
    );
    expect(draftOnly.totalCount).toBe(1);
    expect(draftOnly.proposals[0]!.row.id).toBe(created.row.id);
  });

  it("listProposals filters by actorId", async () => {
    const orgId = "00000000-0000-0000-0000-000000000005";
    const r1 = create(CreateProposalRequestSchema, { title: "User 1 Proposal" });
    const r2 = create(CreateProposalRequestSchema, { title: "User 2 Proposal" });
    await db.withOrgTransaction(orgId, (c) => repo.createProposal(c, orgId, USER_1, r1));
    await db.withOrgTransaction(orgId, (c) => repo.createProposal(c, orgId, USER_2, r2));

    const user1Only = await db.withOrgTransaction(orgId, (client) =>
      repo.listProposals(
        client,
        create(ListProposalsRequestSchema, { actorId: USER_1 })
      )
    );
    expect(user1Only.totalCount).toBe(1);
    expect(user1Only.proposals[0]!.row.actor_id).toBe(USER_1);
  });

  it("listProposals paginates correctly", async () => {
    const orgId = "00000000-0000-0000-0000-000000000006";
    for (let i = 0; i < 3; i++) {
      const r = create(CreateProposalRequestSchema, { title: `Page Proposal ${i}` });
      await db.withOrgTransaction(orgId, (c) => repo.createProposal(c, orgId, USER_1, r));
    }

    const page1 = await db.withOrgTransaction(orgId, (client) =>
      repo.listProposals(
        client,
        create(ListProposalsRequestSchema, { pagination: { pageSize: 2 } })
      )
    );
    expect(page1.proposals).toHaveLength(2);
    expect(page1.totalCount).toBe(3);
    expect(page1.nextPageToken).not.toBe("");

    const page2 = await db.withOrgTransaction(orgId, (client) =>
      repo.listProposals(
        client,
        create(ListProposalsRequestSchema, {
          pagination: { pageSize: 2, pageToken: page1.nextPageToken },
        })
      )
    );
    expect(page2.proposals).toHaveLength(1);
    expect(page2.nextPageToken).toBe("");
  });
});
