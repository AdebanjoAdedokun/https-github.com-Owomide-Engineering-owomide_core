import {
  FIXTURE_PREVIEW_REF,
  FIXTURE_PROVENANCE,
  FIXTURE_REPRICING_LINES,
  FIXTURE_SESSION,
} from "./repricingPreviewV0.js";

/** @import {AuditEvent, OverrideRequest, ProposalDetail, PublicationOperation, WorkspaceSession} from "../contracts.js" */

export const FIXTURE_PROPOSAL_ID = "767fb699-bfb5-56eb-a296-3a0a70c9430a";
export const FIXTURE_GENERATED_PROPOSAL_ID = "bcbcf0e0-853f-533f-9086-12bf2c5217ca";
export const FIXTURE_OVERRIDE_ID = "7ca1b72c-f1b4-5ab4-b5ed-8962c53c6cb2";
export const FIXTURE_PUBLICATION_ID = "3b93717c-f05f-56d4-9762-646a7e915e1f";
export const FIXTURE_FX010_SCENARIO_ID = "FX-010";
export const FIXTURE_PUBLISH_IDEMPOTENCY_KEY = "fx007-publish-attempt-0001";

export const FIXTURE_ACTOR_IDS = Object.freeze({
  teni: "e8d32c42-52e3-50bb-a7d9-03abad606dde",
  chika: "821221ff-d046-5c08-88b9-bac9e2bd378a",
  farida: "d8a10389-4be7-561f-9e25-e8f3677ad7c2",
  moyo: "90100976-76f8-531a-b40e-65bde5dce717",
  manager: "1886df5c-f831-5b55-879f-aabf4888c647",
  owner: "3b9b9141-dd70-5a54-b97d-a65dcdb85635",
  contributor: "4ba27895-621f-59bc-8a91-648cf13b6aa6",
  contributorPeer: "57e5958a-9628-5e69-94c5-b1cbb2ec362d",
  commercial: "6c1b4fe1-feb1-55a9-aad0-a05459f5cbe1",
  executive: "7c01a562-f686-5a74-a71e-542aeb170095",
  viewer: "8fb803b8-82fa-51e1-ab8e-e49b6b6f637e",
});

const ACTORS = Object.freeze({
  teni: Object.freeze({ id: FIXTURE_ACTOR_IDS.teni, displayName: "Teni · Sample Operator" }),
  chika: Object.freeze({ id: FIXTURE_ACTOR_IDS.chika, displayName: "Chika · Sample Approver" }),
  farida: Object.freeze({ id: FIXTURE_ACTOR_IDS.farida, displayName: "Farida · Sample Publisher" }),
  moyo: Object.freeze({ id: FIXTURE_ACTOR_IDS.moyo, displayName: "Moyo · Sample Administrator" }),
  manager: Object.freeze({ id: FIXTURE_ACTOR_IDS.manager, displayName: "Ada · Sample Pricing Manager" }),
  owner: Object.freeze({ id: FIXTURE_ACTOR_IDS.owner, displayName: "Bola · Sample Account Owner" }),
  contributor: Object.freeze({ id: FIXTURE_ACTOR_IDS.contributor, displayName: "Seyi · Sample Contributor" }),
  contributorPeer: Object.freeze({ id: FIXTURE_ACTOR_IDS.contributorPeer, displayName: "Dele · Sample Contributor" }),
  commercial: Object.freeze({ id: FIXTURE_ACTOR_IDS.commercial, displayName: "Zainab · Sample Commercial Approver" }),
  executive: Object.freeze({ id: FIXTURE_ACTOR_IDS.executive, displayName: "Kunle · Sample Executive Approver" }),
  viewer: Object.freeze({ id: FIXTURE_ACTOR_IDS.viewer, displayName: "Fola · Sample Viewer" }),
});

// Explicit fixture capability scenarios, not a migration of production roles.
export const FIXTURE_ROLE_LABELS = Object.freeze({
  pricing_analyst: "Pricing Analyst", import_admin: "Import preparation (sample)",
  approver: "Finance Approver", publisher: "Executor", governance_auditor: "Auditor",
  pricing_manager: "Pricing Manager", account_owner: "Account Owner",
  pricing_contributor: "Pricing Contributor", commercial_approver: "Commercial Approver",
  executive_approver: "Executive Approver", viewer: "Viewer",
});

