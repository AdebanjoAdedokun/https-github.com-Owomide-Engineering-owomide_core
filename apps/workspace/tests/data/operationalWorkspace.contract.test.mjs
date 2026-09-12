import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIXTURE_ACTOR_IDS,
  FIXTURE_BASELINE_IMPORT_ID,
  FIXTURE_CATALOG_TOTAL,
  FIXTURE_CHANGE_SET_ID,
  FIXTURE_COUNTS,
  FIXTURE_MAPPING_IMPORT_ID,
  FIXTURE_PARTIAL_IMPORT_ID,
  FIXTURE_PROPOSAL_ID,
  FIXTURE_PUBLICATION_ID,
  FIXTURE_SAMPLE_IMPORT_ID,
  FIXTURE_SAMPLE_IMPORT_OPERATION_ID,
  RepositoryError,
  assertCatalogSkuSummary,
  assertImportJourney,
  assertOperationalList,
  assertRepricingRule,
  assertRepricingScope,
  createFixtureWorkspaceRepositories,
  findAllowedAction,
} from "../../src/data/index.js";

test("Given the launch workspace composition, when fixture mode starts, then every route family has one transport-neutral repository seam", () => {
  const repositories = createFixtureWorkspaceRepositories();

  assert.deepEqual(
    ["identity", "workQueue", "catalog", "imports", "repricing", "proposals", "publishing", "rules", "audit"]
      .filter((key) => !repositories[key]),
    [],
  );
  assert.equal(typeof repositories.repricing.getPreview, "function", "the approved RPR-03 seam is preserved");
  assert.equal(typeof repositories.proposals.approve, "function", "the governed Proposal seam is preserved");
});

test("Given a fixture login, when the session is ended and restored, then governed work survives and reads fail closed while signed out", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const before = await repositories.proposals.getDetail();

  const signedOut = await repositories.identity.signOut();
  assert.equal(signedOut.authenticated, false);
  await assert.rejects(
    () => repositories.workQueue.list(),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "SESSION_REQUIRED",
  );

  const session = await repositories.identity.signIn();
  const after = await repositories.proposals.getDetail();
  assert.equal(session.actor.id, FIXTURE_ACTOR_IDS.teni);
  assert.deepEqual(after.ref, before.ref);
});

test("Given Teni's resolved multi-role session, when Work queue loads, then only actionable server-shaped items appear", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  const queue = await repositories.workQueue.list();

  assertOperationalList(queue, "work-queue-list");
  assert.deepEqual(queue.items.map((item) => item.type), ["import", "repricing", "proposal"]);
  for (const item of queue.items) {
    const open = findAllowedAction(item.allowedActions, "work.open");
    assert.equal(open.enabled, true);
    if (item.type === "repricing") {
      const preview = await repositories.repricing.getPreview({ ref: open.targetRef });
      assert.deepEqual(open.targetRef, preview.ref);
    } else {
      assert.deepEqual(open.targetRef, item.ref);
    }
  }
});

test("Given a different resolved actor, when Work queue is recomputed, then the client does not infer authority from a display role", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.chika);

  const queue = await repositories.workQueue.list();

  assert.deepEqual(queue.items.map((item) => item.type), ["proposal"]);
});

test("Given Catalog fixture data, when the first bounded page loads, then canonical UUID and organisation-scoped Merchant SKU remain separate", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  const catalog = await repositories.catalog.list({ limit: 3 });
  const first = catalog.items[0];

  assertOperationalList(catalog, "catalog-list");
  assertCatalogSkuSummary(first);
  assert.match(first.canonicalSkuId, /^[0-9a-f-]{36}$/i);
  assert.equal(first.id, first.canonicalSkuId);
  assert.match(first.merchantSku, /^KLD-/);
  assert.equal(first.merchantSkuScope.label, "Merchant SKU");
  assert.notEqual(first.canonicalSkuId, first.merchantSku);
  assert.equal(catalog.page.totalCount, FIXTURE_CATALOG_TOTAL);
  assert.equal(catalog.page.coverage, "bounded-sample");
  assert.equal(catalog.page.exhaustive, false);
  assert.equal(catalog.page.nextCursor, "fixture-catalog:3");
});

