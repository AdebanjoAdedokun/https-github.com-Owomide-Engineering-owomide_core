import {
  REPRICING_CLASSIFICATIONS,
  assertAuditHistory,
  assertOverrideRequest,
  assertProposalComment,
  assertProposalCommentThread,
  assertProposalDetail,
  assertProposalHandoff,
  assertProposalMarginEvidence,
  assertPublicationOperation,
  assertRepricingRule,
  assertRepricingScope,
  assertRepricingPreview,
} from "./contracts.js";
import { throwRepositoryError } from "./domainError.js";
import { createFixtureOperationalRepositories } from "./fixtureOperationalRepositories.js";
import { WORKSPACE_LIVE_BACKEND_ISSUES } from "./liveBackendGate.js";
import {
  FIXTURE_COUNTS,
  FIXTURE_MARGIN_POLICIES,
  FIXTURE_PREPARED_REPRICING_OUTCOMES,
  FIXTURE_PREVIEW_BLOCKERS,
  FIXTURE_PREVIEW_ACTIONS,
  FIXTURE_PREVIEW_REF,
  FIXTURE_PROPOSAL_HANDOFF,
  FIXTURE_PROVENANCE,
  FIXTURE_REPRICING_LINES,
  FIXTURE_SESSION,
  FIXTURE_VERSIONED_REPRICING_ID,
  FIXTURE_VERSION,
  materialiseFixtureRepricingLines,
  preparedFixtureRepricingOutcome,
} from "./fixtures/repricingPreviewV0.js";
import {
  REPRICING_REMEDIATION_ACTIONS,
  calculateMarginBasisPoints,
  evaluateMarginPolicy,
  explainUnevaluatedPolicy,
  fixtureEvaluationHash,
} from "./pricingEngine.js";
import {
  FIXTURE_REPRICING_RULE,
  FIXTURE_REPRICING_SCOPE,
} from "./fixtures/operationalWorkspaceV0.js";
import {
  FIXTURE_ACTOR_IDS,
  FIXTURE_AUDIT_EVENTS,
  FIXTURE_EVIDENCE_SESSIONS,
  FIXTURE_GENERATED_PROPOSAL_ID,
  FIXTURE_JOURNEY_ACTORS,
  FIXTURE_OVERRIDE_DENIED_EVENT,
  FIXTURE_OVERRIDE_ID,
  FIXTURE_OVERRIDE_REQUEST,
  FIXTURE_PROPOSAL_COMMENTS,
  FIXTURE_PROPOSAL_DETAIL,
  FIXTURE_PROPOSAL_ID,
  FIXTURE_PROPOSAL_MARGIN_EVIDENCE,
  FIXTURE_PUBLICATION_ID,
  FIXTURE_PUBLICATION_STATES,
} from "./fixtures/proposalJourneyV0.js";

/** @import {CreateProposalRequest, GetRepricingPreviewRequest, MutationResult, ProposalHandoff, RepricingPreview, ResourceRef, WorkspaceRepositories, WorkspaceSession} from "./contracts.js" */

const DEFAULT_PAGE_LIMIT = 6;
const MAX_PAGE_LIMIT = 200;
const CURSOR_PREFIX = "fixture-rpr03:";
const COMMENT_PAGE_LIMIT = 5;
const COMMENT_CURSOR_PREFIX = "fixture-proposal-comment:";

/**
 * @param {string[] | null} [designEvidenceCapabilities]
 * @param {boolean} [startWithExistingProposal]
 */
function createJourneyRuntime(designEvidenceCapabilities = null, startWithExistingProposal = true) {
  return {
    actorId: FIXTURE_ACTOR_IDS.teni,
    authenticated: true,
    designEvidenceCapabilities,
    proposal: startWithExistingProposal ? clone(FIXTURE_PROPOSAL_DETAIL) : null,
    proposalSourceSnapshot: startWithExistingProposal ? {
      ref: clone(FIXTURE_PREVIEW_REF),
      title: FIXTURE_PROPOSAL_HANDOFF.title,
      effectiveAt: FIXTURE_PROPOSAL_HANDOFF.effectiveAt,
      counts: clone(FIXTURE_COUNTS),
      blockers: clone(FIXTURE_PROPOSAL_DETAIL.blockers),
      lines: clone(FIXTURE_REPRICING_LINES),
    } : null,
    override: null,
    publication: null,
    auditLastSequence: 12,
    overrideDecisionAuditEvent: null,
    publishIdempotencyKey: null,
    comments: startWithExistingProposal ? clone(FIXTURE_PROPOSAL_COMMENTS) : [],
    repricing: {
      scope: clone(FIXTURE_REPRICING_SCOPE),
      rule: clone(FIXTURE_REPRICING_RULE),
      revision: Number(FIXTURE_REPRICING_RULE.ref.version),
      generatedPreview: null,
      lastGeneratedPreviewRef: null,
      previewRuleRef: clone(FIXTURE_REPRICING_RULE.ref),
      remediationRevision: 0,
      remediatedPreviews: [],
      currentRemediatedPreviewRef: null,
    },
  };
}

