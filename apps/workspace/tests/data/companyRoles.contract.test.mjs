import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureWorkspaceRepositories, FIXTURE_ACTOR_IDS as ACTOR, FIXTURE_AUDIT_EVENTS, findAllowedAction, FIXTURE_PROPOSAL_ID } from "../../src/data/index.js";

const select = (repo, actor) => repo.identity.selectDesignEvidenceActor(ACTOR[actor]);
const denied = (code) => (error) => error.envelope?.error?.code === code;
const action = (data, code) => findAllowedAction(data.allowedActions, code);
async function readyDraft(repo, owner = "teni") {
  await select(repo, owner);
  const current = await repo.proposals.getDetail();
  const requested = await repo.proposals.requestOverride({ proposalRef: current.ref, idempotencyKey: "roles-override-request" });
  await repo.identity.selectDesignEvidenceActor(current.assignedApprover.id);
  const decided = await repo.proposals.decideOverride({ overrideRef: requested.data.override.ref, decision: "approve", idempotencyKey: "roles-override-decide" });
  await select(repo, owner);
  return decided.data.proposal;
}
async function policy(repo, analystCanSubmit, key = "roles-company-policy") {
  await select(repo, "owner");
  const company = await repo.company.get();
  return repo.company.updateAnalystSubmission({ companyRef: company.ref, analystCanSubmit, idempotencyKey: key });
}
const requestInput = (suffix = "one") => ({ productReference: "KLD-PANT-0032", issue: "Shelf price differs", reason: "The displayed shelf price differs from the invoice.", evidence: "Sales visit note, 8 September", context: "Ibadan retail", idempotencyKey: `roles-request-${suffix}` });

test("Given the seven new role samples, when compared with canonical FX-010, then their identities are distinct and never inserted into historical audit evidence", async () => {
  const samples = ["manager", "owner", "contributor", "contributorPeer", "commercial", "executive", "viewer"];
  assert.equal(new Set(Object.values(ACTOR)).size, 11);
  for (const key of samples) {
    assert.match(ACTOR[key], /^[0-9a-f-]{36}$/);
    assert.equal(FIXTURE_AUDIT_EVENTS.some((event) => event.actorId === ACTOR[key]), false);
    const session = await select(createFixtureWorkspaceRepositories(), key);
    assert.equal(session.provenance.truthClass, "DEMO_ONLY");
    assert.equal(session.provenance.contractCompatibilityClaimed, false);
  }
});

test("Given two sample companies, when one owner disables analyst submission, then the other company and original compatibility default remain unchanged", async () => {
  const a = createFixtureWorkspaceRepositories();
  const b = createFixtureWorkspaceRepositories({ designEvidenceOrganisation: { id: "company-b", name: "Sample company B", timezone: "Africa/Lagos", baseCurrency: "NGN" } });
  assert.equal((await a.company.get()).policy.analystCanSubmit, true);
  const updated = await policy(a, false);
  assert.equal(updated.data.ref.version, "2");
  assert.equal(updated.mutation.authoritative, false);
  assert.equal(updated.data.history[0].actor.id, ACTOR.owner);
  const analystA = await select(a, "teni");
  assert.equal(analystA.effectiveCapabilities.includes("proposal:submit"), false);
  assert.equal(analystA.effectiveCapabilities.includes("proposal:draft:edit"), true);
  assert.equal((await b.company.get()).policy.analystCanSubmit, true);
  assert.equal((await b.identity.getSession()).effectiveCapabilities.includes("proposal:submit"), true);
  await policy(a, true, "roles-company-policy-on");
  assert.equal((await select(a, "teni")).effectiveCapabilities.includes("proposal:submit"), true);
});

