import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OperationalWorkspace } from "../src/OperationalWorkspace.jsx";
import { createFixtureWorkspaceRepositories, FIXTURE_ACTOR_IDS } from "../src/data/index.js";

// These tests exercise interaction and evidence preservation. Layout, clipping and
// font geometry require the separately recorded real-browser viewport checks.
const viewer = {
  actor: { id: "table-reader", displayName: "Table Reader" },
  effectiveCapabilities: ["proposal:read"],
  roleCodes: ["viewer"],
  capabilityVersion: "1",
};

const proposal = (id, title, state, needsCurrentActor = false) => ({
  ref: { kind: "resource", id, version: "7" },
  title,
  state,
  readiness: state,
  needsCurrentActor,
  counts: { lines: 12, blocked: state === "blocked" ? 2 : 0 },
  owner: { displayName: "Ada Manager" },
  assignedApprover: { displayName: "Chika Approver" },
  assignedPublisher: { displayName: "Farida Executor" },
  updatedAt: "2026-09-12T09:30:00Z",
});

async function openProposals({ session = viewer } = {}) {
  const items = [
    proposal("proposal-blocked", "Pantry recovery", "blocked"),
    proposal("proposal-review", "Beverage recovery", "submitted"),
    proposal("proposal-approved", "Home care recovery", "approved"),
    proposal("proposal-published", "Pantry rollout", "published"),
  ];
  const repositories = { proposals: { list: vi.fn().mockResolvedValue({ items }) } };
  const onNavigate = vi.fn();
  render(<OperationalWorkspace route={{ surface: "proposals", view: "all" }} repositories={repositories} session={session} onNavigate={onNavigate} />);
  const queue = await screen.findByRole("region", { name: "Proposal queue" });
  return { queue, repositories, onNavigate, user: userEvent.setup() };
}

async function openCatalog(actorId) {
  const repositories = createFixtureWorkspaceRepositories();
  const session = actorId ? await repositories.identity.selectDesignEvidenceActor(actorId) : await repositories.identity.getSession();
  const onNavigate = vi.fn();
  render(<OperationalWorkspace route={{ surface: "catalog", view: "list" }} repositories={repositories} session={session} onNavigate={onNavigate} />);
  const catalog = await screen.findByRole("region", { name: "Catalog" });
  return { catalog, repositories, onNavigate, user: userEvent.setup() };
}

