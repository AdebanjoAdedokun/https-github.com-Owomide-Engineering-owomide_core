import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { OperationalWorkspace } from "../src/OperationalWorkspace.jsx";
import { createFixtureWorkspaceRepositories, FIXTURE_ACTOR_IDS } from "../src/data/index.js";

async function handedOffQueue(actorId) {
  const repositories = createFixtureWorkspaceRepositories();
  const initial = await repositories.proposals.getDetail();
  const result = await repositories.proposals.handoff({ proposalRef: initial.ref, assigneeId: FIXTURE_ACTOR_IDS.manager, idempotencyKey: "queue-ui-handoff-001" });
  const session = await repositories.identity.selectDesignEvidenceActor(actorId);
  const onNavigate = vi.fn();
  render(<OperationalWorkspace route={{ surface: "proposals", view: "needs-me" }} repositories={repositories} session={session} onNavigate={onNavigate} />);
  const queue = await screen.findByRole("region", { name: "Proposal queue" });
  return { queue, onNavigate, proposal: result.data, user: userEvent.setup() };
}

it("Given Viewer read access after manager handoff, when Proposals opens, then All proposals is readable without a preparation action or a false Needs me count", async () => {
  const { user, queue, onNavigate, proposal } = await handedOffQueue(FIXTURE_ACTOR_IDS.viewer);
  expect(screen.getByText("Read-only access to pricing decisions.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "New repricing" })).not.toBeInTheDocument();
  expect(within(queue).getByRole("tab", { name: "All proposals 1" })).toHaveClass("is-active");
  const needsMe = within(queue).getByRole("tab", { name: "Needs me 0" });
  const row = within(queue).getByRole("button", { name: /August cost recovery/ });
  const owner = within(row).getByText("Owner").parentElement;
  expect(owner).toHaveTextContent("Ada");
  expect(owner).not.toHaveTextContent("Teni");
  expect(within(queue).getByLabelText("Proposal queue summary")).toHaveTextContent("1 proposal");
  expect(within(queue).getByLabelText("Proposal queue summary")).not.toHaveTextContent("Awaiting review");
  await user.click(needsMe);
  expect(screen.getByText("No Proposals need your action.")).toBeVisible();
  expect(within(queue).getByLabelText("Proposal queue summary")).toHaveTextContent("0 proposals");
  expect(within(queue).queryByRole("button", { name: /August cost recovery/ })).not.toBeInTheDocument();
  await user.click(within(queue).getByRole("button", { name: "Show all" }));
  await user.click(within(queue).getByRole("button", { name: /August cost recovery/ }));
  expect(onNavigate).toHaveBeenCalledWith({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "overview" });
});

it("Given the current manager owns an actionable draft, when Needs me opens, then only server-marked work appears and permitted preparation stays available", async () => {
  const { user, queue, onNavigate } = await handedOffQueue(FIXTURE_ACTOR_IDS.manager);
  expect(within(queue).getByRole("tab", { name: "Needs me 1" })).toHaveClass("is-active");
  expect(within(queue).getByRole("button", { name: /August cost recovery/ })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "New repricing" }));
  expect(onNavigate).toHaveBeenCalledWith({ surface: "repricing-scope", resourceId: "new", view: "scope" });
});

it("Given the original analyst handed the draft away, when Needs me opens, then authorship does not imply current assignment", async () => {
  const { user, queue } = await handedOffQueue(FIXTURE_ACTOR_IDS.teni);
  expect(within(queue).getByRole("tab", { name: "Needs me 0" })).toHaveClass("is-active");
  expect(screen.getByText("No Proposals need your action.")).toBeVisible();
  await user.click(within(queue).getByRole("tab", { name: "All proposals 1" }));
  const row = within(queue).getByRole("button", { name: /August cost recovery/ });
  expect(within(row).getByText("Owner").parentElement).toHaveTextContent("Ada");
});

it("Given assignment metadata is absent, when a reader looks at Needs me, then matching owner text and a manager role label never invent actionability", async () => {
  const session = { actor: { id: "reader", displayName: "Reader" }, roleCodes: ["pricing_manager"], effectiveCapabilities: ["proposal:read"], capabilityVersion: "1" };
  const item = { ref: { kind: "resource", id: "proposal-1", version: "3" }, title: "Readable draft", state: "blocked", readiness: "blocked", owner: session.actor, author: session.actor, counts: { lines: 1, blocked: 1 }, assignedApprover: { displayName: "Approver" }, assignedPublisher: { displayName: "Executor" }, updatedAt: "2026-09-08T08:00:00Z" };
  render(<OperationalWorkspace route={{ surface: "proposals" }} repositories={{ proposals: { list: vi.fn().mockResolvedValue({ items: [item] }) } }} session={session} onNavigate={vi.fn()} />);
  const queue = await screen.findByRole("region", { name: "Proposal queue" });
  expect(screen.queryByRole("button", { name: "New repricing" })).not.toBeInTheDocument();
  await userEvent.setup().click(within(queue).getByRole("tab", { name: "Needs me 0" }));
  expect(screen.getByText("No Proposals need your action.")).toBeVisible();
});