/**
 * Evidence identities exist only so BDD and visual evidence can exercise the
 * resolved-session boundary. Product UI must never expose this as persona
 * switching; live identity continues to come from the authenticated session.
 *
 * @param {keyof typeof ACTORS} key
 * @param {string[]} roleCodes
 * @param {string[]} capabilities
 * @returns {WorkspaceSession}
 */
function evidenceSession(key, roleCodes, capabilities) {
  return Object.freeze({
    ref: Object.freeze({ kind: "fixture-scenario", id: ACTORS[key].id, version: "0.0.0-design.1" }),
    actor: ACTORS[key],
    organisation: FIXTURE_SESSION.organisation,
    roleCodes: Object.freeze(roleCodes),
    roleLabels: Object.freeze(roleCodes.map((code) => FIXTURE_ROLE_LABELS[code] ?? code)),
    effectiveCapabilities: Object.freeze([...capabilities, ...(["teni", "chika", "farida", "moyo", "manager", "commercial", "executive"].includes(key) ? ["pricing:economics:read"] : [])]),
    capabilityVersion: "fixture:0.0.0-design.1",
    dataLabel: "Sample data",
    provenance: FIXTURE_PROVENANCE,
  });
}

export const FIXTURE_EVIDENCE_SESSIONS = Object.freeze({
  [FIXTURE_ACTOR_IDS.teni]: evidenceSession("teni", ["pricing_analyst", "import_admin"], [
    "catalog:read", "import:prepare", "repricing:prepare", "proposal:create", "proposal:read", "proposal:comment", "proposal:submit", "proposal:draft:edit", "proposal:handoff", "override:request", "rules:read", "company:read",
  ]),
  [FIXTURE_ACTOR_IDS.chika]: evidenceSession("chika", ["approver"], [
    "catalog:read", "proposal:read", "proposal:comment", "proposal:review", "proposal:approve", "override:decide",
  ]),
  [FIXTURE_ACTOR_IDS.farida]: evidenceSession("farida", ["publisher"], [
    "catalog:read", "proposal:read", "proposal:comment", "publish:execute", "publish:reconcile",
  ]),
  [FIXTURE_ACTOR_IDS.moyo]: evidenceSession("moyo", ["governance_auditor"], [
    "proposal:read", "audit:read",
  ]),
  [FIXTURE_ACTOR_IDS.manager]: evidenceSession("manager", ["pricing_manager"], [
    "catalog:read", "import:prepare", "repricing:prepare", "proposal:create", "proposal:read", "proposal:comment", "proposal:submit", "proposal:draft:edit", "proposal:handoff", "proposal:handoff:receive", "override:request", "rules:read", "company:read", "request:triage",
  ]),
  [FIXTURE_ACTOR_IDS.owner]: evidenceSession("owner", ["account_owner"], [
    "company:read", "company:policy:update",
  ]),
  [FIXTURE_ACTOR_IDS.contributor]: evidenceSession("contributor", ["pricing_contributor"], [
    "request:create", "request:read:own",
  ]),
  [FIXTURE_ACTOR_IDS.contributorPeer]: evidenceSession("contributorPeer", ["pricing_contributor"], [
    "request:create", "request:read:own",
  ]),
  [FIXTURE_ACTOR_IDS.commercial]: evidenceSession("commercial", ["commercial_approver"], [
    "proposal:read", "proposal:comment", "proposal:review", "proposal:approve", "override:decide",
  ]),
  [FIXTURE_ACTOR_IDS.executive]: evidenceSession("executive", ["executive_approver"], [
    "proposal:read", "proposal:comment", "proposal:review", "proposal:approve", "override:decide",
  ]),
  [FIXTURE_ACTOR_IDS.viewer]: evidenceSession("viewer", ["viewer"], [
    "catalog:read", "proposal:read",
  ]),
});

export const FIXTURE_JOURNEY_ACTORS = ACTORS;

