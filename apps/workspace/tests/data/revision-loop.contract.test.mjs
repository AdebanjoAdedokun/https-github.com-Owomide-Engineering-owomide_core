import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureWorkspaceRepositories, FixtureRepricingRepository, FIXTURE_ACTOR_IDS as ACTOR, findAllowedAction } from "../../src/data/index.js";

const denied = (code) => (error) => error.envelope?.error?.code === code;
const action = (record, code) => findAllowedAction(record.allowedActions, code);
const select = (repo, actor) => repo.identity.selectDesignEvidenceActor(ACTOR[actor]);
const reason = "Recheck the 18% cost margin using the prepared 4.25% adjustment before review.";

async function returnedDraft(repo, manager = false) {
  const original = await repo.proposals.getDetail();
  const request = await repo.proposals.requestOverride({ proposalRef: original.ref, idempotencyKey: "revision-ready-request" });
  await select(repo, "chika");
  let ready = (await repo.proposals.decideOverride({ overrideRef: request.data.override.ref, decision: "approve", idempotencyKey: "revision-ready-decision" })).data.proposal;
  await select(repo, "teni");
  if (manager) {
    ready = (await repo.proposals.handoff({ proposalRef: ready.ref, assigneeId: ACTOR.manager, idempotencyKey: "revision-ready-handoff" })).data;
    await select(repo, "manager");
  }
  const submitted = (await repo.proposals.submit({ proposalRef: ready.ref, idempotencyKey: "revision-first-submit" })).data;
  await select(repo, "chika");
  const returned = (await repo.proposals.decide({ proposalRef: submitted.ref, decision: "reject", reason, idempotencyKey: "revision-return-decision" })).data;
  await select(repo, manager ? "manager" : "teni");
  return { original, submitted, returned };
}

async function changedPreview(repo, returned) {
  const revision = (await repo.proposals.startRevision({ proposalRef: returned.ref, idempotencyKey: "revision-start-working-copy" })).data;
  const rule = await repo.repricing.getRule({ ref: revision.ruleRef });
  const saved = (await repo.repricing.saveRule({ scopeRef: rule.scopeRef, ruleRef: rule.ref, rule: { type: "percentage-change", changeBasisPoints: 425 }, effectiveAt: rule.effectiveAt, idempotencyKey: "revision-save-adjustment" })).data;
  const generated = (await repo.repricing.generatePreview({ ruleRef: saved.ref, idempotencyKey: "revision-generate-preview" })).data;
  return { revision, rule, saved, generated };
}

async function repairOperations(repo, generated) {
  let preview = await repo.repricing.getPreview({ ref: generated.ref, limit: 200 });
  const operational = preview.lines.filter((line) => ["stale-cost", "dimension"].includes(line.issue?.kind));
  assert.equal(operational.length, preview.blockers.staleCost + preview.blockers.dimension);
  for (const [index, line] of operational.entries()) {
    preview = (await repo.repricing.remediateLine({ previewRef: preview.ref, lineId: line.id, action: line.issue.kind === "stale-cost" ? "refresh-cost" : "repair-dimension", idempotencyKey: `revision-repair-${index}` })).data;
  }
  return preview;
}

