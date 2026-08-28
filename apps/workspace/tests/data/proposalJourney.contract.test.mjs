import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIXTURE_ACTOR_IDS,
  FIXTURE_AUDIT_EVENTS,
  FIXTURE_OVERRIDE_ID,
  FIXTURE_PROPOSAL_ID,
  FIXTURE_PUBLICATION_ID,
  FIXTURE_PUBLISH_IDEMPOTENCY_KEY,
  RepositoryError,
  assertAuditHistory,
  assertOverrideRequest,
  assertProposalDetail,
  assertPublicationOperation,
  createFixtureWorkspaceRepositories,
  findAllowedAction,
} from "../../src/data/index.js";

async function requestAndApproveOverride(repositories) {
  const blocked = await repositories.proposals.getDetail();
  const requested = await repositories.proposals.requestOverride({
    proposalRef: blocked.ref,
    idempotencyKey: "bdd-override-request-0001",
  });
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.chika);
  const decided = await repositories.proposals.decideOverride({
    overrideRef: requested.data.override.ref,
    decision: "approve",
    idempotencyKey: "bdd-override-decision-0001",
  });
  return decided.data.proposal;
}

async function submitAndApproveProposal(repositories) {
  const ready = await requestAndApproveOverride(repositories);
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.teni);
  const submitted = await repositories.proposals.submit({
    proposalRef: ready.ref,
    idempotencyKey: "bdd-proposal-submit-0001",
  });
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.chika);
  const approved = await repositories.proposals.approve({
    proposalRef: submitted.data.ref,
    idempotencyKey: "bdd-proposal-approve-0001",
  });
  return approved.data;
}

async function startPublication(repositories) {
  const approved = await submitAndApproveProposal(repositories);
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.farida);
  const started = await repositories.publishing.start({
    proposalRef: approved.ref,
    idempotencyKey: FIXTURE_PUBLISH_IDEMPOTENCY_KEY,
  });
  return started.data;
}

async function repairOperationalBlockers(repositories, sourceRef, keyPrefix) {
  let preview = await repositories.repricing.getPreview({ ref: sourceRef, limit: 200 });
  const repairable = preview.lines.filter((line) => ["stale-cost", "dimension"].includes(line.issue?.kind));
  for (const [index, line] of repairable.entries()) {
    const action = line.issue.kind === "stale-cost" ? "refresh-cost" : "repair-dimension";
    const result = await repositories.repricing.remediateLine({
      previewRef: preview.ref,
      lineId: line.id,
      action,
      idempotencyKey: `${keyPrefix}-${index}-0001`,
    });
    preview = await repositories.repricing.getPreview({ ref: result.data.ref, limit: 200 });
  }
  return preview;
}

test("Given the design fixture, when evidence actors are selected, then resolved sessions expose distinct server-shaped capabilities", async () => {
  const { identity } = createFixtureWorkspaceRepositories();

  const actors = await identity.listDesignEvidenceActors();
  const chika = await identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.chika);

  assert.equal(actors.length, 4);
  assert.deepEqual(actors.map((session) => session.actor.id), Object.values(FIXTURE_ACTOR_IDS));
  assert.deepEqual(chika.roleCodes, ["approver"]);
  assert.ok(chika.effectiveCapabilities.includes("proposal:approve"));
  assert.equal(chika.provenance.truthClass, "DEMO_ONLY");
});

test("Given canonical FX-010 v3, when Proposal detail loads for Teni, then blockers, lineage and server actions are preserved", async () => {
  const detail = await createFixtureWorkspaceRepositories().proposals.getDetail();

  assertProposalDetail(detail);
  assert.deepEqual(detail.ref, { kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "3" });
  assert.equal(detail.state, "blocked");
  assert.equal(detail.readiness, "blocked");
  assert.deepEqual(detail.counts, { selected: 1227, eligible: 1210, blocked: 17 });
  assert.deepEqual(detail.blockers, { total: 17, margin: 12, staleCost: 3, dimension: 2 });
  assert.equal(findAllowedAction(detail.allowedActions, "override.request").enabled, true);
  assert.equal(findAllowedAction(detail.allowedActions, "proposal.submit").reason.code, "WRONG_STATE");
});

