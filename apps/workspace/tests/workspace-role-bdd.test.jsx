import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProposalHandoff, RoleWorkspace } from "../src/RoleWorkspace.jsx";
import { createDomainErrorEnvelope, RepositoryError } from "../src/data/domainError.js";
import { createFixtureWorkspaceRepositories } from "../src/data/index.js";
import { FIXTURE_ACTOR_IDS } from "../src/data/fixtures/proposalJourneyV0.js";
import { installWorkspaceSelectLayoutFixture } from "./helpers/workspaceSelectLayout.js";

installWorkspaceSelectLayoutFixture();

const ref = (id, version = "1") => ({ kind: "resource", id, version });
const action = (code, enabled = true, message) => ({ code, enabled, ...(message ? { reason: { code: "DENIED", message } } : {}) });
const session = { actor: { id: "actor-requester" }, capabilityVersion: "1", roleCodes: ["account_owner"] };
const receipt = (overrides = {}) => ({
  ref: ref("request-001"), status: "submitted", productReference: "KLD-PANT-0032",
  issue: "Shelf price differs", reason: "The shelf label differs from the till.", context: "Lagos retail",
  evidence: "Shelf label recorded this morning.", requester: { id: "actor-requester", displayName: "Ade Bello" },
  createdAt: "2026-09-08T08:15:00Z", allowedActions: [action("request.read")], ...overrides,
});
const list = (overrides = {}) => ({ kind: "pricing-request-list", items: [receipt()], viewScope: "own", allowedActions: [action("request.read"), action("request.create")], ...overrides });
const company = (overrides = {}) => ({
  ref: ref("company-policy"), organisation: { name: "Sample company" }, policy: { analystCanSubmit: false },
  members: [{ id: "analyst", displayName: "Teni Adebayo", roleLabels: ["Pricing Analyst"] }],
  allowedActions: [action("company.read")], ...overrides,
});
const repoError = (message, code = "STALE_VERSION") => new RepositoryError(createDomainErrorEnvelope({ code, message, traceId: "safe-test-trace" }));

function openRole({ route = { surface: "pricing-requests", view: "list" }, listing = list(), request = receipt(), companyData = company(), overrides = {}, capabilities = [], onSessionChange } = {}) {
  const repositories = {
    requests: { list: vi.fn().mockResolvedValue(listing), get: vi.fn().mockResolvedValue(request), create: vi.fn().mockResolvedValue({ data: request }), triage: vi.fn() },
    company: { get: vi.fn().mockResolvedValue(companyData), updateAnalystSubmission: vi.fn() },
    identity: { getSession: vi.fn().mockResolvedValue({ ...session, capabilityVersion: "2" }) },
  };
  for (const [group, methods] of Object.entries(overrides)) Object.assign(repositories[group], methods);
  const onNavigate = vi.fn();
  render(<RoleWorkspace route={route} repositories={repositories} session={{ ...session, effectiveCapabilities: capabilities }} onNavigate={onNavigate} onSessionChange={onSessionChange} />);
  return { repositories, onNavigate, user: userEvent.setup() };
}

