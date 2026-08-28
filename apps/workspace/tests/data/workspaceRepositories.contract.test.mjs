import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIXTURE_ACTOR_IDS,
  FIXTURE_CONNECTION_METADATA,
  FIXTURE_PREVIEW_REF,
  FIXTURE_PROPOSAL_ID,
  RepositoryError,
  assertProposalHandoff,
  assertRepricingPreview,
  createFixtureWorkspaceRepositories,
  createWorkspaceRepositories,
  findAllowedAction,
  toDomainErrorEnvelope,
} from "../../src/data/index.js";

const REQUIRED_LIVE_BACKEND_ISSUES = Object.freeze([
  "BE-001", "BE-002", "BE-003", "BE-004", "BE-005",
  "BE-006", "BE-007", "BE-008", "BE-009", "BE-010",
  "BE-011", "BE-012", "BE-013", "BE-015", "BE-016",
  "BE-017", "BE-018",
]);

async function repairOperationalBlockers(repositories, sourceRef = FIXTURE_PREVIEW_REF, keyPrefix = "bdd-preview-repair") {
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

test("Given the fixture adapter, when a session is resolved, then identity and multi-role context remain synthetic and server-shaped", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  const session = await repositories.identity.getSession();

  assert.equal(session.actor.id, "e8d32c42-52e3-50bb-a7d9-03abad606dde");
  assert.equal(session.dataLabel, "Sample data");
  assert.deepEqual(session.roleCodes, ["pricing_analyst", "import_admin"]);
  assert.equal(session.provenance.truthClass, "DEMO_ONLY");
  assert.equal(session.provenance.contractCompatibilityClaimed, false);
  assert.deepEqual(repositories.transport, { kind: "fixture-memory", liveNetworkEnabled: false });
});

test("Given the application composition seam, when fixture mode is selected, then the transport-neutral factory returns fixture repositories", async () => {
  const repositories = createWorkspaceRepositories({ mode: "fixture" });

  const session = await repositories.identity.getSession();

  assert.equal(repositories.transport.kind, "fixture-memory");
  assert.equal(session.provenance.truthClass, "DEMO_ONLY");
});

test("Given the current backend gates, when live mode is selected, then composition fails closed without a network attempt", () => {
  assert.throws(
    () => createWorkspaceRepositories({ mode: "live" }),
    (error) => {
      assert.ok(error instanceof RepositoryError);
      assert.equal(error.envelope.error.code, "LIVE_ADAPTER_NOT_RELEASED");
      assert.equal(error.envelope.error.details.eligibility, "MOCK_ONLY");
      assert.deepEqual(error.envelope.error.details.requiredBackendIssues, REQUIRED_LIVE_BACKEND_ISSUES);
      return true;
    },
  );
  assert.deepEqual(FIXTURE_CONNECTION_METADATA.liveGate, REQUIRED_LIVE_BACKEND_ISSUES);
});

test("Given FX-004, when RPR-03 loads, then complete counts reconcile while the first six-row page stays honestly bounded", async () => {
  const { repricing } = createFixtureWorkspaceRepositories();

  const preview = await repricing.getPreview({ ref: FIXTURE_PREVIEW_REF });

  assertRepricingPreview(preview);
  assert.deepEqual(preview.counts, {
    requested: 1248,
    matched: 1248,
    priced: 1239,
    selected: 1227,
    eligible: 1210,
    blocked: 17,
    excluded: 12,
    unpriced: 9,
    total: 1248,
  });
  assert.equal(preview.counts.eligible + preview.counts.excluded + preview.counts.blocked + preview.counts.unpriced, preview.counts.matched);
  assert.equal(preview.counts.eligible + preview.counts.blocked, preview.counts.selected);
  assert.equal(preview.lines.length, 6);
  assert.deepEqual(preview.page, {
    cursor: null,
    nextCursor: "fixture-rpr03:6",
    returnedCount: 6,
    limit: 6,
    totalCount: 1248,
    totalCountRelation: "exact",
    coverage: "bounded-sample",
    exhaustive: false,
  });
});

