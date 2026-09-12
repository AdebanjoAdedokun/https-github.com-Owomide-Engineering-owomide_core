import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceApp } from "../src/WorkspaceApp.jsx";
import { createFixtureWorkspaceRepositories } from "../src/data/index.js";

// These are disclosure, evidence-order and navigation regressions. jsdom cannot
// establish scroll reachability: the real-browser wheel/End-key checks must also
// prove the final Scope field can be reached at short and long table heights.
beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "#/repricing/FX-004/preview");
});

async function openPreview() {
  render(<WorkspaceApp repositories={createFixtureWorkspaceRepositories({ startWithExistingProposal: false })} />);
  await screen.findByRole("region", { name: "Repricing preview" });
  return userEvent.setup();
}

function expectCassavaEvidence(inspector) {
  const evidence = inspector.querySelector(".lens-evidence");
  expect(evidence).toBe(inspector.lastElementChild);
  expect([...evidence.querySelectorAll("small")].map((label) => label.textContent)).toEqual([
    "Current cost", "Source", "Price adjustment", "Record", "Scope",
  ]);
  expect(within(evidence).getByText("₦1,515.50", { exact: true })).toBeInTheDocument();
  expect(within(evidence).getByText("Supplier baseline · row 33", { exact: true })).toBeInTheDocument();
  expect(within(evidence).getByText("+3.50%", { exact: true })).toBeInTheDocument();
  expect(within(evidence).getByText("Catalog version 1031", { exact: true })).toBeInTheDocument();
  expect(evidence.lastElementChild).toHaveTextContent("ScopeMarketplace · Ibadan cross-dock");
}