describe("Isolated pricing request journeys", () => {
  it("Given the real fixture Contributor-to-manager journey, when the Contributor reopens their receipt, then status is visible but the internal note and triage controls are not", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.contributor);
    const created = await repositories.requests.create({ productReference: "KLD-PANT-0032", issue: "Shelf price differs", reason: "The till and shelf show different prices.", idempotencyKey: "role-ui-create-001" });
    await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.manager);
    const reviewed = await repositories.requests.triage({ requestRef: created.data.ref, status: "reviewing", note: "Internal protected proposal evidence reference", idempotencyKey: "role-ui-triage-001" });
    const contributor = await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.contributor);
    render(<RoleWorkspace route={{ surface: "pricing-request", resourceId: reviewed.data.ref.id, resourceVersion: reviewed.data.ref.version }} repositories={repositories} session={contributor} onNavigate={vi.fn()} />);
    await screen.findByRole("region", { name: "Pricing request receipt" });
    expect(screen.getByText("In review")).toBeVisible();
    expect(screen.queryByText("Internal protected proposal evidence reference")).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Review pricing request" })).not.toBeInTheDocument();
    expect(screen.getByText("Version 2")).toBeVisible();
  });

  it("Given a Contributor's own list, when a request opens, then it routes to the exact receipt version", async () => {
    const { user, onNavigate } = openRole();
    await screen.findByRole("region", { name: "My pricing requests" });
    await user.click(screen.getByRole("button", { name: /Shelf price differs/ }));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ surface: "pricing-request", resourceId: "request-001", resourceVersion: "1", view: "detail" });
    expect(screen.getByRole("button", { name: "New request" })).toBeEnabled();
  });

  it("Given an unreadable request, when its row is clicked, then it does not navigate", async () => {
    const { user, onNavigate } = openRole({ listing: list({ items: [receipt({ allowedActions: [action("request.read", false)] })] }) });
    const row = await screen.findByRole("button", { name: /Shelf price differs/ });
    expect(row).toHaveAttribute("aria-disabled", "true");
    await user.click(row);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("Given an empty list and no create capability, when opened, then it has a calm empty state and no create action", async () => {
    openRole({ listing: list({ items: [], allowedActions: [action("request.read")] }) });
    expect(await screen.findByRole("heading", { name: "No requests yet" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /New request|Raise a pricing issue/ })).not.toBeInTheDocument();
  });

  it("Given an opaque next cursor, when the next page fails then succeeds, then current rows survive and Previous reuses the stored cursor", async () => {
    const first = list({ page: { cursor: null, nextCursor: "opaque-next-7c", limit: 25, totalCount: 2, totalCountRelation: "exact" } });
    const second = list({ items: [receipt({ ref: ref("request-002"), issue: "Another price issue" })], page: { cursor: "opaque-next-7c", nextCursor: null, limit: 25, totalCount: 2, totalCountRelation: "exact" } });
    const listRequests = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(repoError("The next page could not be loaded.", "NETWORK_ERROR")).mockResolvedValueOnce(second).mockResolvedValueOnce(first);
    const { user } = openRole({ overrides: { requests: { list: listRequests } } });
    const next = await screen.findByRole("button", { name: "Next request page" });
    expect(screen.getByRole("button", { name: "Previous request page" })).toBeDisabled();
    await user.click(next);
    expect(await screen.findByRole("alert")).toHaveTextContent("The next page could not be loaded.");
    expect(screen.getByRole("button", { name: /Shelf price differs/ })).toBeVisible();
    await user.click(next);
    expect(await screen.findByRole("button", { name: /Another price issue/ })).toBeVisible();
    expect(listRequests.mock.calls[1][0]).toEqual({ cursor: "opaque-next-7c", limit: 25 });
    expect(listRequests.mock.calls[2][0]).toEqual({ cursor: "opaque-next-7c", limit: 25 });
    expect(screen.getByRole("status")).toHaveTextContent("Page 2 · 1 shown");
    expect(screen.getByRole("button", { name: "Next request page" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous request page" }));
    expect(await screen.findByRole("button", { name: /Shelf price differs/ })).toBeVisible();
    expect(listRequests.mock.calls[3][0]).toEqual({ cursor: null, limit: 25 });
  });

  it("Given a page is loading, when the actor changes, then the new actor's list replaces it and a late old response is discarded", async () => {
    const first = list({ page: { cursor: null, nextCursor: "actor-one-next", limit: 25 } });
    let resolveOldPage;
    const delayedPage = new Promise((resolve) => { resolveOldPage = resolve; });
    const listRequests = vi.fn().mockResolvedValueOnce(first).mockReturnValueOnce(delayedPage).mockResolvedValueOnce(list({ items: [] }));
    const repositories = { requests: { list: listRequests } };
    const route = { surface: "pricing-requests" };
    const { rerender } = render(<RoleWorkspace route={route} repositories={repositories} session={session} onNavigate={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Next request page" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading requests…");
    expect(screen.getByRole("button", { name: /Shelf price differs/ })).toHaveAttribute("aria-disabled", "true");
    rerender(<RoleWorkspace route={route} repositories={repositories} session={{ ...session, actor: { id: "other-actor" } }} onNavigate={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "No requests yet" })).toBeVisible();
    await act(async () => { resolveOldPage(list({ items: [receipt({ issue: "Old actor secret" })] })); });
    expect(screen.queryByText("Old actor secret")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous request page" })).not.toBeInTheDocument();
  });

  it("Given a new request, when only its required text is entered, then submission trims it and does not imply an attachment upload", async () => {
    const { user, repositories, onNavigate } = openRole({ route: { surface: "pricing-request-new", view: "new" } });
    const submit = await screen.findByRole("button", { name: "Send request" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Product or SKU reference" }), "  KLD-PANT-0032  ");
    await user.type(screen.getByRole("textbox", { name: "Issue" }), "  Shelf price differs  ");
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "  The label differs from the till.  ");
    expect(screen.getByText("Text only in this sample. No files are uploaded.")).toBeVisible();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    await user.click(submit);
    await waitFor(() => expect(repositories.requests.create).toHaveBeenCalledOnce());
    expect(repositories.requests.create).toHaveBeenCalledWith({ productReference: "KLD-PANT-0032", issue: "Shelf price differs", reason: "The label differs from the till.", evidence: "", context: "", idempotencyKey: expect.any(String) });
    expect(onNavigate).toHaveBeenCalledWith({ surface: "pricing-request", resourceId: "request-001", resourceVersion: "1", view: "detail" });
  });

  it("Given an uncertain create response, when retried unchanged, then input and idempotency key are preserved", async () => {
    const create = vi.fn().mockRejectedValueOnce(repoError("Request could not be confirmed. Retry safely.")).mockResolvedValueOnce({ data: receipt() });
    const { user } = openRole({ route: { surface: "pricing-request-new" }, overrides: { requests: { create } } });
    await screen.findByRole("button", { name: "Send request" });
    await user.type(screen.getByRole("textbox", { name: "Product or SKU reference" }), "SKU-09");
    await user.type(screen.getByRole("textbox", { name: "Issue" }), "Wrong price");
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "Shelf label differs.");
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Request could not be confirmed");
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveValue("Shelf label differs.");
    await user.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1][0].idempotencyKey).toBe(create.mock.calls[0][0].idempotencyKey);
  });

  it("Given a Contributor receipt, when it includes unexpected protected metadata, then only safe receipt fields render", async () => {
    const request = receipt({ proposal: { title: "Confidential margin recovery", price: "999999" }, linkedProposalId: "SECRET-PROPOSAL", triage: { note: "Protected team note" }, allowedActions: [action("request.read"), action("request.triage", false)] });
    const { repositories, user, onNavigate } = openRole({ route: { surface: "pricing-request", resourceId: "request-001", resourceVersion: "1" }, request });
    await screen.findByRole("region", { name: "Pricing request receipt" });
    expect(repositories.requests.get).toHaveBeenCalledWith({ requestId: "request-001", requestVersion: "1" });
    expect(screen.queryByText(/Confidential margin recovery|SECRET-PROPOSAL|999999|Protected team note/)).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Review pricing request" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pricing requests" }));
    expect(onNavigate).toHaveBeenCalledWith({ surface: "pricing-requests", view: "list" });
  });

  it("Given manager triage capability, when a response is saved, then the exact request version is updated without a Proposal mutation", async () => {
    const request = receipt({ allowedActions: [action("request.read"), action("request.triage")] });
    const triage = vi.fn().mockResolvedValue({ data: receipt({ ref: ref("request-001", "2"), status: "resolved", triage: { note: "Label corrected." }, allowedActions: [action("request.read"), action("request.triage", false, "This request is complete.")] }) });
    const { user, onNavigate } = openRole({ route: { surface: "pricing-request", resourceId: "request-001", resourceVersion: "1" }, request, capabilities: ["request:triage"], overrides: { requests: { triage } } });
    const form = await screen.findByRole("form", { name: "Review pricing request" });
    await user.click(within(form).getByRole("combobox", { name: "Status" }));
    await user.click(screen.getByRole("option", { name: "Resolved", exact: true }));
    await user.type(within(form).getByRole("textbox", { name: "Internal review note" }), "Label corrected.");
    await user.click(within(form).getByRole("button", { name: "Update request" }));
    expect(await screen.findByText("This request is complete.")).toBeVisible();
    expect(triage).toHaveBeenCalledWith({ requestRef: request.ref, status: "resolved", note: "Label corrected.", idempotencyKey: expect.any(String) });
    expect(onNavigate).toHaveBeenCalledWith({ surface: "pricing-request", resourceId: "request-001", resourceVersion: "2", view: "detail" });
    expect(screen.getByRole("region", { name: "Internal review note" })).toHaveTextContent("Label corrected.");
    expect(screen.getByRole("button", { name: "Update request" })).toBeDisabled();
  });

  it("Given an expired read, when retry succeeds, then a useful error clears and the receipt is shown", async () => {
    const get = vi.fn().mockRejectedValueOnce(repoError("Request access expired. Refresh and try again.", "SESSION_EXPIRED")).mockResolvedValueOnce(receipt());
    const { user } = openRole({ route: { surface: "pricing-request", resourceId: "request-001" }, overrides: { requests: { get } } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Request access expired");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Pricing request receipt" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Given an obsolete exact receipt version, when it fails, then the Contributor can recover through Requests rather than a forbidden work queue", async () => {
    const get = vi.fn().mockRejectedValue(repoError("This request changed. Reload it to see the current status."));
    const { user, onNavigate } = openRole({ route: { surface: "pricing-request", resourceId: "request-001", resourceVersion: "1" }, capabilities: ["request:read:own"], overrides: { requests: { get } } });
    expect(await screen.findByRole("alert")).toHaveTextContent("This request changed");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Work queue" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pricing requests" }));
    expect(onNavigate).toHaveBeenCalledWith({ surface: "pricing-requests", view: "list" });
  });
});