test("Given the Cassava blocker, when its view model is read, then exact money, margin, policy and provenance survive", async () => {
  const preview = await createFixtureWorkspaceRepositories().repricing.getPreview();

  const cassava = preview.lines.find((line) => line.sku === "KLD-PANT-0032");

  assert.ok(cassava);
  assert.deepEqual(cassava.currentCost, { amountMinor: "151550", currency: "NGN" });
  assert.deepEqual(cassava.currentPrice, { amountMinor: "161250", currency: "NGN" });
  assert.deepEqual(cassava.proposedPrice, { amountMinor: "166894", currency: "NGN" });
  assert.deepEqual(cassava.absoluteDelta, { amountMinor: "5644", currency: "NGN" });
  assert.equal(cassava.currentMarginBasisPoints, 601);
  assert.equal(cassava.proposedMarginBasisPoints, 919);
  assert.equal(cassava.policy.floorBasisPoints, 1400);
  assert.deepEqual(cassava.policy.floorPrice, { amountMinor: "176221", currency: "NGN" });
  assert.equal(cassava.policy.violation.code, "MARGIN_BELOW_FLOOR");
  assert.equal(cassava.provenance.rowNumber, 33);
  assert.equal(cassava.provenance.catalogVersion, "1031");
});

test("Given a classification and query, when the sample page is filtered, then authoritative population counts do not change", async () => {
  const { repricing } = createFixtureWorkspaceRepositories();

  const blocked = await repricing.getPreview({ classification: "blocked", limit: 200 });
  const searched = await repricing.getPreview({ query: "cassava" });

  assert.equal(blocked.lines.length, 8);
  assert.ok(blocked.lines.every((line) => line.classification === "blocked"));
  assert.equal(blocked.counts.total, 1248);
  assert.equal(searched.lines.length, 1);
  assert.equal(searched.lines[0].sku, "KLD-PANT-0032");
  assert.equal(searched.counts.selected, 1227);
});

test("Given the bounded thirteen-line evidence set, when RPR-03 requests filter options, then channel and location facets expose stable IDs, names and sample counts", async () => {
  const preview = await createFixtureWorkspaceRepositories().repricing.getPreview();

  assert.deepEqual(preview.facets, {
    coverage: "bounded-sample",
    sampleLineCount: 13,
    channels: [
      { id: "ef646702-a7c2-5a1b-bd32-9f478a9819b9", name: "Marketplace", sampleLineCount: 3, selected: false },
      { id: "4eb5c830-f8ff-5638-8f4d-9d114bb753b2", name: "Key accounts", sampleLineCount: 3, selected: false },
      { id: "968b2614-ffcc-514d-8b42-3d1500f3b28c", name: "Wholesale accounts", sampleLineCount: 2, selected: false },
      { id: "a888c061-f02d-5dc4-b21b-7075367ca4ac", name: "Retail web", sampleLineCount: 5, selected: false },
    ],
    locations: [
      { id: "dd7903e1-7ab5-5cbf-83fb-e047b222801a", name: "Ibadan cross-dock", sampleLineCount: 3, selected: false },
      { id: "8ac88886-b971-55e8-bc09-00d5fc4d0fac", name: "Abuja fulfilment hub", sampleLineCount: 7, selected: false },
      { id: "d80eaca3-aed1-5fd7-bc61-299f92c57db5", name: "Lagos distribution centre", sampleLineCount: 3, selected: false },
    ],
  });
  assert.deepEqual(preview.filterResult, {
    applied: { query: "", classification: "all", channelId: null, locationId: null },
    activeFilterCount: 0,
    hasActiveFilters: false,
    sample: { availableLineCount: 13, matchedLineCount: 13, returnedLineCount: 6 },
    authoritativePopulation: { totalCount: 1248, filteredCount: null, affectedByFilters: false },
  });
});

test("Given response-derived facet IDs, when compound filters are applied, then selection and sample-result metadata update without inventing an authoritative filtered total", async () => {
  const keyAccountsId = "4eb5c830-f8ff-5638-8f4d-9d114bb753b2";
  const abujaId = "8ac88886-b971-55e8-bc09-00d5fc4d0fac";

  const preview = await createFixtureWorkspaceRepositories().repricing.getPreview({
    query: "  Malt  ",
    classification: "blocked",
    channelId: keyAccountsId,
    locationId: abujaId,
  });

  assert.equal(preview.lines.length, 1);
  assert.equal(preview.lines[0].sku, "KLD-BEVE-0166");
  assert.equal(preview.facets.channels.find((option) => option.id === keyAccountsId).selected, true);
  assert.equal(preview.facets.locations.find((option) => option.id === abujaId).selected, true);
  assert.deepEqual(preview.filterResult, {
    applied: {
      query: "Malt",
      classification: "blocked",
      channelId: keyAccountsId,
      locationId: abujaId,
    },
    activeFilterCount: 4,
    hasActiveFilters: true,
    sample: { availableLineCount: 13, matchedLineCount: 1, returnedLineCount: 1 },
    authoritativePopulation: { totalCount: 1248, filteredCount: null, affectedByFilters: false },
  });
});

