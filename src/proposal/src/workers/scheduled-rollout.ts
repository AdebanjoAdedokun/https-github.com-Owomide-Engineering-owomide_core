import { create, toBinary } from "@bufbuild/protobuf";
import type pg from "pg";
import type pino from "pino";
import {
  ApplyPriceChangesRequestSchema,
  PriceChangeSchema,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { ProposalPublishedSchema } from "@owomide/proto/events/proposal/v1_pb.js";
import { signServiceJwt } from "../context.js";
import { dateToTimestamp } from "../domain/time.js";
import type { Database } from "../db.js";
import type { ProposalRepository } from "../repo/proposal-repository.js";
import type { CatalogClient } from "../clients/catalog.js";
import type { ProposalConfig } from "../config.js";

type ScheduledRolloutRow = {
  id: string;
  org_id: string;
  proposal_id: string;
  effective_at: Date;
  status: string;
  attempts: number;
  last_attempted_at: Date | null;
};

const MAX_ATTEMPTS = 5;
const POLL_MS = 5_000;
const BATCH_SIZE = 20;
const WORKER_ACTOR = "system:rollout_worker";

export class ScheduledRolloutWorker {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly db: Database,
    private readonly repo: ProposalRepository,
    private readonly catalogClient: CatalogClient,
    private readonly opts: Pick<ProposalConfig, "catalogServiceSecret" | "serviceJwtIssuer">,
    private readonly logger: pino.Logger,
  ) {}

  start(): void {
    this.running = true;
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<void> {
    await this.processBatch();
  }

  private schedule(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.tick(), POLL_MS);
  }

  private async tick(): Promise<void> {
    try {
      await this.processBatch();
    } catch (err) {
      this.logger.error({ err }, "scheduled-rollout tick failed");
    } finally {
      this.schedule();
    }
  }

  private async processBatch(): Promise<void> {
    const client = await this.pool.connect();
    let rows: ScheduledRolloutRow[];
    try {
      const result = await client.query<ScheduledRolloutRow>(
        "SELECT * FROM proposal.claim_due_rollouts($1)",
        [BATCH_SIZE],
      );
      rows = result.rows;
    } finally {
      client.release();
    }

    for (const row of rows) {
      if (row.attempts > MAX_ATTEMPTS) {
        await this.pool.query("SELECT proposal.mark_rollout_failed($1)", [row.id]);
        this.logger.warn(
          { rolloutId: row.id, proposalId: row.proposal_id },
          "rollout permanently failed after max attempts",
        );
        continue;
      }
      await this.dispatch(row);
    }
  }

  private async dispatch(row: ScheduledRolloutRow): Promise<void> {
    try {
      // Phase 1: read proposal under org context to verify it's still approved
      const current = await this.db.withOrgTransaction(row.org_id, (c) =>
        this.repo.getProposal(c, row.proposal_id),
      );
      if (!current || current.row.state !== "approved") {
        await this.pool.query("SELECT proposal.mark_rollout_failed($1)", [row.id]);
        this.logger.warn(
          { rolloutId: row.id, proposalId: row.proposal_id, state: current?.row.state ?? "not_found" },
          "rollout skipped — proposal not found or not approved",
        );
        return;
      }

      // Phase 2: call Catalog (idempotent — idempotencyKey = proposalId)
      const effectiveAt = dateToTimestamp(row.effective_at);
      const changes = current.lines.map((line) =>
        create(PriceChangeSchema, {
          proposalLineId: line.id,
          skuId: line.sku_id,
          channelId: line.channel_id,
          newPrice: {
            amount: BigInt(line.proposed_price_minor),
            currency: line.proposed_price_currency,
          },
          effectiveAt,
        }),
      );

      const catalogHeaders = new Headers();
      catalogHeaders.set("x-org-id", row.org_id);
      if (this.opts.catalogServiceSecret) {
        const jwt = await signServiceJwt(
          "proposal_svc",
          "catalog",
          this.opts.catalogServiceSecret,
          this.opts.serviceJwtIssuer,
        );
        catalogHeaders.set("Authorization", `Bearer ${jwt}`);
      }

      await this.catalogClient.applyPriceChanges(
        create(ApplyPriceChangesRequestSchema, {
          idempotencyKey: row.proposal_id,
          proposalId: row.proposal_id,
          actorId: WORKER_ACTOR,
          changes,
        }),
        catalogHeaders,
      );

      // Phase 3: publish proposal + outbox + mark dispatched — all atomic
      const now = new Date();
      const payload = toBinary(
        ProposalPublishedSchema,
        create(ProposalPublishedSchema, {
          orgId: row.org_id,
          proposalId: row.proposal_id,
          actorId: WORKER_ACTOR,
          effectiveAt,
          createdAt: dateToTimestamp(now),
        }),
      );

      await this.db.withOrgTransaction(row.org_id, async (c) => {
        await this.repo.publishProposal(c, row.proposal_id, "approved", WORKER_ACTOR, {
          scheduledRolloutId: row.id,
        });
        await this.repo.insertOutboxEvent(c, {
          id: crypto.randomUUID(),
          orgId: row.org_id,
          eventType: "proposal.published",
          aggregateId: row.proposal_id,
          partitionKey: row.proposal_id,
          payload,
        });
        await c.query(
          `UPDATE proposal.scheduled_rollout SET status = 'dispatched' WHERE id = $1`,
          [row.id],
        );
      });

      this.logger.info({ rolloutId: row.id, proposalId: row.proposal_id }, "rollout dispatched");
    } catch (err) {
      this.logger.error({ err, rolloutId: row.id }, "rollout dispatch failed (will retry)");
    }
  }
}
