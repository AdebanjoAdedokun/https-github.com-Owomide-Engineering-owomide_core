import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { WorkspaceViewTabs } from "../src/workspaceTablePatterns.jsx";
import { WorkspaceApp } from "../src/WorkspaceApp.jsx";
import { createFixtureWorkspaceRepositories } from "../src/data/index.js";

const views = ["All", "Assigned", "Blocked", "Review", "Approved", "Published"].map((label) => ({ id: label.toLowerCase(), label, count: 1 }));

function RailExample({ initial = "all" }) {
  const [value, setValue] = useState(initial);
  return <><WorkspaceViewTabs idPrefix="example-tab" label="Example views" panelId="example-results" views={views} value={value} onChange={setValue} /><div id="example-results" role="tabpanel" aria-labelledby={`example-tab-${value}`}>{value}</div></>;
}

function setRailGeometry(rail, initialWidth = 250, contentWidth = 600) {
  let width = initialWidth;
  Object.defineProperties(rail, {
    clientWidth: { configurable: true, get: () => width },
    scrollWidth: { configurable: true, get: () => contentWidth },
  });
  rail.getBoundingClientRect = () => ({ left: 0, right: width, width });
  [...rail.querySelectorAll('[role="tab"]')].forEach((tab, index) => {
    tab.getBoundingClientRect = () => ({ left: index * 100 - rail.scrollLeft, right: (index + 1) * 100 - rail.scrollLeft, width: 100 });
  });
  rail.scrollTo = vi.fn(({ left }) => { rail.scrollLeft = left; rail.dispatchEvent(new Event("scroll")); });
  return (nextWidth) => { width = nextWidth; };
}

it("Given a clipped filter rail, when a keyboard user selects the final view, then the active tab is revealed and continuation cues reflect the remaining content", async () => {
  render(<RailExample />);
  const rail = screen.getByRole("tablist", { name: "Example views" });
  setRailGeometry(rail);
  fireEvent(window, new Event("resize"));
  expect(rail).toHaveClass("has-overflow-after");
  expect(rail).not.toHaveClass("has-overflow-before");

  screen.getByRole("tab", { name: "All 1" }).focus();
  await userEvent.setup().keyboard("{End}");
  const published = screen.getByRole("tab", { name: "Published 1" });
  expect(published).toHaveFocus();
  expect(published).toHaveAttribute("aria-selected", "true");
  expect(rail.scrollTo).toHaveBeenCalledWith({ left: 350, behavior: "smooth" });
  expect(rail).toHaveClass("has-overflow-before");
  expect(rail).not.toHaveClass("has-overflow-after");
  expect(screen.getByRole("tabpanel", { name: "Published 1" })).toHaveTextContent("published");
});

it("Given an active middle filter, when its container narrows, then it stays visible without scrolling an ancestor", () => {
  let notifyResize;
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback) { notifyResize = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  try {
    const { unmount } = render(<RailExample initial="blocked" />);
    const rail = screen.getByRole("tablist", { name: "Example views" });
    const setWidth = setRailGeometry(rail, 350);
    act(() => notifyResize());
    expect(observe).toHaveBeenCalledWith(rail);
    expect(rail.scrollTo).not.toHaveBeenCalled();
    setWidth(180);
    act(() => notifyResize());
    expect(rail.scrollTo).toHaveBeenCalledWith({ left: 128, behavior: "auto" });
    expect(rail).toHaveClass("has-overflow-before", "has-overflow-after");
    unmount();
    expect(disconnect).toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

it("Given reduced motion, when a distant filter is selected, then the rail reveals it without smooth animation", async () => {
  const previous = window.matchMedia;
  window.matchMedia = vi.fn(() => ({ matches: true }));
  try {
    render(<RailExample />);
    const rail = screen.getByRole("tablist", { name: "Example views" });
    setRailGeometry(rail);
    await userEvent.setup().click(screen.getByRole("tab", { name: "Published 1" }));
    expect(rail.scrollTo).toHaveBeenCalledWith({ left: 350, behavior: "auto" });
  } finally { window.matchMedia = previous; }
});

it("Given the Repricing app's clipped rail, when its final filter is selected and the rail narrows, then only the rail scrolls and keyboard focus cannot move ancestors", async () => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "#/repricing/FX-004/preview");
  const ancestorReveal = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  const pageScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  const { unmount } = render(<WorkspaceApp repositories={createFixtureWorkspaceRepositories({ startWithExistingProposal: false })} />);
  try {
    await screen.findByRole("region", { name: "Repricing preview" });
    const rail = screen.getByRole("tablist", { name: "Repricing lines" });
    const setWidth = setRailGeometry(rail, 250, 500);
    fireEvent(window, new Event("resize"));
    expect(rail).toHaveClass("has-overflow-after");

    screen.getByRole("tab", { name: "All lines 1,248" }).focus();
    await userEvent.setup().keyboard("{End}");
    const finalTab = screen.getByRole("tab", { name: "Unpriced 9" });
    await waitFor(() => expect(finalTab).toHaveAttribute("aria-selected", "true"));
    expect(finalTab).toHaveFocus();
    const selectedFocus = focus.mock.contexts.findIndex((target) => target === finalTab);
    expect(selectedFocus).toBeGreaterThanOrEqual(0);
    expect(focus.mock.calls[selectedFocus]).toEqual([{ preventScroll: true }]);
    expect(rail.scrollTo).toHaveBeenCalledWith({ left: 250, behavior: "smooth" });
    expect(rail).toHaveClass("has-overflow-before");
    expect(rail).not.toHaveClass("has-overflow-after");

    setWidth(180);
    fireEvent(window, new Event("resize"));
    expect(rail.scrollTo).toHaveBeenLastCalledWith({ left: 320, behavior: "auto" });
    expect(finalTab).toHaveFocus();
    expect(ancestorReveal).not.toHaveBeenCalled();
    expect(pageScroll).not.toHaveBeenCalled();
    expect(rail.scrollTo.mock.calls.every(([options]) => !Object.hasOwn(options, "top"))).toBe(true);
  } finally {
    unmount();
    focus.mockRestore();
    pageScroll.mockRestore();
    ancestorReveal.mockRestore();
  }
});