test("Given a Merchant SKU is supplied as a route key, when Catalog detail is requested, then the repository requires the canonical UUID", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  await assert.rejects(
    () => repositories.catalog.getDetail({ skuId: "KLD-PANT-0032" }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "CATALOG_CANONICAL_SKU_ID_REQUIRED",
  );

  const list = await repositories.catalog.list({ query: "cassava" });
  const detail = await repositories.catalog.getDetail({ skuId: list.items[0].canonicalSkuId });
  assert.equal(detail.merchantSku, "KLD-PANT-0032");
  assert.equal(detail.ref.id, detail.canonicalSkuId);
});

test("Given Catalog values include absent data, when an unpriced SKU is read, then missing remains null rather than becoming zero", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  const list = await repositories.catalog.list({ priceState: "missing" });
  const item = list.items[0];

  assert.equal(item.merchantSku, "KLD-PANT-0018");
  assert.equal(item.priceState, "missing");
  assert.equal(item.currentPrice, null);
  assert.equal(item.marginBasisPoints, null);
  assert.equal(list.filterResult.authoritativePopulation.filteredCount, null);
});

test("Given the import trust boundary, when the ledger and partial journey load, then every stage and every input row remains accounted for", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  const ledger = await repositories.imports.list();
  const journey = await repositories.imports.getJourney({ batchId: FIXTURE_PARTIAL_IMPORT_ID });

  assertOperationalList(ledger, "import-ledger-list");
  assertImportJourney(journey);
  assert.deepEqual(journey.stages.map((stage) => stage.id), ["upload", "profile", "map", "validate", "review", "commit", "result"]);
  assert.deepEqual(journey.result.counts, {
    input: 80,
    valid: 72,
    warning: 3,
    invalid: 5,
    excluded: 3,
    attempted: 72,
    committed: 68,
    rejected: 4,
    remaining: 5,
  });
  assert.equal(journey.result.persistent, true);
  assert.equal(findAllowedAction(journey.allowedActions, "import.retry").reason.code, "CAPABILITY_UNAVAILABLE");
});

test("Given ambiguous source data, when mapping is inspected, then source examples, target candidates, confidence and template provenance are explicit", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const ledger = await repositories.imports.list({ state: "needs-attention" });

  const journey = await repositories.imports.getJourney({ ref: ledger.items[0].ref });
  const tradeCost = journey.mapping.rows.find((row) => row.source === "Trade Cost");

  assert.equal(journey.mapping.ambiguityCount, 2);
  assert.deepEqual(journey.mapping.unmappedRequired, ["effectiveAt"]);
  assert.equal(tradeCost.state, "ambiguous");
  assert.equal(tradeCost.confidenceBasisPoints, 5400);
  assert.deepEqual(tradeCost.candidates, ["cost.amountMinor", "price.amountMinor"]);
  assert.equal(journey.mapping.savedTemplate.version, "3");
  assert.equal(journey.provenance.truthClass, "DEMO_ONLY");
});

test("Given an import recorded at mapping, when an unreached future URL is requested, then exact version and reached state both fail closed", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  await assert.rejects(
    () => repositories.imports.getJourney({ batchId: FIXTURE_MAPPING_IMPORT_ID, stage: "result" }),
    (error) => error instanceof RepositoryError
      && error.envelope.error.code === "IMPORT_REF_REQUIRED",
  );

  await assert.rejects(
    () => repositories.imports.getJourney({ batchId: FIXTURE_MAPPING_IMPORT_ID, version: "4", stage: "result" }),
    (error) => error instanceof RepositoryError
      && error.envelope.error.code === "IMPORT_STAGE_NOT_AVAILABLE"
      && error.envelope.error.details.resumeStage === "map",
  );

  await assert.rejects(
    () => repositories.imports.getJourney({ batchId: FIXTURE_MAPPING_IMPORT_ID, version: "4", stage: "validate" }),
    (error) => error instanceof RepositoryError
      && error.envelope.error.code === "IMPORT_STAGE_NOT_AVAILABLE",
  );
});