test("Given a small page limit, when the next fixture cursor is used, then paging is stable without claiming full-population exhaustion", async () => {
  const { repricing } = createFixtureWorkspaceRepositories();

  const first = await repricing.getPreview({ limit: 2 });
  const second = await repricing.getPreview({ limit: 2, cursor: first.page.nextCursor });
  const third = await repricing.getPreview({ limit: 2, cursor: second.page.nextCursor });
  const fourth = await repricing.getPreview({ limit: 2, cursor: third.page.nextCursor });
  const fifth = await repricing.getPreview({ limit: 2, cursor: fourth.page.nextCursor });
  const sixth = await repricing.getPreview({ limit: 2, cursor: fifth.page.nextCursor });
  const seventh = await repricing.getPreview({ limit: 2, cursor: sixth.page.nextCursor });

  assert.equal(first.page.nextCursor, "fixture-rpr03:2");
  assert.equal(second.page.nextCursor, "fixture-rpr03:4");
  assert.equal(third.page.nextCursor, "fixture-rpr03:6");
  assert.equal(sixth.page.nextCursor, "fixture-rpr03:12");
  assert.equal(seventh.page.nextCursor, null);
  assert.equal(seventh.page.exhaustive, false);
  assert.deepEqual(first.filterResult.sample, { availableLineCount: 13, matchedLineCount: 13, returnedLineCount: 2 });
  assert.deepEqual(sixth.filterResult.sample, { availableLineCount: 13, matchedLineCount: 13, returnedLineCount: 2 });
  assert.deepEqual(seventh.filterResult.sample, { availableLineCount: 13, matchedLineCount: 13, returnedLineCount: 1 });
  assert.equal(new Set([...first.lines, ...second.lines, ...third.lines, ...fourth.lines, ...fifth.lines, ...sixth.lines, ...seventh.lines].map((line) => line.id)).size, 13);
});

test("Given server-shaped actions, when RPR-03 renders its CTA, then it follows allowedActions rather than role labels", async () => {
  const preview = await createFixtureWorkspaceRepositories().repricing.getPreview();

  const createProposal = findAllowedAction(preview.allowedActions, "proposal.create");
  const readProposal = findAllowedAction(preview.allowedActions, "proposal.read");
  const exportPreview = findAllowedAction(preview.allowedActions, "repricing.preview.export");

  assert.equal(createProposal.enabled, false);
  assert.equal(createProposal.requiredVersion, FIXTURE_PREVIEW_REF.version);
  assert.equal(createProposal.reason.code, "ALREADY_EXISTS");
  assert.equal(createProposal.confirmation, null);
  assert.equal(readProposal.enabled, true);
  assert.equal(readProposal.requiredVersion, "3");
  assert.equal(readProposal.confirmation, null);
  assert.deepEqual(readProposal.targetRef, {
    kind: "resource",
    id: FIXTURE_PROPOSAL_ID,
    version: "3",
  });
  assert.equal(exportPreview.enabled, false);
  assert.equal(exportPreview.reason.code, "CAPABILITY_UNAVAILABLE");
});

test("Given the exact Preview already has a Proposal, when creation bypasses the advertised action, then duplication fails closed", async () => {
  const repositories = createFixtureWorkspaceRepositories();

  await assert.rejects(
    () => repositories.proposals.createFromPreview({
      sourcePreviewRef: FIXTURE_PREVIEW_REF,
      idempotencyKey: "bdd-proposal-duplicate-0001",
    }),
    (error) => error instanceof RepositoryError
      && error.envelope.error.code === "ALREADY_EXISTS"
      && error.envelope.error.details.proposalRef.id === FIXTURE_PROPOSAL_ID,
  );
});