test("Given a company policy, when unauthorized, stale, malformed or conflicting writes arrive, then only one owner mutation is recorded", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const company = await repo.company.get();
  const input = { companyRef: company.ref, analystCanSubmit: false, idempotencyKey: "roles-policy-replay" };
  await assert.rejects(repo.company.updateAnalystSubmission(input), denied("MISSING_PERMISSION"));
  await select(repo, "owner");
  const first = await repo.company.updateAnalystSubmission(input);
  const replay = await repo.company.updateAnalystSubmission(input);
  assert.deepEqual(replay.data, first.data);
  assert.equal(replay.mutation.deduplicated, true);
  await assert.rejects(repo.company.updateAnalystSubmission({ ...input, analystCanSubmit: true }), denied("IDEMPOTENCY_KEY_REUSED"));
  await assert.rejects(repo.company.updateAnalystSubmission({ ...input, idempotencyKey: "roles-policy-stale" }), denied("STALE_VERSION"));
  await assert.rejects(repo.company.updateAnalystSubmission({ ...input, analystCanSubmit: "false" }), denied("COMPANY_POLICY_INVALID"));
  assert.equal((await repo.company.get()).history.length, 1);
});

test("Given a ready analyst draft under draft-only policy, when the analyst edits and hands it to a manager, then original authorship and exact money scope survive", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const ready = await readyDraft(repo);
  await policy(repo, false);
  await select(repo, "teni");
  await assert.rejects(repo.proposals.submit({ proposalRef: ready.ref, idempotencyKey: "roles-submit-forbidden" }), denied("MISSING_PERMISSION"));
  const edited = await repo.proposals.updateDraft({ proposalRef: ready.ref, title: "September pricing review", idempotencyKey: "roles-edit-draft" });
  assert.equal(action(edited.data, "proposal.submit").enabled, false);
  assert.match(action(edited.data, "proposal.submit").reason.message, /Pricing Manager/);
  const input = { proposalRef: edited.data.ref, assigneeId: ACTOR.manager, idempotencyKey: "roles-handoff-ready" };
  const handed = await repo.proposals.handoff(input);
  assert.equal(handed.data.author.id, ACTOR.teni);
  assert.equal(handed.data.submissionOwner.id, ACTOR.manager);
  assert.deepEqual(handed.data.counts, ready.counts);
  assert.deepEqual(handed.data.sourcePreviewRef, ready.sourcePreviewRef);
  assert.equal(handed.data.state, "draft");
  assert.equal(handed.data.handoffHistory.length, 1);
  assert.equal((await repo.proposals.handoff(input)).mutation.deduplicated, true);
  await assert.rejects(repo.proposals.handoff({ ...input, assigneeId: ACTOR.owner }), denied("IDEMPOTENCY_KEY_REUSED"));
  const old = await repo.proposals.getVersion({ proposalRef: ready.ref });
  assert.equal(old.readOnlyEvidence, true);
  assert.equal(old.title, ready.title);
  assert.equal(old.allowedActions.filter((item) => item.enabled).length, 1);
  await select(repo, "manager");
  const submitted = await repo.proposals.submit({ proposalRef: handed.data.ref, idempotencyKey: "roles-manager-submit" });
  assert.equal(submitted.data.submission.actor.id, ACTOR.manager);
  assert.equal(submitted.data.author.id, ACTOR.teni);
  for (const actor of ["teni", "manager"]) {
    await select(repo, actor);
    await assert.rejects(repo.proposals.approve({ proposalRef: submitted.data.ref, idempotencyKey: `roles-self-approve-${actor}` }), denied("MAKER_CHECKER_REQUIRED"));
    await assert.rejects(repo.proposals.decide({ proposalRef: submitted.data.ref, decision: "reject", reason: "Needs review", idempotencyKey: `roles-self-reject-${actor}` }), denied("MAKER_CHECKER_REQUIRED"));
  }
});