/** @type {ProposalDetail} */
export const FIXTURE_PROPOSAL_DETAIL = Object.freeze({
  kind: "proposal-detail",
  ref: Object.freeze({ kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "3" }),
  title: "August cost recovery",
  state: "blocked",
  readiness: "blocked",
  sourcePreviewRef: FIXTURE_PREVIEW_REF,
  createdAt: "2026-08-10T08:40:00Z",
  effectiveAt: "2026-08-15T00:00:00+01:00",
  author: ACTORS.teni,
  assignedApprover: ACTORS.chika,
  assignedPublisher: ACTORS.farida,
  counts: Object.freeze({ selected: 1227, eligible: 1210, blocked: 17 }),
  blockers: Object.freeze({ total: 17, margin: 12, staleCost: 3, dimension: 2 }),
  override: null,
  approval: null,
  publicationRef: null,
  allowedActions: Object.freeze([]),
  provenance: FIXTURE_PROVENANCE,
});

const FIXTURE_MARGIN_LINES = Object.freeze(
  FIXTURE_REPRICING_LINES.filter((line) => line.policy.violation?.code === "MARGIN_BELOW_FLOOR"),
);

/**
 * Retained Proposal evidence is deliberately separate from the live rule
 * directory. It describes the policy snapshot used by this exact Proposal
 * version and never re-evaluates a line in the browser.
 */
export const FIXTURE_PROPOSAL_MARGIN_EVIDENCE = Object.freeze({
  kind: "proposal-margin-evidence",
  proposalRef: Object.freeze({ kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "3" }),
  sourcePreviewRef: FIXTURE_PREVIEW_REF,
  evaluatedAt: "2026-08-10T08:48:00Z",
  policySnapshot: Object.freeze({
    kind: "retained-rule-snapshot",
    version: "0.0.0-design.1",
    label: "Minimum margin",
    effect: "Hold prices below the applicable floor",
    floorRangeBasisPoints: Object.freeze({ minimum: 1400, maximum: 1600 }),
  }),
  counts: Object.freeze({ retained: 12, unresolved: 12, sampleAvailable: FIXTURE_MARGIN_LINES.length }),
  lines: FIXTURE_MARGIN_LINES,
  allowedActions: Object.freeze([]),
  provenance: FIXTURE_PROVENANCE,
});

/**
 * A bounded sample comment proves authorship and version attachment without
 * claiming a live collaboration history.
 */
export const FIXTURE_PROPOSAL_COMMENTS = Object.freeze([
  Object.freeze({
    kind: "proposal-comment",
    ref: Object.freeze({ kind: "resource", id: "2bd9c5ee-31c4-54fa-aebc-a93447ac067f", version: "1" }),
    proposalRef: Object.freeze({ kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "3" }),
    actor: ACTORS.chika,
    body: "Please retain the line-level floor evidence and expiry before independent review.",
    createdAt: "2026-08-10T08:50:00Z",
    editedAt: null,
    provenance: FIXTURE_PROVENANCE,
  }),
]);

/** @type {OverrideRequest} */
export const FIXTURE_OVERRIDE_REQUEST = Object.freeze({
  kind: "override-request",
  ref: Object.freeze({ kind: "resource", id: FIXTURE_OVERRIDE_ID, version: "1" }),
  state: "pending",
  proposalRef: Object.freeze({ kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "3" }),
  requester: ACTORS.teni,
  decider: null,
  lineCount: 12,
  reason: "Time-bounded cost recovery while the current margin policy remains authoritative.",
  evidence: "sample-commercial-note.txt",
  expiresAt: "2026-08-17T17:00:00+01:00",
  requestedAt: "2026-08-10T08:56:00Z",
  decidedAt: null,
  allowedActions: Object.freeze([]),
  provenance: FIXTURE_PROVENANCE,
});