test("Given exact Proposal v3, when retained margin evidence is read, then the locked source, bounded lines and explicit authority remain version-bound", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const proposal = await repositories.proposals.getDetail();

  const evidence = await repositories.proposals.getMarginEvidence({ proposalRef: proposal.ref });

  assert.deepEqual(evidence.proposalRef, proposal.ref);
  assert.deepEqual(evidence.sourcePreviewRef, proposal.sourcePreviewRef);
  assert.equal(evidence.policySnapshot.label, "Minimum margin");
  assert.deepEqual(evidence.counts, { retained: 12, unresolved: 12, sampleAvailable: 3 });
  assert.equal(evidence.lines.length, 3);
  assert.ok(evidence.lines.every((line) => line.policy.violation?.code === "MARGIN_BELOW_FLOOR"));
  const requestOverride = findAllowedAction(evidence.allowedActions, "override.request");
  assert.equal(requestOverride.enabled, true);
  assert.equal(requestOverride.requiredVersion, proposal.ref.version);
  assert.equal(requestOverride.confirmation.consequenceCode, "OVERRIDE_REQUIRES_DIFFERENT_ACTOR");

  await assert.rejects(
    () => repositories.proposals.getMarginEvidence({ proposalRef: { ...proposal.ref, version: "2" } }),
    (error) => {
      assert.equal(error.envelope.error.code, "PROPOSAL_STALE_VERSION");
      return true;
    },
  );
});

test("Given a generated +4.25% Preview, when its Proposal margin is opened, then every retained amount and count stays bound to that exact source version", async () => {
  const repositories = createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
  const scope = await repositories.repricing.getScope();
  const ruleRef = findAllowedAction(scope.allowedActions, "repricing.rule.read").targetRef;
  const rule = await repositories.repricing.getRule({ ref: ruleRef });
  const saved = await repositories.repricing.saveRule({
    scopeRef: rule.scopeRef,
    ruleRef: rule.ref,
    rule: {
      type: "percentage-change",
      changeBasisPoints: 425,
      absoluteChange: null,
      currency: "NGN",
      rounding: "integer-minor-unit-half-up",
    },
    effectiveAt: "2026-08-22T09:30:00+01:00",
    idempotencyKey: "bdd-proposal-margin-rule-425-0001",
  });
  const generated = await repositories.repricing.generatePreview({
    ruleRef: saved.data.ref,
    idempotencyKey: "bdd-proposal-margin-preview-425-0001",
  });
  const preview = await repairOperationalBlockers(repositories, generated.data.ref, "bdd-generated-margin-repair");
  const created = await repositories.proposals.createFromPreview({
    sourcePreviewRef: preview.ref,
    title: preview.title,
    idempotencyKey: "bdd-proposal-margin-create-425-0001",
  });
  const proposal = await repositories.proposals.getDetail({ ref: created.data.ref });
  const evidence = await repositories.proposals.getMarginEvidence({ proposalRef: proposal.ref });
  const previewMarginLines = preview.lines.filter((line) => line.policy.violation?.code === "MARGIN_BELOW_FLOOR");

  assert.deepEqual(proposal.sourcePreviewRef, preview.ref);
  assert.equal(proposal.effectiveAt, preview.effectiveAt);
  assert.deepEqual(proposal.counts, { selected: 1227, eligible: 1220, blocked: 7 });
  assert.deepEqual(proposal.blockers, { total: 7, margin: 7, staleCost: 0, dimension: 0 });
  assert.deepEqual(evidence.sourcePreviewRef, preview.ref);
  assert.deepEqual(evidence.counts, { retained: 7, unresolved: 7, sampleAvailable: previewMarginLines.length });
  assert.match(findAllowedAction(evidence.allowedActions, "override.request").confirmation.body, /Keep 7 margin lines blocked/);
  assert.deepEqual(
    evidence.lines.map((line) => ({ id: line.id, proposedPrice: line.proposedPrice, proposedMarginBasisPoints: line.proposedMarginBasisPoints })),
    previewMarginLines.map((line) => ({ id: line.id, proposedPrice: line.proposedPrice, proposedMarginBasisPoints: line.proposedMarginBasisPoints })),
  );
  assert.equal(evidence.lines.find((line) => line.sku === "KLD-PANT-0032").proposedPrice.amountMinor, "168103");
  assert.notEqual(evidence.lines.find((line) => line.sku === "KLD-PANT-0032").proposedPrice.amountMinor, "166894");
});