test("Given a blocked draft, when it is handed off, then no blocker is waived and an old tab or invalid owner cannot mutate it", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const before = await repo.proposals.getDetail();
  await assert.rejects(repo.proposals.handoff({ proposalRef: before.ref, assigneeId: ACTOR.viewer, idempotencyKey: "roles-invalid-target" }), denied("HANDOFF_ASSIGNEE_INVALID"));
  const transferred = await repo.proposals.handoff({ proposalRef: before.ref, assigneeId: ACTOR.manager, idempotencyKey: "roles-blocked-handoff" });
  assert.deepEqual(transferred.data.blockers, before.blockers);
  assert.equal(transferred.data.state, "blocked");
  await assert.rejects(repo.proposals.updateDraft({ proposalRef: before.ref, title: "Stale", idempotencyKey: "roles-stale-edit" }), denied("PROPOSAL_STALE_VERSION"));
  await assert.rejects(repo.proposals.updateDraft({ proposalRef: transferred.data.ref, title: "Wrong owner", idempotencyKey: "roles-wrong-owner" }), denied("WRONG_ACTOR"));
  await select(repo, "manager");
  await assert.rejects(repo.proposals.submit({ proposalRef: transferred.data.ref, idempotencyKey: "roles-blocked-submit" }), denied("PROPOSAL_WRONG_STATE"));
  const ready = await readyDraft(repo, "manager");
  assert.equal(ready.author.id, ACTOR.teni);
  assert.equal(ready.override.requester.id, ACTOR.manager);
  assert.equal(ready.readiness, "ready_to_submit");
});

test("Given submitted work, when the assigned reviewer returns it, then a new draft needs fresh submission and review while prior evidence stays immutable", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const ready = await readyDraft(repo);
  const submitted = await repo.proposals.submit({ proposalRef: ready.ref, idempotencyKey: "roles-return-submit" });
  await select(repo, "chika");
  assert.equal(action(await repo.proposals.getDetail(), "proposal.reject").enabled, true);
  const input = { proposalRef: submitted.data.ref, decision: "reject", reason: "Clarify the intended effective date.", idempotencyKey: "roles-return-decision" };
  const returned = await repo.proposals.decide(input);
  assert.equal(returned.data.state, "draft");
  assert.equal(returned.data.approval, null);
  assert.equal(returned.data.publicationRef, null);
  assert.equal(returned.data.submission, null);
  assert.deepEqual(returned.data.blockers, submitted.data.blockers);
  assert.equal(returned.data.returnDecision.reviewedProposalRef.version, submitted.data.ref.version);
  assert.equal((await repo.proposals.decide(input)).mutation.deduplicated, true);
  const prior = await repo.proposals.getVersion({ proposalRef: submitted.data.ref });
  assert.equal(prior.state, "submitted");
  assert.equal(prior.readOnlyEvidence, true);
  await assert.rejects(repo.proposals.approve({ proposalRef: submitted.data.ref, idempotencyKey: "roles-return-old-approve" }), denied("PROPOSAL_STALE_VERSION"));
  await assert.rejects(repo.proposals.approve({ proposalRef: returned.data.ref, idempotencyKey: "roles-return-early-approve" }), denied("PROPOSAL_WRONG_STATE"));
  await select(repo, "farida");
  await assert.rejects(repo.publishing.start({ proposalRef: returned.data.ref, idempotencyKey: "roles-return-early-publish" }), denied("PUBLICATION_WRONG_STATE"));
  await select(repo, "teni");
  const resubmitted = await repo.proposals.submit({ proposalRef: returned.data.ref, idempotencyKey: "roles-return-resubmit" });
  await select(repo, "chika");
  const approved = await repo.proposals.decide({ proposalRef: resubmitted.data.ref, decision: "approve", idempotencyKey: "roles-return-fresh-approve" });
  assert.equal(approved.data.approval.reviewedProposalRef.version, resubmitted.data.ref.version);
  assert.equal(approved.data.state, "approved");
  await select(repo, "farida");
  const published = await repo.publishing.start({ proposalRef: approved.data.ref, idempotencyKey: "roles-return-valid-publish" });
  assert.deepEqual(published.data.proposalRef, approved.data.ref);
});

for (const stage of ["commercial", "executive"]) {
  test(`Given ${stage} review is assigned, when another authority decides, then only the assigned actor can use the reusable decision action`, async () => {
    const repo = createFixtureWorkspaceRepositories({ designEvidenceApprovalStage: stage });
    const ready = await readyDraft(repo);
    const submitted = await repo.proposals.submit({ proposalRef: ready.ref, idempotencyKey: `roles-${stage}-submit` });
    await select(repo, stage === "commercial" ? "executive" : "commercial");
    const wrong = await repo.proposals.getDetail();
    assert.equal(wrong.approvalStage.mode, "single-assigned-stage");
    assert.equal(action(wrong, "proposal.approve").enabled, false);
    await assert.rejects(repo.proposals.approve({ proposalRef: submitted.data.ref, idempotencyKey: `roles-${stage}-wrong-approve` }), denied("WRONG_ACTOR"));
    await assert.rejects(repo.proposals.decide({ proposalRef: submitted.data.ref, decision: "reject", reason: "Wrong authority", idempotencyKey: `roles-${stage}-wrong-reject` }), denied("WRONG_ACTOR"));
    await select(repo, stage);
    const result = await repo.proposals.decide({ proposalRef: submitted.data.ref, decision: "approve", idempotencyKey: `roles-${stage}-approved` });
    assert.equal(result.data.approval.actor.id, ACTOR[stage]);
    assert.equal(result.data.approval.authority.code, stage);
  });
}

