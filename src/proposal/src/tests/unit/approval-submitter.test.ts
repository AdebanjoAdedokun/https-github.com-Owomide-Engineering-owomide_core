import { expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { ProposalRepository } from "../../repo/proposal-repository.js";

it.each(["submitter", "missing"])("refuses approval for %s submission evidence before mutating state", async (evidence) => {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: "proposal" }] })
    .mockResolvedValueOnce({ rows: evidence === "missing" ? [] : [{ actor_id: "actor" }] });
  const client = { query } as unknown as PoolClient;
  await expect(new ProposalRepository().approveProposal(client, "proposal", "submitted", "actor", {}))
    .rejects.toThrow(evidence === "missing" ? "Submission evidence" : "actual submitter");
  expect(query).toHaveBeenCalledTimes(2);
});
