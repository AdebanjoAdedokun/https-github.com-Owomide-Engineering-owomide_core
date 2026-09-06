import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIXTURE_ACTOR_IDS,
  FIXTURE_AUDIT_EVENTS,
  FIXTURE_MARGIN_POLICIES,
  FIXTURE_PREVIEW_REF,
  RepositoryError,
  applyPriceAdjustment,
  calculateMarginBasisPoints,
  calculatePercentageMarginFloorPrice,
  createFixtureWorkspaceRepositories,
  evaluateMarginPolicy,
  findAllowedAction,
  resolveMarginPolicy,
} from "../../src/data/index.js";

const ngn = (amountMinor) => ({ amountMinor, currency: "NGN" });
const usd = (amountMinor) => ({ amountMinor, currency: "USD" });
const organisationRule = {
  id: "rule-org",
  version: "1",
  name: "Organisation floor",
  scope: "organisation",
  priority: 0,
  conditions: {},
  floor: { type: "percentage-margin", basisPoints: 1400, currency: "NGN" },
};

test("Given integer minor units, when percentage and absolute adjustments run, then prepared outcomes use explicit deterministic rounding", () => {
  assert.deepEqual(
    applyPriceAdjustment(ngn("161250"), { type: "percentage-change", changeBasisPoints: 350, currency: "NGN", rounding: "integer-minor-unit-half-up" }),
    { proposedPrice: ngn("166894"), absoluteDelta: ngn("5644"), rounding: "integer-minor-unit-half-up" },
  );
  assert.deepEqual(
    applyPriceAdjustment(ngn("161250"), { type: "absolute-change", absoluteChange: ngn("2500"), currency: "NGN" }),
    { proposedPrice: ngn("163750"), absoluteDelta: ngn("2500"), rounding: "exact-minor-unit-addition" },
  );
  assert.equal(
    applyPriceAdjustment(ngn("1"), { type: "percentage-change", changeBasisPoints: 5000, currency: "NGN" }).proposedPrice.amountMinor,
    "2",
    "an exact half minor unit rounds up",
  );
});

test("Given a percentage margin floor, when the exact floor is calculated, then ceiling arithmetic makes one minor unit the pass boundary", () => {
  const floorPrice = calculatePercentageMarginFloorPrice(ngn("151550"), 1400);
  assert.deepEqual(floorPrice, ngn("176221"));
  assert.equal(calculateMarginBasisPoints(floorPrice, ngn("151550")), 1400);

  const exact = evaluateMarginPolicy({ proposedPrice: floorPrice, currentCost: ngn("151550"), costState: "current", dimensionsValid: true, rules: [organisationRule], facts: {} });
  const below = evaluateMarginPolicy({ proposedPrice: ngn("176220"), currentCost: ngn("151550"), costState: "current", dimensionsValid: true, rules: [organisationRule], facts: {} });
  assert.equal(exact.classification, "eligible");
  assert.equal(exact.result, "clear");
  assert.equal(below.classification, "blocked");
  assert.equal(below.issue.code, "MARGIN_BELOW_FLOOR");
});

test("Given overlapping policies, when precedence resolves, then priority, specificity and stable ID are applied in that order", () => {
  const rules = [
    { ...organisationRule, id: "z-org" },
    { ...organisationRule, id: "z-category", name: "Category", scope: "category", priority: 100, conditions: { categoryId: "pantry" } },
    { ...organisationRule, id: "b-channel", name: "Channel broad", scope: "channel", priority: 200, conditions: { channelId: "retail" } },
    { ...organisationRule, id: "z-channel-specific", name: "Channel specific Z", scope: "channel", priority: 200, conditions: { channelId: "retail", categoryId: "pantry" } },
    { ...organisationRule, id: "a-channel-specific", name: "Channel specific A", scope: "channel", priority: 200, conditions: { channelId: "retail", categoryId: "pantry" } },
    { ...organisationRule, id: "sku-rule", name: "SKU", scope: "sku", priority: 300, conditions: { skuId: "sku-1" } },
  ];
  const facts = { skuId: "sku-1", channelId: "retail", categoryId: "pantry" };
  const resolved = resolveMarginPolicy(rules, facts);
  assert.deepEqual(resolved.matchingChain.map((rule) => rule.id), ["sku-rule", "a-channel-specific", "z-channel-specific", "b-channel", "z-category", "z-org"]);
  assert.equal(resolved.appliedRule.scope, "sku");

  const withoutSku = resolveMarginPolicy(rules, { ...facts, skuId: "sku-2" });
  assert.equal(withoutSku.appliedRule.id, "a-channel-specific");
  assert.throws(() => resolveMarginPolicy([organisationRule, { ...organisationRule }], {}), /MARGIN_RULE_ID_DUPLICATE/);
});