test("Given a contributor, when a concern is submitted and retried, then only a safe own-request receipt is returned and no proposal is created", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const before = await repo.proposals.getDetail();
  await select(repo, "contributor");
  const result = await repo.requests.create(requestInput());
  assert.equal(result.mutation.authoritative, false);
  assert.equal(result.data.evidenceType, "text");
  assert.equal(result.data.status, "submitted");
  assert.equal(result.data.triage, null);
  assert.equal((await repo.requests.create(requestInput())).mutation.deduplicated, true);
  const list = await repo.requests.list();
  assert.equal(list.viewScope, "own");
  assert.equal(list.items.length, 1);
  assert.equal(action(list, "request.create").enabled, true);
  assert.equal(action(list, "request.triage").enabled, false);
  assert.equal(JSON.stringify(list).includes(FIXTURE_PROPOSAL_ID), false);
  for (const key of ["proposalId", "proposalRef", "cost", "price", "margin", "assignedApprover"]) assert.equal(Object.hasOwn(result.data, key), false);
  await assert.rejects(repo.requests.create({ ...requestInput(), reason: "Different reason" }), denied("IDEMPOTENCY_KEY_REUSED"));
  await select(repo, "teni");
  assert.deepEqual((await repo.proposals.getDetail()).ref, before.ref);
});

test("Given pricing requests from two contributors, when ownership, tenant or cursor context differs, then other request data is not disclosed", async () => {
  const repo = createFixtureWorkspaceRepositories();
  await select(repo, "contributor");
  const first = await repo.requests.create(requestInput("first"));
  await repo.requests.create(requestInput("second"));
  const page = await repo.requests.list({ limit: 1 });
  assert.ok(page.page.nextCursor);
  const secondPage = await repo.requests.list({ limit: 1, cursor: page.page.nextCursor });
  assert.notEqual(secondPage.items[0].ref.id, page.items[0].ref.id);
  await select(repo, "contributorPeer");
  assert.equal((await repo.requests.list()).items.length, 0);
  await assert.rejects(repo.requests.get({ requestId: first.data.ref.id }), denied("REQUEST_NOT_FOUND"));
  await assert.rejects(repo.requests.list({ cursor: page.page.nextCursor }), denied("CURSOR_INVALID"));
  const otherTenant = createFixtureWorkspaceRepositories({ designEvidenceOrganisation: { id: "other-company", name: "Other sample", timezone: "Africa/Lagos", baseCurrency: "NGN" } });
  await select(otherTenant, "contributor");
  await assert.rejects(otherTenant.requests.get({ requestId: first.data.ref.id }), denied("REQUEST_NOT_FOUND"));
});