test("Given returned manager-owned work, a pricing revision forks the exact retained inputs without changing the reviewed evidence", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const { returned, submitted } = await returnedDraft(repo, true);
  const source = await repo.repricing.getPreview({ ref: returned.sourcePreviewRef, limit: 200 });
  const before = await repo.proposals.getDetail();
  const request = { proposalRef: returned.ref, idempotencyKey: "revision-exact-start" };
  const started = await repo.proposals.startRevision(request);
  assert.equal(started.mutation.authoritative, false);
  assert.equal(started.mutation.applied, true);
  assert.deepEqual(started.data.sourceProposalRef, returned.ref);
  assert.deepEqual(started.data.sourcePreviewRef, returned.sourcePreviewRef);
  assert.deepEqual(started.data.returnDecision.reviewedProposalRef, submitted.ref);
  assert.equal(started.data.startedBy.id, ACTOR.manager);
  assert.equal(started.data.returnDecision.reason, reason);
  const after = await repo.proposals.getDetail();
  for (const field of ["ref", "author", "submissionOwner", "sourcePreviewRef", "returnDecision", "blockers", "counts", "activity"]) assert.deepEqual(after[field], before[field]);
  assert.deepEqual(await repo.repricing.getPreview({ ref: returned.sourcePreviewRef, limit: 200 }), source);
  const rule = await repo.repricing.getRule({ ref: started.data.ruleRef });
  assert.equal(rule.rule.changeBasisPoints, 350);
  assert.notDeepEqual(rule.ref, source.ruleRef);
  assert.deepEqual(rule.revisionOrigin.sourceProposalRef, returned.ref);
  assert.equal((await repo.proposals.startRevision(request)).mutation.deduplicated, true);
  const resume = await repo.proposals.startRevision({ ...request, idempotencyKey: "revision-resume-existing" });
  assert.equal(resume.mutation.applied, false);
  assert.deepEqual(resume.data.ruleRef, started.data.ruleRef);
  await assert.rejects(repo.proposals.startRevision({ ...request, proposalRef: submitted.ref }), denied("IDEMPOTENCY_KEY_REUSED"));
});

test("Given a changed prepared rule, replacement creation preserves author, owner and rejection lineage but requires fresh authority", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const { submitted, returned } = await returnedDraft(repo, true);
  const reviewedEvidence = await repo.proposals.getVersion({ proposalRef: submitted.ref });
  const { generated } = await changedPreview(repo, returned);
  assert.equal(generated.rule.changeBasisPoints, 425);
  assert.equal(generated.counts.eligible, 1215);
  assert.equal(generated.counts.total, 1248);
  await assert.rejects(repo.proposals.createFromPreview({ sourcePreviewRef: generated.ref, idempotencyKey: "revision-premature-create" }), denied("PROPOSAL_SOURCE_REMEDIATION_REQUIRED"));
  const repaired = await repairOperations(repo, generated);
  assert.equal(repaired.blockers.staleCost + repaired.blockers.dimension, 0);
  const request = { sourcePreviewRef: repaired.ref, title: "Returned adjustment · 4.25%", idempotencyKey: "revision-create-replacement" };
  const created = await repo.proposals.createFromPreview(request);
  const replacement = await repo.proposals.getDetail();
  assert.equal(created.data.ref.id, returned.ref.id);
  assert.equal(Number(created.data.ref.version), Number(returned.ref.version) + 1);
  assert.equal(replacement.author.id, ACTOR.teni);
  assert.equal(replacement.submissionOwner.id, ACTOR.manager);
  assert.deepEqual(replacement.sourcePreviewRef, repaired.ref);
  assert.deepEqual(replacement.revisionOrigin.sourceProposalRef, returned.ref);
  assert.equal(replacement.revisionOrigin.returnDecision.reason, reason);
  assert.ok(replacement.returnDecision.addressedAt);
  assert.deepEqual(replacement.returnDecision.replacementProposalRef, replacement.ref);
  assert.equal(replacement.override, null);
  assert.equal(replacement.submission, null);
  assert.equal(replacement.approval, null);
  assert.equal(replacement.publicationRef, null);
  assert.equal(replacement.operationalReconciliation, null);
  assert.equal(replacement.revisionHistory.length, 1);
  assert.equal(replacement.activity.at(-1).eventType, "proposal.pricing_revised");
  assert.deepEqual(await repo.proposals.getVersion({ proposalRef: submitted.ref }), reviewedEvidence);
  assert.equal((await repo.proposals.getVersion({ proposalRef: returned.ref })).allowedActions.filter((item) => item.enabled).length, 1);
  await assert.rejects(repo.proposals.getMarginEvidence({ proposalRef: submitted.ref }), denied("PROPOSAL_STALE_VERSION"));
  await assert.rejects(repo.proposals.submit({ proposalRef: replacement.ref, idempotencyKey: "revision-blocked-submit" }), denied("PROPOSAL_WRONG_STATE"));
  assert.equal((await repo.proposals.createFromPreview(request)).mutation.deduplicated, true);
  await assert.rejects(repo.proposals.startRevision({ proposalRef: returned.ref, idempotencyKey: "revision-stale-new-branch" }), denied("PROPOSAL_STALE_VERSION"));
  const exception = await repo.proposals.requestOverride({ proposalRef: replacement.ref, idempotencyKey: "revision-fresh-exception" });
  await select(repo, "chika");
  const ready = (await repo.proposals.decideOverride({ overrideRef: exception.data.override.ref, decision: "approve", idempotencyKey: "revision-fresh-exception-approval" })).data.proposal;
  await select(repo, "manager");
  const resubmitted = (await repo.proposals.submit({ proposalRef: ready.ref, idempotencyKey: "revision-fresh-submit" })).data;
  await assert.rejects(repo.proposals.approve({ proposalRef: resubmitted.ref, idempotencyKey: "revision-self-approval" }), denied("MAKER_CHECKER_REQUIRED"));
  await select(repo, "chika");
  const approved = (await repo.proposals.approve({ proposalRef: resubmitted.ref, idempotencyKey: "revision-independent-approval" })).data;
  assert.deepEqual(approved.approval.reviewedProposalRef, resubmitted.ref);
  assert.equal(approved.publicationRef, null);
});