test("Given Proposal v3 comments, when Teni writes and retries, then actor, copy, cursor and idempotency remain server-shaped", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const proposal = await repositories.proposals.getDetail();
  const initial = await repositories.proposals.listComments({ proposalRef: proposal.ref, limit: 1 });
  const addAction = findAllowedAction(initial.allowedActions, "proposal.comment.add");

  assert.equal(initial.kind, "proposal-comment-thread");
  assert.deepEqual(initial.proposalRef, proposal.ref);
  assert.equal(initial.page.totalCount, 1);
  assert.equal(addAction.enabled, true);
  assert.equal(addAction.requiredVersion, "3");
  assert.equal(addAction.confirmation.title, "Add version-bound comment");

  const request = {
    proposalRef: proposal.ref,
    idempotencyKey: "bdd-proposal-comment-v3-0001",
    body: "Retain the exact floor evidence with this Proposal version.",
  };
  const first = await repositories.proposals.addComment(request);
  const retry = await repositories.proposals.addComment(request);
  assert.equal(first.data.actor.id, FIXTURE_ACTOR_IDS.teni);
  assert.deepEqual(first.data.proposalRef, proposal.ref);
  assert.equal(first.data.body, request.body);
  assert.equal(first.mutation.authoritative, false);
  assert.equal(retry.data.ref.id, first.data.ref.id);
  assert.equal(retry.mutation.deduplicated, true);

  await repositories.proposals.addComment({
    proposalRef: proposal.ref,
    idempotencyKey: "bdd-proposal-comment-v3-0002",
    body: "Second version-bound note for cursor evidence.",
  });
  const firstPage = await repositories.proposals.listComments({ proposalRef: proposal.ref, limit: 1 });
  const secondPage = await repositories.proposals.listComments({ proposalRef: proposal.ref, cursor: firstPage.page.nextCursor, limit: 1 });
  assert.equal(firstPage.page.totalCount, 3);
  assert.equal(firstPage.items.length, 1);
  assert.ok(firstPage.page.nextCursor);
  assert.equal(secondPage.items.length, 1);
  assert.notEqual(firstPage.items[0].ref.id, secondPage.items[0].ref.id);

  await assert.rejects(
    () => repositories.proposals.addComment({ ...request, body: "A different payload must not reuse the key." }),
    (error) => {
      assert.equal(error.envelope.error.code, "IDEMPOTENCY_KEY_REUSED");
      return true;
    },
  );
});

test("Given comments from Proposal v3, when the governed object advances, then each version exposes only its own thread", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const v3 = await repositories.proposals.getDetail();
  assert.equal((await repositories.proposals.listComments({ proposalRef: v3.ref })).page.totalCount, 1);

  const v7 = await requestAndApproveOverride(repositories);
  const v7Thread = await repositories.proposals.listComments({ proposalRef: v7.ref });
  assert.equal(v7Thread.page.totalCount, 0, "the seeded v3 comment must not leak into v7");
  const v7Comment = await repositories.proposals.addComment({
    proposalRef: v7.ref,
    idempotencyKey: "bdd-proposal-comment-v7-0001",
    body: "The reconciled draft is ready for the author to submit.",
  });
  assert.deepEqual(v7Comment.data.proposalRef, v7.ref);
  assert.equal((await repositories.proposals.listComments({ proposalRef: v7.ref })).page.totalCount, 1);

  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.teni);
  const v8 = (await repositories.proposals.submit({ proposalRef: v7.ref, idempotencyKey: "bdd-proposal-submit-after-comment-0001" })).data;
  assert.equal((await repositories.proposals.listComments({ proposalRef: v8.ref })).page.totalCount, 0, "the v7 comment must remain isolated from v8");
});