test("Given a manager triages a concern, when the contributor checks status, then internal decision notes stay private and exact-version updates are enforced", async () => {
  const repo = createFixtureWorkspaceRepositories();
  await select(repo, "contributor");
  const created = await repo.requests.create(requestInput());
  const input = { requestRef: created.data.ref, status: "reviewing", note: `Internal linked work ${FIXTURE_PROPOSAL_ID}`, idempotencyKey: "roles-triage-review" };
  await assert.rejects(repo.requests.triage(input), denied("MISSING_PERMISSION"));
  await select(repo, "manager");
  assert.equal((await repo.requests.list()).viewScope, "team");
  const reviewed = await repo.requests.triage(input);
  assert.equal(reviewed.data.triage.actor.id, ACTOR.manager);
  assert.equal((await repo.requests.triage(input)).mutation.deduplicated, true);
  await assert.rejects(repo.requests.triage({ ...input, idempotencyKey: "roles-triage-stale" }), denied("STALE_VERSION"));
  const closed = await repo.requests.triage({ requestRef: reviewed.data.ref, status: "resolved", note: "Confirmed corrected reference.", idempotencyKey: "roles-triage-close" });
  assert.equal(action(closed.data, "request.triage").enabled, false);
  await assert.rejects(repo.requests.triage({ requestRef: closed.data.ref, status: "reviewing", note: "Reopen", idempotencyKey: "roles-triage-reopen" }), denied("REQUEST_WRONG_STATE"));
  await select(repo, "contributor");
  const safe = await repo.requests.get({ requestId: created.data.ref.id });
  assert.equal(safe.status, "resolved");
  assert.equal(safe.triage, null);
  assert.equal(JSON.stringify(safe).includes(FIXTURE_PROPOSAL_ID), false);
  await assert.rejects(repo.requests.get({ requestId: created.data.ref.id, requestVersion: "1" }), denied("STALE_VERSION"));
});

test("Given Contributor permissions, when protected repositories are called directly or an old mutation key is replayed, then work and financial evidence remain inaccessible", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const original = await repo.proposals.getDetail();
  const comment = { proposalRef: original.ref, body: "Protected note", idempotencyKey: "roles-protected-comment" };
  await repo.proposals.addComment(comment);
  await select(repo, "contributor");
  const calls = [
    () => repo.catalog.list(), () => repo.catalog.getDetail({ skuId: "not-visible" }), () => repo.imports.list(),
    () => repo.repricing.getScope(), () => repo.repricing.getPreview(), () => repo.rules.list(),
    () => repo.proposals.list(), () => repo.proposals.getDetail(), () => repo.proposals.getVersion({ proposalRef: original.ref }),
    () => repo.proposals.listComments({ proposalRef: original.ref }), () => repo.proposals.addComment(comment),
    () => repo.proposals.getMarginEvidence({ proposalRef: original.ref }), () => repo.company.get(),
    () => repo.proposals.submit({ proposalRef: original.ref, idempotencyKey: "roles-protected-submit" }),
    () => repo.proposals.approve({ proposalRef: original.ref, idempotencyKey: "roles-protected-approve" }),
    () => repo.audit.list(), () => repo.audit.getProposalHistory({ proposalId: original.ref.id }),
    () => repo.publishing.start({ proposalRef: original.ref, idempotencyKey: "roles-protected-publish" }),
  ];
  for (const call of calls) await assert.rejects(call, denied("MISSING_PERMISSION"));
  await assert.rejects(repo.workQueue.list(), denied("MISSING_PERMISSION"));
});

test("Given the Viewer and owner sample roles, when authority is resolved, then neither silently inherits pricing mutation or executive powers", async () => {
  const repo = createFixtureWorkspaceRepositories();
  await select(repo, "viewer");
  const detail = await repo.proposals.getDetail();
  for (const code of ["proposal.handoff", "proposal.submit", "proposal.approve", "proposal.reject", "publication.start"]) assert.equal(action(detail, code).enabled, false);
  await assert.rejects(repo.requests.list(), denied("MISSING_PERMISSION"));
  const owner = await select(repo, "owner");
  assert.deepEqual(owner.effectiveCapabilities, ["company:read", "company:policy:update"]);
  await assert.rejects(repo.proposals.getDetail(), denied("MISSING_PERMISSION"));
  const roleCodes = (await repo.company.get()).members.flatMap((member) => member.roleCodes);
  for (const absent of ["workspace_admin", "vendor_manager", "forward_deployed_engineer", "ai_assistant"]) assert.equal(roleCodes.includes(absent), false);
});