describe("Repricing inspector complete evidence", () => {
  it.each([
    { width: 1024, mode: "desktop overlay", movesDocument: false },
    { width: 390, mode: "mobile document flow", movesDocument: true },
  ])("Given a $width px $mode, when a line opens, then document handoff only runs for mobile", async ({ width, movesDocument }) => {
    const originalMatchMedia = window.matchMedia;
    const media = vi.spyOn(window, "matchMedia").mockImplementation((query) => {
      const min = query.match(/min-width:\s*(\d+)px/);
      const max = query.match(/max-width:\s*(\d+)px/);
      return {
        ...originalMatchMedia(query),
        matches: query.includes("prefers-reduced-motion") || Boolean((min || max)
          && (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))),
      };
    });
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const { unmount } = render(<WorkspaceApp repositories={createFixtureWorkspaceRepositories({ startWithExistingProposal: false })} />);
    try {
      await screen.findByRole("region", { name: "Repricing preview" });
      scroll.mockClear();
      await userEvent.setup().click(screen.getByRole("button", { name: "Inspect Cassava flour, Select, 1 kg" }));
      const inspector = await screen.findByRole("complementary", { name: "Decision details for Cassava flour" });
      // Observe the actual handoff callback after both scheduled animation
      // frames. This does not pretend jsdom can simulate native wheel chaining.
      await act(async () => {
        await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      });
      expect(inspector).toHaveFocus();
      const inspectorFocusCalls = focus.mock.calls.filter((_, index) => focus.mock.contexts[index] === inspector);
      expect(inspectorFocusCalls.length).toBeGreaterThan(0);
      expect(inspectorFocusCalls.every(([options]) => options?.preventScroll === true)).toBe(true);
      if (movesDocument) {
        await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "auto" }));
      } else {
        expect(scroll).not.toHaveBeenCalled();
      }
    } finally {
      unmount();
      focus.mockRestore();
      scroll.mockRestore();
      media.mockRestore();
    }
  });

  it.each([
    { tabName: "All lines 1,248", product: "Cassava flour", rowName: "Inspect Cassava flour, Select, 1 kg", source: "Supplier baseline · row 33", scope: "ScopeMarketplace · Ibadan cross-dock" },
    { tabName: "Need review 17", product: "Cassava flour", rowName: "Inspect Cassava flour, Select, 1 kg", source: "Supplier baseline · row 33", scope: "ScopeMarketplace · Ibadan cross-dock" },
    { tabName: "Eligible 1,210", product: "Long-grain rice", rowName: "Inspect Long-grain rice, Classic, 1 kg", source: "Supplier baseline · row 3", scope: "ScopeRetail web · Ibadan cross-dock" },
  ])("Given $tabName, when policy details expand and the inspector closes, then final evidence and the originating filter and row remain intact", async ({ tabName, product, rowName, source, scope }) => {
    const user = await openPreview();
    const tab = screen.getByRole("tab", { name: tabName });
    await user.click(tab);
    const origin = await screen.findByRole("button", { name: rowName });
    await user.click(origin);
    const inspector = screen.getByRole("complementary", { name: `Decision details for ${product}` });
    const disclosure = within(inspector).getByText("Why this policy won", { selector: "summary" });
    await user.click(disclosure);
    expect(disclosure.closest("details")).toHaveAttribute("open");
    const evidence = inspector.querySelector(".lens-evidence");
    expect(evidence).toBe(inspector.lastElementChild);
    expect(evidence).toHaveTextContent(source);
    expect(evidence.lastElementChild).toHaveTextContent(scope);
    expect(tab).toHaveAttribute("aria-selected", "true");

    inspector.focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: `Decision details for ${product}` })).not.toBeInTheDocument());
    await waitFor(() => expect(origin).toHaveFocus());
    expect(origin).toHaveAttribute("aria-expanded", "false");
    expect(tab).toHaveAttribute("aria-selected", "true");
  });

  it("Given a single filtered line, when policy reasoning is expanded and collapsed, then its final evidence remains in document order after authority without changing the selected version", async () => {
    const user = await openPreview();
    const search = screen.getByPlaceholderText("Search SKU or product");
    await user.type(search, "KLD-PANT-0032");
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Inspect / })).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Inspect Cassava flour, Select, 1 kg" }));
    const inspector = screen.getByRole("complementary", { name: "Decision details for Cassava flour" });
    const selectedRoute = window.location.hash;
    const policy = within(inspector).getByRole("region", { name: "Applied margin policy" });
    const disclosure = within(policy).getByText("Why this policy won", { selector: "summary" });
    const details = disclosure.closest("details");
    expect(details).not.toHaveAttribute("open");
    expectCassavaEvidence(inspector);

    await user.click(disclosure);
    expect(details).toHaveAttribute("open");
    expect(within(details).getByText(/Applied Pantry & staples floor/)).toBeVisible();
    expect(within(details).getAllByRole("listitem").length).toBeGreaterThan(0);
    expectCassavaEvidence(inspector);
    expect(inspector.querySelector(".lens-authority").nextElementSibling).toBe(inspector.querySelector(".lens-evidence"));
    expect(window.location.hash).toBe(selectedRoute);

    await user.click(disclosure);
    expect(details).not.toHaveAttribute("open");
    expectCassavaEvidence(inspector);
    expect(search).toHaveValue("KLD-PANT-0032");
  });

  it("Given expanded policy reasoning, when the inspector is exited with Escape, then the original row and selected version are restored", async () => {
    const user = await openPreview();
    const origin = screen.getByRole("button", { name: "Inspect Cassava flour, Select, 1 kg" });
    await user.click(origin);
    const inspector = screen.getByRole("complementary", { name: "Decision details for Cassava flour" });
    const disclosure = within(inspector).getByText("Why this policy won", { selector: "summary" });
    await user.click(disclosure);
    expect(disclosure.closest("details")).toHaveAttribute("open");
    expectCassavaEvidence(inspector);
    inspector.focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Decision details for Cassava flour" })).not.toBeInTheDocument());
    await waitFor(() => expect(origin).toHaveFocus());
    expect(origin).toHaveAttribute("aria-expanded", "false");
    expect(window.location.hash).not.toContain("line=");
  });

  it("Given an expanded policy inspector, when the adjacent line is selected, then trailing evidence is replaced with the new line's source, record and scope", async () => {
    const user = await openPreview();
    await user.click(screen.getByRole("button", { name: "Inspect Cassava flour, Select, 1 kg" }));
    const inspector = screen.getByRole("complementary", { name: "Decision details for Cassava flour" });
    await user.click(within(inspector).getByText("Why this policy won", { selector: "summary" }));
    inspector.focus();
    await user.keyboard("{ArrowDown}");
    const next = await screen.findByRole("complementary", { name: "Decision details for Seasoning mix" });
    const evidence = next.querySelector(".lens-evidence");
    expect(evidence).toBe(next.lastElementChild);
    expect(evidence).toHaveTextContent("Supplier baseline · row 100");
    expect(evidence).toHaveTextContent("Catalog version 1098");
    expect(evidence.lastElementChild).toHaveTextContent("ScopeKey accounts · Abuja fulfilment hub");
    expect(evidence).not.toHaveTextContent("row 33");
    expect(evidence).not.toHaveTextContent("Catalog version 1031");
    expect(next).toHaveFocus();
  });
});