test("Given an unevaluable line, when policy evaluation runs, then cost, currency, no-match and dimension failures remain distinct blockers", () => {
  const base = { proposedPrice: ngn("12000"), currentCost: ngn("9000"), costState: "current", dimensionsValid: true, rules: [organisationRule], facts: {} };
  assert.deepEqual(
    evaluateMarginPolicy({ ...base, currentCost: null, costState: "missing" }).issue,
    { kind: "stale-cost", code: "COST_MISSING", message: "A current cost is required before margin can be evaluated.", persistent: true, allowedRemediations: ["refresh-cost", "exclude"] },
  );
  assert.equal(evaluateMarginPolicy({ ...base, costState: "stale" }).issue.code, "COST_STALE");
  assert.equal(evaluateMarginPolicy({ ...base, proposedPrice: usd("12000") }).issue.code, "POLICY_CURRENCY_MISMATCH");
  assert.equal(evaluateMarginPolicy({ ...base, rules: [], facts: { categoryId: "unknown" } }).issue.code, "MARGIN_RULE_NO_MATCH");
  assert.equal(evaluateMarginPolicy({ ...base, dimensionsValid: false }).issue.code, "DIMENSION_UNSUPPORTED");
});

test("Given FX-004 bounded evidence, when every classification is inspected, then blocker kinds and excluded/unpriced contracts remain honest while aggregate counts reconcile", async () => {
  const preview = await createFixtureWorkspaceRepositories().repricing.getPreview({ ref: FIXTURE_PREVIEW_REF, limit: 200 });
  assert.deepEqual(preview.blockers, { total: 17, margin: 12, staleCost: 3, dimension: 2 });
  assert.equal(preview.counts.matched, preview.counts.eligible + preview.counts.blocked + preview.counts.excluded + preview.counts.unpriced);
  assert.equal(preview.counts.priced, preview.counts.eligible + preview.counts.blocked + preview.counts.excluded);
  assert.deepEqual(
    Object.fromEntries(["margin", "stale-cost", "dimension", "excluded", "unpriced"].map((kind) => [kind, preview.lines.filter((line) => line.issue?.kind === kind).length])),
    { margin: 3, "stale-cost": 3, dimension: 2, excluded: 1, unpriced: 1 },
  );
  const unpriced = preview.lines.find((line) => line.classification === "unpriced");
  assert.equal(unpriced.currentPrice, null);
  assert.equal(unpriced.proposedPrice, null);
  assert.equal(unpriced.selected, false);
  const excluded = preview.lines.find((line) => line.classification === "excluded");
  assert.equal(excluded.exclusion.code, "EXPLICITLY_EXCLUDED");
  assert.equal(excluded.selected, false);
  assert.ok(preview.lines.every((line) => line.policy.evaluation.engineVersion && line.policy.evaluation.evaluationHash));
});

test("Given a current Preview line, when floor remediation is retried or the old ref is reused, then it is idempotent, versioned and stale-safe", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const originalProposal = await repositories.proposals.getDetail();
  const preview = await repositories.repricing.getPreview({ ref: FIXTURE_PREVIEW_REF, query: "cassava", limit: 200 });
  const cassava = preview.lines[0];
  const request = { previewRef: preview.ref, lineId: cassava.id, action: "apply-floor", idempotencyKey: "remediate-cassava-floor-0001" };
  const applied = await repositories.repricing.remediateLine(request);
  const retried = await repositories.repricing.remediateLine(request);
  const updated = await repositories.repricing.getPreview({ ref: applied.data.ref, query: "cassava", limit: 200 });
  assert.equal(applied.data.ref.version, "0.0.0-design.1-r1");
  assert.equal(retried.mutation.deduplicated, true);
  assert.equal(updated.lines[0].classification, "eligible");
  assert.deepEqual(updated.lines[0].proposedPrice, ngn("176221"));
  assert.deepEqual(updated.blockers, { total: 16, margin: 11, staleCost: 3, dimension: 2 });
  assert.deepEqual((await repositories.proposals.getDetail()).counts, originalProposal.counts, "Preview remediation cannot mutate retained Proposal evidence");
  assert.equal((await repositories.repricing.getPreview({ ref: FIXTURE_PREVIEW_REF })).ref.version, FIXTURE_PREVIEW_REF.version, "old Preview remains readable");
  await assert.rejects(
    () => repositories.repricing.remediateLine({ ...request, lineId: "3576e827-02d1-5898-ac6d-93790e8066f7", idempotencyKey: "remediate-stale-old-ref-0002" }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "REPRICING_PREVIEW_STALE_VERSION",
  );
});