test("Given an audit-only Proposal reader, when comments resolve, then reading remains available while adding fails closed from explicit capability", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const proposal = await repositories.proposals.getDetail();
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.moyo);

  const thread = await repositories.proposals.listComments({ proposalRef: proposal.ref });
  const addAction = findAllowedAction(thread.allowedActions, "proposal.comment.add");
  assert.equal(thread.page.totalCount, 1);
  assert.equal(addAction.enabled, false);
  assert.equal(addAction.reason.code, "MISSING_PERMISSION");
  await assert.rejects(
    () => repositories.proposals.addComment({ proposalRef: proposal.ref, idempotencyKey: "bdd-proposal-comment-denied-0001", body: "This must not be recorded." }),
    (error) => {
      assert.equal(error.envelope.error.code, "MISSING_PERMISSION");
      assert.equal(error.envelope.error.details.requiredCapability, "proposal:comment");
      return true;
    },
  );
});

test("Given a resolved session without proposal read scope, when Proposal detail is requested, then access fails closed before version disclosure", async () => {
  const repositories = createFixtureWorkspaceRepositories({ designEvidenceCapabilities: [] });

  await assert.rejects(
    () => repositories.proposals.getDetail({
      ref: { kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "stale-version" },
    }),
    (error) => {
      assert.equal(error.envelope.error.code, "MISSING_PERMISSION");
      assert.equal(error.envelope.error.details.requiredCapability, "proposal:read");
      assert.equal(error.envelope.error.details.currentVersion, undefined);
      return true;
    },
  );
});

test("Given blocked Proposal v3, when submission is attempted before blockers resolve, then state validation fails closed", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const blocked = await repositories.proposals.getDetail();

  await assert.rejects(
    () => repositories.proposals.submit({ proposalRef: blocked.ref, idempotencyKey: "bdd-submit-blocked-v3-0001" }),
    (error) => {
      assert.equal(error.envelope.error.code, "PROPOSAL_WRONG_STATE");
      assert.equal(error.envelope.error.details.currentState, "blocked");
      return true;
    },
  );
  assert.equal((await repositories.proposals.getDetail()).ref.version, "3");
});

test("Given blocked Proposal v3, when Teni requests an exception, then Override v1 is pending and the Proposal remains unapproved", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const detail = await repositories.proposals.getDetail();
  const request = {
    proposalRef: detail.ref,
    idempotencyKey: "bdd-request-idempotent-0001",
    reason: "Time-bounded evidence for the twelve margin lines.",
  };

  const first = await repositories.proposals.requestOverride(request);
  const retry = await repositories.proposals.requestOverride(request);

  assertOverrideRequest(first.data.override);
  assert.equal(first.data.override.ref.id, FIXTURE_OVERRIDE_ID);
  assert.equal(first.data.override.ref.version, "1");
  assert.equal(first.data.override.state, "pending");
  assert.equal(first.data.proposal.ref.version, "3");
  assert.equal(first.data.proposal.state, "blocked");
  assert.equal(first.data.proposal.readiness, "pending_override");
  assert.equal(first.data.proposal.approval, null);
  assert.equal(retry.mutation.deduplicated, true);
});

test("Given a pending Override assigned to Chika, when server actions are resolved, then approve and deny are distinct versioned decisions", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const blocked = await repositories.proposals.getDetail();
  const requested = await repositories.proposals.requestOverride({
    proposalRef: blocked.ref,
    idempotencyKey: "bdd-override-explicit-actions-0001",
  });

  assert.equal(findAllowedAction(requested.data.override.allowedActions, "override.approve").decision, "approve");
  assert.equal(findAllowedAction(requested.data.override.allowedActions, "override.approve").enabled, false);
  assert.equal(findAllowedAction(requested.data.override.allowedActions, "override.deny").decision, "deny");
  assert.equal(findAllowedAction(requested.data.override.allowedActions, "override.deny").enabled, false);

  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.chika);
  const detail = await repositories.proposals.getDetail();
  for (const source of [detail.allowedActions, detail.override.allowedActions]) {
    const approve = findAllowedAction(source, "override.approve");
    const deny = findAllowedAction(source, "override.deny");
    assert.equal(findAllowedAction(source, "override.decide"), null);
    assert.equal(approve.enabled, true);
    assert.equal(approve.decision, "approve");
    assert.equal(approve.requiredVersion, "1");
    assert.equal(approve.confirmation.consequenceCode, "OVERRIDE_APPROVED_PROPOSAL_NOT_APPROVED");
    assert.equal(deny.enabled, true);
    assert.equal(deny.decision, "deny");
    assert.equal(deny.requiredVersion, "1");
    assert.equal(deny.confirmation.consequenceCode, "OVERRIDE_DENIED_PROPOSAL_REMAINS_BLOCKED");
  }
});