test("Given the shared resolved session, when the evidence actor changes, then Proposal creation is capability-shaped while Preview read stays truthful", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const teniPreview = await repositories.repricing.getPreview();

  assert.equal(findAllowedAction(teniPreview.allowedActions, "repricing.preview.read").enabled, true);
  assert.equal(findAllowedAction(teniPreview.allowedActions, "proposal.create").enabled, false);
  assert.equal(findAllowedAction(teniPreview.allowedActions, "proposal.create").reason.code, "ALREADY_EXISTS");
  assert.equal(findAllowedAction(teniPreview.allowedActions, "proposal.read").enabled, true);
  assert.ok((await repositories.identity.getSession()).effectiveCapabilities.includes("proposal:create"));

  for (const actorId of [FIXTURE_ACTOR_IDS.chika, FIXTURE_ACTOR_IDS.farida, FIXTURE_ACTOR_IDS.moyo]) {
    const session = await repositories.identity.selectDesignEvidenceActor(actorId);
    const preview = await repositories.repricing.getPreview();
    const read = findAllowedAction(preview.allowedActions, "repricing.preview.read");
    const create = findAllowedAction(preview.allowedActions, "proposal.create");
    const open = findAllowedAction(preview.allowedActions, "proposal.read");

    assert.equal(session.effectiveCapabilities.includes("proposal:create"), false);
    assert.equal(read.enabled, true);
    assert.equal(read.reason, null);
    assert.equal(create.enabled, false);
    assert.equal(create.reason.code, "ALREADY_EXISTS");
    assert.equal(create.confirmation, null);
    assert.equal(open.enabled, true);
    assert.equal(open.reason, null);
    assert.equal(open.requiredVersion, "3");
    assert.deepEqual(open.targetRef, {
      kind: "resource",
      id: FIXTURE_PROPOSAL_ID,
      version: "3",
    });
  }

  await assert.rejects(
    () => repositories.proposals.createFromPreview({
      sourcePreviewRef: FIXTURE_PREVIEW_REF,
      idempotencyKey: "bdd-proposal-create-forbidden-0001",
    }),
    (error) => {
      assert.equal(error.envelope.error.code, "MISSING_PERMISSION");
      assert.equal(error.envelope.error.details.requiredCapability, "proposal:create");
      return true;
    },
  );
});

test("Given a session without Proposal read authority, when Preview actions resolve, then opening the handoff fails closed independently of Preview read", async () => {
  const repositories = createFixtureWorkspaceRepositories({ designEvidenceCapabilities: ["repricing:prepare"] });
  const preview = await repositories.repricing.getPreview();

  assert.equal(findAllowedAction(preview.allowedActions, "repricing.preview.read").enabled, true);
  assert.equal(findAllowedAction(preview.allowedActions, "proposal.create").enabled, false);
  const open = findAllowedAction(preview.allowedActions, "proposal.read");
  assert.equal(open.enabled, false);
  assert.equal(open.reason.code, "MISSING_PERMISSION");
  assert.equal(open.reason.message, "Proposal read access is required for this resolved session.");
  assert.equal(open.confirmation, null);
  assert.equal(open.targetRef, null);
});

test("Given the current Preview version, when Teni creates a Proposal, then all selected lines and blockers transfer without approval or publish", async () => {
  const repositories = createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
  const preview = await repairOperationalBlockers(repositories, FIXTURE_PREVIEW_REF, "bdd-create-repair");

  const result = await repositories.proposals.createFromPreview({
    sourcePreviewRef: preview.ref,
    idempotencyKey: "bdd-proposal-create-0001",
    title: "August cost recovery",
  });

  assertProposalHandoff(result.data);
  assert.equal(result.mutation.applied, true);
  assert.equal(result.mutation.authoritative, false);
  assert.equal(result.mutation.deduplicated, false);
  assert.equal(result.data.state, "blocked");
  assert.deepEqual(result.data.sourcePreviewRef, preview.ref);
  assert.deepEqual(result.data.counts, { selected: 1227, eligible: 1215, blocked: 12 });
  assert.equal(result.data.author.id, "e8d32c42-52e3-50bb-a7d9-03abad606dde");
  assert.equal(findAllowedAction(result.data.allowedActions, "override.request").enabled, true);
  assert.equal(findAllowedAction(result.data.allowedActions, "proposal.submit").reason.code, "WRONG_STATE");
  assert.equal(findAllowedAction(result.data.allowedActions, "proposal.approve").reason.code, "WRONG_ACTOR");
  assert.equal(findAllowedAction(result.data.allowedActions, "proposal.publish").reason.code, "WRONG_STATE");
});

