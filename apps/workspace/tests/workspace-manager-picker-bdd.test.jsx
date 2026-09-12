import React, { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSelect } from "../src/WorkspaceSelect.jsx";
import { ProposalHandoff } from "../src/RoleWorkspace.jsx";
import { installWorkspaceSelectLayoutFixture } from "./helpers/workspaceSelectLayout.js";

installWorkspaceSelectLayoutFixture();

const managers = [
  { value: "ada", label: "Ada", description: "Pricing Manager" },
  { value: "ayo", label: "Ayo Adeyemi", description: "Pricing Manager" },
  { value: "zara", label: "Zara Bello", description: "Pricing Manager" },
];

function Picker({ initialValue = "", onChange = () => {}, options = managers, disabled = false }) {
  const [value, setValue] = useState(initialValue);
  return <>
    <WorkspaceSelect label="Pricing Manager" value={value} options={options} disabled={disabled}
      placeholder="Choose a manager" onChange={(next) => { setValue(next); onChange(next); }} />
    <button type="button">Continue elsewhere</button>
  </>;
}

function activeOption(combobox) {
  const activeId = combobox.getAttribute("aria-activedescendant");
  expect(activeId).toBeTruthy();
  const option = document.getElementById(activeId);
  expect(option).toHaveAttribute("role", "option");
  return option;
}

