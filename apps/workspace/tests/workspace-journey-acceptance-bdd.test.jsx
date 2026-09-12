import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceApp } from "../src/WorkspaceApp.jsx";
import { createFixtureWorkspaceRepositories, FIXTURE_ACTOR_IDS as ACTOR } from "../src/data/index.js";
import { createDomainErrorEnvelope, RepositoryError } from "../src/data/domainError.js";
import { workspaceHash } from "../src/workspaceRouting.js";
import { installWorkspaceSelectLayoutFixture } from "./helpers/workspaceSelectLayout.js";

installWorkspaceSelectLayoutFixture();
beforeEach(() => window.sessionStorage.clear());

const reason = "Rework the price adjustment to 4.25% and bring back fresh policy evidence.";
const safeError = (code, message) => new RepositoryError(createDomainErrorEnvelope({ code, message, traceId: "journey-acceptance-safe-error", domain: "proposal" }));

async function returnedProposal({ draftOnly = false } = {}) {
  const repositories = createFixtureWorkspaceRepositories();
  const start = await repositories.proposals.getDetail();
  const exception = await repositories.proposals.requestOverride({ proposalRef: start.ref, idempotencyKey: "acceptance-original-exception" });
  await repositories.identity.selectDesignEvidenceActor(ACTOR.chika);
  const ready = (await repositories.proposals.decideOverride({ overrideRef: exception.data.override.ref, decision: "approve", idempotencyKey: "acceptance-original-exception-decision" })).data.proposal;
  await repositories.identity.selectDesignEvidenceActor(ACTOR.teni);
  const submitted = (await repositories.proposals.submit({ proposalRef: ready.ref, idempotencyKey: "acceptance-original-submit" })).data;
  await repositories.identity.selectDesignEvidenceActor(ACTOR.chika);
  const returned = (await repositories.proposals.decide({ proposalRef: submitted.ref, decision: "reject", reason, idempotencyKey: "acceptance-original-return" })).data;
  if (draftOnly) {
    await repositories.identity.selectDesignEvidenceActor(ACTOR.owner);
    const company = await repositories.company.get();
    await repositories.company.updateAnalystSubmission({ companyRef: company.ref, analystCanSubmit: false, idempotencyKey: "acceptance-draft-only" });
  }
  await repositories.identity.selectDesignEvidenceActor(ACTOR.teni);
  return { repositories, submitted, returned };
}

function showProposal(repositories, proposal) {
  window.history.replaceState(null, "", workspaceHash({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "overview" }));
  render(<WorkspaceApp repositories={repositories} />);
  return userEvent.setup();
}

async function openRevision(user) {
  const trigger = await screen.findByRole("button", { name: "Revise pricing evidence" });
  trigger.focus();
  await user.keyboard("{Enter}");
  return screen.findByRole("region", { name: "Price adjustment" });
}

async function changeAdjustment(user, panel, value) {
  const input = within(panel).getByRole("textbox");
  await user.clear(input);
  await user.type(input, value);
  return input;
}