/** @type {Record<"1" | "2" | "3" | "4", PublicationOperation>} */
export const FIXTURE_PUBLICATION_STATES = Object.freeze({
  "1": Object.freeze({
    kind: "publication-operation",
    ref: Object.freeze({ kind: "resource", id: FIXTURE_PUBLICATION_ID, version: "1" }),
    state: "unknown-outcome",
    proposalRef: Object.freeze({ kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "9" }),
    publisher: ACTORS.farida,
    idempotencyKey: FIXTURE_PUBLISH_IDEMPOTENCY_KEY,
    counts: Object.freeze({ requested: 1227, attempted: 1227, succeeded: 0, failed: 0, remaining: 1227, duplicateWrites: 0 }),
    supportId: "sample-trace-fx007",
    allowedActions: Object.freeze([]),
    provenance: FIXTURE_PROVENANCE,
  }),
  "2": Object.freeze({
    kind: "publication-operation",
    ref: Object.freeze({ kind: "resource", id: FIXTURE_PUBLICATION_ID, version: "2" }),
    state: "incomplete",
    proposalRef: Object.freeze({ kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "9" }),
    publisher: ACTORS.farida,
    idempotencyKey: FIXTURE_PUBLISH_IDEMPOTENCY_KEY,
    counts: Object.freeze({ requested: 1227, attempted: 1227, succeeded: 1223, failed: 4, remaining: 4, duplicateWrites: 0 }),
    supportId: null,
    allowedActions: Object.freeze([]),
    provenance: FIXTURE_PROVENANCE,
  }),
  "3": Object.freeze({
    kind: "publication-operation",
    ref: Object.freeze({ kind: "resource", id: FIXTURE_PUBLICATION_ID, version: "3" }),
    state: "reconciling",
    proposalRef: Object.freeze({ kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "9" }),
    publisher: ACTORS.farida,
    idempotencyKey: FIXTURE_PUBLISH_IDEMPOTENCY_KEY,
    counts: Object.freeze({ requested: 1227, attempted: 4, succeeded: 1223, failed: 4, remaining: 4, duplicateWrites: 0 }),
    supportId: null,
    allowedActions: Object.freeze([]),
    provenance: FIXTURE_PROVENANCE,
  }),
  "4": Object.freeze({
    kind: "publication-operation",
    ref: Object.freeze({ kind: "resource", id: FIXTURE_PUBLICATION_ID, version: "4" }),
    state: "published",
    proposalRef: Object.freeze({ kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "9" }),
    publisher: ACTORS.farida,
    idempotencyKey: FIXTURE_PUBLISH_IDEMPOTENCY_KEY,
    counts: Object.freeze({ requested: 1227, attempted: 4, succeeded: 1227, failed: 0, remaining: 0, duplicateWrites: 0 }),
    supportId: null,
    allowedActions: Object.freeze([]),
    provenance: FIXTURE_PROVENANCE,
  }),
});

const IMPORT_ID = "71345dfe-ce8f-57e0-9549-76774f919cf9";
const CHANGE_SET_ID = "2beecc58-6ac9-5edb-bc59-7fc80b31cbd0";
const AUDIT_VIEW_ID = "1290cc7f-b89f-5939-89cf-df0ca06fd4af";

/**
 * @param {number} sequence
 * @param {string} id
 * @param {string} eventType
 * @param {string} objectId
 * @param {string} objectType
 * @param {string} version
 * @param {keyof typeof ACTORS | null} actorKey
 * @param {Record<string, unknown> | null} before
 * @param {Record<string, unknown> | null} after
 * @param {string} reason
 * @returns {AuditEvent}
 */
function event(sequence, id, eventType, objectId, objectType, version, actorKey, before, after, reason) {
  const roles = { teni: "Operator", chika: "Approver", farida: "Publisher", moyo: "Administrator" };
  return Object.freeze({
    id,
    sequence,
    occurredAt: `2026-08-10T${String(8 + Math.floor(sequence * 4 / 60)).padStart(2, "0")}:${String((sequence * 4) % 60).padStart(2, "0")}:00Z`,
    eventType,
    object: Object.freeze({ id: objectId, type: objectType, version }),
    actorId: actorKey ? ACTORS[actorKey].id : null,
    actorRole: actorKey ? roles[actorKey] : null,
    sourceType: sequence === 1 ? "import" : actorKey ? "human" : "system",
    before: before ? Object.freeze(before) : null,
    after: after ? Object.freeze(after) : null,
    reason,
    isSynthetic: true,
  });
}

/**
 * Alternate branch evidence for a denied exception. It is deliberately kept
 * outside `FIXTURE_AUDIT_EVENTS` so the canonical approved FX-010 25-event
 * reconstruction remains byte-for-byte grounded in fixture.json.
 * @type {AuditEvent}
 */