describe("Company analyst policy capabilities", () => {
  it("Given an Account Owner label without the policy action, when Company access opens, then the setting remains read-only", async () => {
    const { user, repositories } = openRole({ route: { surface: "company-access" } });
    const toggle = await screen.findByRole("checkbox", { name: /Analysts can submit drafts/ });
    const policy = screen.getByRole("form", { name: "Analyst submission policy" });
    const members = screen.getByRole("region", { name: "Sample team access" });
    expect(policy.compareDocumentPosition(members) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(repositories.company.updateAnalystSubmission).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save policy" })).not.toBeInTheDocument();
  });

  it("Given the explicit policy capability, when saved, then the versioned policy and effective session are refreshed", async () => {
    const data = company({ allowedActions: [action("company.read"), action("company.policy.update")] });
    const next = company({ ...data, ref: ref("company-policy", "2"), policy: { analystCanSubmit: true } });
    const updateAnalystSubmission = vi.fn().mockResolvedValue({ data: next });
    const onSessionChange = vi.fn();
    const { user, repositories } = openRole({ route: { surface: "company-access" }, companyData: data, onSessionChange, overrides: { company: { updateAnalystSubmission } } });
    const toggle = await screen.findByRole("checkbox", { name: /Analysts can submit drafts/ });
    expect(screen.getByRole("button", { name: "Save policy" })).toBeDisabled();
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Save policy" }));
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledOnce());
    expect(updateAnalystSubmission).toHaveBeenCalledWith({ companyRef: data.ref, analystCanSubmit: true, idempotencyKey: expect.any(String) });
    expect(repositories.identity.getSession).toHaveBeenCalledOnce();
    expect(screen.getByText(/Policy version 2/)).toBeVisible();
  });
});