test("Given a selected blocked line, when it is explicitly excluded, then a new Preview preserves accounting without inventing approval", async () => {
  const repositories = createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
  const preview = await repositories.repricing.getPreview({ ref: FIXTURE_PREVIEW_REF, query: "cassava", limit: 200 });
  const result = await repositories.repricing.remediateLine({
    previewRef: preview.ref,
    lineId: preview.lines[0].id,
    action: "exclude",
    idempotencyKey: "remediate-cassava-exclude-0001",
  });
  const updated = await repositories.repricing.getPreview({ ref: result.data.ref, query: "cassava", limit: 200 });

  assert.equal(updated.ref.version, "0.0.0-design.1-r1");
  assert.deepEqual(updated.counts, {
    requested: 1248,
    matched: 1248,
    priced: 1239,
    selected: 1226,
    eligible: 1210,
    blocked: 16,
    excluded: 13,
    unpriced: 9,
    total: 1248,
  });
  assert.deepEqual(updated.blockers, { total: 16, margin: 11, staleCost: 3, dimension: 2 });
  assert.equal(updated.lines[0].classification, "excluded");
  assert.equal(updated.lines[0].selected, false);
  assert.equal(updated.lines[0].exclusion.code, "OPERATOR_EXCLUDED");
  assert.equal(updated.lines[0].remediationEvidence.action, "exclude");
  assert.equal(findAllowedAction(updated.allowedActions, "proposal.create").enabled, false, "operational blockers still gate governance");
});

test("Given all operational blockers, when their exact lines are repaired, then a new Preview may enter governance with margin blockers preserved", async () => {
  const repositories = createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
  let preview = await repositories.repricing.getPreview({ ref: FIXTURE_PREVIEW_REF, limit: 200 });
  assert.equal(findAllowedAction(preview.allowedActions, "proposal.create").reason.code, "WRONG_STATE");
  const repairable = preview.lines.filter((line) => ["stale-cost", "dimension"].includes(line.issue?.kind));
  for (const [index, line] of repairable.entries()) {
    const action = line.issue.kind === "stale-cost" ? "refresh-cost" : "repair-dimension";
    const result = await repositories.repricing.remediateLine({ previewRef: preview.ref, lineId: line.id, action, idempotencyKey: `repair-operational-${index}-0001` });
    preview = await repositories.repricing.getPreview({ ref: result.data.ref, limit: 200 });
  }
  assert.deepEqual(preview.blockers, { total: 12, margin: 12, staleCost: 0, dimension: 0 });
  assert.deepEqual({ eligible: preview.counts.eligible, blocked: preview.counts.blocked }, { eligible: 1215, blocked: 12 });
  assert.equal(findAllowedAction(preview.allowedActions, "proposal.create").enabled, true);
  const created = await repositories.proposals.createFromPreview({ sourcePreviewRef: preview.ref, idempotencyKey: "create-after-operational-repair-0001" });
  assert.deepEqual(created.data.counts, { selected: 1227, eligible: 1215, blocked: 12 });
  assert.deepEqual((await repositories.proposals.getDetail({ ref: created.data.ref })).blockers, { total: 12, margin: 12, staleCost: 0, dimension: 0 });
});

test("Given legacy FX-010 has operational blockers, when its exception is approved, then separate cost and dimension reconciliation evidence precedes margin override application", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const requested = await repositories.proposals.requestOverride({ proposalRef: (await repositories.proposals.getDetail()).ref, idempotencyKey: "override-operational-boundary-0001" });
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.chika);
  const decided = await repositories.proposals.decideOverride({ overrideRef: requested.data.override.ref, decision: "approve", idempotencyKey: "override-operational-boundary-0002" });
  assert.deepEqual(decided.data.proposal.blockers, { total: 0, margin: 0, staleCost: 0, dimension: 0 });
  assert.deepEqual(decided.data.proposal.counts, { selected: 1227, eligible: 1227, blocked: 0 });
  assert.deepEqual(decided.data.proposal.operationalReconciliation, { costsRefreshed: 3, dimensionsReconciled: 2, auditSequences: [16, 17, 18] });
  assert.deepEqual(FIXTURE_AUDIT_EVENTS.slice(15, 18).map((event) => event.eventType), ["catalog.costs_refreshed", "catalog.dimension_scope_reconciled", "proposal.override_applied"]);
  assert.equal(decided.data.proposal.state, "draft");
  assert.equal(decided.data.proposal.readiness, "ready_to_submit");
  assert.equal(findAllowedAction(decided.data.proposal.allowedActions, "proposal.submit").enabled, false, "Chika cannot submit Teni's proposal");
  assert.equal(findAllowedAction(decided.data.proposal.allowedActions, "override.request").enabled, false);
});