test("Given a stale or wrong-owner revision attempt, the exact returned draft and unrelated prepared work remain protected", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const { returned, submitted } = await returnedDraft(repo, true);
  await select(repo, "teni");
  assert.equal(action(await repo.proposals.getDetail(), "proposal.revision.start").enabled, false);
  await assert.rejects(repo.proposals.startRevision({ proposalRef: returned.ref, idempotencyKey: "revision-wrong-owner" }), denied("WRONG_ACTOR"));
  await select(repo, "contributor");
  await assert.rejects(repo.proposals.startRevision({ proposalRef: returned.ref, idempotencyKey: "revision-contributor-denied" }), denied("MISSING_PERMISSION"));
  await select(repo, "manager");
  await assert.rejects(repo.proposals.startRevision({ proposalRef: submitted.ref, idempotencyKey: "revision-stale-source" }), denied("PROPOSAL_STALE_VERSION"));
  const { revision, generated } = await changedPreview(repo, returned);
  const scope = await repo.repricing.getScope({ ref: revision.scopeRef });
  await assert.rejects(repo.repricing.updateScope({ scopeRef: scope.ref, filters: { query: "arbitrary subset" }, idempotencyKey: "revision-arbitrary-scope" }), denied("REPRICING_SCOPE_CRITERIA_UNAVAILABLE"));
  const rule = await repo.repricing.getRule({ ref: generated.ruleRef });
  await assert.rejects(repo.repricing.saveRule({ scopeRef: rule.scopeRef, ruleRef: rule.ref, rule: { type: "percentage-change", changeBasisPoints: 999 }, effectiveAt: rule.effectiveAt, idempotencyKey: "revision-arbitrary-rule" }), denied("REPRICING_RULE_OUTCOME_UNAVAILABLE"));
  const repaired = await repairOperations(repo, generated);
  const changed = (await repo.proposals.updateDraft({ proposalRef: returned.ref, title: "A newer returned draft", idempotencyKey: "revision-concurrent-edit" })).data;
  await assert.rejects(repo.proposals.createFromPreview({ sourcePreviewRef: repaired.ref, idempotencyKey: "revision-concurrent-replace" }), denied("PROPOSAL_STALE_VERSION"));
  assert.deepEqual((await repo.proposals.getDetail()).ref, changed.ref);
  assert.equal(action(await repo.repricing.getPreview({ ref: repaired.ref }), "proposal.create").enabled, false);
});