test("Given Teni requested the exception, when Teni attempts to decide it, then maker-checker denial preserves all work", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const proposal = await repositories.proposals.getDetail();
  const requested = await repositories.proposals.requestOverride({
    proposalRef: proposal.ref,
    idempotencyKey: "bdd-same-actor-request-0001",
  });

  await assert.rejects(
    () => repositories.proposals.decideOverride({
      overrideRef: requested.data.override.ref,
      decision: "approve",
      idempotencyKey: "bdd-same-actor-decision-0001",
    }),
    (error) => {
      assert.ok(error instanceof RepositoryError);
      assert.equal(error.envelope.error.code, "MAKER_CHECKER_REQUIRED");
      assert.equal(error.envelope.error.details.workPreserved, true);
      return true;
    },
  );
  const preserved = await repositories.proposals.getDetail();
  assert.equal(preserved.override.state, "pending");
  assert.equal(preserved.ref.version, "3");
});

test("Given Chika decides Override v1, when it is approved, then Override v2 only makes Proposal v7 ready to submit", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  const ready = await requestAndApproveOverride(repositories);

  assert.equal(ready.ref.version, "7");
  assert.equal(ready.state, "draft");
  assert.equal(ready.readiness, "ready_to_submit");
  assert.equal(ready.override.ref.version, "2");
  assert.equal(ready.override.state, "approved");
  assert.equal(ready.approval, null, "an Override decision must never approve the Proposal");
  assert.equal(ready.publicationRef, null);
  assert.deepEqual(ready.counts, { selected: 1227, eligible: 1227, blocked: 0 });
});

test("Given Chika denies Override v1, when branch evidence is reconstructed, then Proposal v3 stays blocked and event 15 is override.denied", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const blocked = await repositories.proposals.getDetail();
  const requested = await repositories.proposals.requestOverride({
    proposalRef: blocked.ref,
    idempotencyKey: "bdd-override-denial-request-0001",
  });
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.chika);

  const denied = await repositories.proposals.decideOverride({
    overrideRef: requested.data.override.ref,
    decision: "deny",
    idempotencyKey: "bdd-override-denial-decision-0001",
  });

  assert.equal(denied.data.override.ref.version, "2");
  assert.equal(denied.data.override.state, "denied");
  assert.equal(denied.data.proposal.ref.version, "3");
  assert.equal(denied.data.proposal.state, "blocked");
  assert.equal(denied.data.proposal.readiness, "blocked");
  assert.deepEqual(denied.data.proposal.counts, { selected: 1227, eligible: 1210, blocked: 17 });
  assert.equal(denied.data.proposal.approval, null);
  assert.equal(denied.data.proposal.publicationRef, null);

  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.moyo);
  const history = await repositories.audit.getProposalHistory({ proposalId: FIXTURE_PROPOSAL_ID });
  assert.deepEqual(history.sequence, { first: 1, last: 15, gaps: 0 });
  assert.equal(history.complete, false);
  assert.equal(history.events[14].eventType, "override.denied");
  assert.deepEqual(history.events[14].before, { lineCount: 12, state: "pending" });
  assert.deepEqual(history.events[14].after, { lineCount: 12, state: "denied" });
  assert.equal(history.events.some((event) => event.eventType === "override.approved"), false);
  assert.equal(FIXTURE_AUDIT_EVENTS[14].eventType, "override.approved", "the canonical approved FX-010 path must remain unchanged");
});

test("Given Proposal v7 is ready, when Teni submits it, then v8 awaits independent approval and is not published", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const ready = await requestAndApproveOverride(repositories);
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.teni);

  const submitted = await repositories.proposals.submit({
    proposalRef: ready.ref,
    idempotencyKey: "bdd-submit-current-v7-0001",
  });

  assert.equal(submitted.data.ref.version, "8");
  assert.equal(submitted.data.state, "submitted");
  assert.equal(submitted.data.readiness, "awaiting_approval");
  assert.equal(submitted.data.approval, null);
  assert.equal(submitted.data.publicationRef, null);
});