test("Given malformed intake, when submitted, then no fake evidence uploads or empty business requests are accepted", async () => {
  const repo = createFixtureWorkspaceRepositories();
  await select(repo, "contributor");
  for (const input of [{ ...requestInput(), productReference: " " }, { ...requestInput(), reason: " " }, { ...requestInput(), evidence: { fileName: "fake.pdf" } }, { ...requestInput(), issue: "x".repeat(121) }]) await assert.rejects(repo.requests.create(input), denied("REQUEST_INVALID"));
  const result = await repo.requests.create({ ...requestInput(), evidence: undefined, context: undefined });
  assert.equal(result.data.evidence, "");
  assert.equal(result.data.context, "");
  assert.equal((await repo.requests.list()).items.length, 1);
  await repo.identity.signOut();
  await assert.rejects(repo.requests.list(), denied("SESSION_REQUIRED"));
});

test("Given a handed-off draft and a subsequent return, when each actor opens Work, then the exact next owner and current version follow the journey", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const ready = await readyDraft(repo);
  const handed = await repo.proposals.handoff({ proposalRef: ready.ref, assigneeId: ACTOR.manager, idempotencyKey: "roles-queue-handoff" });
  const queued = async () => (await repo.workQueue.list({ type: "proposal" })).items[0];
  assert.equal((await queued()).nextActorId, ACTOR.manager);
  assert.equal((await queued()).needsCurrentActor, false);
  await select(repo, "manager");
  assert.equal((await queued()).needsCurrentActor, true);
  assert.deepEqual((await queued()).ref, handed.data.ref);
  const submitted = await repo.proposals.submit({ proposalRef: handed.data.ref, idempotencyKey: "roles-queue-submit" });
  assert.equal((await queued()).nextActorId, ACTOR.chika);
  assert.equal((await queued()).needsCurrentActor, false);
  await select(repo, "chika");
  assert.equal((await queued()).needsCurrentActor, true);
  const returned = await repo.proposals.decide({ proposalRef: submitted.data.ref, decision: "reject", reason: "Recheck effective date.", idempotencyKey: "roles-queue-return" });
  const next = await queued();
  assert.equal(next.title, "Revise returned Proposal");
  assert.equal(next.nextActorId, ACTOR.manager);
  assert.deepEqual(next.ref, returned.data.ref);
  assert.equal(next.needsCurrentActor, false);
  await select(repo, "manager");
  assert.equal((await queued()).needsCurrentActor, true);
  await select(repo, "contributor");
  await assert.rejects(repo.workQueue.list(), denied("MISSING_PERMISSION"));
});

test("Given the sample Viewer without economics permission, when Catalog, Preview and retained margin evidence are read directly, then economics never reach the client", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const catalogBefore = await repo.catalog.list();
  const previewBefore = await repo.repricing.getPreview({ limit: 200 });
  await select(repo, "viewer");
  const catalog = await repo.catalog.list();
  for (const item of catalog.items) {
    assert.equal(item.currentCost, null);
    assert.equal(item.marginBasisPoints, null);
    assert.equal(item.fieldVisibility.economics, "restricted");
    const detail = await repo.catalog.getDetail({ skuId: item.id });
    assert.equal(detail.summary.currentCost, null);
    assert.equal(detail.summary.marginBasisPoints, null);
  }
  assert.deepEqual(catalog.items[0].currentPrice, catalogBefore.items[0].currentPrice);
  const preview = await repo.repricing.getPreview({ limit: 200 });
  assert.deepEqual(preview.counts, previewBefore.counts);
  assert.deepEqual(preview.lines[0].proposedPrice, previewBefore.lines[0].proposedPrice);
  assert.equal(preview.fieldVisibility.economics, "restricted");
  const proposal = await repo.proposals.getDetail();
  const evidence = await repo.proposals.getMarginEvidence({ proposalRef: proposal.ref });
  assert.deepEqual(evidence.policySnapshot.floorRangeBasisPoints, { minimum: null, maximum: null });
  for (const line of [...preview.lines, ...evidence.lines]) {
    assert.equal(line.currentCost, null);
    assert.equal(line.currentMarginBasisPoints, null);
    assert.equal(line.proposedMarginBasisPoints, null);
    assert.equal(line.policy.floorPrice, null);
    assert.equal(line.policy.floorBasisPoints, null);
    assert.equal(line.policy.evaluation.appliedRule, null);
    assert.deepEqual(line.policy.evaluation.matchingChain, []);
    assert.equal(line.policy.evaluation.evaluationHash, null);
    assert.equal(line.policy.evaluation.status, "restricted");
    assert.equal(line.remediationInputs, null);
    assert.equal(line.remediationEvidence, null);
    assert.deepEqual(line.allowedRemediations, []);
  }
  await assert.rejects(repo.proposals.listComments({ proposalRef: proposal.ref }), denied("MISSING_PERMISSION"));
  await assert.rejects(repo.rules.list(), denied("MISSING_PERMISSION"));
  await assert.rejects(repo.audit.list(), denied("MISSING_PERMISSION"));
  await assert.rejects(repo.audit.getEntityHistory({ entityType: "proposal", entityId: proposal.ref.id }), denied("MISSING_PERMISSION"));
  await select(repo, "teni");
  assert.deepEqual((await repo.repricing.getPreview({ limit: 200 })).lines, previewBefore.lines);
  assert.deepEqual((await repo.catalog.list()).items, catalogBefore.items);
});

