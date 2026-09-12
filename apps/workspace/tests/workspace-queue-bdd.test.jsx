import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OperationalWorkspace } from "../src/OperationalWorkspace.jsx";
import { createFixtureWorkspaceRepositories } from "../src/data/index.js";

const itemRef = { kind: "resource", id: "2beecc58-6ac9-5edb-bc59-7fc80b31cbd0", version: "3" };
const targetRef = { kind: "resource", id: "df79d27f-e87d-58ba-9167-87ced18c72b5", version: "7" };
const workItem = (overrides = {}) => ({
  id: "work-cost-change",
  ref: itemRef,
  type: "repricing",
  title: "Review cost change",
  reason: "One price needs review.",
  status: "blocked",
  nextActor: "Pricing team",
  counts: { attention: 1, total: 40 },
  updatedAt: "2026-09-07T09:00:00Z",
  allowedActions: [{ code: "work.open", enabled: true, targetRef }],
  ...overrides,
});

async function openQueue({ capabilities = [], items = [workItem()] } = {}) {
  const session = { actor: { id: "reader" }, capabilityVersion: "1", effectiveCapabilities: capabilities, roleCodes: ["pricing_analyst"] };
  const repositories = { workQueue: { list: vi.fn().mockResolvedValue({ items }) } };
  const onNavigate = vi.fn();
  render(<OperationalWorkspace route={{ surface: "work", view: "needs-me" }} repositories={repositories} session={session} onNavigate={onNavigate} />);
  await screen.findByRole("region", { name: "Work queue" });
  return { onNavigate, user: userEvent.setup() };
}

describe("Work queue permission and destination boundaries", () => {
  it("Given no preparation capabilities, when Work opens, then role labels alone expose neither Import nor Repricing", async () => {
    await openQueue();
    expect(screen.queryByRole("button", { name: "Import data" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New repricing" })).not.toBeInTheDocument();
  });

  it.each([
    ["import:prepare", "Import data", "New repricing", { surface: "import-new", view: "create" }],
    ["repricing:prepare", "New repricing", "Import data", { surface: "repricing-scope", resourceId: "new", view: "scope" }],
  ])("Given %s only, when its entry action is selected, then only that permitted journey opens", async (capability, allowed, absent, expected) => {
    const { user, onNavigate } = await openQueue({ capabilities: [capability] });
    expect(screen.queryByRole("button", { name: absent })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: allowed }));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it.each([
    ["repricing", "repricing", "preview"],
    ["proposal", "proposal", "overview"],
    ["import", "import-map", "map"],
  ])("Given a %s item whose action target differs from its identity, when selected, then its exact authorised destination/version opens", async (type, surface, view) => {
    const { user, onNavigate } = await openQueue({ items: [workItem({ type })] });
    await user.click(screen.getByRole("button", { name: /Review cost change/ }));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ surface, view, resourceId: targetRef.id, resourceVersion: targetRef.version });
  });

  it("Given an explicit denial, when the row is clicked or keyboard-activated, then work stays visible with its reason and navigation never occurs", async () => {
    const { user, onNavigate } = await openQueue({ items: [workItem({ allowedActions: [{ code: "work.open", enabled: false, targetRef, reason: { code: "WRONG_ACTOR", message: "This review is assigned to another member." } }] })] });
    const row = screen.getByRole("button", { name: /Review cost change/ });
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row).toHaveAccessibleDescription("This review is assigned to another member.");
    await user.click(row);
    row.focus();
    await user.keyboard("{Enter} ");
    expect(onNavigate).not.toHaveBeenCalled();
    expect(row).toHaveFocus();
  });

  it.each([
    ["missing action", { allowedActions: [] }],
    ["missing target", { allowedActions: [{ code: "work.open", enabled: true }] }],
    ["unversioned target", { allowedActions: [{ code: "work.open", enabled: true, targetRef: { ...targetRef, version: null } }] }],
    ["unsupported type", { type: "unknown" }],
    ["prototype-named type", { type: "constructor" }],
    ["path-shaped target", { allowedActions: [{ code: "work.open", enabled: true, targetRef: { ...targetRef, id: "../proposals/other" } }] }],
  ])("Given a %s, when a work row is selected, then no inferred or demo destination is used", async (_label, overrides) => {
    const { user, onNavigate } = await openQueue({ items: [workItem(overrides)] });
    const row = screen.getByRole("button", { name: /Review cost change/ });
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(within(row).getByText(/This destination is unavailable/)).toBeVisible();
    await user.click(row);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("Given the prepared scope fixture, when Scope opens, then the fixed population is disclosed and naming still works", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const session = await repositories.identity.getSession();
    render(<OperationalWorkspace route={{ surface: "repricing-scope", resourceId: "new", view: "scope" }} repositories={repositories} session={session} onNavigate={vi.fn()} />);
    await screen.findByRole("heading", { name: "Define scope" });
    expect(screen.getByText("Name this prepared sample. Its catalog population is fixed.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Scope name" })).toBeEnabled();
    expect(screen.queryByRole("combobox", { name: "Category" })).not.toBeInTheDocument();
  });
});

