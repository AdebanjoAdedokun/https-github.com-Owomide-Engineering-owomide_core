import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApp } from "../src/WorkspaceApp.jsx";
import { createFixtureWorkspaceRepositories, FIXTURE_ACTOR_IDS } from "../src/data/index.js";
import { workspaceHash } from "../src/workspaceRouting.js";

beforeEach(() => window.sessionStorage.clear());

async function viewerProposal(view = "overview") {
  const repositories = createFixtureWorkspaceRepositories();
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.viewer);
  const proposal = await repositories.proposals.getDetail();
  const comments = vi.spyOn(repositories.proposals, "listComments");
  const margin = vi.spyOn(repositories.proposals, "getMarginEvidence");
  window.history.replaceState(null, "", workspaceHash({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view }));
  render(<WorkspaceApp repositories={repositories} />);
  await screen.findByRole("heading", { name: proposal.title });
  return { repositories, comments, margin, user: userEvent.setup() };
}

it("Given a Viewer with redacted economics, when a Proposal opens, then selling prices remain useful without empty margin or policy presentation", async () => {
  await viewerProposal();
  const nextStep = await screen.findByRole("region", { name: "Proposal next step" });
  expect(within(nextStep).getByRole("heading", { name: "Read-only proposal" })).toBeVisible();
  expect(nextStep).toHaveTextContent("You can inspect prices and progress. Costs and internal discussion are restricted.");
  expect(screen.queryByRole("button", { name: /Request exception review|Submit for independent review|Review current version|Review publication|Review source issues/ })).not.toBeInTheDocument();
  const price = screen.getByRole("region", { name: "Price change for Cassava flour" });
  expect(price).toHaveTextContent("₦1,612.50");
  expect(price).toHaveTextContent("₦1,668.94");
  expect(screen.queryByText("₦1,515.50")).not.toBeInTheDocument();
  expect(screen.queryByText(/Unavailable margin|No applied margin policy/)).not.toBeInTheDocument();
  expect(screen.queryByText("Applied floor")).not.toBeInTheDocument();
  expect(screen.queryByText("14.00%")).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: /^Margin/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: /^Comments/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Draft submission handoff" })).not.toBeInTheDocument();
});

it.each(["comments", "margin"])("Given a Viewer follows a protected %s deep link, then the readable overview is shown without fetching that evidence", async (view) => {
  const { comments, margin, user } = await viewerProposal(view);
  const tabs = screen.getByRole("tablist", { name: "Proposal views" });
  expect(within(tabs).getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  expect(comments).not.toHaveBeenCalled();
  expect(margin).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "Proposal comments" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Retained margin evidence" })).not.toBeInTheDocument();
  within(tabs).getByRole("tab", { name: "Overview" }).focus();
  await user.keyboard("{End}");
  expect(await screen.findByRole("tab", { name: /^Activity/ })).toHaveAttribute("aria-selected", "true");
  expect(comments).not.toHaveBeenCalled();
  expect(margin).not.toHaveBeenCalled();
});

it("Given a Proposal detail, when its Proposals breadcrumb is chosen, then the actual proposal directory opens", async () => {
  const { user } = await viewerProposal();
  const breadcrumb = document.querySelector(".proposal-page-head .breadcrumbs");
  await user.click(within(breadcrumb).getByRole("button", { name: "Proposals" }));
  expect(await screen.findByRole("region", { name: "Proposal queue" })).toBeVisible();
  expect(window.location.hash).toBe("#/proposals");
  expect(screen.queryByRole("region", { name: "Price change for Cassava flour" })).not.toBeInTheDocument();
});

it("Given an unassigned Viewer opens a submitted review, then the assigned reviewer and current session access remain distinct", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const start = await repositories.proposals.getDetail();
  const requested = await repositories.proposals.requestOverride({ proposalRef: start.ref, idempotencyKey: "review-label-request" });
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.chika);
  const ready = (await repositories.proposals.decideOverride({ overrideRef: requested.data.override.ref, decision: "approve", idempotencyKey: "review-label-override" })).data.proposal;
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.teni);
  const submitted = (await repositories.proposals.submit({ proposalRef: ready.ref, idempotencyKey: "review-label-submit" })).data;
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.viewer);
  window.history.replaceState(null, "", workspaceHash({ surface: "proposal-approval", resourceId: submitted.ref.id, resourceVersion: submitted.ref.version, view: "review" }));
  render(<WorkspaceApp repositories={repositories} />);
  const review = await screen.findByRole("region", { name: "Review the current version" });
  const responsibility = within(review).getByText("Assigned reviewer").parentElement;
  expect(responsibility).toHaveTextContent("Chika");
  expect(responsibility).not.toHaveTextContent("Fola");
  const currentAccess = review.querySelector('[aria-label="Current review access"]');
  expect(currentAccess).toHaveTextContent("Viewing as Fola.");
  expect(currentAccess).not.toHaveTextContent("A decision is enabled for this session.");
  expect(within(review).queryByRole("button", { name: "Approve Proposal" })).not.toBeInTheDocument();
  expect(within(review).queryByRole("button", { name: "Return for changes" })).not.toBeInTheDocument();
});