/** @template T @param {T} value @returns {T} */
function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/** @param {number} milliseconds */
function wait(milliseconds) {
  if (!milliseconds) return Promise.resolve();
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

/** @param {string} code @param {boolean} enabled @param {string} version @param {import("./contracts.js").ActionDenial | null} reason @param {import("./contracts.js").ConfirmationMetadata | null} [confirmation] @param {"approve" | "deny" | null} [decision] */
function allowedAction(code, enabled, version, reason, confirmation = null, decision = null) {
  return { code, enabled, reason, requiredVersion: version, confirmation, decision };
}

/** @param {ReturnType<typeof allowedAction>} action @param {ResourceRef | null} targetRef */
function withTarget(action, targetRef) {
  return targetRef ? { ...action, targetRef: clone(targetRef) } : action;
}

/** @param {string} code @param {string} message */
function denial(code, message) {
  return { code, message };
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime */
function currentSession(runtime) {
  if (!runtime.authenticated) {
    throwRepositoryError({
      code: "SESSION_REQUIRED",
      message: "Sign in to continue to the workspace.",
      details: { workPreserved: true },
      retryable: false,
      domain: "identity",
      traceId: "fixture-session-required",
    });
  }
  const session = FIXTURE_EVIDENCE_SESSIONS[runtime.actorId];
  if (!Array.isArray(runtime.designEvidenceCapabilities)) return session;
  return {
    ...session,
    effectiveCapabilities: Object.freeze([...runtime.designEvidenceCapabilities]),
  };
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime @param {string} capability */
function hasCapability(runtime, capability) {
  return currentSession(runtime).effectiveCapabilities.includes(capability);
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime @param {string} capability @param {string} domain */
function requireCapability(runtime, capability, domain) {
  if (hasCapability(runtime, capability)) return;
  throwRepositoryError({
    code: "MISSING_PERMISSION",
    message: "The resolved session is not authorised for this action.",
    details: { requiredCapability: capability },
    retryable: false,
    domain,
    traceId: `fixture-${domain}-missing-permission`,
  });
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime @param {string[]} capabilities @param {string} domain */
function requireAnyCapability(runtime, capabilities, domain) {
  if (capabilities.some((capability) => hasCapability(runtime, capability))) return;
  throwRepositoryError({
    code: "MISSING_PERMISSION",
    message: "The resolved session is not authorised to read this repricing evidence.",
    details: { requiredAnyCapability: capabilities },
    retryable: false,
    domain,
    traceId: `fixture-${domain}-missing-permission`,
  });
}

/** @param {unknown} value @param {string} domain */
function assertIdempotencyKey(value, domain) {
  if (typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) return;
  throwRepositoryError({
    code: "IDEMPOTENCY_KEY_INVALID",
    message: "Use an idempotency key between 8 and 128 safe characters.",
    details: {},
    retryable: false,
    domain,
    traceId: `fixture-${domain}-invalid-idempotency-key`,
  });
}

/**
 * @param {import("./contracts.js").ResourceRef | undefined} ref
 * @param {import("./contracts.js").ResourceRef} current
 * @param {"PROPOSAL" | "OVERRIDE" | "PUBLICATION"} resource
 * @param {string} domain
 */
function assertCurrentRef(ref, current, resource, domain) {
  if (!ref || ref.id !== current.id) {
    throwRepositoryError({
      code: `${resource}_NOT_FOUND`,
      message: `The requested ${resource.toLocaleLowerCase()} is not available.`,
      details: { resourceId: ref?.id ?? null },
      retryable: false,
      domain,
      traceId: `fixture-${domain}-not-found`,
    });
  }
  if (ref.version !== current.version) {
    throwRepositoryError({
      code: `${resource}_STALE_VERSION`,
      message: `This ${resource.toLocaleLowerCase()} changed after it was opened.`,
      details: { expectedVersion: ref.version, currentVersion: current.version },
      retryable: false,
      domain,
      traceId: `fixture-${domain}-stale-version`,
    });
  }
}

/**
 * @template T
 * @param {Map<string, {fingerprint: string, result: import("./contracts.js").MutationResult<T>}>} requests
 * @param {string} idempotencyKey
 * @param {string} fingerprint
 * @param {string} domain
 * @param {() => import("./contracts.js").MutationResult<T>} mutate
 */
function applyIdempotent(requests, idempotencyKey, fingerprint, domain, mutate) {
  assertIdempotencyKey(idempotencyKey, domain);
  const recorded = requests.get(idempotencyKey);
  if (recorded) {
    if (recorded.fingerprint !== fingerprint) {
      throwRepositoryError({
        code: "IDEMPOTENCY_KEY_REUSED",
        message: "This idempotency key was already used for a different request.",
        details: {},
        retryable: false,
        domain,
        traceId: `fixture-${domain}-idempotency-conflict`,
      });
    }
    return { data: clone(recorded.result.data), mutation: { ...recorded.result.mutation, deduplicated: true } };
  }
  const result = mutate();
  requests.set(idempotencyKey, { fingerprint, result: clone(result) });
  return clone(result);
}

/**
 * Resolve a safe mutation retry before re-evaluating state/version guards that
 * the first successful attempt necessarily changed.
 * @template T
 * @param {Map<string, {fingerprint: string, result: import("./contracts.js").MutationResult<T>}>} requests
 * @param {string} idempotencyKey
 * @param {string} fingerprint
 * @param {string} domain
 * @returns {import("./contracts.js").MutationResult<T> | null}
 */
function readIdempotentRetry(requests, idempotencyKey, fingerprint, domain) {
  assertIdempotencyKey(idempotencyKey, domain);
  const recorded = requests.get(idempotencyKey);
  if (!recorded) return null;
  if (recorded.fingerprint !== fingerprint) {
    throwRepositoryError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "This idempotency key was already used for a different request.",
      details: {},
      retryable: false,
      domain,
      traceId: `fixture-${domain}-idempotency-conflict`,
    });
  }
  return { data: clone(recorded.result.data), mutation: { ...recorded.result.mutation, deduplicated: true } };
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime @param {ResourceRef} previewRef */
function repricingPreviewAllowedActions(runtime, previewRef = FIXTURE_PREVIEW_REF) {
  const actions = clone(FIXTURE_PREVIEW_ACTIONS);
  const retainedRemediation = runtime.repricing.remediatedPreviews.find((preview) => sameRef(preview.ref, previewRef));
  const previewCounts = retainedRemediation?.counts
    ?? (sameRef(runtime.repricing.generatedPreview?.ref, previewRef) ? runtime.repricing.generatedPreview.counts : FIXTURE_COUNTS);
  const previewBlockers = retainedRemediation?.blockers
    ?? (sameRef(runtime.repricing.generatedPreview?.ref, previewRef) ? runtime.repricing.generatedPreview.blockers : FIXTURE_PREVIEW_BLOCKERS);
  const readPreview = actions.find((action) => action.code === "repricing.preview.read");
  const createProposal = actions.find((action) => action.code === "proposal.create");
  const readProposal = actions.find((action) => action.code === "proposal.read");
  const exportPreview = actions.find((action) => action.code === "repricing.preview.export");
  const hasCreateCapability = hasCapability(runtime, "proposal:create");
  const hasReadCapability = hasCapability(runtime, "proposal:read");
  const existingProposal = runtime.proposal?.sourcePreviewRef?.id === previewRef.id
    && runtime.proposal?.sourcePreviewRef?.version === previewRef.version
    ? runtime.proposal
    : null;
  const remediableBlockers = previewBlockers.staleCost + previewBlockers.dimension;
  const canCreateProposal = hasCreateCapability && !existingProposal && remediableBlockers === 0;
  const canReadProposal = hasReadCapability && Boolean(existingProposal);
  readPreview.requiredVersion = previewRef.version;
  createProposal.enabled = canCreateProposal;
  createProposal.reason = canCreateProposal
    ? null
    : existingProposal
      ? denial("ALREADY_EXISTS", "This exact Preview already has a governed Proposal. Open its current version instead.")
      : !hasCreateCapability
        ? denial("MISSING_PERMISSION", "Proposal creation permission is required for this resolved session.")
        : denial("WRONG_STATE", `Resolve ${remediableBlockers.toLocaleString("en-GB")} stale-cost or dimension blocker${remediableBlockers === 1 ? "" : "s"} before governance.`);
  createProposal.requiredVersion = previewRef.version;
  createProposal.confirmation = canCreateProposal
    ? {
        ...createProposal.confirmation,
        body: `Carry all ${previewCounts.selected.toLocaleString("en-NG")} selected lines into governance with all ${previewCounts.blocked.toLocaleString("en-NG")} issues preserved.`,
      }
    : null;
  readProposal.enabled = canReadProposal;
  readProposal.reason = canReadProposal
    ? null
    : existingProposal
      ? denial("MISSING_PERMISSION", "Proposal read access is required for this resolved session.")
      : denial("PROPOSAL_NOT_FOUND", "No governed Proposal exists for this exact Preview version yet.");
  readProposal.requiredVersion = existingProposal?.ref.version ?? previewRef.version;
  readProposal.confirmation = null;
  readProposal.targetRef = canReadProposal ? clone(existingProposal.ref) : null;
  exportPreview.requiredVersion = previewRef.version;
  return actions;
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime */
function overrideDecisionActions(runtime) {
  const override = runtime.override;
  const marginLineCount = override?.lineCount ?? runtime.proposal.blockers.margin;
  const marginLineNoun = marginLineCount === 1 ? "line" : "lines";
  const isRequester = Boolean(override && runtime.actorId === override.requester.id);
  const isAssignedApprover = runtime.actorId === runtime.proposal.assignedApprover.id;
  const hasDecisionCapability = hasCapability(runtime, "override:decide");
  const isPending = override?.state === "pending";
  const canDecide = Boolean(isPending && isAssignedApprover && !isRequester && hasDecisionCapability);
  const reason = canDecide ? null : denial(
    isRequester || !isAssignedApprover ? "WRONG_ACTOR" : !hasDecisionCapability ? "MISSING_PERMISSION" : "WRONG_STATE",
    isRequester
      ? "The requester cannot decide their own exception."
      : !isAssignedApprover
        ? "This exception is assigned to a different approver."
        : !hasDecisionCapability
          ? "Override decision permission is required."
          : "A current pending exception is required.",
  );
  const version = override?.ref.version ?? runtime.proposal.ref.version;
  return [
    allowedAction("override.approve", canDecide, version, reason, canDecide ? {
      title: "Approve bounded exception",
      body: `Approve only the ${marginLineCount.toLocaleString("en-GB")} evidenced ${marginLineNoun}. This does not approve or publish the Proposal.`,
      confirmLabel: "Approve exception",
      consequenceCode: "OVERRIDE_APPROVED_PROPOSAL_NOT_APPROVED",
    } : null, "approve"),
    allowedAction("override.deny", canDecide, version, reason, canDecide ? {
      title: "Deny bounded exception",
      body: `Keep the ${marginLineCount.toLocaleString("en-GB")} margin ${marginLineNoun} blocked. The Proposal remains blocked and no prices are released.`,
      confirmLabel: "Deny exception",
      consequenceCode: "OVERRIDE_DENIED_PROPOSAL_REMAINS_BLOCKED",
    } : null, "deny"),
  ];
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime */
function proposalAllowedActions(runtime) {
  const proposal = runtime.proposal;
  const version = proposal.ref.version;
  const marginLineCount = proposal.blockers.margin;
  const marginLineNoun = marginLineCount === 1 ? "line" : "lines";
  const actorId = runtime.actorId;
  const isAuthor = actorId === proposal.author.id;
  const isAssignedApprover = actorId === proposal.assignedApprover.id;
  const isAssignedPublisher = actorId === proposal.assignedPublisher.id;
  const overridePending = runtime.override?.state === "pending";
  const canRequestOverride = proposal.state === "blocked" && marginLineCount > 0 && !runtime.override && isAuthor && hasCapability(runtime, "override:request");
  const canSubmit = proposal.state === "draft" && proposal.readiness === "ready_to_submit" && isAuthor && hasCapability(runtime, "proposal:submit");
  const canApprove = proposal.state === "submitted" && isAssignedApprover && !isAuthor && hasCapability(runtime, "proposal:approve");
  const canPublish = proposal.state === "approved" && !runtime.publication && isAssignedPublisher && hasCapability(runtime, "publish:execute");
  const canComment = hasCapability(runtime, "proposal:comment");
  return [
    allowedAction("proposal.read", hasCapability(runtime, "proposal:read"), version, hasCapability(runtime, "proposal:read") ? null : denial("MISSING_PERMISSION", "Proposal read access is required.")),
    allowedAction("proposal.comment.add", canComment, version, canComment ? null : denial(
      "MISSING_PERMISSION",
      "Comment permission is required for this Proposal version.",
    ), canComment ? {
      title: "Add version-bound comment",
      body: `Attach this human-authored comment to Proposal v${version}. The Proposal decision state does not change.`,
      confirmLabel: "Add comment",
      consequenceCode: "COMMENT_ATTACHED_TO_PROPOSAL_VERSION",
    } : null),
    allowedAction("override.request", canRequestOverride, version, canRequestOverride ? null : denial(
      !hasCapability(runtime, "override:request") ? "MISSING_PERMISSION" : !isAuthor ? "WRONG_ACTOR" : "WRONG_STATE",
      overridePending
        ? "An exception request is already awaiting an independent decision."
        : marginLineCount < 1
          ? "Exceptions apply only to margin blockers; repair stale-cost or dimension issues in a new Preview."
          : "Only the author can request an exception while the Proposal is blocked.",
    ), canRequestOverride ? {
      title: "Request bounded exception",
      body: `Keep ${marginLineCount.toLocaleString("en-GB")} margin ${marginLineNoun} blocked until a different authorised actor decides the evidence.`,
      confirmLabel: "Request exception",
      consequenceCode: "OVERRIDE_REQUIRES_DIFFERENT_ACTOR",
    } : null),
    ...overrideDecisionActions(runtime),
    allowedAction("proposal.submit", canSubmit, version, canSubmit ? null : denial(
      !hasCapability(runtime, "proposal:submit") ? "MISSING_PERMISSION" : !isAuthor ? "WRONG_ACTOR" : "WRONG_STATE",
      proposal.state === "blocked" ? "Resolve all blockers before submission." : "Only the current ready draft can be submitted by its author.",
    ), canSubmit ? {
      title: "Submit current version",
      body: "Lock the current version for independent review by Chika.",
      confirmLabel: "Submit for approval",
      consequenceCode: "PROPOSAL_SUBMITTED_NOT_APPROVED",
    } : null),
    allowedAction("proposal.approve", canApprove, version, canApprove ? null : denial(
      isAuthor ? "WRONG_ACTOR" : !hasCapability(runtime, "proposal:approve") ? "MISSING_PERMISSION" : "WRONG_STATE",
      isAuthor ? "The Proposal author cannot approve this protected decision." : "Only the current submitted version can be approved by the assigned approver.",
    ), canApprove ? {
      title: "Approve current version",
      body: "Approve the reviewed version for a separate Publisher. No prices are released by this action.",
      confirmLabel: "Approve Proposal",
      consequenceCode: "PROPOSAL_APPROVED_NOT_PUBLISHED",
    } : null),
    allowedAction("publication.start", canPublish, version, canPublish ? null : denial(
      !hasCapability(runtime, "publish:execute") ? "MISSING_PERMISSION" : !isAssignedPublisher ? "WRONG_ACTOR" : "WRONG_STATE",
      "Only the assigned Publisher can release an approved current Proposal.",
    ), canPublish ? {
      title: "Publish 1,227 prices",
      body: "Release the approved scope and reconcile the durable Catalog outcome.",
      confirmLabel: "Start publication",
      consequenceCode: "PUBLICATION_OUTCOME_MUST_RECONCILE",
    } : null),
  ];
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime */
function materialiseProposal(runtime) {
  const detail = clone(runtime.proposal);
  detail.override = runtime.override ? materialiseOverride(runtime) : null;
  detail.publicationRef = runtime.publication ? clone(runtime.publication.ref) : null;
  detail.allowedActions = proposalAllowedActions(runtime);
  assertProposalDetail(detail);
  return detail;
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime */
function proposalCommentActions(runtime) {
  const version = runtime.proposal.ref.version;
  const canComment = hasCapability(runtime, "proposal:comment");
  return [
    allowedAction("proposal.comments.read", true, version, null),
    allowedAction("proposal.comment.add", canComment, version, canComment ? null : denial(
      "MISSING_PERMISSION",
      "Comment permission is required for this Proposal version.",
    ), canComment ? {
      title: "Add version-bound comment",
      body: `Attach this human-authored comment to Proposal v${version}. The Proposal decision state does not change.`,
      confirmLabel: "Add comment",
      consequenceCode: "COMMENT_ATTACHED_TO_PROPOSAL_VERSION",
    } : null),
  ];
}

/** @param {unknown} cursor @param {Array<{ref: {id: string}}>} ordered */
function readCommentCursor(cursor, ordered) {
  if (cursor == null) return 0;
  if (typeof cursor !== "string" || !cursor.startsWith(COMMENT_CURSOR_PREFIX)) {
    throwRepositoryError({
      code: "PROPOSAL_COMMENT_CURSOR_INVALID",
      message: "The comment cursor is not valid for this Proposal.",
      details: {},
      retryable: false,
      domain: "proposal-comment",
      traceId: "fixture-proposal-comment-invalid-cursor",
    });
  }
  const lastSeenId = cursor.slice(COMMENT_CURSOR_PREFIX.length);
  const index = ordered.findIndex((comment) => comment.ref.id === lastSeenId);
  if (index < 0) {
    throwRepositoryError({
      code: "PROPOSAL_COMMENT_CURSOR_INVALID",
      message: "The comment cursor is not valid for this Proposal.",
      details: {},
      retryable: false,
      domain: "proposal-comment",
      traceId: "fixture-proposal-comment-unknown-cursor",
    });
  }
  return index + 1;
}

/** @param {unknown} value */
function normaliseCommentLimit(value) {
  if (value == null) return COMMENT_PAGE_LIMIT;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throwRepositoryError({
      code: "PROPOSAL_COMMENT_LIMIT_INVALID",
      message: "Comment page size must be between 1 and 50.",
      details: {},
      retryable: false,
      domain: "proposal-comment",
      traceId: "fixture-proposal-comment-invalid-limit",
    });
  }
  return limit;
}

/** @param {number} index */
function fixtureCommentId(index) {
  return `9e7dfd24-f3e8-5ba2-9b25-${String(index).padStart(12, "0")}`;
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime */
function materialiseOverride(runtime) {
  if (!runtime.override) return null;
  const override = clone(runtime.override);
  override.allowedActions = overrideDecisionActions(runtime);
  assertOverrideRequest(override);
  return override;
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime */
function materialisePublication(runtime) {
  if (!runtime.publication) return null;
  const publication = clone(runtime.publication);
  const isPublisher = runtime.actorId === publication.publisher.id;
  const mayReconcile = isPublisher && hasCapability(runtime, "publish:reconcile") && ["unknown-outcome", "reconciling"].includes(publication.state);
  const mayRetry = isPublisher && hasCapability(runtime, "publish:execute") && publication.state === "incomplete";
  const remainingCount = publication.counts.remaining;
  const remainingNoun = remainingCount === 1 ? "price" : "prices";
  publication.allowedActions = [
    allowedAction("publication.reconcile", mayReconcile, publication.ref.version, mayReconcile ? null : denial(
      !isPublisher ? "WRONG_ACTOR" : !hasCapability(runtime, "publish:reconcile") ? "MISSING_PERMISSION" : "WRONG_STATE",
      publication.state === "unknown-outcome" ? "Reconcile the unknown outcome before any retry." : "Reconciliation is only required for an unresolved operation.",
    )),
    allowedAction("publication.retry", mayRetry, publication.ref.version, mayRetry ? null : denial(
      !isPublisher ? "WRONG_ACTOR" : !hasCapability(runtime, "publish:execute") ? "MISSING_PERMISSION" : "WRONG_STATE",
      publication.state === "unknown-outcome" ? "Retry is unsafe until the unknown outcome has been reconciled." : "Only an incomplete reconciled operation can retry unresolved rows.",
    ), mayRetry ? {
      title: `Retry ${remainingCount.toLocaleString("en-GB")} unresolved ${remainingNoun}`,
      body: `Use the original idempotency key and retry only the ${remainingCount.toLocaleString("en-GB")} remaining ${remainingCount === 1 ? "write" : "writes"}.`,
      confirmLabel: `Retry ${remainingCount.toLocaleString("en-GB")} ${remainingNoun}`,
      consequenceCode: "RETRY_UNRESOLVED_ONLY",
    } : null),
  ];
  assertPublicationOperation(publication);
  return publication;
}

/** @param {unknown} value @returns {string} */
function normaliseQuery(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-NG") : "";
}

/** @param {unknown} value @returns {string | null} */
function normaliseFacetId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Facets always describe the bounded thirteen-line diagnostic sample, not the
 * 1,248-line authoritative population. Options remain stable while a filter is
 * applied, and `selected` reflects the current request.
 *
 * @param {Array<Record<string, any>>} lines
 * @param {"channel" | "location"} dimension
 * @param {string | null} selectedId
 */
function buildFacetOptions(lines, dimension, selectedId) {
  const options = new Map();
  for (const line of lines) {
    const value = line.scope[dimension];
    const existing = options.get(value.id);
    if (existing) {
      existing.sampleLineCount += 1;
    } else {
      options.set(value.id, {
        id: value.id,
        name: value.name,
        sampleLineCount: 1,
        selected: value.id === selectedId,
      });
    }
  }
  return [...options.values()];
}

/** @param {string | null | undefined} cursor @returns {number} */
function readCursor(cursor) {
  if (cursor == null) return 0;
  if (typeof cursor !== "string" || !cursor.startsWith(CURSOR_PREFIX)) {
    throwRepositoryError({
      code: "REPRICING_CURSOR_INVALID",
      message: "The repricing page cursor is not valid for this data source.",
      details: {},
      retryable: false,
      domain: "repricing",
      traceId: "fixture-rpr03-invalid-cursor",
    });
  }
  const offset = Number(cursor.slice(CURSOR_PREFIX.length));
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throwRepositoryError({
      code: "REPRICING_CURSOR_INVALID",
      message: "The repricing page cursor is not valid for this data source.",
      details: {},
      retryable: false,
      domain: "repricing",
      traceId: "fixture-rpr03-invalid-cursor",
    });
  }
  return offset;
}

/** @param {ResourceRef | undefined} ref @param {ReturnType<typeof createJourneyRuntime> | null} [runtime] */
function assertPreviewRef(ref, runtime = null) {
  if (!ref) return;
  const retainedRemediation = runtime?.repricing.remediatedPreviews.find((preview) => sameRef(preview.ref, ref));
  const current = retainedRemediation?.ref
    ?? (ref.kind === FIXTURE_PREVIEW_REF.kind && ref.id === FIXTURE_PREVIEW_REF.id
    ? FIXTURE_PREVIEW_REF
    : runtime?.repricing.generatedPreview?.ref?.kind === ref.kind
      && runtime.repricing.generatedPreview.ref.id === ref.id
      ? runtime.repricing.generatedPreview.ref
      : null);
  const invalidated = !current
    && runtime?.repricing.lastGeneratedPreviewRef?.kind === ref.kind
    && runtime.repricing.lastGeneratedPreviewRef.id === ref.id;
  if (invalidated) {
    throwRepositoryError({
      code: "REPRICING_PREVIEW_STALE_VERSION",
      message: "This repricing preview no longer matches the current persisted Rule.",
      details: { expectedVersion: ref.version ?? null, currentVersion: null },
      retryable: false,
      domain: "repricing",
      traceId: "fixture-rpr03-stale-version",
    });
  }
  if (!current) {
    throwRepositoryError({
      code: "REPRICING_PREVIEW_NOT_FOUND",
      message: "The requested repricing preview is not available.",
      details: { previewRef: ref.id ?? null },
      retryable: false,
      domain: "repricing",
      traceId: "fixture-rpr03-not-found",
    });
  }
  if (ref.version !== current.version) {
    throwRepositoryError({
      code: "REPRICING_PREVIEW_STALE_VERSION",
      message: "This repricing preview changed after it was opened.",
      details: {
        expectedVersion: ref.version,
        currentVersion: current.version,
      },
      retryable: false,
      domain: "repricing",
      traceId: "fixture-rpr03-stale-version",
    });
  }
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime @param {ResourceRef} ref */
function assertCurrentRemediationRef(runtime, ref) {
  const current = runtime.repricing.currentRemediatedPreviewRef
    ?? (runtime.repricing.generatedPreview && ref.id === runtime.repricing.generatedPreview.ref.id
      ? runtime.repricing.generatedPreview.ref
      : FIXTURE_PREVIEW_REF);
  if (!sameRef(ref, current)) {
    throwRepositoryError({
      code: "REPRICING_PREVIEW_STALE_VERSION",
      message: "This repricing Preview changed after it was opened. Reload before applying another remediation.",
      details: { expectedVersion: ref?.version ?? null, currentVersion: current?.version ?? null },
      retryable: false,
      domain: "repricing",
      traceId: "fixture-rpr03-remediation-stale-version",
    });
  }
}

/** @param {ResourceRef | undefined} ref @param {ResourceRef} current @param {"scope" | "rule"} resource @param {boolean} [required] */
function assertExactRepricingRef(ref, current, resource, required = true) {
  const code = resource.toLocaleUpperCase("en-GB");
  if (!ref) {
    if (!required) return;
    throwRepositoryError({
      code: `REPRICING_${code}_REF_REQUIRED`,
      message: `An exact versioned repricing ${resource} reference is required.`,
      details: {},
      retryable: false,
      domain: "repricing",
      traceId: `fixture-repricing-${resource}-ref-required`,
    });
  }
  if (ref.kind !== current.kind || ref.id !== current.id) {
    throwRepositoryError({
      code: `REPRICING_${code}_NOT_FOUND`,
      message: `The requested repricing ${resource} is not available.`,
      details: { resourceId: ref.id ?? null },
      retryable: false,
      domain: "repricing",
      traceId: `fixture-repricing-${resource}-not-found`,
    });
  }
  if (ref.version !== current.version) {
    throwRepositoryError({
      code: `REPRICING_${code}_STALE_VERSION`,
      message: `This repricing ${resource} changed after it was opened.`,
      details: { expectedVersion: ref.version ?? null, currentVersion: current.version },
      retryable: false,
      domain: "repricing",
      traceId: `fixture-repricing-${resource}-stale-version`,
    });
  }
}

/** @param {ResourceRef | null | undefined} left @param {ResourceRef | null | undefined} right */
function sameRef(left, right) {
  return Boolean(left && right && left.kind === right.kind && left.id === right.id && left.version === right.version);
}

/**
 * The checked-in audit reconstruction belongs only to canonical FX-010. A
 * generated Preview may reuse the same fixture repository instance, but it
 * must never acquire that history by coincidence of an old Proposal ID.
 * @param {ReturnType<typeof createJourneyRuntime>} runtime
 */
function hasCanonicalFx010AuditLineage(runtime) {
  return runtime.proposal?.ref?.id === FIXTURE_PROPOSAL_ID
    && sameRef(runtime.proposal?.sourcePreviewRef, FIXTURE_PREVIEW_REF);
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime */
function canonicalAuditEvents(runtime) {
  if (!hasCanonicalFx010AuditLineage(runtime)) return [];
  const complete = runtime.publication?.state === "published";
  const last = complete ? 25 : runtime.auditLastSequence;
  const events = clone(FIXTURE_AUDIT_EVENTS.slice(0, last));
  if (runtime.overrideDecisionAuditEvent && last >= 15) {
    events[14] = clone(runtime.overrideDecisionAuditEvent);
  }
  return events;
}

function canonicalPreviewSource() {
  return {
    kind: "repricing-preview",
    ref: FIXTURE_PREVIEW_REF,
    persistence: "fixture-only",
    title: "August cost recovery",
    dataLabel: "Sample data",
    dataLabelDismissible: false,
    effectiveAt: "2026-08-15T00:00:00+01:00",
    rule: { type: "percentage-change", changeBasisPoints: 350, absoluteChange: null, currency: "NGN", rounding: "integer-minor-unit-half-up" },
    scopeRef: FIXTURE_REPRICING_SCOPE.ref,
    ruleRef: FIXTURE_REPRICING_RULE.ref,
    counts: FIXTURE_COUNTS,
    blockers: FIXTURE_PREVIEW_BLOCKERS,
    lines: FIXTURE_REPRICING_LINES,
    remediationEvidence: [],
    provenance: FIXTURE_PROVENANCE,
  };
}

/** @param {Record<string, any>} outcome */
function policyFromOutcome(outcome) {
  return {
    floorBasisPoints: outcome.floorBasisPoints,
    floorPrice: outcome.floorPrice,
    scope: outcome.scope,
    sourceId: outcome.sourceId,
    result: outcome.result,
    violation: outcome.violation,
    evaluation: outcome.evaluation,
  };
}

/** @param {Record<string, any>} evaluation @param {string} explanation */
function revisedEvaluation(evaluation, explanation) {
  const revised = { ...clone(evaluation), explanation };
  revised.evaluationHash = fixtureEvaluationHash({ ...revised, evaluationHash: undefined });
  return revised;
}

/** @param {Record<string, any>} counts @param {string} from @param {string} to */
function movePopulationCount(counts, from, to) {
  const next = clone(counts);
  if (from === to) return next;
  next[from] -= 1;
  next[to] += 1;
  if (["eligible", "blocked"].includes(from) && !["eligible", "blocked"].includes(to)) next.selected -= 1;
  if (!["eligible", "blocked"].includes(from) && ["eligible", "blocked"].includes(to)) next.selected += 1;
  return next;
}

/** @param {Record<string, any>} blockers @param {Record<string, any>} sourceLine @param {Record<string, any>} nextLine */
function moveBlockerCount(blockers, sourceLine, nextLine) {
  const next = clone(blockers);
  if (sourceLine.classification === "blocked" && nextLine.classification !== "blocked") {
    next.total -= 1;
    if (sourceLine.issue.kind === "margin") next.margin -= 1;
    if (sourceLine.issue.kind === "stale-cost") next.staleCost -= 1;
    if (sourceLine.issue.kind === "dimension") next.dimension -= 1;
  }
  return next;
}

/** @param {string | null} categoryId */
function fixtureCategory(categoryId) {
  const existing = FIXTURE_REPRICING_LINES.find((line) => line.category?.id === categoryId)?.category;
  if (existing) return existing;
  const policy = FIXTURE_MARGIN_POLICIES.find((rule) => rule.scope === "category" && rule.conditions?.categoryId === categoryId);
  return policy ? { id: categoryId, name: policy.name.replace(/ floor$/, "") } : null;
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime */
function nextRepricingVersion(runtime) {
  runtime.repricing.revision += 1;
  return String(runtime.repricing.revision);
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime @param {Record<string, any>} scope */
function materialiseScope(runtime, scope = runtime.repricing.scope) {
  const response = clone(scope);
  const canPrepare = hasCapability(runtime, "repricing:prepare");
  const canCreate = canPrepare && response.ref.id !== FIXTURE_VERSIONED_REPRICING_ID;
  const ruleTarget = sameRef(runtime.repricing.rule?.scopeRef, response.ref) ? runtime.repricing.rule.ref : null;
  response.allowedActions = [
    allowedAction("repricing.scope.read", true, response.ref.version, null),
    allowedAction("repricing.scope.create", canCreate, null, canCreate ? null : denial(
      canPrepare ? "ALREADY_EXISTS" : "MISSING_PERMISSION",
      canPrepare ? "A fixture Scope already exists; update its exact current version." : "Repricing preparation permission is required to create a Scope.",
    )),
    allowedAction("repricing.scope.update", canPrepare, response.ref.version, canPrepare ? null : denial("MISSING_PERMISSION", "Repricing preparation permission is required to update this Scope.")),
    withTarget(allowedAction(
      "repricing.rule.read",
      Boolean(ruleTarget),
      ruleTarget?.version ?? response.ref.version,
      ruleTarget ? null : denial("WRONG_STATE", "Persist a Rule against the current Scope version before continuing."),
    ), ruleTarget),
  ];
  assertRepricingScope(response);
  return response;
}

/** @param {ReturnType<typeof createJourneyRuntime>} runtime @param {Record<string, any>} rule */
function materialiseRule(runtime, rule = runtime.repricing.rule) {
  const response = clone(rule);
  response.preparedRules = Object.values(FIXTURE_PREPARED_REPRICING_OUTCOMES).map(({ label, rule: preparedRule }) => ({ label, rule: clone(preparedRule) }));
  const canPrepare = hasCapability(runtime, "repricing:prepare");
  const previewTarget = sameRef(runtime.repricing.previewRuleRef, response.ref)
    ? runtime.repricing.generatedPreview?.ref ?? FIXTURE_PREVIEW_REF
    : null;
  const canGenerate = canPrepare && !previewTarget;
  response.allowedActions = [
    allowedAction("repricing.rule.read", true, response.ref.version, null),
    allowedAction("repricing.rule.edit", canPrepare, response.ref.version, canPrepare ? null : denial("MISSING_PERMISSION", "Only a resolved repricing preparation capability can edit this draft rule.")),
    allowedAction("repricing.rule.save", canPrepare, response.ref.version, canPrepare ? null : denial("MISSING_PERMISSION", "Repricing preparation permission is required to save this Rule.")),
    allowedAction("repricing.preview.generate", canGenerate, response.ref.version, canGenerate ? null : denial(
      previewTarget ? "ALREADY_EXISTS" : "MISSING_PERMISSION",
      previewTarget ? "This exact Rule version already has a persisted Preview." : "Repricing preparation permission is required to generate a Preview.",
    )),
    withTarget(allowedAction(
      "repricing.preview.read",
      Boolean(previewTarget),
      previewTarget?.version ?? response.ref.version,
      previewTarget ? null : denial("WRONG_STATE", "Generate a Preview from this exact Rule version before opening it."),
    ), previewTarget),
  ];
  assertRepricingRule(response);
  return response;
}

/** @param {unknown} value */
function validateScopePatch(value) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throwRepositoryError({ code: "REPRICING_SCOPE_INVALID", message: "Scope criteria must be an object.", details: {}, retryable: false, domain: "repricing", traceId: "fixture-repricing-scope-invalid" });
  }
  return clone(value);
}

/** @param {any} request @param {Record<string, any>} base */
function scopeFromRequest(request, base) {
  const title = request?.title == null ? base.title : String(request.title).trim();
  if (!title || title.length > 120) {
    throwRepositoryError({ code: "REPRICING_SCOPE_TITLE_INVALID", message: "Scope title must contain 1 to 120 characters.", details: {}, retryable: false, domain: "repricing", traceId: "fixture-repricing-scope-title-invalid" });
  }
  const filters = { ...clone(base.filters), ...validateScopePatch(request?.filters) };
  const selection = { ...clone(base.selection), ...validateScopePatch(request?.selection) };
  if (JSON.stringify(filters) !== JSON.stringify(base.filters) || JSON.stringify(selection) !== JSON.stringify(base.selection)) {
    throwRepositoryError({
      code: "REPRICING_SCOPE_CRITERIA_UNAVAILABLE",
      message: "This sample can persist only the prepared complete FX-004 Scope; alternate criteria require an authoritative full-population result.",
      details: { preparedScopeRef: clone(base.ref) },
      retryable: false,
      domain: "repricing",
      traceId: "fixture-repricing-scope-criteria-unavailable",
    });
  }
  return {
    ...clone(base),
    title,
    filters,
    selection,
  };
}

/** @param {any} input */
function validatePersistedRule(input) {
  if (!input || !["percentage-change", "absolute-change"].includes(input.type)) {
    throwRepositoryError({ code: "REPRICING_RULE_INVALID", message: "Choose a supported percentage or absolute NGN rule.", details: {}, retryable: false, domain: "repricing", traceId: "fixture-repricing-rule-invalid" });
  }
  if (input.type === "percentage-change") {
    if (!Number.isSafeInteger(input.changeBasisPoints) || input.changeBasisPoints < 1 || input.changeBasisPoints > 10_000) {
      throwRepositoryError({ code: "REPRICING_RULE_INVALID", message: "Percentage change must be between 0.01% and 100.00%.", details: {}, retryable: false, domain: "repricing", traceId: "fixture-repricing-rule-invalid-percentage" });
    }
    return { type: input.type, changeBasisPoints: input.changeBasisPoints, absoluteChange: null, currency: "NGN", rounding: "integer-minor-unit-half-up" };
  }
  const amountMinor = input.absoluteChange?.amountMinor;
  if (input.absoluteChange?.currency !== "NGN" || typeof amountMinor !== "string" || !/^\d+$/.test(amountMinor) || BigInt(amountMinor) < 1n) {
    throwRepositoryError({ code: "REPRICING_RULE_INVALID", message: "Absolute change must be a positive NGN minor-unit amount.", details: {}, retryable: false, domain: "repricing", traceId: "fixture-repricing-rule-invalid-absolute" });
  }
  return { type: input.type, changeBasisPoints: null, absoluteChange: { amountMinor, currency: "NGN" }, currency: "NGN", rounding: "integer-minor-unit-half-up" };
}

/** @param {Record<string, any>} rule */
function explainRule(rule) {
  return rule.type === "percentage-change"
    ? `Increase every selected current NGN price by ${(rule.changeBasisPoints / 100).toFixed(2)}%, rounded to the nearest minor unit.`
    : `Increase every selected current NGN price by NGN ${(Number(rule.absoluteChange.amountMinor) / 100).toFixed(2)}, rounded to the nearest minor unit.`;
}

/** @param {number | undefined} requested */
function normaliseLimit(requested) {
  if (requested == null) return DEFAULT_PAGE_LIMIT;
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > MAX_PAGE_LIMIT) {
    throwRepositoryError({
      code: "REPRICING_PAGE_LIMIT_INVALID",
      message: `Page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}.`,
      details: { maximum: MAX_PAGE_LIMIT },
      retryable: false,
      domain: "repricing",
      traceId: "fixture-rpr03-invalid-limit",
    });
  }
  return requested;
}

/**
 * Fixture identity adapter. It returns a resolved session so components do not
 * infer authority from the displayed role labels.
 */
export class FixtureIdentityRepository {
  /** @param {{latencyMs?: number, runtime?: ReturnType<typeof createJourneyRuntime>}} [options] */
  constructor({ latencyMs = 0, runtime = createJourneyRuntime() } = {}) {
    this.latencyMs = latencyMs;
    this.runtime = runtime;
  }

  /** @returns {Promise<WorkspaceSession>} */
  async getSession() {
    await wait(this.latencyMs);
    return clone(currentSession(this.runtime));
  }

  /** Fixture authentication entry point. It resolves the canonical sample session without claiming a production identity provider. */
  async signIn() {
    this.runtime.authenticated = true;
    await wait(this.latencyMs);
    return clone(currentSession(this.runtime));
  }

  /** End the in-memory fixture session without mutating any governed work. */
  async signOut() {
    this.runtime.authenticated = false;
    await wait(this.latencyMs);
    return { authenticated: false, provenance: clone(FIXTURE_PROVENANCE) };
  }

  /**
   * Fixture evidence harness only. This intentionally explicit name prevents
   * it being mistaken for product-level persona switching.
   * @returns {Promise<WorkspaceSession[]>}
   */
  async listDesignEvidenceActors() {
    await wait(this.latencyMs);
    return Object.values(FIXTURE_EVIDENCE_SESSIONS).map(clone);
  }

  /**
   * Fixture evidence harness only. Live adapters must not implement this.
   * @param {string} actorId
   * @returns {Promise<WorkspaceSession>}
   */
  async selectDesignEvidenceActor(actorId) {
    if (!Object.hasOwn(FIXTURE_EVIDENCE_SESSIONS, actorId)) {
      throwRepositoryError({
        code: "FIXTURE_EVIDENCE_ACTOR_NOT_FOUND",
        message: "That design-evidence actor is not available.",
        details: { actorId },
        retryable: false,
        domain: "identity",
        traceId: "fixture-evidence-actor-not-found",
      });
    }
    this.runtime.actorId = actorId;
    await wait(this.latencyMs);
    return clone(currentSession(this.runtime));
  }
}

/**
 * Fixture RPR-03 adapter. Population counts are authoritative FX-004 outputs;
 * line pages are explicitly marked as pages of the bounded thirteen-row
 * diagnostic sample. The default page remains six rows.
 */
export class FixtureRepricingRepository {
  /** @param {{latencyMs?: number, runtime?: ReturnType<typeof createJourneyRuntime>}} [options] */
  constructor({ latencyMs = 0, runtime = createJourneyRuntime() } = {}) {
    this.latencyMs = latencyMs;
    this.runtime = runtime;
    this.scopeCreateRequests = new Map();
    this.scopeUpdateRequests = new Map();
    this.ruleSaveRequests = new Map();
    this.previewGenerateRequests = new Map();
    this.lineRemediationRequests = new Map();
  }

  /** @param {{ref?: ResourceRef}} [request] */
  async getScope(request = {}) {
    requireAnyCapability(this.runtime, ["repricing:prepare", "proposal:review"], "repricing");
    assertExactRepricingRef(request.ref, this.runtime.repricing.scope.ref, "scope", false);
    const response = materialiseScope(this.runtime);
    await wait(this.latencyMs);
    return response;
  }

  /** @param {{title?: string, filters?: Record<string, unknown>, selection?: Record<string, unknown>, idempotencyKey: string}} request */
  async createScope(request) {
    requireCapability(this.runtime, "repricing:prepare", "repricing");
    const draft = scopeFromRequest(request, FIXTURE_REPRICING_SCOPE);
    const fingerprint = JSON.stringify({ title: draft.title, filters: draft.filters, selection: draft.selection });
    const retry = readIdempotentRetry(this.scopeCreateRequests, request?.idempotencyKey, fingerprint, "repricing");
    if (retry) { await wait(this.latencyMs); return retry; }
    if (this.runtime.repricing.scope.ref.id === FIXTURE_VERSIONED_REPRICING_ID) {
      throwRepositoryError({
        code: "REPRICING_SCOPE_ALREADY_EXISTS",
        message: "A fixture Scope has already been created. Update its exact current version instead.",
        details: { scopeRef: clone(this.runtime.repricing.scope.ref) },
        retryable: false,
        domain: "repricing",
        traceId: "fixture-repricing-scope-already-exists",
      });
    }
    const result = applyIdempotent(this.scopeCreateRequests, request.idempotencyKey, fingerprint, "repricing", () => {
      const ref = { kind: "resource", id: FIXTURE_VERSIONED_REPRICING_ID, version: "1" };
      this.runtime.repricing.scope = { ...draft, ref };
      this.runtime.repricing.rule = {
        ...clone(FIXTURE_REPRICING_RULE),
        ref: clone(ref),
        scopeRef: clone(ref),
      };
      this.runtime.repricing.revision = 1;
      this.runtime.repricing.lastGeneratedPreviewRef = clone(this.runtime.repricing.generatedPreview?.ref ?? null);
      this.runtime.repricing.generatedPreview = null;
      this.runtime.repricing.previewRuleRef = null;
      this.runtime.repricing.remediatedPreviews = [];
      this.runtime.repricing.currentRemediatedPreviewRef = null;
      return {
        data: materialiseScope(this.runtime),
        mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false },
      };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{scopeRef: ResourceRef, title?: string, filters?: Record<string, unknown>, selection?: Record<string, unknown>, idempotencyKey: string}} request */
  async updateScope(request) {
    requireCapability(this.runtime, "repricing:prepare", "repricing");
    const draft = scopeFromRequest(request, this.runtime.repricing.scope);
    const fingerprint = JSON.stringify({ scopeRef: request?.scopeRef ?? null, title: draft.title, filters: draft.filters, selection: draft.selection });
    const retry = readIdempotentRetry(this.scopeUpdateRequests, request?.idempotencyKey, fingerprint, "repricing");
    if (retry) { await wait(this.latencyMs); return retry; }
    assertExactRepricingRef(request?.scopeRef, this.runtime.repricing.scope.ref, "scope");
    const result = applyIdempotent(this.scopeUpdateRequests, request.idempotencyKey, fingerprint, "repricing", () => {
      const ref = { ...clone(this.runtime.repricing.scope.ref), version: nextRepricingVersion(this.runtime) };
      this.runtime.repricing.scope = { ...draft, ref };
      this.runtime.repricing.rule = {
        ...clone(this.runtime.repricing.rule ?? FIXTURE_REPRICING_RULE),
        ref: clone(ref),
        scopeRef: clone(ref),
      };
      this.runtime.repricing.lastGeneratedPreviewRef = clone(this.runtime.repricing.generatedPreview?.ref ?? this.runtime.repricing.lastGeneratedPreviewRef);
      this.runtime.repricing.generatedPreview = null;
      this.runtime.repricing.previewRuleRef = null;
      this.runtime.repricing.remediatedPreviews = [];
      this.runtime.repricing.currentRemediatedPreviewRef = null;
      return {
        data: materialiseScope(this.runtime),
        mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false },
      };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{ref?: ResourceRef}} request */
  async getRule(request = {}) {
    requireAnyCapability(this.runtime, ["repricing:prepare", "proposal:review"], "repricing");
    assertExactRepricingRef(request.ref, this.runtime.repricing.rule.ref, "rule");
    const response = materialiseRule(this.runtime);
    await wait(this.latencyMs);
    return response;
  }

  /** @param {{scopeRef: ResourceRef, ruleRef?: ResourceRef, rule: Record<string, any>, effectiveAt: string, idempotencyKey: string}} request */
  async saveRule(request) {
    requireCapability(this.runtime, "repricing:prepare", "repricing");
    const persistedRule = validatePersistedRule(request?.rule);
    if (!preparedFixtureRepricingOutcome(persistedRule)) {
      throwRepositoryError({
        code: "REPRICING_RULE_OUTCOME_UNAVAILABLE",
        message: "Choose a prepared Sample-data rule: +3.50%, +4.25%, or +NGN 25.00. Other values require an authoritative full-population calculation.",
        details: { preparedRules: Object.values(FIXTURE_PREPARED_REPRICING_OUTCOMES).map((outcome) => outcome.label) },
        retryable: false,
        domain: "repricing",
        traceId: "fixture-repricing-rule-outcome-unavailable",
      });
    }
    if (typeof request?.effectiveAt !== "string" || Number.isNaN(Date.parse(request.effectiveAt))) {
      throwRepositoryError({ code: "REPRICING_RULE_EFFECTIVE_AT_INVALID", message: "Choose a valid effective date and time.", details: {}, retryable: false, domain: "repricing", traceId: "fixture-repricing-rule-effective-at-invalid" });
    }
    const fingerprint = JSON.stringify({ scopeRef: request.scopeRef, ruleRef: request.ruleRef ?? null, rule: persistedRule, effectiveAt: request.effectiveAt });
    const retry = readIdempotentRetry(this.ruleSaveRequests, request?.idempotencyKey, fingerprint, "repricing");
    if (retry) { await wait(this.latencyMs); return retry; }
    assertExactRepricingRef(request.scopeRef, this.runtime.repricing.scope.ref, "scope");
    if (request.ruleRef) assertExactRepricingRef(request.ruleRef, this.runtime.repricing.rule.ref, "rule");
    const result = applyIdempotent(this.ruleSaveRequests, request.idempotencyKey, fingerprint, "repricing", () => {
      const ref = { kind: "resource", id: this.runtime.repricing.scope.ref.id, version: nextRepricingVersion(this.runtime) };
      this.runtime.repricing.rule = {
        kind: "repricing-rule",
        ref,
        scopeRef: clone(this.runtime.repricing.scope.ref),
        state: "valid",
        rule: persistedRule,
        supportedTypes: ["percentage-change", "absolute-change"],
        explanation: explainRule(persistedRule),
        effectiveAt: request.effectiveAt,
        dataLabel: "Sample data",
        provenance: clone(FIXTURE_PROVENANCE),
      };
      this.runtime.repricing.lastGeneratedPreviewRef = clone(this.runtime.repricing.generatedPreview?.ref ?? this.runtime.repricing.lastGeneratedPreviewRef);
      this.runtime.repricing.generatedPreview = null;
      this.runtime.repricing.previewRuleRef = null;
      this.runtime.repricing.remediatedPreviews = [];
      this.runtime.repricing.currentRemediatedPreviewRef = null;
      return {
        data: materialiseRule(this.runtime),
        mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false },
      };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{ruleRef: ResourceRef, idempotencyKey: string}} request */
  async generatePreview(request) {
    requireCapability(this.runtime, "repricing:prepare", "repricing");
    const fingerprint = JSON.stringify({ ruleRef: request?.ruleRef ?? null });
    const retry = readIdempotentRetry(this.previewGenerateRequests, request?.idempotencyKey, fingerprint, "repricing");
    if (retry) { await wait(this.latencyMs); return retry; }
    assertExactRepricingRef(request?.ruleRef, this.runtime.repricing.rule.ref, "rule");
    const preparedOutcome = preparedFixtureRepricingOutcome(this.runtime.repricing.rule.rule);
    if (!preparedOutcome) {
      throwRepositoryError({
        code: "REPRICING_PREVIEW_OUTCOME_UNAVAILABLE",
        message: "No complete-population fixture outcome exists for this Rule version.",
        details: { ruleRef: clone(this.runtime.repricing.rule.ref) },
        retryable: false,
        domain: "repricing",
        traceId: "fixture-repricing-preview-outcome-unavailable",
      });
    }
    if (sameRef(this.runtime.repricing.previewRuleRef, request.ruleRef)) {
      throwRepositoryError({
        code: "REPRICING_PREVIEW_ALREADY_EXISTS",
        message: "This exact Rule version already has a persisted Preview. Open its returned version instead.",
        details: { previewRef: clone(this.runtime.repricing.generatedPreview?.ref ?? FIXTURE_PREVIEW_REF) },
        retryable: false,
        domain: "repricing",
        traceId: "fixture-repricing-preview-already-exists",
      });
    }
    const result = applyIdempotent(this.previewGenerateRequests, request.idempotencyKey, fingerprint, "repricing", () => {
      const ref = { kind: "resource", id: this.runtime.repricing.rule.ref.id, version: nextRepricingVersion(this.runtime) };
      this.runtime.repricing.generatedPreview = {
        kind: "repricing-preview",
        ref,
        persistence: "fixture-only",
        title: this.runtime.repricing.scope.title,
        dataLabel: "Sample data",
        dataLabelDismissible: false,
        effectiveAt: this.runtime.repricing.rule.effectiveAt,
        rule: clone(this.runtime.repricing.rule.rule),
        scopeRef: clone(this.runtime.repricing.scope.ref),
        ruleRef: clone(this.runtime.repricing.rule.ref),
        counts: clone(preparedOutcome.counts),
        blockers: {
          total: preparedOutcome.counts.blocked,
          margin: Math.max(0, preparedOutcome.counts.blocked - FIXTURE_PREVIEW_BLOCKERS.staleCost - FIXTURE_PREVIEW_BLOCKERS.dimension),
          staleCost: FIXTURE_PREVIEW_BLOCKERS.staleCost,
          dimension: FIXTURE_PREVIEW_BLOCKERS.dimension,
        },
        lines: materialiseFixtureRepricingLines(this.runtime.repricing.rule.rule, this.runtime.repricing.rule.effectiveAt),
        remediationEvidence: [],
        provenance: clone(FIXTURE_PROVENANCE),
      };
      this.runtime.repricing.lastGeneratedPreviewRef = clone(ref);
      this.runtime.repricing.previewRuleRef = clone(this.runtime.repricing.rule.ref);
      const data = this.materialisePreview({ ref });
      return {
        data,
        mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false },
      };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {ResourceRef} ref */
  sourcePreview(ref) {
    const remediated = this.runtime.repricing.remediatedPreviews.find((preview) => sameRef(preview.ref, ref));
    if (remediated) return remediated;
    if (sameRef(this.runtime.repricing.generatedPreview?.ref, ref)) return this.runtime.repricing.generatedPreview;
    if (sameRef(FIXTURE_PREVIEW_REF, ref)) return canonicalPreviewSource();
    return null;
  }

  /**
   * Apply one explicit remediation to the current Preview and persist a new
   * fixture-only Preview version. Retained Proposals and old Preview snapshots
   * are never rewritten.
   *
   * @param {{previewRef: ResourceRef, lineId: string, action: "apply-floor" | "exclude" | "refresh-cost" | "repair-dimension", idempotencyKey: string}} request
   */
  async remediateLine(request) {
    requireCapability(this.runtime, "repricing:prepare", "repricing");
    const fingerprint = JSON.stringify({ previewRef: request?.previewRef ?? null, lineId: request?.lineId ?? null, action: request?.action ?? null });
    const retry = readIdempotentRetry(this.lineRemediationRequests, request?.idempotencyKey, fingerprint, "repricing-remediation");
    if (retry) { await wait(this.latencyMs); return retry; }
    if (!request?.previewRef || typeof request.lineId !== "string" || !request.lineId) {
      throwRepositoryError({ code: "REPRICING_REMEDIATION_INVALID", message: "An exact Preview and line are required.", details: {}, retryable: false, domain: "repricing", traceId: "fixture-rpr03-remediation-invalid" });
    }
    if (!REPRICING_REMEDIATION_ACTIONS.includes(request.action)) {
      throwRepositoryError({ code: "REPRICING_REMEDIATION_ACTION_INVALID", message: "The requested remediation action is not supported.", details: { supported: REPRICING_REMEDIATION_ACTIONS }, retryable: false, domain: "repricing", traceId: "fixture-rpr03-remediation-action-invalid" });
    }
    assertPreviewRef(request.previewRef, this.runtime);
    assertCurrentRemediationRef(this.runtime, request.previewRef);
    const source = this.sourcePreview(request.previewRef);
    const sourceLine = source?.lines.find((line) => line.id === request.lineId);
    if (!sourceLine) {
      throwRepositoryError({ code: "REPRICING_LINE_NOT_FOUND", message: "The requested line is not present in this bounded Preview evidence.", details: { lineId: request.lineId }, retryable: false, domain: "repricing", traceId: "fixture-rpr03-remediation-line-not-found" });
    }
    if (!sourceLine.allowedRemediations.includes(request.action)) {
      throwRepositoryError({ code: "REPRICING_REMEDIATION_WRONG_STATE", message: "This remediation does not apply to the line's current issue.", details: { action: request.action, allowedRemediations: sourceLine.allowedRemediations }, retryable: false, domain: "repricing", traceId: "fixture-rpr03-remediation-wrong-state" });
    }

    const result = applyIdempotent(this.lineRemediationRequests, request.idempotencyKey, fingerprint, "repricing-remediation", () => {
      const sequence = this.runtime.repricing.remediationRevision + 1;
      const appliedAt = `2026-08-10T10:00:${String(sequence).padStart(2, "0")}Z`;
      const baseVersion = String(request.previewRef.version).replace(/-r\d+$/, "");
      const fromPreviewRef = clone(request.previewRef);
      let nextLine = clone(sourceLine);
      let explanation;

      if (request.action === "apply-floor") {
        if (!sourceLine.policy.floorPrice || !sourceLine.currentPrice) {
          throwRepositoryError({ code: "REPRICING_FLOOR_UNAVAILABLE", message: "No exact floor price is available for this line.", details: { lineId: sourceLine.id }, retryable: false, domain: "repricing", traceId: "fixture-rpr03-remediation-floor-unavailable" });
        }
        nextLine.proposedPrice = clone(sourceLine.policy.floorPrice);
        nextLine.absoluteDelta = {
          amountMinor: (BigInt(nextLine.proposedPrice.amountMinor) - BigInt(sourceLine.currentPrice.amountMinor)).toString(),
          currency: nextLine.proposedPrice.currency,
        };
        nextLine.proposedMarginBasisPoints = calculateMarginBasisPoints(nextLine.proposedPrice, sourceLine.currentCost);
        nextLine.classification = "eligible";
        nextLine.selected = true;
        nextLine.issue = null;
        nextLine.allowedRemediations = ["exclude"];
        nextLine.policy = {
          ...clone(sourceLine.policy),
          result: "clear",
          violation: null,
          evaluation: revisedEvaluation(sourceLine.policy.evaluation, `Applied the exact ${sourceLine.policy.floorPrice.amountMinor}-minor-unit policy floor; this is the first compliant price.`),
        };
        explanation = "Raised the proposed price to the exact ceiling floor.";
      } else if (request.action === "refresh-cost") {
        if (!sourceLine.remediationInputs?.refreshedCost) {
          throwRepositoryError({ code: "REPRICING_REFRESHED_COST_UNAVAILABLE", message: "No bounded refreshed-cost evidence exists for this line.", details: { lineId: sourceLine.id }, retryable: false, domain: "repricing", traceId: "fixture-rpr03-remediation-cost-unavailable" });
        }
        nextLine.currentCost = clone(sourceLine.remediationInputs.refreshedCost);
        nextLine.costState = "current";
        nextLine.currentMarginBasisPoints = calculateMarginBasisPoints(sourceLine.currentPrice, nextLine.currentCost);
        const outcome = evaluateMarginPolicy({ proposedPrice: sourceLine.proposedPrice, currentCost: nextLine.currentCost, costState: "current", dimensionsValid: true, rules: FIXTURE_MARGIN_POLICIES, facts: sourceLine.facts });
        nextLine.proposedMarginBasisPoints = outcome.proposedMarginBasisPoints;
        nextLine.classification = outcome.classification;
        nextLine.issue = outcome.issue;
        nextLine.allowedRemediations = outcome.allowedRemediations;
        nextLine.policy = policyFromOutcome(outcome);
        explanation = "Re-evaluated the line against a refreshed current cost record.";
      } else if (request.action === "repair-dimension") {
        const repairedFacts = sourceLine.remediationInputs?.repairedFacts;
        if (!repairedFacts) {
          throwRepositoryError({ code: "REPRICING_REPAIRED_DIMENSION_UNAVAILABLE", message: "No bounded repaired-dimension evidence exists for this line.", details: { lineId: sourceLine.id }, retryable: false, domain: "repricing", traceId: "fixture-rpr03-remediation-dimension-unavailable" });
        }
        nextLine.facts = { ...clone(sourceLine.facts), ...clone(repairedFacts) };
        nextLine.category = fixtureCategory(nextLine.facts.categoryId);
        const outcome = evaluateMarginPolicy({ proposedPrice: sourceLine.proposedPrice, currentCost: sourceLine.currentCost, costState: sourceLine.costState, dimensionsValid: true, rules: FIXTURE_MARGIN_POLICIES, facts: nextLine.facts });
        nextLine.proposedMarginBasisPoints = outcome.proposedMarginBasisPoints;
        nextLine.classification = outcome.classification;
        nextLine.issue = outcome.issue;
        nextLine.allowedRemediations = outcome.allowedRemediations;
        nextLine.policy = policyFromOutcome(outcome);
        explanation = "Repaired the missing pricing dimension and re-ran policy resolution.";
      } else {
        nextLine.classification = "excluded";
        nextLine.selected = false;
        nextLine.exclusion = { code: "OPERATOR_EXCLUDED", reason: "Excluded during Preview remediation." };
        nextLine.issue = { kind: "excluded", code: "OPERATOR_EXCLUDED", message: nextLine.exclusion.reason, persistent: false, allowedRemediations: [] };
        nextLine.allowedRemediations = [];
        nextLine.policy = explainUnevaluatedPolicy({ rules: FIXTURE_MARGIN_POLICIES, facts: nextLine.facts, reason: "The operator excluded this line before governance." });
        explanation = "Excluded the line from the selected Proposal scope.";
      }

      const evidence = { lineId: nextLine.id, action: request.action, fromPreviewRef, appliedAt, explanation };
      nextLine.remediationEvidence = clone(evidence);
      const ref = { ...clone(source.ref), version: `${baseVersion}-r${sequence}` };
      const preview = {
        ...clone(source),
        ref,
        counts: movePopulationCount(source.counts, sourceLine.classification, nextLine.classification),
        blockers: moveBlockerCount(source.blockers, sourceLine, nextLine),
        lines: source.lines.map((line) => line.id === nextLine.id ? nextLine : clone(line)),
        remediationEvidence: [...clone(source.remediationEvidence ?? []), evidence],
      };
      this.runtime.repricing.remediationRevision = sequence;
      this.runtime.repricing.remediatedPreviews.push(preview);
      this.runtime.repricing.currentRemediatedPreviewRef = clone(ref);
      // Mutation handoff includes the complete bounded diagnostic sample so a
      // remediated row remains available to the focused inspector. Ordinary
      // getPreview reads retain their default cursor/page behaviour.
      const data = this.materialisePreview({ ref, limit: preview.lines.length });
      return { data, mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }

  /**
   * @param {GetRepricingPreviewRequest} [request]
   * @returns {Promise<RepricingPreview>}
   */
  async getPreview(request = {}) {
    requireAnyCapability(this.runtime, ["repricing:prepare", "proposal:read", "proposal:review"], "repricing");
    const preview = this.materialisePreview(request);
    await wait(this.latencyMs);
    return preview;
  }

  /** @param {GetRepricingPreviewRequest} request @returns {RepricingPreview} */
  materialisePreview(request = {}) {
    assertPreviewRef(request.ref, this.runtime);
    const remediated = request.ref
      ? this.runtime.repricing.remediatedPreviews.find((preview) => sameRef(preview.ref, request.ref))
      : null;
    const generated = !remediated && request.ref && request.ref.id !== FIXTURE_PREVIEW_REF.id
      ? this.runtime.repricing.generatedPreview
      : null;
    const source = remediated ?? generated ?? canonicalPreviewSource();
    const classification = request.classification ?? "all";
    if (classification !== "all" && !REPRICING_CLASSIFICATIONS.includes(classification)) {
      throwRepositoryError({
        code: "REPRICING_CLASSIFICATION_INVALID",
        message: "The requested repricing classification is not supported.",
        details: { supported: ["all", ...REPRICING_CLASSIFICATIONS] },
        retryable: false,
        domain: "repricing",
        traceId: "fixture-rpr03-invalid-classification",
      });
    }

    const offset = readCursor(request.cursor);
    const limit = normaliseLimit(request.limit);
    const appliedQuery = typeof request.query === "string" ? request.query.trim() : "";
    const query = normaliseQuery(appliedQuery);
    const channelId = normaliseFacetId(request.channelId);
    const locationId = normaliseFacetId(request.locationId);
    const sourceLines = source.lines;
    const filtered = sourceLines.filter((line) => {
      const matchesClassification = classification === "all" || line.classification === classification;
      const matchesChannel = !channelId || line.scope.channel.id === channelId;
      const matchesLocation = !locationId || line.scope.location.id === locationId;
      const searchText = `${line.sku} ${line.product.name} ${line.product.variant} ${line.scope.channel.name} ${line.scope.location.name}`.toLocaleLowerCase("en-NG");
      return matchesClassification && matchesChannel && matchesLocation && (!query || searchText.includes(query));
    });
    const lines = filtered.slice(offset, offset + limit);
    const nextOffset = offset + lines.length;
    const nextCursor = nextOffset < filtered.length ? `${CURSOR_PREFIX}${nextOffset}` : null;

    /** @type {RepricingPreview} */
    const preview = {
      ...clone(source),
      lines: clone(lines),
      page: {
        cursor: request.cursor ?? null,
        nextCursor,
        returnedCount: lines.length,
        limit,
        totalCount: source.counts.total,
        totalCountRelation: "exact",
        coverage: "bounded-sample",
        exhaustive: false,
      },
      facets: {
        coverage: "bounded-sample",
        sampleLineCount: sourceLines.length,
        channels: buildFacetOptions(sourceLines, "channel", channelId),
        locations: buildFacetOptions(sourceLines, "location", locationId),
      },
      filterResult: {
        applied: {
          query: appliedQuery,
          classification,
          channelId,
          locationId,
        },
        activeFilterCount:
          Number(Boolean(appliedQuery))
          + Number(classification !== "all")
          + Number(Boolean(channelId))
          + Number(Boolean(locationId)),
        hasActiveFilters: Boolean(appliedQuery || classification !== "all" || channelId || locationId),
        sample: {
          availableLineCount: sourceLines.length,
          matchedLineCount: filtered.length,
          returnedLineCount: lines.length,
        },
        authoritativePopulation: {
          totalCount: source.counts.total,
          filteredCount: null,
          affectedByFilters: false,
        },
      },
      allowedActions: repricingPreviewAllowedActions(this.runtime, source.ref),
    };
    assertRepricingPreview(preview);
    return preview;
  }
}

/**
 * Fixture Proposal mutation adapter with explicit precondition and idempotency
 * behavior. It never sends a network request.
 */
export class FixtureProposalRepository {
  /** @param {{latencyMs?: number, runtime?: ReturnType<typeof createJourneyRuntime>}} [options] */
  constructor({ latencyMs = 0, runtime = createJourneyRuntime() } = {}) {
    this.latencyMs = latencyMs;
    this.runtime = runtime;
    /** @type {Map<string, {fingerprint: string, result: MutationResult<ProposalHandoff>}>} */
    this.requests = new Map();
    /** @type {Map<string, any>} */
    this.journeyRequests = new Map();
    /** @type {Map<string, any>} */
    this.commentRequests = new Map();
  }

  /**
   * @param {CreateProposalRequest} request
   * @returns {Promise<MutationResult<ProposalHandoff>>}
   */
  async createFromPreview(request) {
    if (!request || typeof request !== "object") {
      throwRepositoryError({
        code: "PROPOSAL_CREATE_REQUEST_INVALID",
        message: "A Proposal creation request is required.",
        details: {},
        retryable: false,
        domain: "proposal",
        traceId: "fixture-proposal-invalid-request",
      });
    }
    requireCapability(this.runtime, "proposal:create", "proposal");
    if (!request.sourcePreviewRef) {
      throwRepositoryError({
        code: "PROPOSAL_SOURCE_PREVIEW_REQUIRED",
        message: "A versioned source Preview reference is required.",
        details: {},
        retryable: false,
        domain: "proposal",
        traceId: "fixture-proposal-source-required",
      });
    }
    assertPreviewRef(request.sourcePreviewRef, this.runtime);
    const remediatedSource = this.runtime.repricing.remediatedPreviews.find((preview) => sameRef(preview.ref, request.sourcePreviewRef));
    const generatedSource = this.runtime.repricing.generatedPreview;
    const isGeneratedSource = Boolean(remediatedSource || (generatedSource
      && generatedSource.ref.id === request.sourcePreviewRef.id
      && generatedSource.ref.version === request.sourcePreviewRef.version));
    const sourcePreview = remediatedSource
      ?? (isGeneratedSource ? generatedSource : canonicalPreviewSource());
    const remediableBlockers = sourcePreview.blockers.staleCost + sourcePreview.blockers.dimension;
    if (typeof request.idempotencyKey !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(request.idempotencyKey)) {
      throwRepositoryError({
        code: "IDEMPOTENCY_KEY_INVALID",
        message: "Use an idempotency key between 8 and 128 safe characters.",
        details: {},
        retryable: false,
        domain: "proposal",
        traceId: "fixture-proposal-invalid-idempotency-key",
      });
    }
    if (request.title != null && (typeof request.title !== "string" || !request.title.trim() || request.title.length > 120)) {
      throwRepositoryError({
        code: "PROPOSAL_TITLE_INVALID",
        message: "Proposal title must contain 1 to 120 characters.",
        details: {},
        retryable: false,
        domain: "proposal",
        traceId: "fixture-proposal-invalid-title",
      });
    }

    const title = request.title?.trim() || sourcePreview.title || FIXTURE_PROPOSAL_HANDOFF.title;
    const fingerprint = JSON.stringify({
      previewKind: request.sourcePreviewRef.kind,
      previewId: request.sourcePreviewRef.id,
      previewVersion: request.sourcePreviewRef.version,
      title,
    });
    const recorded = this.requests.get(request.idempotencyKey);
    if (recorded) {
      if (recorded.fingerprint !== fingerprint) {
        throwRepositoryError({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "This idempotency key was already used for a different Proposal request.",
          details: {},
          retryable: false,
          domain: "proposal",
          traceId: "fixture-proposal-idempotency-conflict",
        });
      }
      await wait(this.latencyMs);
      return {
        data: clone(recorded.result.data),
        mutation: { ...recorded.result.mutation, deduplicated: true },
      };
    }

    if (this.runtime.proposal?.sourcePreviewRef?.id === request.sourcePreviewRef.id
      && this.runtime.proposal?.sourcePreviewRef?.version === request.sourcePreviewRef.version) {
      throwRepositoryError({
        code: "ALREADY_EXISTS",
        message: "This exact Preview already has a governed Proposal. Open its current version instead.",
        details: { proposalRef: clone(this.runtime.proposal.ref), sourcePreviewRef: clone(request.sourcePreviewRef) },
        retryable: false,
        domain: "proposal",
        traceId: "fixture-proposal-already-exists",
      });
    }
    if (remediableBlockers > 0) {
      throwRepositoryError({
        code: "PROPOSAL_SOURCE_REMEDIATION_REQUIRED",
        message: "Resolve stale-cost and dimension blockers before creating a governed Proposal.",
        details: { sourcePreviewRef: clone(sourcePreview.ref), staleCost: sourcePreview.blockers.staleCost, dimension: sourcePreview.blockers.dimension },
        retryable: false,
        domain: "proposal",
        traceId: "fixture-proposal-source-remediation-required",
      });
    }

    const proposal = clone(FIXTURE_PROPOSAL_HANDOFF);
    proposal.ref.id = isGeneratedSource ? FIXTURE_GENERATED_PROPOSAL_ID : FIXTURE_PROPOSAL_ID;
    proposal.title = title;
    proposal.sourcePreviewRef = clone(sourcePreview.ref);
    proposal.effectiveAt = sourcePreview.effectiveAt;
    proposal.counts = {
      selected: sourcePreview.counts.selected,
      eligible: sourcePreview.counts.eligible,
      blocked: sourcePreview.counts.blocked,
    };
    const submitAction = proposal.allowedActions.find((action) => action.code === "proposal.submit");
    if (submitAction?.reason?.code === "WRONG_STATE") {
      submitAction.reason.message = `Resolve or authorise all ${proposal.counts.blocked.toLocaleString("en-GB")} blockers before submission.`;
    }
    // Carry the exact source Preview ledger. Non-margin blockers must already
    // have been remediated; margin blockers may enter governance for a
    // separately authorised exception decision.
    const sourceBlockers = clone(sourcePreview.blockers);
    this.runtime.proposal = clone(FIXTURE_PROPOSAL_DETAIL);
    this.runtime.proposal.ref.id = proposal.ref.id;
    this.runtime.proposal.title = title;
    this.runtime.proposal.sourcePreviewRef = clone(sourcePreview.ref);
    this.runtime.proposal.effectiveAt = sourcePreview.effectiveAt;
    this.runtime.proposal.counts = clone(proposal.counts);
    this.runtime.proposal.blockers = clone(sourceBlockers);
    this.runtime.proposalSourceSnapshot = {
      ref: clone(sourcePreview.ref),
      title: sourcePreview.title,
      effectiveAt: sourcePreview.effectiveAt,
      counts: clone(sourcePreview.counts),
      blockers: clone(sourceBlockers),
      lines: clone(sourcePreview.lines),
    };
    this.runtime.override = null;
    this.runtime.publication = null;
    this.runtime.auditLastSequence = 12;
    this.runtime.overrideDecisionAuditEvent = null;
    this.runtime.publishIdempotencyKey = null;
    this.runtime.comments = [];
    assertProposalHandoff(proposal);
    /** @type {MutationResult<ProposalHandoff>} */
    const result = {
      data: proposal,
      mutation: {
        idempotencyKey: request.idempotencyKey,
        applied: true,
        deduplicated: false,
        // Fixture mutation success is deterministic design evidence, not a
        // claim that a backend accepted or persisted the Proposal.
        authoritative: false,
      },
    };
    this.requests.set(request.idempotencyKey, { fingerprint, result: clone(result) });
    await wait(this.latencyMs);
    return clone(result);
  }

  /** @param {{ref?: import("./contracts.js").ResourceRef}} [request] */
  async getDetail(request = {}) {
    requireCapability(this.runtime, "proposal:read", "proposal");
    if (request.ref) assertCurrentRef(request.ref, this.runtime.proposal.ref, "PROPOSAL", "proposal");
    const detail = materialiseProposal(this.runtime);
    await wait(this.latencyMs);
    return detail;
  }

  /** @param {{proposalRef: import("./contracts.js").ResourceRef}} request */
  async getMarginEvidence(request) {
    requireCapability(this.runtime, "proposal:read", "proposal-margin");
    assertCurrentRef(request?.proposalRef, this.runtime.proposal.ref, "PROPOSAL", "proposal-margin");
    const source = this.runtime.proposalSourceSnapshot;
    if (!source
      || source.ref.id !== this.runtime.proposal.sourcePreviewRef.id
      || source.ref.version !== this.runtime.proposal.sourcePreviewRef.version) {
      throwRepositoryError({
        code: "PROPOSAL_MARGIN_EVIDENCE_UNAVAILABLE",
        message: "The retained margin evidence is not available for this exact Proposal source version.",
        details: { proposalRef: clone(this.runtime.proposal.ref), sourcePreviewRef: clone(this.runtime.proposal.sourcePreviewRef) },
        retryable: false,
        domain: "proposal-margin",
        traceId: "fixture-proposal-margin-source-unavailable",
      });
    }
    const evidence = clone(FIXTURE_PROPOSAL_MARGIN_EVIDENCE);
    evidence.proposalRef = clone(this.runtime.proposal.ref);
    evidence.sourcePreviewRef = clone(source.ref);
    evidence.counts.retained = source.blockers.margin;
    evidence.counts.unresolved = this.runtime.proposal.blockers.margin;
    evidence.lines = clone(source.lines.filter((line) => line.policy.violation?.code === "MARGIN_BELOW_FLOOR"));
    evidence.counts.sampleAvailable = evidence.lines.length;
    evidence.allowedActions = [
      allowedAction("proposal.margin.read", true, this.runtime.proposal.ref.version, null),
      clone(proposalAllowedActions(this.runtime).find((action) => action.code === "override.request")),
    ].filter(Boolean);
    assertProposalMarginEvidence(evidence);
    await wait(this.latencyMs);
    return evidence;
  }

  /** @param {{proposalRef: import("./contracts.js").ResourceRef, cursor?: string | null, limit?: number}} request */
  async listComments(request) {
    requireCapability(this.runtime, "proposal:read", "proposal-comment");
    assertCurrentRef(request?.proposalRef, this.runtime.proposal.ref, "PROPOSAL", "proposal-comment");
    const ordered = clone(this.runtime.comments)
      .filter((comment) => comment.proposalRef.id === this.runtime.proposal.ref.id
        && comment.proposalRef.version === this.runtime.proposal.ref.version)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const offset = readCommentCursor(request?.cursor, ordered);
    const limit = normaliseCommentLimit(request?.limit);
    const items = ordered.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    const nextCursor = nextOffset < ordered.length && items.length
      ? `${COMMENT_CURSOR_PREFIX}${items.at(-1).ref.id}`
      : null;
    const thread = {
      kind: "proposal-comment-thread",
      proposalRef: clone(this.runtime.proposal.ref),
      items,
      page: {
        cursor: request?.cursor ?? null,
        nextCursor,
        returnedCount: items.length,
        limit,
        totalCount: ordered.length,
        totalCountRelation: "exact",
      },
      allowedActions: proposalCommentActions(this.runtime),
      provenance: clone(FIXTURE_PROVENANCE),
    };
    assertProposalCommentThread(thread);
    await wait(this.latencyMs);
    return thread;
  }

  /** @param {{proposalRef: import("./contracts.js").ResourceRef, idempotencyKey: string, body: string}} request */
  async addComment(request) {
    requireCapability(this.runtime, "proposal:comment", "proposal-comment");
    const body = typeof request?.body === "string" ? request.body.trim() : "";
    if (!body || body.length > 2000) {
      throwRepositoryError({
        code: "PROPOSAL_COMMENT_BODY_INVALID",
        message: "Comment text must contain between 1 and 2,000 characters.",
        details: {},
        retryable: false,
        domain: "proposal-comment",
        traceId: "fixture-proposal-comment-invalid-body",
      });
    }
    const fingerprint = JSON.stringify({ proposalRef: request?.proposalRef, body });
    const retry = readIdempotentRetry(this.commentRequests, request?.idempotencyKey, fingerprint, "proposal-comment");
    if (retry) {
      await wait(this.latencyMs);
      return retry;
    }
    assertCurrentRef(request?.proposalRef, this.runtime.proposal.ref, "PROPOSAL", "proposal-comment");
    const action = proposalCommentActions(this.runtime).find((candidate) => candidate.code === "proposal.comment.add");
    if (!action?.enabled) {
      throwRepositoryError({
        code: action?.reason?.code ?? "MISSING_PERMISSION",
        message: action?.reason?.message ?? "Comment permission is required for this Proposal version.",
        details: {},
        retryable: false,
        domain: "proposal-comment",
        traceId: "fixture-proposal-comment-action-denied",
      });
    }
    const result = applyIdempotent(this.commentRequests, request.idempotencyKey, fingerprint, "proposal-comment", () => {
      const actor = clone(currentSession(this.runtime).actor);
      const sequence = this.runtime.comments.length + 1;
      const comment = {
        kind: "proposal-comment",
        ref: { kind: "resource", id: fixtureCommentId(sequence), version: "1" },
        proposalRef: clone(this.runtime.proposal.ref),
        actor,
        body,
        createdAt: `2026-08-10T${String(9 + Math.floor(sequence / 12)).padStart(2, "0")}:${String((sequence * 5) % 60).padStart(2, "0")}:00Z`,
        editedAt: null,
        provenance: clone(FIXTURE_PROVENANCE),
      };
      assertProposalComment(comment);
      this.runtime.comments.push(clone(comment));
      return {
        data: comment,
        mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false },
      };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{proposalRef: import("./contracts.js").ResourceRef, idempotencyKey: string, reason?: string, evidence?: string}} request */
  async requestOverride(request) {
    if (!request || typeof request !== "object") {
      throwRepositoryError({ code: "OVERRIDE_REQUEST_INVALID", message: "An exception request is required.", details: {}, retryable: false, domain: "override", traceId: "fixture-override-invalid-request" });
    }
    const reason = request.reason?.trim() || FIXTURE_OVERRIDE_REQUEST.reason;
    const evidence = request.evidence?.trim() || FIXTURE_OVERRIDE_REQUEST.evidence;
    const fingerprint = JSON.stringify({ proposalRef: request.proposalRef, reason, evidence });
    const retry = readIdempotentRetry(this.journeyRequests, request.idempotencyKey, fingerprint, "override");
    if (retry) {
      await wait(this.latencyMs);
      return retry;
    }
    assertCurrentRef(request.proposalRef, this.runtime.proposal.ref, "PROPOSAL", "proposal");
    requireCapability(this.runtime, "override:request", "override");
    if (this.runtime.actorId !== this.runtime.proposal.author.id) {
      throwRepositoryError({ code: "WRONG_ACTOR", message: "Only the Proposal author can request this exception.", details: {}, retryable: false, domain: "override", traceId: "fixture-override-wrong-requester" });
    }
    if (this.runtime.proposal.state !== "blocked" || this.runtime.override) {
      throwRepositoryError({ code: "OVERRIDE_WRONG_STATE", message: "The Proposal must be blocked without a current exception request.", details: { currentState: this.runtime.proposal.state }, retryable: false, domain: "override", traceId: "fixture-override-wrong-state" });
    }
    if (this.runtime.proposal.blockers.margin < 1) {
      throwRepositoryError({ code: "OVERRIDE_MARGIN_BLOCKERS_REQUIRED", message: "An exception can authorise margin blockers only; repair operational blockers in a new Preview.", details: { blockers: clone(this.runtime.proposal.blockers) }, retryable: false, domain: "override", traceId: "fixture-override-margin-required" });
    }
    const result = applyIdempotent(this.journeyRequests, request.idempotencyKey, fingerprint, "override", () => {
      this.runtime.override = clone(FIXTURE_OVERRIDE_REQUEST);
      this.runtime.override.proposalRef = clone(this.runtime.proposal.ref);
      this.runtime.override.lineCount = this.runtime.proposal.blockers.margin;
      this.runtime.override.reason = reason;
      this.runtime.override.evidence = evidence;
      this.runtime.proposal.readiness = "pending_override";
      this.runtime.auditLastSequence = 14;
      this.runtime.overrideDecisionAuditEvent = null;
      return {
        data: { proposal: materialiseProposal(this.runtime), override: materialiseOverride(this.runtime) },
        mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false },
      };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{overrideRef: import("./contracts.js").ResourceRef, decision: "approve" | "deny", idempotencyKey: string}} request */
  async decideOverride(request) {
    const fingerprint = JSON.stringify({ overrideRef: request?.overrideRef, decision: request?.decision });
    const retry = readIdempotentRetry(this.journeyRequests, request?.idempotencyKey, fingerprint, "override");
    if (retry) {
      await wait(this.latencyMs);
      return retry;
    }
    if (!this.runtime.override) {
      throwRepositoryError({ code: "OVERRIDE_NOT_FOUND", message: "No exception request is available.", details: {}, retryable: false, domain: "override", traceId: "fixture-override-not-found" });
    }
    assertCurrentRef(request?.overrideRef, this.runtime.override.ref, "OVERRIDE", "override");
    if (this.runtime.actorId === this.runtime.override.requester.id) {
      throwRepositoryError({ code: "MAKER_CHECKER_REQUIRED", message: "The requester cannot decide their own exception.", details: { workPreserved: true }, retryable: false, domain: "override", traceId: "fixture-override-maker-checker" });
    }
    requireCapability(this.runtime, "override:decide", "override");
    if (this.runtime.actorId !== this.runtime.proposal.assignedApprover.id) {
      throwRepositoryError({ code: "WRONG_ACTOR", message: "This exception is assigned to a different approver.", details: {}, retryable: false, domain: "override", traceId: "fixture-override-wrong-decider" });
    }
    if (this.runtime.override.state !== "pending") {
      throwRepositoryError({ code: "OVERRIDE_WRONG_STATE", message: "Only a pending exception can be decided.", details: { currentState: this.runtime.override.state }, retryable: false, domain: "override", traceId: "fixture-override-decision-wrong-state" });
    }
    if (!request || !["approve", "deny"].includes(request.decision)) {
      throwRepositoryError({ code: "OVERRIDE_DECISION_INVALID", message: "Decision must be approve or deny.", details: {}, retryable: false, domain: "override", traceId: "fixture-override-invalid-decision" });
    }
    const result = applyIdempotent(this.journeyRequests, request.idempotencyKey, fingerprint, "override", () => {
      this.runtime.override.ref.version = "2";
      this.runtime.override.state = request.decision === "approve" ? "approved" : "denied";
      this.runtime.override.decider = clone(FIXTURE_JOURNEY_ACTORS.chika);
      this.runtime.override.decidedAt = "2026-08-10T09:00:00Z";
      if (request.decision === "approve") {
        this.runtime.overrideDecisionAuditEvent = null;
        this.runtime.proposal.ref.version = "7";
        const authorisedMarginLines = this.runtime.proposal.blockers.margin;
        const legacyFx010Reconciliation = hasCanonicalFx010AuditLineage(this.runtime)
          ? {
              costsRefreshed: this.runtime.proposal.blockers.staleCost,
              dimensionsReconciled: this.runtime.proposal.blockers.dimension,
              auditSequences: [16, 17, 18],
            }
          : null;
        const remaining = legacyFx010Reconciliation
          ? 0
          : this.runtime.proposal.blockers.staleCost + this.runtime.proposal.blockers.dimension;
        this.runtime.proposal.state = remaining > 0 ? "blocked" : "draft";
        this.runtime.proposal.readiness = remaining > 0 ? "blocked" : "ready_to_submit";
        this.runtime.proposal.counts = {
          selected: this.runtime.proposal.counts.selected,
          eligible: this.runtime.proposal.counts.eligible
            + authorisedMarginLines
            + (legacyFx010Reconciliation?.costsRefreshed ?? 0)
            + (legacyFx010Reconciliation?.dimensionsReconciled ?? 0),
          blocked: remaining,
        };
        this.runtime.proposal.blockers = {
          total: remaining,
          margin: 0,
          staleCost: legacyFx010Reconciliation ? 0 : this.runtime.proposal.blockers.staleCost,
          dimension: legacyFx010Reconciliation ? 0 : this.runtime.proposal.blockers.dimension,
        };
        this.runtime.proposal.operationalReconciliation = legacyFx010Reconciliation;
        this.runtime.auditLastSequence = 18;
      } else {
        this.runtime.proposal.readiness = "blocked";
        this.runtime.auditLastSequence = 15;
        this.runtime.overrideDecisionAuditEvent = clone(FIXTURE_OVERRIDE_DENIED_EVENT);
      }
      return {
        data: { proposal: materialiseProposal(this.runtime), override: materialiseOverride(this.runtime) },
        mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false },
      };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{proposalRef: import("./contracts.js").ResourceRef, idempotencyKey: string}} request */
  async submit(request) {
    const fingerprint = JSON.stringify({ proposalRef: request?.proposalRef });
    const retry = readIdempotentRetry(this.journeyRequests, request?.idempotencyKey, fingerprint, "proposal");
    if (retry) {
      await wait(this.latencyMs);
      return retry;
    }
    assertCurrentRef(request?.proposalRef, this.runtime.proposal.ref, "PROPOSAL", "proposal");
    requireCapability(this.runtime, "proposal:submit", "proposal");
    if (this.runtime.actorId !== this.runtime.proposal.author.id) {
      throwRepositoryError({ code: "WRONG_ACTOR", message: "Only the Proposal author can submit this version.", details: {}, retryable: false, domain: "proposal", traceId: "fixture-proposal-submit-wrong-actor" });
    }
    if (this.runtime.proposal.state !== "draft" || this.runtime.proposal.readiness !== "ready_to_submit") {
      throwRepositoryError({ code: "PROPOSAL_WRONG_STATE", message: "Only a ready current draft can be submitted.", details: { currentState: this.runtime.proposal.state, readiness: this.runtime.proposal.readiness }, retryable: false, domain: "proposal", traceId: "fixture-proposal-submit-wrong-state" });
    }
    const result = applyIdempotent(this.journeyRequests, request.idempotencyKey, fingerprint, "proposal", () => {
      this.runtime.proposal.ref.version = "8";
      this.runtime.proposal.state = "submitted";
      this.runtime.proposal.readiness = "awaiting_approval";
      this.runtime.auditLastSequence = 19;
      return { data: materialiseProposal(this.runtime), mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{proposalRef: import("./contracts.js").ResourceRef, idempotencyKey: string}} request */
  async approve(request) {
    const fingerprint = JSON.stringify({ proposalRef: request?.proposalRef });
    const retry = readIdempotentRetry(this.journeyRequests, request?.idempotencyKey, fingerprint, "proposal");
    if (retry) {
      await wait(this.latencyMs);
      return retry;
    }
    assertCurrentRef(request?.proposalRef, this.runtime.proposal.ref, "PROPOSAL", "proposal");
    if (this.runtime.actorId === this.runtime.proposal.author.id) {
      throwRepositoryError({ code: "MAKER_CHECKER_REQUIRED", message: "The Proposal author cannot approve their own protected decision.", details: { workPreserved: true }, retryable: false, domain: "proposal", traceId: "fixture-proposal-approval-maker-checker" });
    }
    requireCapability(this.runtime, "proposal:approve", "proposal");
    if (this.runtime.actorId !== this.runtime.proposal.assignedApprover.id) {
      throwRepositoryError({ code: "WRONG_ACTOR", message: "This Proposal is assigned to a different approver.", details: {}, retryable: false, domain: "proposal", traceId: "fixture-proposal-approval-wrong-actor" });
    }
    if (this.runtime.proposal.state !== "submitted" || this.runtime.proposal.readiness !== "awaiting_approval") {
      throwRepositoryError({ code: "PROPOSAL_WRONG_STATE", message: "Only the current submitted version can be approved.", details: { currentState: this.runtime.proposal.state }, retryable: false, domain: "proposal", traceId: "fixture-proposal-approval-wrong-state" });
    }
    const result = applyIdempotent(this.journeyRequests, request.idempotencyKey, fingerprint, "proposal", () => {
      this.runtime.proposal.ref.version = "9";
      this.runtime.proposal.state = "approved";
      this.runtime.proposal.readiness = "approved_to_publish";
      this.runtime.proposal.approval = {
        state: "approved",
        actor: clone(FIXTURE_JOURNEY_ACTORS.chika),
        decidedAt: "2026-08-10T09:20:00Z",
        proposalVersion: "9",
      };
      this.runtime.auditLastSequence = 20;
      return { data: materialiseProposal(this.runtime), mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }
}

/** Fixture publication adapter for the separately authorised FX-010 release. */
export class FixturePublicationRepository {
  /** @param {{latencyMs?: number, runtime?: ReturnType<typeof createJourneyRuntime>}} [options] */
  constructor({ latencyMs = 0, runtime = createJourneyRuntime() } = {}) {
    this.latencyMs = latencyMs;
    this.runtime = runtime;
    /** @type {Map<string, any>} */
    this.startRequests = new Map();
    /** @type {Map<string, any>} */
    this.retryRequests = new Map();
  }

  /** @param {{operationRef?: import("./contracts.js").ResourceRef}} [request] */
  async get(request = {}) {
    if (!this.runtime.publication) {
      throwRepositoryError({ code: "PUBLICATION_NOT_FOUND", message: "No publication operation is available.", details: {}, retryable: false, domain: "publication", traceId: "fixture-publication-not-found" });
    }
    if (!hasCapability(this.runtime, "publish:execute") && !hasCapability(this.runtime, "audit:read")) {
      throwRepositoryError({ code: "MISSING_PERMISSION", message: "Publication read access is required.", details: {}, retryable: false, domain: "publication", traceId: "fixture-publication-read-forbidden" });
    }
    if (request.operationRef) assertCurrentRef(request.operationRef, this.runtime.publication.ref, "PUBLICATION", "publication");
    const operation = materialisePublication(this.runtime);
    await wait(this.latencyMs);
    return operation;
  }

  /** @param {{proposalRef: import("./contracts.js").ResourceRef, idempotencyKey: string}} request */
  async start(request) {
    const fingerprint = JSON.stringify({ proposalRef: request?.proposalRef });
    const retry = readIdempotentRetry(this.startRequests, request?.idempotencyKey, fingerprint, "publication");
    if (retry) {
      await wait(this.latencyMs);
      return retry;
    }
    assertCurrentRef(request?.proposalRef, this.runtime.proposal.ref, "PROPOSAL", "proposal");
    requireCapability(this.runtime, "publish:execute", "publication");
    if (this.runtime.actorId !== this.runtime.proposal.assignedPublisher.id) {
      throwRepositoryError({ code: "WRONG_ACTOR", message: "This release is assigned to a different Publisher.", details: {}, retryable: false, domain: "publication", traceId: "fixture-publication-wrong-publisher" });
    }
    if (this.runtime.proposal.state !== "approved" || this.runtime.proposal.readiness !== "approved_to_publish" || this.runtime.publication) {
      throwRepositoryError({ code: "PUBLICATION_WRONG_STATE", message: "A current approved Proposal without an existing release is required.", details: { currentState: this.runtime.proposal.state }, retryable: false, domain: "publication", traceId: "fixture-publication-start-wrong-state" });
    }
    const result = applyIdempotent(this.startRequests, request.idempotencyKey, fingerprint, "publication", () => {
      this.runtime.publication = clone(FIXTURE_PUBLICATION_STATES["1"]);
      this.runtime.publication.idempotencyKey = request.idempotencyKey;
      this.runtime.publishIdempotencyKey = request.idempotencyKey;
      this.runtime.proposal.publicationRef = clone(this.runtime.publication.ref);
      this.runtime.auditLastSequence = 21;
      return { data: materialisePublication(this.runtime), mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{operationRef: import("./contracts.js").ResourceRef}} request */
  async reconcile(request) {
    if (!this.runtime.publication) {
      throwRepositoryError({ code: "PUBLICATION_NOT_FOUND", message: "No publication operation is available.", details: {}, retryable: false, domain: "publication", traceId: "fixture-publication-reconcile-not-found" });
    }
    assertCurrentRef(request?.operationRef, this.runtime.publication.ref, "PUBLICATION", "publication");
    requireCapability(this.runtime, "publish:reconcile", "publication");
    if (this.runtime.actorId !== this.runtime.publication.publisher.id) {
      throwRepositoryError({ code: "WRONG_ACTOR", message: "Only the assigned Publisher can reconcile this operation.", details: {}, retryable: false, domain: "publication", traceId: "fixture-publication-reconcile-wrong-actor" });
    }
    if (this.runtime.publication.state === "unknown-outcome") {
      this.runtime.publication = clone(FIXTURE_PUBLICATION_STATES["2"]);
      this.runtime.publication.idempotencyKey = this.runtime.publishIdempotencyKey;
      this.runtime.auditLastSequence = 22;
    } else if (this.runtime.publication.state === "reconciling") {
      this.runtime.publication = clone(FIXTURE_PUBLICATION_STATES["4"]);
      this.runtime.publication.idempotencyKey = this.runtime.publishIdempotencyKey;
      this.runtime.auditLastSequence = 24;
    } else {
      throwRepositoryError({ code: "PUBLICATION_WRONG_STATE", message: "Only an unknown or reconciling outcome can be reconciled.", details: { currentState: this.runtime.publication.state }, retryable: false, domain: "publication", traceId: "fixture-publication-reconcile-wrong-state" });
    }
    const operation = materialisePublication(this.runtime);
    await wait(this.latencyMs);
    return operation;
  }

  /** @param {{operationRef: import("./contracts.js").ResourceRef, idempotencyKey: string}} request */
  async retry(request) {
    const fingerprint = JSON.stringify({ operationRef: request?.operationRef, unresolved: 4 });
    const deduplicated = readIdempotentRetry(this.retryRequests, request?.idempotencyKey, fingerprint, "publication");
    if (deduplicated) {
      await wait(this.latencyMs);
      return deduplicated;
    }
    if (!this.runtime.publication) {
      throwRepositoryError({ code: "PUBLICATION_NOT_FOUND", message: "No publication operation is available.", details: {}, retryable: false, domain: "publication", traceId: "fixture-publication-retry-not-found" });
    }
    assertCurrentRef(request?.operationRef, this.runtime.publication.ref, "PUBLICATION", "publication");
    requireCapability(this.runtime, "publish:execute", "publication");
    if (this.runtime.actorId !== this.runtime.publication.publisher.id) {
      throwRepositoryError({ code: "WRONG_ACTOR", message: "Only the assigned Publisher can retry this operation.", details: {}, retryable: false, domain: "publication", traceId: "fixture-publication-retry-wrong-actor" });
    }
    if (this.runtime.publication.state !== "incomplete") {
      throwRepositoryError({
        code: this.runtime.publication.state === "unknown-outcome" ? "PUBLICATION_OUTCOME_UNKNOWN" : "PUBLICATION_WRONG_STATE",
        message: this.runtime.publication.state === "unknown-outcome" ? "Reconcile the unknown outcome before retrying." : "Only a reconciled incomplete operation can be retried.",
        details: { currentState: this.runtime.publication.state },
        retryable: false,
        domain: "publication",
        traceId: "fixture-publication-retry-unsafe",
      });
    }
    if (request.idempotencyKey !== this.runtime.publishIdempotencyKey) {
      throwRepositoryError({ code: "PUBLICATION_IDEMPOTENCY_KEY_MISMATCH", message: "Safe retry must reuse the original publication idempotency key.", details: {}, retryable: false, domain: "publication", traceId: "fixture-publication-retry-key-mismatch" });
    }
    const result = applyIdempotent(this.retryRequests, request.idempotencyKey, fingerprint, "publication", () => {
      this.runtime.publication = clone(FIXTURE_PUBLICATION_STATES["3"]);
      this.runtime.publication.idempotencyKey = this.runtime.publishIdempotencyKey;
      this.runtime.auditLastSequence = 23;
      return { data: materialisePublication(this.runtime), mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }
}

/** Read-only FX-010 evidence adapter. It cannot manufacture domain events. */
export class FixtureAuditRepository {
  /** @param {{latencyMs?: number, runtime?: ReturnType<typeof createJourneyRuntime>}} [options] */
  constructor({ latencyMs = 0, runtime = createJourneyRuntime() } = {}) {
    this.latencyMs = latencyMs;
    this.runtime = runtime;
  }

  /** @param {{proposalId: string}} request */
  async getProposalHistory(request) {
    if (request?.proposalId !== FIXTURE_PROPOSAL_ID || !hasCanonicalFx010AuditLineage(this.runtime)) {
      throwRepositoryError({ code: "AUDIT_HISTORY_NOT_FOUND", message: "No audit reconstruction is available for that Proposal.", details: { proposalId: request?.proposalId ?? null }, retryable: false, domain: "audit", traceId: "fixture-audit-not-found" });
    }
    requireCapability(this.runtime, "audit:read", "audit");
    const complete = this.runtime.publication?.state === "published";
    const events = canonicalAuditEvents(this.runtime);
    const last = events.at(-1).sequence;
    const history = {
      kind: "audit-history",
      proposalId: FIXTURE_PROPOSAL_ID,
      events,
      sequence: { first: 1, last, gaps: 0 },
      complete,
      readOnlyEvidence: true,
      allowedActions: [allowedAction("audit.read", true, "1", null)],
      provenance: clone(FIXTURE_PROVENANCE),
    };
    assertAuditHistory(history);
    await wait(this.latencyMs);
    return history;
  }
}

/**
 * Single composition seam for the current prototype. Replace this factory at
 * the application boundary when generated live repositories become eligible.
 *
 * `designEvidenceCapabilities` is a fixture-only test harness for proving
 * fail-closed capability boundaries. Product composition must omit it.
 * `startWithExistingProposal: false` is reserved for repository contract tests
 * that exercise creation from a genuinely fresh Preview. Product composition
 * keeps the canonical existing Proposal so Preview never offers two competing
 * authoritative actions.
 * @param {{latencyMs?: number, designEvidenceCapabilities?: string[] | null, startWithExistingProposal?: boolean}} [options]
 * @returns {import("./contracts.js").FixtureWorkspaceRepositories}
 */
export function createFixtureWorkspaceRepositories({ latencyMs = 0, designEvidenceCapabilities = null, startWithExistingProposal = true } = {}) {
  const runtime = createJourneyRuntime(designEvidenceCapabilities, startWithExistingProposal);
  const identity = new FixtureIdentityRepository({ latencyMs, runtime });
  const repricing = new FixtureRepricingRepository({ latencyMs, runtime });
  const proposals = new FixtureProposalRepository({ latencyMs, runtime });
  const publishing = new FixturePublicationRepository({ latencyMs, runtime });
  const audit = new FixtureAuditRepository({ latencyMs, runtime });
  const operational = createFixtureOperationalRepositories({
    latencyMs,
    getSession: () => currentSession(runtime),
    getProposal: () => materialiseProposal(runtime),
    getEvents: () => canonicalAuditEvents(runtime),
  });
  Object.assign(proposals, {
    list: operational.proposals.list.bind(operational.proposals),
  });
  Object.assign(audit, {
    list: operational.audit.list.bind(operational.audit),
    getEntityHistory: operational.audit.getEntityHistory.bind(operational.audit),
  });
  return Object.freeze({
    identity,
    workQueue: operational.workQueue,
    catalog: operational.catalog,
    imports: operational.imports,
    repricing,
    proposals,
    publishing,
    rules: operational.rules,
    audit,
    transport: Object.freeze({ kind: "fixture-memory", liveNetworkEnabled: false }),
  });
}

export const FIXTURE_CONNECTION_METADATA = Object.freeze({
  mode: "fixture",
  fixtureVersion: FIXTURE_VERSION,
  liveNetworkEnabled: false,
  backendEligibility: "MOCK_ONLY",
  liveGate: WORKSPACE_LIVE_BACKEND_ISSUES,
});