test("Given an approved or resubmitted version, a prior pricing revision cannot overwrite its locked evidence", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const { returned } = await returnedDraft(repo);
  const { generated } = await changedPreview(repo, returned);
  const repaired = await repairOperations(repo, generated);
  const resubmitted = (await repo.proposals.submit({ proposalRef: returned.ref, idempotencyKey: "revision-old-draft-resubmit" })).data;
  await select(repo, "chika");
  const approved = (await repo.proposals.approve({ proposalRef: resubmitted.ref, idempotencyKey: "revision-old-draft-approve" })).data;
  await select(repo, "teni");
  await assert.rejects(repo.proposals.startRevision({ proposalRef: approved.ref, idempotencyKey: "revision-approved-forbidden" }), denied("WRONG_STATE"));
  await assert.rejects(repo.proposals.createFromPreview({ sourcePreviewRef: repaired.ref, idempotencyKey: "revision-approved-overwrite" }), denied("PROPOSAL_STALE_VERSION"));
  assert.deepEqual((await repo.proposals.getDetail()).approval, approved.approval);
  assert.deepEqual((await repo.proposals.getDetail()).sourcePreviewRef, approved.sourcePreviewRef);
});

test("Given restricted economics, decision text cannot leak through current, historical, or preview revision lineage", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const { returned } = await returnedDraft(repo);
  const { generated } = await changedPreview(repo, returned);
  await select(repo, "viewer");
  const openRevision = await repo.proposals.getDetail();
  assert.equal(JSON.stringify(openRevision).includes(reason), false);
  assert.equal(JSON.stringify(await repo.repricing.getPreview({ ref: generated.ref })).includes(reason), false);
  await select(repo, "teni");
  const repaired = await repairOperations(repo, generated);
  await repo.proposals.createFromPreview({ sourcePreviewRef: repaired.ref, idempotencyKey: "revision-private-replacement" });
  await select(repo, "viewer");
  for (const record of [await repo.proposals.getDetail(), await repo.proposals.getVersion({ proposalRef: returned.ref }), await repo.repricing.getPreview({ ref: repaired.ref })]) {
    assert.equal(JSON.stringify(record).includes(reason), false);
    assert.equal(JSON.stringify(record).includes("18%"), false);
  }
});

test("Given a second review return, its generated source survives the next revision as immutable read-only evidence", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const { returned } = await returnedDraft(repo);
  const { generated } = await changedPreview(repo, returned);
  const repaired = await repairOperations(repo, generated);
  const replacement = (await repo.proposals.createFromPreview({ sourcePreviewRef: repaired.ref, idempotencyKey: "revision-multicycle-replace" })).data;
  assert.deepEqual((await repo.repricing.getRule({ ref: generated.ruleRef })).relatedProposalRef, replacement.ref);
  const exception = await repo.proposals.requestOverride({ proposalRef: replacement.ref, idempotencyKey: "revision-multicycle-exception" });
  await select(repo, "chika");
  const ready = (await repo.proposals.decideOverride({ overrideRef: exception.data.override.ref, decision: "approve", idempotencyKey: "revision-multicycle-authorise" })).data.proposal;
  await select(repo, "teni");
  const submitted = (await repo.proposals.submit({ proposalRef: ready.ref, idempotencyKey: "revision-multicycle-submit" })).data;
  await select(repo, "chika");
  const secondReturned = (await repo.proposals.decide({ proposalRef: submitted.ref, decision: "reject", reason: "Review the absolute prepared adjustment instead.", idempotencyKey: "revision-multicycle-return" })).data;
  await select(repo, "teni");
  const before = await repo.repricing.getPreview({ ref: secondReturned.sourcePreviewRef, limit: 200 });
  const next = (await repo.proposals.startRevision({ proposalRef: secondReturned.ref, idempotencyKey: "revision-multicycle-start" })).data;
  const after = await repo.repricing.getPreview({ ref: secondReturned.sourcePreviewRef, limit: 200 });
  assert.equal(after.readOnlyEvidence, true);
  assert.deepEqual(after.ref, before.ref);
  assert.deepEqual(after.counts, before.counts);
  assert.deepEqual(after.blockers, before.blockers);
  assert.deepEqual(after.remediationEvidence, before.remediationEvidence);
  const economics = (preview) => preview.lines.map(({ id, proposedPrice, currentCost, policy, remediationEvidence }) => ({ id, proposedPrice, currentCost, policy, remediationEvidence }));
  assert.deepEqual(economics(after), economics(before));
  assert.equal(after.lines.every((line) => line.allowedRemediations.length === 0), true);
  assert.equal(action(after, "proposal.create").enabled, false);
  assert.deepEqual(next.sourceProposalRef, secondReturned.ref);
  assert.deepEqual(next.sourcePreviewRef, secondReturned.sourcePreviewRef);
  assert.equal((await repo.repricing.getRule({ ref: next.ruleRef })).rule.changeBasisPoints, 425);
  await assert.rejects(repo.proposals.createFromPreview({ sourcePreviewRef: after.ref, idempotencyKey: "revision-retained-reuse" }), denied("REPRICING_PREVIEW_STALE_VERSION"));
  assert.deepEqual((await repo.proposals.getDetail()).ref, secondReturned.ref);
});