describe("Versioned analyst-to-manager handoff", () => {
  const draft = (overrides = {}) => ({ ref: ref("proposal-001", "3"), title: "August cost recovery", author: { id: "analyst", displayName: "Teni Adebayo" }, handoffCandidates: [{ id: "manager-1", displayName: "Ayo Adeyemi" }], allowedActions: [action("proposal.handoff")], ...overrides });

  it("Given company policy denies analyst submission, when handoff opens, then draft ownership is distinct from submission permission", () => {
    const reason = "Your company requires a Pricing Manager to submit. Hand off this draft.";
    render(<ProposalHandoff proposal={draft({ submissionOwner: { id: "analyst", displayName: "Teni Adebayo" }, submissionPolicy: { analystCanSubmit: false }, allowedActions: [action("proposal.handoff"), action("proposal.submit", false, reason)] })} proposals={{ handoff: vi.fn() }} />);
    expect(screen.getByText("Draft owner: Teni Adebayo.")).toBeVisible();
    expect(screen.getByText(reason)).toBeVisible();
    expect(screen.queryByText(/owns the next submission/)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Pricing Manager" })).toBeEnabled();
  });

  it("Given a draft-only analyst, when a manager is chosen, then a versioned confirmation is required before handoff", async () => {
    const proposal = draft();
    const result = { data: { ...proposal, submissionOwner: proposal.handoffCandidates[0] }, mutation: { state: "committed" } };
    const proposals = { handoff: vi.fn().mockResolvedValue(result) };
    const onHandoff = vi.fn();
    const user = userEvent.setup();
    render(<ProposalHandoff proposal={proposal} proposals={proposals} onHandoff={onHandoff} />);
    expect(screen.getByRole("button", { name: "Review handoff" })).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "Pricing Manager" }));
    await user.click(screen.getByRole("option", { name: /^Ayo Adeyemi(?:\s|$)/ }));
    await user.click(screen.getByRole("button", { name: "Review handoff" }));
    expect(proposals.handoff).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Confirm handoff of version 3" })).toHaveFocus();
    expect(screen.getByText(/Teni Adebayo remains the author/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm handoff" }));
    await waitFor(() => expect(onHandoff).toHaveBeenCalledWith(result));
    expect(proposals.handoff).toHaveBeenCalledWith({ proposalRef: proposal.ref, assigneeId: "manager-1", idempotencyKey: expect.any(String) });
  });

  it("Given handoff is denied, when opened, then there is a next-actor explanation and no manager picker", () => {
    render(<ProposalHandoff proposal={draft({ allowedActions: [action("proposal.handoff", false, "Only the draft owner can hand this version over.")] })} proposals={{ handoff: vi.fn() }} />);
    expect(screen.getByText("Only the draft owner can hand this version over.")).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("Given a stale draft, when confirmed, then the failure is visible without claiming successful handoff", async () => {
    const proposals = { handoff: vi.fn().mockRejectedValue(repoError("This draft has changed. Open its latest version.")) };
    const onHandoff = vi.fn();
    const user = userEvent.setup();
    render(<ProposalHandoff proposal={draft()} proposals={proposals} onHandoff={onHandoff} />);
    await user.click(screen.getByRole("combobox", { name: "Pricing Manager" }));
    await user.click(screen.getByRole("option", { name: /^Ayo Adeyemi(?:\s|$)/ }));
    await user.click(screen.getByRole("button", { name: "Review handoff" }));
    await user.click(screen.getByRole("button", { name: "Confirm handoff" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This draft has changed");
    expect(onHandoff).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Confirm handoff of version 3" })).toBeVisible();
  });

  it("Given draft-edit capability, when a title is saved, then only the title changes against the exact Proposal version", async () => {
    const proposal = draft({ allowedActions: [action("proposal.handoff"), action("proposal.draft.edit")] });
    const result = { data: { ...proposal, title: "September recovery", ref: ref("proposal-001", "4") } };
    const proposals = { updateDraft: vi.fn().mockResolvedValue(result), handoff: vi.fn() };
    const onHandoff = vi.fn();
    const user = userEvent.setup();
    render(<ProposalHandoff proposal={proposal} proposals={proposals} onHandoff={onHandoff} />);
    await user.click(screen.getByRole("button", { name: "Edit draft title" }));
    const title = screen.getByRole("textbox", { name: "Draft title" });
    expect(title).toHaveFocus();
    expect(screen.getByRole("button", { name: "Save title" })).toBeDisabled();
    expect(screen.getByText("Changes to prices or scope need a new Preview.")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Pricing Manager" })).toBeDisabled();
    await user.clear(title);
    await user.type(title, "  September recovery  ");
    await user.click(screen.getByRole("button", { name: "Save title" }));
    await waitFor(() => expect(onHandoff).toHaveBeenCalledWith(result));
    expect(proposals.updateDraft).toHaveBeenCalledExactlyOnceWith({ proposalRef: proposal.ref, title: "September recovery", idempotencyKey: expect.any(String) });
    expect(proposals.handoff).not.toHaveBeenCalled();
  });

  it("Given no draft-edit capability, when handoff opens, then no title editor is exposed", () => {
    render(<ProposalHandoff proposal={draft()} proposals={{ handoff: vi.fn(), updateDraft: vi.fn() }} />);
    expect(screen.queryByRole("button", { name: "Edit draft title" })).not.toBeInTheDocument();
  });

  it("Given a returned Proposal, when its next draft opens, then the reviewer and reviewed version are preserved with the reason", () => {
    render(<ProposalHandoff proposal={draft({ returnDecision: { actor: { displayName: "Chika Okafor" }, reason: "Confirm the updated supplier cost.", reviewedProposalRef: ref("proposal-001", "2"), decidedAt: "2026-09-08T10:20:00Z" } })} proposals={{ handoff: vi.fn() }} />);
    expect(screen.getByRole("heading", { name: "Returned for changes" })).toBeVisible();
    expect(screen.getByText("Confirm the updated supplier cost.")).toBeVisible();
    expect(screen.getByText(/Chika Okafor · Review of version 2/)).toBeVisible();
    expect(document.querySelector('time[datetime="2026-09-08T10:20:00Z"]')).toBeVisible();
  });
});