test("Given sensitive decision notes and historical versions, when a Viewer reads current or retained Proposal details, then free-text financial evidence is withheld too", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const ready = await readyDraft(repo);
  const submitted = await repo.proposals.submit({ proposalRef: ready.ref, idempotencyKey: "roles-redaction-submit" });
  await select(repo, "chika");
  const secret = "Confidential economics: cost 151550, floor 176221.";
  await repo.proposals.decide({ proposalRef: submitted.data.ref, decision: "reject", reason: secret, idempotencyKey: "roles-redaction-return" });
  await select(repo, "viewer");
  const current = await repo.proposals.getDetail();
  const historical = await repo.proposals.getVersion({ proposalRef: submitted.data.ref });
  assert.equal(current.fieldVisibility.economics, "restricted");
  assert.equal(historical.fieldVisibility.economics, "restricted");
  assert.equal(JSON.stringify(current).includes(secret), false);
  assert.equal(current.override.reason, "Pricing economics require separate permission.");
  assert.equal(current.returnDecision.reason, "Pricing economics require separate permission.");
  assert.equal(historical.override.evidence, "Pricing economics require separate permission.");
});

test("Given the Proposal directory after handoff, submission and return, when a participant or Viewer reads it, then ownership and Needs me follow actual versioned authority", async () => {
  const repo = createFixtureWorkspaceRepositories();
  const ready = await readyDraft(repo);
  const handed = await repo.proposals.handoff({ proposalRef: ready.ref, assigneeId: ACTOR.manager, idempotencyKey: "roles-directory-handoff" });
  const row = async () => (await repo.proposals.list()).items[0];
  const formerOwner = await row();
  assert.equal(formerOwner.author.id, ACTOR.teni);
  assert.equal(formerOwner.owner.id, ACTOR.manager);
  assert.equal(formerOwner.submissionOwner.id, ACTOR.manager);
  assert.equal(formerOwner.nextActor.id, ACTOR.manager);
  assert.equal(formerOwner.needsCurrentActor, false);
  assert.deepEqual(formerOwner.ref, handed.data.ref);
  await select(repo, "viewer");
  assert.equal((await row()).owner.id, ACTOR.manager);
  assert.equal((await row()).needsCurrentActor, false);
  await select(repo, "manager");
  assert.equal((await row()).needsCurrentActor, true);
  const submitted = await repo.proposals.submit({ proposalRef: handed.data.ref, idempotencyKey: "roles-directory-submit" });
  assert.equal((await row()).nextActor.id, ACTOR.chika);
  assert.equal((await row()).needsCurrentActor, false);
  await select(repo, "chika");
  assert.equal((await row()).needsCurrentActor, true);
  const returned = await repo.proposals.decide({ proposalRef: submitted.data.ref, decision: "reject", reason: "Clarify scope", idempotencyKey: "roles-directory-return" });
  assert.equal((await row()).nextActor.id, ACTOR.manager);
  assert.equal((await row()).needsCurrentActor, false);
  await select(repo, "manager");
  const resumed = await row();
  assert.equal(resumed.needsCurrentActor, true);
  assert.equal(resumed.author.id, ACTOR.teni);
  assert.deepEqual(resumed.ref, returned.data.ref);
  await select(repo, "viewer");
  assert.equal((await row()).needsCurrentActor, false);
});