test("Given an intermediate revision Preview, authorised navigation follows its replacement without rewriting lineage or broadening actions", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const { returned } = await returnedDraft(repo);
  const { generated } = await changedPreview(repo, returned);
  assert.deepEqual(generated.relatedProposalRef, returned.ref);
  assert.equal(action(generated, "proposal.read").enabled, false);
  const repaired = await repairOperations(repo, generated);
  const replacement = (await repo.proposals.createFromPreview({ sourcePreviewRef: repaired.ref, idempotencyKey: "revision-navigation-replace" })).data;
  const intermediate = await repo.repricing.getPreview({ ref: generated.ref, limit: 200 });
  assert.deepEqual(intermediate.relatedProposalRef, replacement.ref);
  assert.deepEqual(intermediate.revisionOrigin, generated.revisionOrigin);
  assert.deepEqual(intermediate.revisionOrigin.sourceProposalRef, returned.ref);
  assert.deepEqual(intermediate.ruleRef, generated.ruleRef);
  assert.equal(action(intermediate, "proposal.read").enabled, false);
  assert.equal(action(intermediate, "proposal.read").targetRef, null);
  assert.equal(action(intermediate, "proposal.create").enabled, false);
  assert.equal((await repo.repricing.getPreview({ ref: returned.sourcePreviewRef })).relatedProposalRef, undefined, "An unrelated canonical Preview must not inherit this lineage link.");
  await select(repo, "viewer");
  const viewer = await repo.repricing.getPreview({ ref: generated.ref });
  assert.deepEqual(viewer.relatedProposalRef, replacement.ref, "Proposal read permission authorises the lineage link, not internal economics.");
  assert.equal(JSON.stringify(viewer).includes(reason), false);
  assert.equal(viewer.lines.every((line) => line.currentCost === null), true);
  assert.equal(action(viewer, "proposal.read").enabled, false);
  await select(repo, "contributor");
  await assert.rejects(repo.repricing.getPreview({ ref: generated.ref }), denied("MISSING_PERMISSION"));
  // This explicit fixture adapter may read Preview evidence but has no
  // Proposal read capability. Its displayed role must not grant the link.
  const reviewOnly = new FixtureRepricingRepository({ runtime: { ...repo.repricing.runtime, designEvidenceCapabilities: ["proposal:review"] } });
  const deniedLink = await reviewOnly.getPreview({ ref: generated.ref });
  assert.equal(Object.hasOwn(deniedLink, "relatedProposalRef"), false);
  assert.equal(action(deniedLink, "proposal.read").enabled, false);
  assert.equal(action(deniedLink, "proposal.read").targetRef, null);
  assert.equal(JSON.stringify(deniedLink).includes(reason), false);
  assert.equal(Object.hasOwn(await reviewOnly.getRule({ ref: generated.ruleRef }), "relatedProposalRef"), false);
});