test("Given the Proposal creation boundary, when a handoff is validated, then only draft or blocked creation states are accepted", async () => {
  const repositories = createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
  const preview = await repairOperationalBlockers(repositories, FIXTURE_PREVIEW_REF, "bdd-state-boundary-repair");
  const result = await repositories.proposals.createFromPreview({
    sourcePreviewRef: preview.ref,
    idempotencyKey: "bdd-proposal-create-state-boundary-0001",
    title: "August cost recovery",
  });
  const handoff = structuredClone(result.data);

  assert.doesNotThrow(() => assertProposalHandoff({ ...handoff, state: "draft" }));
  assert.doesNotThrow(() => assertProposalHandoff({ ...handoff, state: "blocked" }));
  for (const state of ["submitted", "approved"]) {
    assert.throws(
      () => assertProposalHandoff({ ...handoff, state }),
      /proposal creation handoff must remain draft or blocked/,
    );
  }
});

test("Given a repeated mutation key, when the same request is retried, then the mutation is safely deduplicated", async () => {
  const repositories = createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
  const preview = await repairOperationalBlockers(repositories, FIXTURE_PREVIEW_REF, "bdd-retry-repair");
  const request = {
    sourcePreviewRef: preview.ref,
    idempotencyKey: "bdd-proposal-create-retry-0001",
    title: "August cost recovery",
  };

  const first = await repositories.proposals.createFromPreview(request);
  const retry = await repositories.proposals.createFromPreview(request);

  assert.equal(first.mutation.deduplicated, false);
  assert.equal(retry.mutation.deduplicated, true);
  assert.equal(retry.data.ref.id, first.data.ref.id);
  assert.deepEqual(retry.data.counts, first.data.counts);
});

test("Given a used mutation key, when its payload changes, then a stable idempotency conflict is returned", async () => {
  const repositories = createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
  const preview = await repairOperationalBlockers(repositories, FIXTURE_PREVIEW_REF, "bdd-conflict-repair");
  const idempotencyKey = "bdd-proposal-create-conflict-0001";
  await repositories.proposals.createFromPreview({
    sourcePreviewRef: preview.ref,
    idempotencyKey,
    title: "August cost recovery",
  });

  await assert.rejects(
    () => repositories.proposals.createFromPreview({
      sourcePreviewRef: preview.ref,
      idempotencyKey,
      title: "Changed title",
    }),
    (error) => {
      assert.ok(error instanceof RepositoryError);
      assert.equal(error.envelope.error.code, "IDEMPOTENCY_KEY_REUSED");
      assert.equal(error.envelope.error.retryable, false);
      assert.equal(error.envelope.traceId, "fixture-proposal-idempotency-conflict");
      return true;
    },
  );
});

test("Given a stale Preview reference, when Proposal creation is attempted, then work is rejected before mutation with a safe error envelope", async () => {
  const { proposals } = createFixtureWorkspaceRepositories();

  await assert.rejects(
    () => proposals.createFromPreview({
      sourcePreviewRef: { ...FIXTURE_PREVIEW_REF, version: "older-fixture-version" },
      idempotencyKey: "bdd-proposal-stale-0001",
    }),
    (error) => {
      const envelope = toDomainErrorEnvelope(error);
      assert.equal(envelope.error.code, "REPRICING_PREVIEW_STALE_VERSION");
      assert.equal(envelope.error.retryable, false);
      assert.deepEqual(envelope.error.details, {
        expectedVersion: "older-fixture-version",
        currentVersion: FIXTURE_PREVIEW_REF.version,
      });
      assert.equal(typeof envelope.traceId, "string");
      assert.equal("stack" in envelope.error, false);
      return true;
    },
  );
});

test("Given no source Preview reference, when Proposal creation is attempted, then the mutation fails closed", async () => {
  const { proposals } = createFixtureWorkspaceRepositories();

  await assert.rejects(
    () => proposals.createFromPreview({
      idempotencyKey: "bdd-proposal-missing-source-0001",
    }),
    (error) => {
      assert.ok(error instanceof RepositoryError);
      assert.equal(error.envelope.error.code, "PROPOSAL_SOURCE_PREVIEW_REQUIRED");
      assert.equal(error.envelope.error.retryable, false);
      return true;
    },
  );
});

test("Given the fixture composition, when repositories execute, then no live network transport is invoked", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("fixture repositories must not call fetch");
  };
  try {
    const repositories = createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
    await repositories.identity.getSession();
    const preview = await repairOperationalBlockers(repositories, FIXTURE_PREVIEW_REF, "bdd-no-network-repair");
    await repositories.proposals.createFromPreview({
      sourcePreviewRef: preview.ref,
      idempotencyKey: "bdd-no-network-create-0001",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(FIXTURE_CONNECTION_METADATA.liveNetworkEnabled, false);
  assert.equal(FIXTURE_CONNECTION_METADATA.backendEligibility, "MOCK_ONLY");
});