describe("Work queue stage and count clarity", () => {
  it("Given work from different stages, when Needs me opens, then each authorised action remains visible without a misleading unique-line total", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const session = await repositories.identity.getSession();
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<OperationalWorkspace route={{ surface: "work", view: "needs-me" }} repositories={repositories} session={session} onNavigate={onNavigate} />);
    const queue = await screen.findByRole("region", { name: "Work queue" });
    const preview = within(queue).getByRole("button", { name: /Review August cost recovery/ });
    const proposal = within(queue).getByRole("button", { name: /Resolve Proposal blockers/ });
    const mapping = within(queue).getByRole("button", { name: /Finish supplier cost mapping/ });

    expect(within(queue).getByRole("tab", { name: "Needs me 3" })).toHaveClass("is-active");
    expect(within(preview).getByText("Repricing preview")).toBeVisible();
    expect(within(preview).getByText("Review calculated prices and line selection.")).toBeVisible();
    expect(within(proposal).getByText("Proposal")).toBeVisible();
    expect(within(proposal).getByText("August cost recovery · resolve blockers before submission.")).toBeVisible();
    expect(within(preview).getByText("17 lines need review")).toBeVisible();
    expect(within(proposal).getByText("17 lines need review")).toBeVisible();
    expect(within(preview).getByText("1,248 lines in scope")).toBeVisible();
    expect(within(proposal).getByText("1,227 lines in scope")).toBeVisible();
    expect(within(mapping).getByText("3 mapping issues")).toBeVisible();
    expect(within(mapping).getByText("80 source rows")).toBeVisible();
    expect(within(proposal).getByText("Next actor").parentElement).toHaveTextContent("Teni");
    expect(proposal).not.toHaveTextContent("Sample Operator");

    const summary = within(queue).getByLabelText("Work queue summary");
    expect(summary).toHaveTextContent("3 work items");
    expect(summary).toHaveTextContent("Line counts may overlap between stages.");
    expect(summary).not.toHaveTextContent("37");
    expect(summary).not.toHaveTextContent("Line attention");
    expect(summary).not.toHaveTextContent("Blocked work");
    await user.click(preview);
    await user.click(proposal);
    expect(onNavigate.mock.calls[0][0].surface).toBe("repricing");
    expect(onNavigate.mock.calls[1][0].surface).toBe("proposal");
    expect(onNavigate.mock.calls[0][0].resourceId).not.toBe(onNavigate.mock.calls[1][0].resourceId);
  });

  it("Given a filtered queue, when a search narrows the stage actions, then the footer reports visible work items only", async () => {
    const { user } = await openQueue({ items: [workItem(), workItem({ id: "other-work", title: "Review seasonal update" })] });
    await user.type(screen.getByRole("textbox", { name: "Search work" }), "seasonal");
    expect(screen.getByLabelText("Work queue summary")).toHaveTextContent("1 work item");
    expect(screen.queryByRole("button", { name: /Review cost change/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review seasonal update/ })).toBeVisible();
  });

  it("Given missing scope evidence, when a queue item appears, then missing counts are not presented as zero work", async () => {
    await openQueue({ items: [workItem({ counts: {}, nextActor: "" })] });
    const row = screen.getByRole("button", { name: /Review cost change/ });
    expect(within(row).getByText("Attention count unavailable")).toBeVisible();
    expect(within(row).getByText("Scope unavailable")).toBeVisible();
    expect(within(row).getByText("Unassigned")).toBeVisible();
    expect(row).not.toHaveTextContent("0 lines");
  });
});