async function navigateTo(route) {
  await act(async () => {
    window.history.pushState(null, "", workspaceHash(route));
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

async function repairOperationalEvidence(repositories, ref) {
  let preview = await repositories.repricing.getPreview({ ref, limit: 200 });
  const lines = preview.lines.filter((line) => ["stale-cost", "dimension"].includes(line.issue?.kind));
  for (const [index, line] of lines.entries()) {
    const result = await repositories.repricing.remediateLine({ previewRef: preview.ref, lineId: line.id,
      action: line.issue.kind === "stale-cost" ? "refresh-cost" : "repair-dimension", idempotencyKey: `acceptance-operational-repair-${index}` });
    preview = await repositories.repricing.getPreview({ ref: result.data.ref, limit: 200 });
  }
  return preview;
}

describe("Connected returned-Proposal acceptance", () => {
  it("Given a returned Analyst draft, an actual 4.25% adjustment becomes a lineage-preserving replacement and requires fresh policy review before Manager submission", async () => {
    const { repositories, returned, submitted } = await returnedProposal({ draftOnly: true });
    const originalSource = await repositories.repricing.getPreview({ ref: submitted.sourcePreviewRef, limit: 200 });
    const save = vi.spyOn(repositories.repricing, "saveRule");
    const generate = vi.spyOn(repositories.repricing, "generatePreview");
    const create = vi.spyOn(repositories.proposals, "createFromPreview");
    const user = showProposal(repositories, returned);
    const adjustment = await openRevision(user);
    await changeAdjustment(user, adjustment, "4.25");
    await user.click(screen.getByRole("button", { name: "Save adjustment" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const savedRule = (await save.mock.results[0].value).data;
    expect(savedRule.rule.changeBasisPoints).toBe(425);
    expect(savedRule.revisionOrigin.sourceProposalRef).toEqual(returned.ref);
    await user.click(await screen.findByRole("button", { name: "Generate versioned Preview" }));
    await screen.findByRole("region", { name: "Repricing preview" });
    const generated = (await generate.mock.results[0].value).data;
    expect(generated.ruleRef).toEqual(savedRule.ref);
    expect(generated.revisionOrigin.sourceProposalRef).toEqual(returned.ref);
    expect(screen.getByText("₦1,681.03")).toBeVisible();
    expect(window.location.hash).toBe(workspaceHash({ surface: "repricing", resourceId: generated.ref.id, resourceVersion: generated.ref.version, view: "preview" }));
    expect(generated.blockers.staleCost + generated.blockers.dimension).toBeGreaterThan(0);
    expect(create).not.toHaveBeenCalled();
    expect((await repositories.proposals.getDetail()).ref).toEqual(returned.ref);

    // Remediation controls have their own connected BDD coverage. Prepare their
    // real repository outcome here, then continue the replacement through UI.
    const repaired = await repairOperationalEvidence(repositories, generated.ref);
    expect(repaired.blockers.staleCost + repaired.blockers.dimension).toBe(0);
    expect(repaired.blockers.margin).toBeGreaterThan(0);
    await navigateTo({ surface: "repricing", resourceId: repaired.ref.id, resourceVersion: repaired.ref.version, view: "preview" });
    const createButton = await screen.findByRole("button", { name: "Create Proposal" });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);
    const confirmation = screen.getByRole("dialog");
    await user.click(within(confirmation).getByRole("button", { name: "Create blocked Proposal" }));
    await screen.findByRole("tablist", { name: "Proposal views" });
    const replacement = await repositories.proposals.getDetail();
    expect(replacement.ref.id).toBe(returned.ref.id);
    expect(Number(replacement.ref.version)).toBeGreaterThan(Number(returned.ref.version));
    expect(replacement.sourcePreviewRef).toEqual(repaired.ref);
    expect(replacement.author.id).toBe(ACTOR.teni);
    expect(replacement.submissionOwner.id).toBe(ACTOR.teni);
    expect(replacement.returnDecision.reviewedProposalRef).toEqual(submitted.ref);
    expect(replacement.returnDecision.reason).toBe(reason);
    expect(replacement.revisionHistory.at(-1)).toMatchObject({ sourceProposalRef: returned.ref, sourcePreviewRef: returned.sourcePreviewRef, replacementProposalRef: replacement.ref, replacementPreviewRef: repaired.ref });
    expect(replacement.state).toBe("blocked");
    expect(replacement.override).toBeNull();
    expect(replacement.approval).toBeNull();
    expect(replacement.submission).toBeNull();
    expect(replacement.publicationRef).toBeNull();
    expect(replacement.allowedActions.find((action) => action.code === "proposal.submit").enabled).toBe(false);

    const historical = await repositories.proposals.getVersion({ proposalRef: submitted.ref });
    expect(historical.readOnlyEvidence).toBe(true);
    expect(historical.sourcePreviewRef).toEqual(submitted.sourcePreviewRef);
    expect(historical.state).toBe("submitted");
    expect(historical.allowedActions.filter((action) => action.code !== "proposal.read").every((action) => action.enabled === false)).toBe(true);
    await expect(repositories.proposals.getMarginEvidence({ proposalRef: submitted.ref })).rejects.toMatchObject({ envelope: { error: { code: "PROPOSAL_STALE_VERSION" } } });
    const sourceAfter = await repositories.repricing.getPreview({ ref: submitted.sourcePreviewRef, limit: 200 });
    expect(sourceAfter.lines).toEqual(originalSource.lines);

    const handoff = await screen.findByRole("region", { name: "Draft submission handoff" });
    expect((await repositories.identity.getSession()).effectiveCapabilities).not.toContain("proposal:submit");
    await user.click(within(handoff).getByRole("combobox", { name: "Pricing Manager" }));
    await user.click(screen.getByRole("option", { name: /^Ada(?:\s|$)/ }));
    await user.click(within(handoff).getByRole("button", { name: "Review handoff" }));
    expect(screen.getByRole("group", { name: `Confirm handoff of version ${replacement.ref.version}` })).toHaveFocus();
    await user.click(within(handoff).getByRole("button", { name: "Confirm handoff" }));
    await waitFor(async () => expect((await repositories.proposals.getDetail()).submissionOwner.id).toBe(ACTOR.manager));

    // A second, independently decided exception is deliberately required for
    // the new economics; the original exception must not satisfy this step.
    await repositories.identity.selectDesignEvidenceActor(ACTOR.manager);
    const assigned = await repositories.proposals.getDetail();
    const exception = await repositories.proposals.requestOverride({ proposalRef: assigned.ref, idempotencyKey: "acceptance-replacement-exception" });
    await repositories.identity.selectDesignEvidenceActor(ACTOR.chika);
    const ready = (await repositories.proposals.decideOverride({ overrideRef: exception.data.override.ref, decision: "approve", idempotencyKey: "acceptance-replacement-review" })).data.proposal;
    await repositories.identity.selectDesignEvidenceActor(ACTOR.manager);
    await navigateTo({ surface: "proposal", resourceId: ready.ref.id, resourceVersion: ready.ref.version, view: "overview" });
    await user.click(await screen.findByRole("button", { name: "Submit for independent review" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Submit for approval" }));
    await waitFor(async () => expect((await repositories.proposals.getDetail()).state).toBe("submitted"));
    const resubmitted = await repositories.proposals.getDetail();
    expect(resubmitted.author.id).toBe(ACTOR.teni);
    expect(resubmitted.submission.actor.id).toBe(ACTOR.manager);
    expect(resubmitted.sourcePreviewRef).toEqual(repaired.ref);
    expect(resubmitted.approval).toBeNull();
    expect(resubmitted.publicationRef).toBeNull();
  }, 30000);

  it("Given a created replacement, revisiting its generated Preview, repaired Preview and saved adjustment opens the exact current Proposal without rewriting the revision origin", async () => {
    const { repositories, returned } = await returnedProposal();
    const revision = (await repositories.proposals.startRevision({ proposalRef: returned.ref, idempotencyKey: "acceptance-navigation-revision" })).data;
    const rule = await repositories.repricing.getRule({ ref: revision.ruleRef });
    const saved = (await repositories.repricing.saveRule({ scopeRef: rule.scopeRef, ruleRef: rule.ref,
      rule: { ...rule.rule, changeBasisPoints: 425 }, effectiveAt: rule.effectiveAt, idempotencyKey: "acceptance-navigation-rule" })).data;
    const generated = (await repositories.repricing.generatePreview({ ruleRef: saved.ref, idempotencyKey: "acceptance-navigation-preview" })).data;
    const repaired = await repairOperationalEvidence(repositories, generated.ref);
    await repositories.proposals.createFromPreview({ sourcePreviewRef: repaired.ref, idempotencyKey: "acceptance-navigation-replacement" });
    const createdReplacement = await repositories.proposals.getDetail();
    const replacement = (await repositories.proposals.updateDraft({ proposalRef: createdReplacement.ref,
      title: "Cost recovery · replacement context", idempotencyKey: "acceptance-navigation-title-version" })).data;
    expect(Number(replacement.ref.version)).toBeGreaterThan(Number(createdReplacement.ref.version));
    const origin = saved.revisionOrigin;
    expect(origin.sourceProposalRef).toEqual(returned.ref);
    const create = vi.spyOn(repositories.proposals, "createFromPreview");
    const start = vi.spyOn(repositories.proposals, "startRevision");
    const user = showProposal(repositories, replacement);
    await screen.findByRole("tablist", { name: "Proposal views" });

    for (const route of [
      { surface: "repricing", resourceId: generated.ref.id, resourceVersion: generated.ref.version, view: "preview" },
      { surface: "repricing", resourceId: repaired.ref.id, resourceVersion: repaired.ref.version, view: "preview" },
      { surface: "repricing-rule", resourceId: saved.ref.id, resourceVersion: saved.ref.version, view: "rule" },
    ]) {
      await navigateTo(route);
      const context = await screen.findByRole("region", { name: "Pricing revision context" });
      expect(context).toHaveTextContent(`Pricing revision · from Proposal v${returned.ref.version}`);
      expect(context).toHaveTextContent(reason);
      expect(context).toHaveTextContent(`Continue with Proposal v${replacement.ref.version}.`);
      expect(within(context).queryByRole("button", { name: "Back to proposal" })).not.toBeInTheDocument();
      await user.click(within(context).getByRole("button", { name: "Open replacement" }));
      expect(window.location.hash).toBe(workspaceHash({ surface: "proposal", resourceId: replacement.ref.id, resourceVersion: replacement.ref.version, view: "overview" }));
      await screen.findByRole("tablist", { name: "Proposal views" });
      expect(await screen.findByRole("heading", { name: replacement.title })).toBeVisible();
    }

    expect(create).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect((await repositories.repricing.getRule({ ref: saved.ref })).revisionOrigin).toEqual(origin);
    expect((await repositories.repricing.getPreview({ ref: repaired.ref })).revisionOrigin).toEqual(origin);
    const intermediate = await repositories.repricing.getPreview({ ref: generated.ref });
    expect(intermediate.ref).toEqual(generated.ref);
    expect(intermediate.lines).toEqual(generated.lines);
    expect(intermediate.revisionOrigin).toEqual(origin);
    expect(intermediate.relatedProposalRef).toEqual(replacement.ref);
    expect(intermediate.allowedActions.find((action) => action.code === "proposal.create").enabled).toBe(false);
    expect(intermediate.allowedActions.find((action) => action.code === "proposal.read").enabled).toBe(false);
    expect((await repositories.proposals.getDetail()).ref).toEqual(replacement.ref);
  });

  it("Given a returned draft, when revision starts by keyboard, then its exact rule opens and unsupported adjustments cannot generate claimed evidence", async () => {
    const { repositories, returned, submitted } = await returnedProposal();
    const startRevision = vi.spyOn(repositories.proposals, "startRevision");
    const save = vi.spyOn(repositories.repricing, "saveRule");
    const generate = vi.spyOn(repositories.repricing, "generatePreview");
    const user = showProposal(repositories, returned);
    expect(await screen.findByText(reason)).toBeVisible();
    const panel = await openRevision(user);
    expect(startRevision).toHaveBeenCalledExactlyOnceWith({ proposalRef: returned.ref, idempotencyKey: expect.any(String) });
    const revision = (await startRevision.mock.results[0].value).data;
    expect(revision.sourceProposalRef).toEqual(returned.ref);
    expect(revision.returnDecision.reviewedProposalRef).toEqual(submitted.ref);
    expect(window.location.hash).toBe(workspaceHash({ surface: "repricing-rule", resourceId: revision.ruleRef.id, resourceVersion: revision.ruleRef.version, view: "rule" }));
    const input = await changeAdjustment(user, panel, "6.00");
    expect(input).toHaveValue("6.00");
    expect(screen.getByRole("button", { name: "Save adjustment" })).toBeDisabled();
    expect(panel).toHaveTextContent("Prepared outcomes: 3.50%, 4.25%, or NGN 25.00.");
    expect(save).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect((await repositories.proposals.getDetail()).ref).toEqual(returned.ref);
  });

  it("Given a returned draft, when starting revision conflicts with the current version, then the safe error remains in context without navigation or evidence mutation", async () => {
    const { repositories, returned } = await returnedProposal();
    const startRevision = vi.spyOn(repositories.proposals, "startRevision").mockRejectedValue(safeError("STALE_VERSION", "This Proposal changed. Open its current version before revising."));
    const generate = vi.spyOn(repositories.repricing, "generatePreview");
    const user = showProposal(repositories, returned);
    const trigger = await screen.findByRole("button", { name: "Revise pricing evidence" });
    const originalRoute = window.location.hash;
    await user.click(trigger);
    expect(await screen.findByRole("alert")).toHaveTextContent("This Proposal changed. Open its current version before revising.");
    expect(window.location.hash).toBe(originalRoute);
    expect(screen.getByText(reason)).toBeVisible();
    expect(startRevision).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
    expect((await repositories.proposals.getDetail()).ref).toEqual(returned.ref);
  });

  it("Given a new adjustment, when its save fails, then the exact user value survives and no preview or replacement is generated", async () => {
    const { repositories, returned } = await returnedProposal();
    const user = showProposal(repositories, returned);
    const panel = await openRevision(user);
    const save = vi.spyOn(repositories.repricing, "saveRule").mockRejectedValue(safeError("REPRICING_RULE_STALE_VERSION", "The adjustment changed elsewhere. Reopen its current version."));
    const generate = vi.spyOn(repositories.repricing, "generatePreview");
    const create = vi.spyOn(repositories.proposals, "createFromPreview");
    const input = await changeAdjustment(user, panel, "4.25");
    await user.click(screen.getByRole("button", { name: "Save adjustment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The adjustment changed elsewhere. Reopen its current version.");
    expect(input).toHaveValue("4.25");
    expect(save).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect((await repositories.proposals.getDetail()).sourcePreviewRef).toEqual(returned.sourcePreviewRef);
  });

  it.each([["Viewer", ACTOR.viewer], ["assigned reviewer", ACTOR.chika], ["unassigned manager", ACTOR.manager]])("Given a returned draft viewed by an %s, then revision has no enabled path and the old Proposal stays unchanged", async (_, actorId) => {
    const { repositories, returned } = await returnedProposal();
    await repositories.identity.selectDesignEvidenceActor(actorId);
    const startRevision = vi.spyOn(repositories.proposals, "startRevision");
    showProposal(repositories, returned);
    await screen.findByRole("heading", { name: returned.title });
    for (const button of screen.queryAllByRole("button", { name: /Revise pricing evidence|Continue pricing revision/ })) expect(button).toBeDisabled();
    expect(startRevision).not.toHaveBeenCalled();
    expect((await repositories.proposals.getDetail()).ref).toEqual(returned.ref);
  });

  it("Given a Contributor deep-links to a returned Proposal, then the read is denied and no downstream pricing evidence is fetched or exposed", async () => {
    const { repositories, returned } = await returnedProposal();
    await repositories.identity.selectDesignEvidenceActor(ACTOR.contributor);
    const preview = vi.spyOn(repositories.repricing, "getPreview");
    const startRevision = vi.spyOn(repositories.proposals, "startRevision");
    showProposal(repositories, returned);
    await screen.findByText(/not available for your role|not available to your role|access to this view|not authorised|not have access/i);
    expect(preview).not.toHaveBeenCalled();
    expect(startRevision).not.toHaveBeenCalled();
    expect(screen.queryByText(reason)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revise pricing evidence" })).not.toBeInTheDocument();
  });
});
