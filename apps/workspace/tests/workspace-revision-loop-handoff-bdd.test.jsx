import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ProposalHandoff } from "../src/RoleWorkspace.jsx";
import { createFixtureWorkspaceRepositories, FIXTURE_ACTOR_IDS as ACTOR } from "../src/data/index.js";
import { RepositoryError, createDomainErrorEnvelope } from "../src/data/domainError.js";

async function returnedDraft() {
  const repositories = createFixtureWorkspaceRepositories();
  const original = await repositories.proposals.getDetail();
  const override = await repositories.proposals.requestOverride({ proposalRef: original.ref, idempotencyKey: "revision-ui-override" });
  await repositories.identity.selectDesignEvidenceActor(ACTOR.chika);
  const ready = (await repositories.proposals.decideOverride({ overrideRef: override.data.override.ref, decision: "approve", idempotencyKey: "revision-ui-override-approve" })).data.proposal;
  await repositories.identity.selectDesignEvidenceActor(ACTOR.teni);
  const submitted = (await repositories.proposals.submit({ proposalRef: ready.ref, idempotencyKey: "revision-ui-submit" })).data;
  await repositories.identity.selectDesignEvidenceActor(ACTOR.chika);
  await repositories.proposals.decide({ proposalRef: submitted.ref, decision: "reject", reason: "Revise the prepared pricing adjustment before a fresh review.", idempotencyKey: "revision-ui-return" });
  await repositories.identity.selectDesignEvidenceActor(ACTOR.teni);
  return { repositories, proposal: await repositories.proposals.getDetail() };
}

it("Given a returned draft, the pricing revision action hands off exact lineage and resuming preserves its current working copy", async () => {
  const { repositories, proposal } = await returnedDraft();
  const callback = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(<ProposalHandoff proposal={proposal} proposals={repositories.proposals} onRevisionStarted={callback} />);
  expect(screen.getByRole("heading", { name: "Returned for changes" })).toBeVisible();
  expect(screen.getByText("Revise the prepared pricing adjustment before a fresh review.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Revise pricing evidence" }));
  await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
  const first = callback.mock.calls[0][0];
  expect(first.data.sourceProposalRef).toEqual(proposal.ref);
  expect(first.data.returnDecision.reviewedProposalRef).toEqual(proposal.returnDecision.reviewedProposalRef);
  expect((await repositories.proposals.getDetail()).sourcePreviewRef).toEqual(proposal.sourcePreviewRef);
  rerender(<ProposalHandoff proposal={await repositories.proposals.getDetail()} proposals={repositories.proposals} onRevisionStarted={callback} />);
  await user.click(screen.getByRole("button", { name: "Continue pricing revision" }));
  await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
  expect(callback.mock.calls[1][0].data.ruleRef).toEqual(first.data.ruleRef);
});

it("Given a failed revision handoff, the decision remains visible and retry uses the same safe mutation key", async () => {
  const { repositories, proposal } = await returnedDraft();
  const callback = vi.fn();
  const realStart = repositories.proposals.startRevision.bind(repositories.proposals);
  const start = vi.spyOn(repositories.proposals, "startRevision")
    .mockRejectedValueOnce(new RepositoryError(createDomainErrorEnvelope({ code: "PROPOSAL_STALE_VERSION", message: "This Proposal changed. Reopen its current version before revising.", traceId: "revision-ui-stale" })))
    .mockImplementation(realStart);
  const user = userEvent.setup();
  render(<ProposalHandoff proposal={proposal} proposals={repositories.proposals} onRevisionStarted={callback} />);
  await user.click(screen.getByRole("button", { name: "Revise pricing evidence" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Reopen its current version");
  expect(callback).not.toHaveBeenCalled();
  expect(screen.getByText(proposal.returnDecision.reason)).toBeVisible();
  expect((await repositories.proposals.getDetail()).ref).toEqual(proposal.ref);
  await user.click(screen.getByRole("button", { name: "Revise pricing evidence" }));
  await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
  expect(start.mock.calls[1][0].idempotencyKey).toBe(start.mock.calls[0][0].idempotencyKey);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("Given a non-owner reviewer, revision is unavailable and no working copy is created", async () => {
  const { repositories } = await returnedDraft();
  await repositories.identity.selectDesignEvidenceActor(ACTOR.chika);
  const proposal = await repositories.proposals.getDetail();
  const start = vi.spyOn(repositories.proposals, "startRevision");
  render(<ProposalHandoff proposal={proposal} proposals={repositories.proposals} onRevisionStarted={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Revise pricing evidence" })).toBeDisabled();
  expect(start).not.toHaveBeenCalled();
  expect((await repositories.proposals.getDetail()).pricingRevision).toBeUndefined();
});