test("Given Teni authored submitted Proposal v8, when Teni attempts approval, then maker-checker denial preserves v8", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const ready = await requestAndApproveOverride(repositories);
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.teni);
  const submitted = await repositories.proposals.submit({ proposalRef: ready.ref, idempotencyKey: "bdd-submit-maker-checker-0001" });

  await assert.rejects(
    () => repositories.proposals.approve({ proposalRef: submitted.data.ref, idempotencyKey: "bdd-author-approve-0001" }),
    (error) => {
      assert.equal(error.envelope.error.code, "MAKER_CHECKER_REQUIRED");
      assert.equal(error.envelope.error.details.workPreserved, true);
      return true;
    },
  );
  assert.equal((await repositories.proposals.getDetail()).ref.version, "8");
});

test("Given Chika independently approves current v8, when approval succeeds, then v9 is approved but publication remains separate", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  const approved = await submitAndApproveProposal(repositories);

  assert.equal(approved.ref.version, "9");
  assert.equal(approved.state, "approved");
  assert.equal(approved.readiness, "approved_to_publish");
  assert.equal(approved.approval.actor.id, FIXTURE_ACTOR_IDS.chika);
  assert.equal(approved.publicationRef, null, "approval must never publish");
  assert.equal(findAllowedAction(approved.allowedActions, "publication.start").enabled, false, "Chika is not the Publisher");
});

test("Given approved Proposal v9, when a non-Publisher starts release, then permission fails closed", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const approved = await submitAndApproveProposal(repositories);

  await assert.rejects(
    () => repositories.publishing.start({ proposalRef: approved.ref, idempotencyKey: "bdd-publish-forbidden-0001" }),
    (error) => {
      assert.equal(error.envelope.error.code, "MISSING_PERMISSION");
      assert.equal(error.envelope.error.details.requiredCapability, "publish:execute");
      return true;
    },
  );
  assert.equal((await repositories.proposals.getDetail()).publicationRef, null);
});

test("Given Farida starts the separate release, when the outcome is unknown, then retry is disabled until reconciliation", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const unknown = await startPublication(repositories);

  assertPublicationOperation(unknown);
  assert.deepEqual(unknown.ref, { kind: "resource", id: FIXTURE_PUBLICATION_ID, version: "1" });
  assert.equal(unknown.state, "unknown-outcome");
  assert.deepEqual(unknown.counts, { requested: 1227, attempted: 1227, succeeded: 0, failed: 0, remaining: 1227, duplicateWrites: 0 });
  assert.equal(findAllowedAction(unknown.allowedActions, "publication.reconcile").enabled, true);
  assert.equal(findAllowedAction(unknown.allowedActions, "publication.retry").enabled, false);
  assert.equal(findAllowedAction(unknown.allowedActions, "publication.retry").reason.code, "WRONG_STATE");
  await assert.rejects(
    () => repositories.publishing.retry({ operationRef: unknown.ref, idempotencyKey: FIXTURE_PUBLISH_IDEMPOTENCY_KEY }),
    (error) => {
      assert.equal(error.envelope.error.code, "PUBLICATION_OUTCOME_UNKNOWN");
      assert.equal(error.envelope.error.retryable, false);
      return true;
    },
  );
});

test("Given unknown Publish v1, when Farida reconciles, then v2 reports 1,223 durable successes and only four unresolved rows", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const unknown = await startPublication(repositories);

  const incomplete = await repositories.publishing.reconcile({ operationRef: unknown.ref });
  const reloaded = await repositories.publishing.get({ operationRef: incomplete.ref });

  assert.equal(incomplete.ref.version, "2");
  assert.equal(incomplete.state, "incomplete");
  assert.deepEqual(incomplete.counts, { requested: 1227, attempted: 1227, succeeded: 1223, failed: 4, remaining: 4, duplicateWrites: 0 });
  assert.deepEqual(reloaded, incomplete);
  const retry = findAllowedAction(incomplete.allowedActions, "publication.retry");
  assert.equal(retry.enabled, true);
  assert.equal(retry.confirmation.title, `Retry ${incomplete.counts.remaining} unresolved prices`);
  assert.equal(retry.confirmation.confirmLabel, `Retry ${incomplete.counts.remaining} prices`);
});