describe("Shared table interaction standard", () => {
  it("Given Proposal filters, when Left, Right, Home and End are used, then focus wraps with a single tab stop and the results retain the active tab's label", async () => {
    const { queue, user } = await openProposals();
    const tablist = within(queue).getByRole("tablist", { name: "Proposal queue views" });
    const tabs = within(tablist).getAllByRole("tab");
    const panel = within(queue).getByRole("tabpanel");
    expect(tabs).toHaveLength(6);

    const assertSelection = (selected) => {
      expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([selected]);
      expect(tabs.filter((tab) => tab.getAttribute("aria-selected") === "true")).toEqual([selected]);
      expect(selected).toHaveAttribute("aria-controls", panel.id);
      expect(panel).toHaveAttribute("aria-labelledby", selected.id);
      expect(selected).toHaveFocus();
    };

    await user.click(tabs[0]);
    assertSelection(tabs[0]);
    await user.keyboard("{ArrowLeft}");
    assertSelection(tabs[5]);
    expect(within(panel).getByRole("button", { name: /Pantry rollout/ })).toBeVisible();
    await user.keyboard("{ArrowRight}");
    assertSelection(tabs[0]);
    await user.keyboard("{End}");
    assertSelection(tabs[5]);
    await user.keyboard("{Home}{ArrowRight}{ArrowRight}");
    assertSelection(tabs[2]);
    expect(within(panel).getByRole("button", { name: /Pantry recovery/ })).toBeVisible();
    expect(within(panel).queryByRole("button", { name: /Pantry rollout/ })).not.toBeInTheDocument();
    await user.tab();
    expect(within(queue).getByRole("textbox", { name: "Search proposals" })).toHaveFocus();
  });

  it("Given a read-only Proposal search, when filters change and a matching row opens with Enter, then the query survives and navigation carries the exact version without preparation controls", async () => {
    const { queue, user, onNavigate } = await openProposals();
    const search = within(queue).getByRole("textbox", { name: "Search proposals" });
    expect(screen.queryByRole("button", { name: "New repricing" })).not.toBeInTheDocument();
    await user.type(search, "Pantry");
    await user.click(within(queue).getByRole("tab", { name: "Published 1" }));
    expect(search).toHaveValue("Pantry");
    const published = within(queue).getByRole("button", { name: /Pantry rollout/ });
    expect(within(queue).queryByRole("button", { name: /Pantry recovery/ })).not.toBeInTheDocument();
    published.focus();
    await user.keyboard("{Enter}");
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ surface: "proposal", resourceId: "proposal-published", resourceVersion: "7", view: "overview" });
  });

  it("Given an empty Proposal search within an active state filter, when Clear search is used, then only the query resets and the state filter remains selected", async () => {
    const { queue, user } = await openProposals();
    const blocked = within(queue).getByRole("tab", { name: "Blocked 1" });
    await user.click(blocked);
    await user.type(within(queue).getByRole("textbox", { name: "Search proposals" }), "unmatched-product");
    expect(within(queue).queryByRole("button", { name: /Pantry recovery/ })).not.toBeInTheDocument();
    await user.click(within(queue).getByRole("button", { name: "Clear search" }));
    expect(blocked).toHaveAttribute("aria-selected", "true");
    expect(within(queue).getByRole("textbox", { name: "Search proposals" })).toHaveValue("");
    expect(within(queue).getByRole("button", { name: /Pantry recovery/ })).toBeVisible();
    expect(within(queue).queryByRole("button", { name: /Home care recovery/ })).not.toBeInTheDocument();
  });

  it("Given a searched Catalog, when its full row opens by keyboard and Escape closes the inspector, then SKU search, result count and row focus are preserved", async () => {
    const { catalog, user, onNavigate } = await openCatalog();
    expect(screen.getByRole("button", { name: "View imports" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Start repricing" })).toBeEnabled();
    const search = within(catalog).getByRole("textbox", { name: "Search product or SKU code" });
    await user.type(search, "KLD-PANT-0032");
    const pager = within(catalog).getByRole("navigation", { name: "SKUs pagination" });
    await waitFor(() => expect(pager).toHaveTextContent("of 1 sample SKUs"));
    const row = within(catalog).getByRole("button", { name: /Cassava flour/ });
    row.focus();
    await user.keyboard("{Enter}");
    const inspector = screen.getByRole("complementary", { name: "Catalog detail for Cassava flour" });
    await waitFor(() => expect(inspector).toHaveFocus());
    expect(row).toHaveAttribute("aria-controls", inspector.id);
    expect(catalog.querySelector(".ops-list-plane")).toHaveAttribute("inert");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(row).toHaveFocus());
    expect(search).toHaveValue("KLD-PANT-0032");
    expect(pager).toHaveTextContent("1–1of 1 sample SKUs");
    expect(pager).toHaveTextContent("1,248 authoritative SKUs");
    expect(catalog.querySelector(".ops-list-plane")).not.toHaveAttribute("inert");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("Given the second Catalog page, when a row is inspected and dismissed, then page two and its visible records stay in place instead of resetting to the first page", async () => {
    const { catalog, user } = await openCatalog();
    const pager = within(catalog).getByRole("navigation", { name: "SKUs pagination" });
    await user.click(within(pager).getByRole("button", { name: "Next SKUs page" }));
    await waitFor(() => expect(pager).toHaveTextContent("Page 2 of 2"));
    const rowsBefore = [...catalog.querySelectorAll(".catalog-list > button")];
    const contentBefore = rowsBefore.map((row) => row.textContent);
    await user.click(rowsBefore[0]);
    await user.click(screen.getByRole("button", { name: "Close catalog detail" }));
    await waitFor(() => expect(rowsBefore[0]).toHaveFocus());
    expect([...catalog.querySelectorAll(".catalog-list > button")].map((row) => row.textContent)).toEqual(contentBefore);
    expect(pager).toHaveTextContent("9–13of 13 sample SKUs");
    expect(within(pager).getByRole("button", { name: "Previous SKUs page" })).toBeEnabled();
    expect(within(pager).getByRole("button", { name: "Next SKUs page" })).toBeDisabled();
  });

  it("Given a Viewer with catalog read access but no economics permission, when a SKU opens, then the row and inspector preserve the restriction instead of leaking or inventing cost", async () => {
    const { catalog, user } = await openCatalog(FIXTURE_ACTOR_IDS.viewer);
    expect(screen.queryByRole("button", { name: "View imports" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start repricing" })).not.toBeInTheDocument();
    const row = within(catalog).getByRole("button", { name: /Cassava flour/ });
    expect(row).toHaveTextContent("₦1,612.50");
    expect(row).toHaveTextContent("Restricted by access");
    expect(row).not.toHaveTextContent("₦1,515.50");
    await user.click(row);
    const inspector = screen.getByRole("complementary", { name: "Catalog detail for Cassava flour" });
    expect(inspector).toHaveTextContent("Restricted by access");
    expect(inspector).not.toHaveTextContent("₦1,515.50");
    expect(inspector).not.toHaveTextContent("₦0.00");
    expect(within(inspector).getByRole("button", { name: "Open full record" })).toBeEnabled();
  });

  it("Given the margin-policy ledger, when its policy row is activated by keyboard, then floor and version remain attached to that policy and open its read-only record", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const session = await repositories.identity.getSession();
    const policies = await repositories.rules.list({ limit: 20 });
    const policy = policies.items[0];
    const onNavigate = vi.fn();
    render(<OperationalWorkspace route={{ surface: "rules", view: "read" }} repositories={repositories} session={session} onNavigate={onNavigate} />);
    const ledger = await screen.findByRole("region", { name: "Margin policies" });
    expect(within(ledger).getAllByText("SKU", { exact: true }).length).toBeGreaterThan(0);
    expect(within(ledger).queryByText("Sku", { exact: true })).not.toBeInTheDocument();
    const row = within(ledger).getByRole("button", { name: new RegExp(policy.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    expect(row).toHaveTextContent(policy.code);
    expect(row).toHaveTextContent(`${((policy.effect?.basisPoints ?? policy.marginFloorBasisPoints) / 100).toFixed(2)}%`);
    expect(within(row).getByTitle(`Exact version ${policy.ref.version}`)).toBeVisible();
    row.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ surface: "rule-detail", resourceId: policy.id, view: "read" });
  });
});
