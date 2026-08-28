import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIXTURE_ACTOR_IDS,
  FIXTURE_GENERATED_PROPOSAL_ID,
  FIXTURE_PROPOSAL_ID,
  RepositoryError,
  createFixtureWorkspaceRepositories,
  findAllowedAction,
} from "../../src/data/index.js";
import { repricingRuleLabel } from "../../src/workspacePresenter.js";

async function persistPreparedScope(repositories) {
  const prepared = await repositories.repricing.getScope();
  return repositories.repricing.createScope({
    title: prepared.title,
    filters: prepared.filters,
    selection: prepared.selection,
    idempotencyKey: "rpr-scope-create-prepared-0001",
  });
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

test("Given the prepared FX-004 Scope, when it is created and renamed, then each mutation is exact, versioned, idempotent and fixture-only", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const prepared = await repositories.repricing.getScope();

  assert.equal(findAllowedAction(prepared.allowedActions, "repricing.scope.create").enabled, true);
  const created = await persistPreparedScope(repositories);
  const retried = await persistPreparedScope(repositories);
  assert.equal(created.data.ref.version, "1");
  assert.equal(created.mutation.authoritative, false);
  assert.equal(created.mutation.deduplicated, false);
  assert.equal(retried.mutation.deduplicated, true);

  const renamed = await repositories.repricing.updateScope({
    scopeRef: created.data.ref,
    title: "August cost recovery · prepared sample",
    filters: created.data.filters,
    selection: created.data.selection,
    idempotencyKey: "rpr-scope-update-prepared-0001",
  });
  assert.equal(renamed.data.ref.version, "2");
  assert.equal(renamed.data.title, "August cost recovery · prepared sample");
  assert.equal(findAllowedAction(renamed.data.allowedActions, "repricing.rule.read").targetRef.version, "2");

  await assert.rejects(
    () => repositories.repricing.updateScope({
      scopeRef: renamed.data.ref,
      filters: { ...renamed.data.filters, currency: "USD" },
      selection: renamed.data.selection,
      idempotencyKey: "rpr-scope-update-unsupported-0001",
    }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "REPRICING_SCOPE_CRITERIA_UNAVAILABLE",
  );
});

test("Given a persisted prepared Scope, when +4.25% is saved and generated, then exact derived prices and alternate aggregate evidence reach a versioned Preview and Proposal", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const created = await persistPreparedScope(repositories);
  const ruleRef = findAllowedAction(created.data.allowedActions, "repricing.rule.read").targetRef;
  const draftRule = await repositories.repricing.getRule({ ref: ruleRef });
  assert.deepEqual(draftRule.preparedRules.map((entry) => entry.label), ["+3.50%", "+4.25%", "+NGN 25.00"]);

  const saved = await repositories.repricing.saveRule({
    scopeRef: draftRule.scopeRef,
    ruleRef: draftRule.ref,
    rule: { type: "percentage-change", changeBasisPoints: 425, absoluteChange: null, currency: "NGN", rounding: "integer-minor-unit-half-up" },
    effectiveAt: "2026-08-15T00:00:00+01:00",
    idempotencyKey: "rpr-rule-save-425-0001",
  });
  assert.equal(saved.data.ref.version, "2");
  assert.equal(saved.mutation.authoritative, false);

  const generated = await repositories.repricing.generatePreview({
    ruleRef: saved.data.ref,
    idempotencyKey: "rpr-preview-generate-425-0001",
  });
  const generatedPreview = generated.data;
  const preview = await repairOperationalBlockers(repositories, generatedPreview.ref, "rpr-generated-repair");
  const cassava = preview.lines.find((line) => line.sku === "KLD-PANT-0032");
  assert.deepEqual(preview.scopeRef, created.data.ref);
  assert.deepEqual(preview.ruleRef, saved.data.ref);
  assert.equal(preview.ref.id, saved.data.ref.id);
  assert.equal(generatedPreview.ref.version, "3");
  assert.equal(preview.ref.version, "3-r5");
  assert.deepEqual(preview.counts, {
    requested: 1248,
    matched: 1248,
    priced: 1239,
    selected: 1227,
    eligible: 1220,
    blocked: 7,
    excluded: 12,
    unpriced: 9,
    total: 1248,
  });
  assert.deepEqual(cassava.proposedPrice, { amountMinor: "168103", currency: "NGN" });
  assert.equal(cassava.proposedMarginBasisPoints, 984);
  assert.equal(findAllowedAction(preview.allowedActions, "proposal.create").enabled, true);
  assert.match(findAllowedAction(preview.allowedActions, "proposal.create").confirmation.body, /7 issues preserved/);
  assert.equal(generated.mutation.authoritative, false);

  await assert.rejects(
    () => repositories.repricing.getPreview({ ref: { ...generatedPreview.ref, version: "2" } }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "REPRICING_PREVIEW_STALE_VERSION",
  );

  const handoff = await repositories.proposals.createFromPreview({
    sourcePreviewRef: preview.ref,
    title: preview.title,
    idempotencyKey: "rpr-proposal-create-425-0001",
  });
  assert.deepEqual(handoff.data.sourcePreviewRef, preview.ref);
  assert.deepEqual(handoff.data.counts, { selected: 1227, eligible: 1220, blocked: 7 });
  assert.equal(handoff.data.ref.id, FIXTURE_GENERATED_PROPOSAL_ID);
  assert.notEqual(handoff.data.ref.id, FIXTURE_PROPOSAL_ID);
  assert.equal(handoff.mutation.authoritative, false);
  const proposal = await repositories.proposals.getDetail({ ref: handoff.data.ref });
  assert.deepEqual(proposal.sourcePreviewRef, preview.ref);
  assert.deepEqual((await repositories.repricing.getPreview({ ref: proposal.sourcePreviewRef })).rule, preview.rule);
  assert.deepEqual((await repositories.repricing.getPreview({ ref: generatedPreview.ref })).ref, generatedPreview.ref, "the unremediated generated Preview remains readable and immutable");

  const participantAudit = await repositories.audit.list({ entityType: "proposal" });
  assert.equal(participantAudit.items.length, 0, "generated work must not borrow canonical FX-010 audit rows");
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.moyo);
  await assert.rejects(
    () => repositories.audit.getProposalHistory({ proposalId: proposal.ref.id }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "AUDIT_HISTORY_NOT_FOUND",
  );
});

test("Given the fixture calculation boundary, when an unsupported Rule is saved, then generation cannot reuse the fixed 1,248-line aggregate", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const created = await persistPreparedScope(repositories);
  const rule = await repositories.repricing.getRule({ ref: findAllowedAction(created.data.allowedActions, "repricing.rule.read").targetRef });

  await assert.rejects(
    () => repositories.repricing.saveRule({
      scopeRef: rule.scopeRef,
      ruleRef: rule.ref,
      rule: { type: "percentage-change", changeBasisPoints: 500, absoluteChange: null, currency: "NGN", rounding: "integer-minor-unit-half-up" },
      effectiveAt: "2026-08-15T00:00:00+01:00",
      idempotencyKey: "rpr-rule-save-unsupported-0001",
    }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "REPRICING_RULE_OUTCOME_UNAVAILABLE",
  );
});

test("Given percentage and absolute prepared Rules, when copy is presented, then absolute NGN is never mislabelled as +0.00%", () => {
  assert.equal(repricingRuleLabel({ type: "percentage-change", changeBasisPoints: 425 }), "+4.25%");
  assert.equal(repricingRuleLabel({ type: "absolute-change", absoluteChange: { amountMinor: "2500", currency: "NGN" } }), "+₦25.00");
});