test("Given a fresh Sample data import, when every repository-backed stage completes, then exact versions, idempotency and canonical reconciliation remain explicit", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  const created = await repositories.imports.create({ intent: "cost-update", idempotencyKey: "import:create:contract:001" });
  assert.equal(created.data.ref.id, FIXTURE_SAMPLE_IMPORT_ID);
  assert.equal(created.data.ref.version, "1");
  assert.equal(created.data.stage, "upload");
  assert.equal(created.data.dataLabel, "Sample data");
  assert.equal(created.mutation.authoritative, false);
  assert.equal(findAllowedAction(created.data.allowedActions, "import.upload").enabled, true);

  const createRetry = await repositories.imports.create({ intent: "cost-update", idempotencyKey: "import:create:contract:001" });
  assert.equal(createRetry.mutation.deduplicated, true);
  assert.equal(createRetry.data.ref.version, "1");

  await assert.rejects(
    () => repositories.imports.upload({ batchRef: created.data.ref, sourceFile: null, idempotencyKey: "import:upload:contract:bad" }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "IMPORT_SAMPLE_SOURCE_REQUIRED",
  );

  const uploaded = await repositories.imports.upload({
    batchRef: created.data.ref,
    sourceFile: { name: "owomide-fixture-supplier-costs-messy.csv", format: "CSV", rows: 80, isSynthetic: true },
    idempotencyKey: "import:upload:contract:001",
  });
  assert.equal(uploaded.data.ref.version, "2");
  assert.equal(uploaded.data.stage, "profile");
  assert.equal(findAllowedAction(uploaded.data.allowedActions, "import.profile").enabled, true);

  const profiled = await repositories.imports.profile({ batchRef: uploaded.data.ref, idempotencyKey: "import:profile:contract:001" });
  assert.equal(profiled.data.ref.version, "3");
  assert.equal(profiled.data.stage, "map");
  assert.equal(profiled.data.profile.status, "complete");
  assert.equal(findAllowedAction(profiled.data.allowedActions, "import.mapping.save").enabled, true);

  const mapped = await repositories.imports.saveMapping({
    batchRef: profiled.data.ref,
    mapping: { tradeCostTarget: "cost.amountMinor", priceTarget: "price.amountMinor", effectiveAt: "2026-08-15T00:00:00+01:00" },
    idempotencyKey: "import:mapping:contract:001",
  });
  assert.equal(mapped.data.ref.version, "4");
  assert.equal(mapped.data.stage, "map");
  assert.equal(mapped.data.state, "mapped");
  assert.equal(mapped.data.mapping.ambiguityCount, 0);
  assert.deepEqual(mapped.data.mapping.unmappedRequired, []);
  assert.equal(findAllowedAction(mapped.data.allowedActions, "import.validate").enabled, true);

  const validated = await repositories.imports.validate({ batchRef: mapped.data.ref, idempotencyKey: "import:validation:contract:001" });
  assert.equal(validated.data.ref.version, "5");
  assert.equal(validated.data.stage, "review");
  assert.equal(validated.data.validation.state, "complete");
  assert.equal(findAllowedAction(validated.data.allowedActions, "import.review.acknowledge").enabled, true);

  await assert.rejects(
    () => repositories.imports.getJourney({ batchId: FIXTURE_SAMPLE_IMPORT_ID, stage: "review" }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "IMPORT_REF_REQUIRED",
  );
  await assert.rejects(
    () => repositories.imports.acknowledgeReview({ batchRef: validated.data.ref, acknowledgement: false, idempotencyKey: "import:review:contract:bad" }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "IMPORT_ACKNOWLEDGEMENT_REQUIRED",
  );

  const acknowledged = await repositories.imports.acknowledgeReview({
    batchRef: validated.data.ref,
    acknowledgement: true,
    idempotencyKey: "import:review:contract:001",
  });
  assert.equal(acknowledged.data.ref.version, "6");
  assert.equal(acknowledged.data.stage, "commit");
  assert.equal(acknowledged.data.review.acknowledgement.acknowledged, true);
  assert.equal(findAllowedAction(acknowledged.data.allowedActions, "import.commit.start").enabled, true);

  const committed = await repositories.imports.commit({ batchRef: acknowledged.data.ref, idempotencyKey: "import:commit:contract:001" });
  assert.equal(committed.data.journey.ref.version, "7");
  assert.equal(committed.data.journey.stage, "commit");
  assert.equal(committed.data.operation.ref.id, FIXTURE_SAMPLE_IMPORT_OPERATION_ID);
  assert.equal(committed.data.operation.ref.version, "1");
  assert.equal(committed.data.operation.state, "unknown-outcome");
  assert.deepEqual(committed.data.operation.counts, { attempted: 72, committed: null, rejected: null, remaining: null });
  assert.equal(committed.mutation.authoritative, false);
  assert.equal(findAllowedAction(committed.data.journey.allowedActions, "import.commit.start"), null);
  assert.equal(findAllowedAction(committed.data.journey.allowedActions, "import.commit.reconcile").enabled, true);

  const commitRetry = await repositories.imports.commit({ batchRef: acknowledged.data.ref, idempotencyKey: "import:commit:contract:001" });
  assert.equal(commitRetry.mutation.deduplicated, true);
  assert.equal(commitRetry.data.operation.ref.version, "1");
  await assert.rejects(
    () => repositories.imports.commit({ batchRef: committed.data.journey.ref, idempotencyKey: "import:commit:contract:002" }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "IMPORT_WRONG_STATE",
  );

  const operation = await repositories.imports.getCommitOperation({ operationRef: committed.data.operation.ref });
  assert.equal(operation.status, "awaiting-reconciliation");
  const reconciled = await repositories.imports.reconcileCommit({ operationRef: operation.ref, idempotencyKey: "import:reconcile:contract:001" });
  assert.equal(reconciled.data.journey.ref.version, "8");
  assert.equal(reconciled.data.journey.stage, "result");
  assert.equal(reconciled.data.journey.state, "partial-success");
  assert.equal(reconciled.data.operation.ref.version, "2");
  assert.equal(reconciled.data.operation.state, "reconciled");
  assert.deepEqual(reconciled.data.operation.counts, { attempted: 72, committed: 68, rejected: 4, remaining: 5 });
  assert.equal(reconciled.data.journey.result.catalogWriteAuthoritative, false);
  assert.equal(reconciled.data.journey.result.persistenceScope, "fixture-memory-only");
  assert.equal(reconciled.mutation.authoritative, false);

  const reconcileRetry = await repositories.imports.reconcileCommit({ operationRef: operation.ref, idempotencyKey: "import:reconcile:contract:001" });
  assert.equal(reconcileRetry.mutation.deduplicated, true);
  assert.equal(reconcileRetry.data.journey.ref.version, "8");
  await assert.rejects(
    () => repositories.imports.getJourney({ batchId: FIXTURE_SAMPLE_IMPORT_ID, version: "7", stage: "result" }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "IMPORT_STALE_VERSION",
  );
  const result = await repositories.imports.getJourney({ batchId: FIXTURE_SAMPLE_IMPORT_ID, version: "8", stage: "result" });
  assert.deepEqual(result.result.counts, { input: 80, valid: 72, warning: 3, invalid: 5, excluded: 3, attempted: 72, committed: 68, rejected: 4, remaining: 5 });
});

test("Given FX-004, when Scope then Rule are read, then complete population accounting and the explainable 3.50% rule are unchanged", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  const scope = await repositories.repricing.getScope();
  const ruleTarget = findAllowedAction(scope.allowedActions, "repricing.rule.read").targetRef;
  const rule = await repositories.repricing.getRule({ ref: ruleTarget });

  assertRepricingScope(scope);
  assertRepricingRule(rule);
  assert.equal(scope.ref.id, FIXTURE_CHANGE_SET_ID);
  assert.deepEqual(scope.counts, FIXTURE_COUNTS);
  assert.equal(scope.completeness.complete, true);
  assert.equal(scope.completeness.historicalLimitApplied, false);
  assert.equal(rule.rule.changeBasisPoints, 350);
  assert.equal(rule.rule.currency, "NGN");
  assert.equal(findAllowedAction(rule.allowedActions, "repricing.rule.edit").enabled, true);
});

test("Given the current governed Proposal, when a bounded exception is requested, then the Proposal list reflects pending review without replacing existing journey methods", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const blocked = await repositories.proposals.getDetail();

  await repositories.proposals.requestOverride({
    proposalRef: blocked.ref,
    idempotencyKey: "bdd-directory-override-0001",
  });
  const list = await repositories.proposals.list();

  assert.equal(list.items.length, 1, "failure-only fixture scenarios must not appear as navigable Proposals");
  assert.equal(list.items[0].ref.id, FIXTURE_PROPOSAL_ID);
  assert.equal(list.items[0].state, "blocked");
  assert.equal(list.items[0].readiness, "pending_override");
  assert.equal(findAllowedAction(list.items[0].allowedActions, "proposal.read").enabled, true);
});

test("Given launch policy context, when Rules load, then all eight canonical margin floors are readable and administration remains unavailable", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  const rules = await repositories.rules.list();
  const pantry = await repositories.rules.getDetail({ ruleId: "c886c96d-18d7-51b6-8290-c3f1962b8ede" });

  assertOperationalList(rules, "rule-list");
  assert.equal(rules.items.length, 8);
  assert.equal(pantry.marginFloorBasisPoints, 1400);
  assert.equal(pantry.effect.type, "minimum-margin");
  assert.equal(findAllowedAction(pantry.allowedActions, "rules.edit").enabled, false);
  assert.equal(findAllowedAction(pantry.allowedActions, "rules.edit").reason.code, "CAPABILITY_UNAVAILABLE");
});

test("Given participant-scoped audit access, when Teni reads activity, then authored entity evidence is open but unrelated entities stay forbidden", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  const audit = await repositories.audit.list();
  assertOperationalList(audit, "audit-ledger-list");
  assert.equal(audit.filterResult.accessScope, "owned-or-involved-proposals");
  assert.ok(audit.items[0].sequence > audit.items.at(-1).sequence);

  const authoredImport = await repositories.audit.getEntityHistory({ entityType: "import", entityId: FIXTURE_BASELINE_IMPORT_ID });
  const session = await repositories.identity.getSession();
  assert.ok(authoredImport.items.some((event) => event.actorId === session.actor.id));

  await assert.rejects(
    () => repositories.audit.getEntityHistory({ entityType: "publish", entityId: FIXTURE_PUBLICATION_ID }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "MISSING_PERMISSION",
  );
});

test("Given an authorised Governance auditor, when entity history is opened, then import evidence is read-only, paged and sequence-stable", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.moyo);

  const history = await repositories.audit.getEntityHistory({
    entityType: "import",
    entityId: FIXTURE_BASELINE_IMPORT_ID,
    limit: 3,
  });

  assertOperationalList(history, "audit-entity-history");
  assert.equal(history.items.length, 3);
  assert.equal(history.page.nextCursor, `fixture-audit-import-${FIXTURE_BASELINE_IMPORT_ID}:3`);
  assert.equal(history.filterResult.readOnlyEvidence, true);
  assert.ok(history.items.every((event) => event.object.id === FIXTURE_BASELINE_IMPORT_ID));
});

test("Given a cursor from another collection, when Catalog receives it, then pagination fails closed instead of skipping records", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  await assert.rejects(
    () => repositories.catalog.list({ cursor: "fixture-imports:3" }),
    (error) => error instanceof RepositoryError && error.envelope.error.code === "CATALOG_CURSOR_INVALID",
  );
});