test("Given reconciled Publish v2, when retry uses another idempotency key, then the unsafe mutation is rejected", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const unknown = await startPublication(repositories);
  const incomplete = await repositories.publishing.reconcile({ operationRef: unknown.ref });

  await assert.rejects(
    () => repositories.publishing.retry({ operationRef: incomplete.ref, idempotencyKey: "different-publish-key-0001" }),
    (error) => {
      assert.equal(error.envelope.error.code, "PUBLICATION_IDEMPOTENCY_KEY_MISMATCH");
      return true;
    },
  );
});

test("Given reconciled Publish v2, when Farida safely retries and reconciles, then only four rows are attempted and v4 completes with no duplicates", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const unknown = await startPublication(repositories);
  const incomplete = await repositories.publishing.reconcile({ operationRef: unknown.ref });

  const retried = await repositories.publishing.retry({
    operationRef: incomplete.ref,
    idempotencyKey: FIXTURE_PUBLISH_IDEMPOTENCY_KEY,
  });
  const completed = await repositories.publishing.reconcile({ operationRef: retried.data.ref });

  assert.equal(retried.data.ref.version, "3");
  assert.equal(retried.data.state, "reconciling");
  assert.equal(retried.data.counts.attempted, 4);
  assert.equal(completed.ref.version, "4");
  assert.equal(completed.state, "published");
  assert.deepEqual(completed.counts, { requested: 1227, attempted: 4, succeeded: 1227, failed: 0, remaining: 0, duplicateWrites: 0 });
});

test("Given a stale Proposal or Publish version, when a mutation or deep-link read is attempted, then no work is applied", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const ready = await requestAndApproveOverride(repositories);

  await assert.rejects(
    () => repositories.proposals.getDetail({ ref: { ...ready.ref, version: "3" } }),
    (error) => {
      assert.equal(error.envelope.error.code, "PROPOSAL_STALE_VERSION");
      assert.deepEqual(error.envelope.error.details, { expectedVersion: "3", currentVersion: "7" });
      return true;
    },
  );
});

test("Given Publish advances from v1 to v2, when the v1 deep link reloads, then the stale operation is rejected", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const unknown = await startPublication(repositories);
  await repositories.publishing.reconcile({ operationRef: unknown.ref });

  await assert.rejects(
    () => repositories.publishing.get({ operationRef: unknown.ref }),
    (error) => {
      assert.equal(error.envelope.error.code, "PUBLICATION_STALE_VERSION");
      assert.deepEqual(error.envelope.error.details, { expectedVersion: "1", currentVersion: "2" });
      return true;
    },
  );
});

test("Given the completed release, when Moyo reads FX-010 history, then all 25 canonical events are gapless and read-only", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const unknown = await startPublication(repositories);
  const incomplete = await repositories.publishing.reconcile({ operationRef: unknown.ref });
  const retried = await repositories.publishing.retry({ operationRef: incomplete.ref, idempotencyKey: FIXTURE_PUBLISH_IDEMPOTENCY_KEY });
  await repositories.publishing.reconcile({ operationRef: retried.data.ref });
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.moyo);

  const history = await repositories.audit.getProposalHistory({ proposalId: FIXTURE_PROPOSAL_ID });

  assertAuditHistory(history);
  assert.equal(history.complete, true);
  assert.equal(history.readOnlyEvidence, true);
  assert.deepEqual(history.sequence, { first: 1, last: 25, gaps: 0 });
  assert.deepEqual(history.events.map((event) => event.id), FIXTURE_AUDIT_EVENTS.map((event) => event.id));
  assert.equal(history.events[14].eventType, "override.approved");
  assert.equal(history.events[19].eventType, "proposal.approved");
  assert.equal(history.events[23].eventType, "publish.completed");
});

test("Given a user without audit scope, when full reconstruction is requested, then evidence access fails closed", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  await assert.rejects(
    () => repositories.audit.getProposalHistory({ proposalId: FIXTURE_PROPOSAL_ID }),
    (error) => {
      assert.equal(error.envelope.error.code, "MISSING_PERMISSION");
      assert.equal(error.envelope.error.details.requiredCapability, "audit:read");
      return true;
    },
  );
});