export const FIXTURE_OVERRIDE_DENIED_EVENT = event(
  15,
  "4f7e720f-4c8a-5a08-84d4-1c1b49a5e1d2",
  "override.denied",
  FIXTURE_OVERRIDE_ID,
  "override",
  "2",
  "chika",
  { lineCount: 12, state: "pending" },
  { lineCount: 12, state: "denied" },
  "A different authorised actor denied the bounded exception; all twelve margin lines remained blocked.",
);

/** @type {AuditEvent[]} */
export const FIXTURE_AUDIT_EVENTS = Object.freeze([
  event(1, "fcd3ec3f-cba7-5060-bea1-07ec84549448", "import.uploaded", IMPORT_ID, "import", "1", "teni", null, { input: 1248, state: "uploaded" }, "Fictional baseline selected for explicit review."),
  event(2, "84aa9510-ce92-5ee5-aac0-f9e3081a4567", "import.profiled", IMPORT_ID, "import", "2", null, { state: "uploaded" }, { state: "profiled" }, "Columns and source examples profiled."),
  event(3, "d7082374-8dfe-5d09-a274-138640fd5129", "import.mapping_saved", IMPORT_ID, "import", "3", "teni", { state: "profiled" }, { state: "mapped" }, "Required fields mapped and template saved."),
  event(4, "cb52098b-b51b-54f2-8b75-b81bc2e40b16", "import.validated", IMPORT_ID, "import", "4", null, { state: "mapped" }, { invalid: 0, state: "validated", valid: 1248 }, "Full input reconciled before crossing the trust boundary."),
  event(5, "7d199470-6aef-5173-bd1c-1a2bd5486682", "import.review_confirmed", IMPORT_ID, "import", "5", "teni", { state: "validated" }, { state: "reviewed" }, "Operator confirmed the synthetic bootstrap scope."),
  event(6, "4ad37ff1-0d53-5a85-8636-ad4a9dc577b3", "import.committed", IMPORT_ID, "import", "6", null, { state: "reviewed" }, { committed: 1248, state: "committed" }, "All reviewed bootstrap rows were committed."),
  event(7, "56d15cef-3695-5b6a-90e1-3aea2d0fdd07", "repricing.draft_created", CHANGE_SET_ID, "change-set", "1", "teni", null, { matched: 1248, state: "draft" }, "Operator created a 3.5% change draft."),
  event(8, "22f38ac3-67f6-520b-9589-618971a33c6c", "fx.context_confirmed", CHANGE_SET_ID, "change-set", "2", null, { state: "draft" }, { conversionApplied: false, sourceCurrency: "NGN", state: "fx-confirmed", targetCurrency: "NGN" }, "NGN source and target context required no conversion."),
  event(9, "9a7d980f-a8bb-5e92-93de-b7c295a4f800", "repricing.previewed", CHANGE_SET_ID, "change-set", "3", null, { state: "fx-confirmed" }, { blocked: 17, eligible: 1210, excluded: 12, matched: 1248, selected: 1227, state: "previewed", unpriced: 9 }, "Every matched SKU received an explicit classification."),
  event(10, "ebde67fd-e824-5e7b-b49b-75353f1fa829", "proposal.created", FIXTURE_PROPOSAL_ID, "proposal", "1", "teni", null, { blocked: 17, lines: 1227, state: "draft" }, "The full selected population transferred without invisible recalculation or row loss."),
  event(11, "9c39a8c5-6b66-5117-9902-86e44d4c7fdd", "rule.evaluated", FIXTURE_PROPOSAL_ID, "proposal", "2", null, { lines: 1227, state: "draft" }, { dimensionBlocked: 2, lines: 1227, marginBlocked: 12, staleCost: 3, state: "blocked" }, "The current pricing and margin rules were evaluated for all selected lines."),
  event(12, "3902ae45-2ce0-5ffc-88d0-5d0fe826abf5", "margin.blocked", FIXTURE_PROPOSAL_ID, "proposal", "3", null, { blocked: 17, state: "blocked" }, { blocked: 17, marginBlocked: 12, state: "blocked" }, "Twelve selected lines remained below their applicable margin floors."),
  event(13, "7829d6f5-c68a-5c6f-ae76-876b61bd2569", "proposal.comment_added", FIXTURE_PROPOSAL_ID, "proposal", "4", "chika", { commentCount: 0, state: "blocked" }, { commentCount: 1, state: "blocked" }, "Approver requested bounded evidence for the margin exceptions."),
  event(14, "6b3b5551-293b-5013-a773-091afe0d230f", "override.requested", FIXTURE_OVERRIDE_ID, "override", "1", "teni", null, { expiresAt: "2026-08-17T17:00:00+01:00", lineCount: 12, state: "pending" }, "Operator supplied reason, evidence, twelve-line scope, and expiry."),
  event(15, "7cdb7c6f-7b35-55fc-b7b7-e3435276c7b0", "override.approved", FIXTURE_OVERRIDE_ID, "override", "2", "chika", { lineCount: 12, state: "pending" }, { lineCount: 12, state: "approved" }, "A different authorised actor approved the bounded twelve-line exception."),
  event(16, "b8b69a43-7bff-50e4-874c-e2b8c96d7455", "catalog.costs_refreshed", FIXTURE_PROPOSAL_ID, "proposal", "5", null, { blocked: 17, state: "blocked" }, { blocked: 14, staleCostResolved: 3, state: "blocked" }, "Three stale costs were refreshed and the affected lines were recalculated."),
  event(17, "42b5fc22-6552-5cd6-9c2f-98eb4c6f0ea0", "catalog.dimension_scope_reconciled", FIXTURE_PROPOSAL_ID, "proposal", "6", null, { blocked: 14, state: "blocked" }, { blocked: 12, dimensionResolved: 2, state: "blocked" }, "Two blocked dimension contexts were preserved under the reviewed scope mapping."),
  event(18, "fb72628d-1cc2-5aaf-95d7-523aeb03c705", "proposal.override_applied", FIXTURE_PROPOSAL_ID, "proposal", "7", null, { blocked: 12, lines: 1227, state: "blocked" }, { blocked: 0, lines: 1227, state: "ready" }, "The approved override resolved twelve margin blockers without changing the selected population."),
  event(19, "835d86df-6a6a-5254-ad49-0fdaee5bd63e", "proposal.submitted", FIXTURE_PROPOSAL_ID, "proposal", "8", "teni", { blocked: 0, lines: 1227, state: "ready" }, { lines: 1227, state: "submitted" }, "Operator submitted the current reconciled 1,227-line version."),
  event(20, "a23e6995-db0e-5cea-a80e-9e0fd1f0e11f", "proposal.approved", FIXTURE_PROPOSAL_ID, "proposal", "9", "chika", { lines: 1227, state: "submitted" }, { lines: 1227, state: "approved" }, "Approver accepted the current version without publishing it."),
  event(21, "61a59bf1-4bf3-54ad-acd2-a60fb7dd5789", "publish.started", FIXTURE_PUBLICATION_ID, "publish", "1", "farida", null, { requested: 1227, state: "in-progress" }, "Publisher separately confirmed scope and consequence."),
  event(22, "d31ebc3e-e49c-51db-934f-25261285e1c6", "publish.incomplete", FIXTURE_PUBLICATION_ID, "publish", "2", null, { requested: 1227, state: "in-progress" }, { failed: 4, remaining: 4, state: "incomplete", succeeded: 1223 }, "Four Catalog writes required reconciliation; success was not declared."),
  event(23, "40b4c56e-1df6-5323-8641-2a58edb8d1f5", "publish.retry_requested", FIXTURE_PUBLICATION_ID, "publish", "3", "farida", { remaining: 4, state: "incomplete" }, { attempted: 4, state: "reconciling" }, "Publisher retried only the four unresolved rows using the original idempotency key."),
  event(24, "8ef4d8b5-0f62-5816-8a5f-61fc5b249ab8", "publish.completed", FIXTURE_PUBLICATION_ID, "publish", "4", null, { attempted: 4, state: "reconciling" }, { remaining: 0, state: "published", succeeded: 1227 }, "All intended Catalog writes were durably reconciled."),
  event(25, "5f7c9ba9-1e24-5e67-a0b7-4369cfdb0a25", "audit.reconstruction_viewed", AUDIT_VIEW_ID, "audit-view", "1", "moyo", null, { eventCount: 24, state: "complete" }, "Administrator reconstructed the complete depicted synthetic journey."),
]);