describe("Styled manager picker behaviour", () => {
  it("Given an unselected manager field, when opened, then a labelled listbox replaces the native popup without committing a choice", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Picker onChange={onChange} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    expect(picker.tagName).not.toBe("SELECT");
    expect(picker).toHaveTextContent("Choose a manager");
    expect(picker).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(picker);
    const listbox = screen.getByRole("listbox", { name: "Pricing Manager" });
    expect(picker).toHaveAttribute("aria-expanded", "true");
    expect(picker).toHaveAttribute("aria-controls", listbox.id);
    expect(picker).toHaveFocus();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getAllByRole("option").every((option) => option.getAttribute("aria-selected") === "false")).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Given an open picker, when a manager is clicked, then only that value commits and focus returns to the picker", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Picker onChange={onChange} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    await user.click(picker);
    await user.click(screen.getByRole("option", { name: /^Ayo Adeyemi/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("ayo");
    expect(picker).toHaveTextContent("Ayo Adeyemi");
    expect(picker).toHaveAttribute("aria-expanded", "false");
    expect(picker).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(picker);
    expect(screen.getByRole("option", { name: /^Ayo Adeyemi/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /^Ada/ })).toHaveAttribute("aria-selected", "false");
  });

  it("Given keyboard focus, when arrows and Home or End are used, then options can be explored without changing the value until Enter", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Picker onChange={onChange} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(activeOption(picker)).toHaveTextContent("Ada");
    await user.keyboard("{ArrowDown}");
    expect(activeOption(picker)).toHaveTextContent("Ayo Adeyemi");
    expect(activeOption(picker)).toHaveAttribute("aria-selected", "false");
    await user.keyboard("{End}");
    expect(activeOption(picker)).toHaveTextContent("Zara Bello");
    await user.keyboard("{Home}");
    expect(activeOption(picker)).toHaveTextContent("Ada");
    await user.keyboard("{ArrowDown}");
    expect(onChange).not.toHaveBeenCalled();
    expect(picker).toHaveTextContent("Choose a manager");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("ayo");
    expect(picker).toHaveFocus();
    expect(picker).toHaveAttribute("aria-expanded", "false");
  });

  it("Given no current value, when ArrowUp opens the picker and Space confirms, then the last manager is selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Picker onChange={onChange} />);
    await user.tab();
    await user.keyboard("{ArrowUp}");
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    expect(activeOption(picker)).toHaveTextContent("Zara Bello");
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("zara");
    expect(picker).toHaveAttribute("aria-expanded", "false");
  });

  it("Given an existing manager, when another is highlighted then Escape is pressed, then the original choice survives and focus remains usable", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Picker initialValue="ada" onChange={onChange} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    await user.click(picker);
    await user.keyboard("{End}{Escape}");
    expect(picker).toHaveTextContent("Ada");
    expect(picker).toHaveFocus();
    expect(picker).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Given an open uncommitted choice, when Tab is pressed, then the popup closes and focus proceeds instead of being trapped", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Picker onChange={onChange} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    await user.click(picker);
    await user.keyboard("{End}");
    await user.tab();
    expect(screen.getByRole("button", { name: "Continue elsewhere" })).toHaveFocus();
    expect(picker).toHaveAttribute("aria-expanded", "false");
    expect(picker).toHaveTextContent("Choose a manager");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Given an open picker, when the user clicks elsewhere, then it dismisses without stealing focus or committing the highlighted manager", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Picker onChange={onChange} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    await user.click(picker);
    await user.keyboard("{End}");
    const outside = screen.getByRole("button", { name: "Continue elsewhere" });
    await user.click(outside);
    expect(outside).toHaveFocus();
    expect(picker).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Given several managers, when a name is typed in the open list, then typeahead highlights its option and Enter commits it", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Picker onChange={onChange} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    await user.click(picker);
    await user.keyboard("za");
    expect(activeOption(picker)).toHaveTextContent("Zara Bello");
    expect(activeOption(picker)).toHaveAttribute("aria-selected", "false");
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("zara");
  });

  it("Given a disabled field, when clicked or reached by Tab, then it exposes its disabled state and never opens", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Picker disabled onChange={onChange} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    expect(picker).toBeDisabled();
    await user.click(picker);
    await user.tab();
    expect(screen.getByRole("button", { name: "Continue elsewhere" })).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Given the manager label, when clicked, then its associated picker receives focus", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    await user.click(screen.getByText("Pricing Manager", { selector: "label" }));
    expect(screen.getByRole("combobox", { name: "Pricing Manager" })).toHaveFocus();
  });

  it("Given a selected manager and open list, when the picker becomes disabled then enabled, then the popup closes and the committed selection survives", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Picker initialValue="ayo" onChange={onChange} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    expect(picker).toHaveTextContent("Ayo Adeyemi");
    await user.click(picker);
    expect(screen.getByRole("option", { name: /^Ayo Adeyemi/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    rerender(<Picker initialValue="ayo" onChange={onChange} disabled />);
    expect(picker).toBeDisabled();
    expect(picker).toHaveTextContent("Ayo Adeyemi");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    rerender(<Picker initialValue="ayo" onChange={onChange} />);
    expect(picker).toBeEnabled();
    await user.click(picker);
    expect(activeOption(picker)).toHaveTextContent("Ayo Adeyemi");
    expect(screen.getByRole("option", { name: /^Ayo Adeyemi/ })).toHaveAttribute("aria-selected", "true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Given a long manager list, when End is pressed, then the final option is active and scrolled into view without committing it", async () => {
    const options = Array.from({ length: 40 }, (_, index) => ({ value: `manager-${index}`, label: `Manager ${index + 1}` }));
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Picker options={options} onChange={onChange} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    await user.click(picker);
    const listbox = screen.getByRole("listbox");
    Object.defineProperty(listbox, "clientHeight", { configurable: true, value: 240 });
    screen.getAllByRole("option").forEach((option, index) => {
      Object.defineProperty(option, "offsetTop", { configurable: true, value: index * 48 });
      Object.defineProperty(option, "offsetHeight", { configurable: true, value: 48 });
    });
    await user.keyboard("{End}");
    expect(activeOption(picker)).toBe(screen.getByRole("option", { name: "Manager 40" }));
    expect(listbox.scrollTop).toBe(40 * 48 - 240);
    expect(onChange).not.toHaveBeenCalled();
  });
});

const action = (code) => ({ code, enabled: true });
const draft = (overrides = {}) => ({
  ref: { kind: "resource", id: "proposal-001", version: "3" },
  title: "August cost recovery",
  author: { id: "analyst", displayName: "Teni Adebayo" },
  handoffCandidates: [{ id: "ada", displayName: "Ada" }],
  allowedActions: [action("proposal.handoff"), action("proposal.draft.edit")],
  ...overrides,
});

describe("Manager picker within the draft handoff", () => {
  it("Given an eligible manager, when selected then reviewed, then no repository mutation occurs before the separate confirmation", async () => {
    const proposal = draft();
    const result = { data: { ...proposal, submissionOwner: proposal.handoffCandidates[0] } };
    const proposals = { handoff: vi.fn().mockResolvedValue(result) };
    const onHandoff = vi.fn();
    const user = userEvent.setup();
    render(<ProposalHandoff proposal={proposal} proposals={proposals} onHandoff={onHandoff} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    await user.click(picker);
    await user.click(screen.getByRole("option", { name: /^Ada(?:\s|$)/ }));
    expect(proposals.handoff).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Review handoff" }));
    expect(proposals.handoff).not.toHaveBeenCalled();
    expect(picker).toBeDisabled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Confirm handoff of version 3" })).toHaveFocus();
    expect(screen.getByText(/This does not submit, approve or publish/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm handoff" }));
    await waitFor(() => expect(onHandoff).toHaveBeenCalledWith(result));
    expect(proposals.handoff).toHaveBeenCalledExactlyOnceWith({ proposalRef: proposal.ref, assigneeId: "ada", idempotencyKey: expect.any(String) });
  });

  it("Given a title edit or pending handoff, when the user revisits the picker, then it stays disabled until the operation completes", async () => {
    const proposal = draft();
    let resolveHandoff;
    const pending = new Promise((resolve) => { resolveHandoff = resolve; });
    const proposals = { handoff: vi.fn().mockReturnValue(pending), updateDraft: vi.fn() };
    const user = userEvent.setup();
    render(<ProposalHandoff proposal={proposal} proposals={proposals} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    await user.click(screen.getByRole("button", { name: "Edit draft title" }));
    expect(picker).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel edit" }));
    expect(picker).toBeEnabled();
    await user.click(picker);
    await user.click(screen.getByRole("option", { name: /^Ada(?:\s|$)/ }));
    await user.click(screen.getByRole("button", { name: "Review handoff" }));
    await user.click(screen.getByRole("button", { name: "Confirm handoff" }));
    expect(picker).toBeDisabled();
    expect(screen.getByRole("button", { name: "Handing off…" })).toBeDisabled();
    await user.click(picker);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await act(async () => { resolveHandoff({ data: { ...proposal, submissionOwner: proposal.handoffCandidates[0] } }); });
    expect(picker).toBeEnabled();
    expect(proposals.handoff).toHaveBeenCalledOnce();
  });

  it("Given no eligible manager, when draft actions open, then the picker and handoff remain disabled with a clear next step", async () => {
    const proposals = { handoff: vi.fn() };
    const user = userEvent.setup();
    render(<ProposalHandoff proposal={draft({ handoffCandidates: [] })} proposals={proposals} />);
    const picker = screen.getByRole("combobox", { name: "Pricing Manager" });
    expect(picker).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review handoff" })).toBeDisabled();
    expect(screen.getByText("No eligible manager is assigned. Ask the Account Owner to resolve access.")).toBeVisible();
    await user.click(picker);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(proposals.handoff).not.toHaveBeenCalled();
  });
});
