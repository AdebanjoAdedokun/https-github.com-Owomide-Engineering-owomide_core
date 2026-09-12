import {
  assertCatalogSkuSummary,
  assertImportCommitOperation,
  assertImportJourney,
  assertOperationalList,
  assertRepricingRule,
  assertRepricingScope,
} from "./contracts.js";
import { throwRepositoryError } from "./domainError.js";
import { ECONOMICS_READ, projectCatalogEconomics } from "./fixtureEconomicsVisibility.js";
import {
  FIXTURE_BASELINE_IMPORT_ID,
  FIXTURE_CATALOG_SAMPLE,
  FIXTURE_CATALOG_TOTAL,
  FIXTURE_CHANGE_SET_ID,
  FIXTURE_IMPORT_BATCHES,
  FIXTURE_IMPORT_JOURNEYS,
  FIXTURE_MAPPING_IMPORT_ID,
  FIXTURE_OPERATIONAL_AUDIT_EVENTS,
  FIXTURE_PROPOSAL_DIRECTORY,
  FIXTURE_REPRICING_RULE,
  FIXTURE_REPRICING_SCOPE,
  FIXTURE_RULES,
  FIXTURE_SAMPLE_IMPORT_ID,
  FIXTURE_SAMPLE_IMPORT_OPERATION_ID,
  FIXTURE_WORK_QUEUE_BASE,
} from "./fixtures/operationalWorkspaceV0.js";
import { FIXTURE_PREVIEW_REF, FIXTURE_PROVENANCE } from "./fixtures/repricingPreviewV0.js";

/** @import {AllowedAction, AuditEvent, CatalogSkuSummary, DataProvenance, OperationalList, ProposalDetail, ResourceRef, WorkspaceSession} from "./contracts.js" */

const MAX_PAGE_LIMIT = 200;
const IMPORT_STAGE_ORDER = Object.freeze(["upload", "profile", "map", "validate", "review", "commit", "result"]);
const IMPORT_REQUEST_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

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

/** @param {string} code @param {string} message */
function denial(code, message) {
  return { code, message };
}

/**
 * @param {string} code
 * @param {boolean} enabled
 * @param {string | null} requiredVersion
 * @param {import("./contracts.js").ActionDenial | null} reason
 * @param {ResourceRef | null} [targetRef]
 * @returns {AllowedAction}
 */
function action(code, enabled, requiredVersion, reason, targetRef = null, confirmation = null) {
  return {
    code,
    enabled,
    reason,
    requiredVersion,
    confirmation,
    decision: null,
    ...(targetRef ? { targetRef: clone(targetRef) } : {}),
  };
}

/** @param {unknown} value @param {string} domain */
function assertIdempotencyKey(value, domain) {
  if (typeof value === "string" && IMPORT_REQUEST_KEY.test(value)) return;
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

/**
 * @template T
 * @param {Map<string, {fingerprint: string, result: import("./contracts.js").MutationResult<T>}>} requests
 * @param {string} idempotencyKey
 * @param {string} fingerprint
 * @param {string} domain
 * @param {() => import("./contracts.js").MutationResult<T>} mutate
 */
function applyIdempotent(requests, idempotencyKey, fingerprint, domain, mutate) {
  const retry = readIdempotentRetry(requests, idempotencyKey, fingerprint, domain);
  if (retry) return retry;
  const result = mutate();
  requests.set(idempotencyKey, { fingerprint, result: clone(result) });
  return clone(result);
}

/** @param {string} stage @param {string} state */
function importStagesFor(stage, state) {
  const activeIndex = IMPORT_STAGE_ORDER.indexOf(stage);
  return IMPORT_STAGE_ORDER.map((id, index) => ({
    id,
    label: id === "map" ? "Map" : id.charAt(0).toUpperCase() + id.slice(1),
    status: state === "partial-success" || state === "committed"
      ? "complete"
      : index < activeIndex
        ? "complete"
        : index === activeIndex
          ? "current"
          : "upcoming",
  }));
}

/** @param {WorkspaceSession} session @param {string} capability */
function hasCapability(session, capability) {
  return session.effectiveCapabilities.includes(capability);
}

/** @param {WorkspaceSession} session @param {string[]} capabilities */
function hasAnyCapability(session, capabilities) {
  return capabilities.some((capability) => hasCapability(session, capability));
}

/** @param {WorkspaceSession} session @param {string[]} capabilities @param {string} domain */
function requireAnyCapability(session, capabilities, domain) {
  if (hasAnyCapability(session, capabilities)) return;
  throwRepositoryError({
    code: "MISSING_PERMISSION",
    message: `This resolved session cannot read the requested ${domain} data.`,
    details: { requiredAnyCapability: capabilities },
    retryable: false,
    domain,
    traceId: `fixture-${domain}-missing-permission`,
  });
}

/** @param {number | undefined} requested @param {number} fallback @param {string} domain */
function normaliseLimit(requested, fallback, domain) {
  if (requested == null) return fallback;
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > MAX_PAGE_LIMIT) {
    throwRepositoryError({
      code: `${domain.toLocaleUpperCase("en-GB")}_PAGE_LIMIT_INVALID`,
      message: `Page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}.`,
      details: { maximum: MAX_PAGE_LIMIT },
      retryable: false,
      domain,
      traceId: `fixture-${domain}-invalid-limit`,
    });
  }
  return requested;
}

/** @param {string | null | undefined} cursor @param {string} prefix @param {string} domain */
function readCursor(cursor, prefix, domain) {
  if (cursor == null) return 0;
  if (typeof cursor !== "string" || !cursor.startsWith(prefix)) {
    throwRepositoryError({
      code: `${domain.toLocaleUpperCase("en-GB")}_CURSOR_INVALID`,
      message: "The list cursor is not valid for this collection.",
      details: {},
      retryable: false,
      domain,
      traceId: `fixture-${domain}-invalid-cursor`,
    });
  }
  const offset = Number(cursor.slice(prefix.length));
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throwRepositoryError({
      code: `${domain.toLocaleUpperCase("en-GB")}_CURSOR_INVALID`,
      message: "The list cursor is not valid for this collection.",
      details: {},
      retryable: false,
      domain,
      traceId: `fixture-${domain}-invalid-cursor`,
    });
  }
  return offset;
}

/**
 * @template T
 * @param {Object} input
 * @param {string} input.kind
 * @param {T[]} input.items
 * @param {string | null | undefined} input.cursor
 * @param {number | undefined} input.limit
 * @param {number} input.fallbackLimit
 * @param {string} input.cursorPrefix
 * @param {string} input.domain
 * @param {number | null} input.totalCount
 * @param {"exact" | "unavailable"} input.totalCountRelation
 * @param {"bounded-sample" | "complete-page"} input.coverage
 * @param {Record<string, unknown>} input.filterResult
 * @param {AllowedAction[]} input.allowedActions
 * @param {DataProvenance} [input.provenance]
 * @returns {OperationalList<T>}
 */
function paginate(input) {
  const limit = normaliseLimit(input.limit, input.fallbackLimit, input.domain);
  const offset = readCursor(input.cursor, input.cursorPrefix, input.domain);
  const pageItems = input.items.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;
  const nextCursor = nextOffset < input.items.length ? `${input.cursorPrefix}${nextOffset}` : null;
  const response = {
    kind: input.kind,
    items: clone(pageItems),
    page: {
      cursor: input.cursor ?? null,
      nextCursor,
      returnedCount: pageItems.length,
      limit,
      totalCount: input.totalCount,
      totalCountRelation: input.totalCountRelation,
      coverage: input.coverage,
      exhaustive: input.coverage === "complete-page" && nextCursor === null,
    },
    filterResult: clone(input.filterResult),
    allowedActions: clone(input.allowedActions),
    provenance: clone(input.provenance ?? FIXTURE_PROVENANCE),
  };
  assertOperationalList(response, input.kind);
  return response;
}

/** @param {unknown} value */
function normaliseQuery(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-NG") : "";
}

/** @param {string} value */
function humaniseImportIntent(value) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** @param {ResourceRef | undefined} ref @param {ResourceRef[]} acceptedRefs @param {string} domain @param {boolean} [required] */
function assertFixtureRef(ref, acceptedRefs, domain, required = false) {
  if (!ref) {
    if (!required) return;
    throwRepositoryError({
      code: `${domain.toLocaleUpperCase("en-GB")}_REF_REQUIRED`,
      message: `An exact versioned ${domain} reference is required.`,
      details: {},
      retryable: false,
      domain,
      traceId: `fixture-${domain}-ref-required`,
    });
  }
  const current = acceptedRefs.find((candidate) => candidate.kind === ref.kind && candidate.id === ref.id);
  if (!current) {
    throwRepositoryError({
      code: `${domain.toLocaleUpperCase("en-GB")}_NOT_FOUND`,
      message: `The requested ${domain} fixture is not available.`,
      details: { resourceId: ref.id },
      retryable: false,
      domain,
      traceId: `fixture-${domain}-not-found`,
    });
  }
  if (current.version !== ref.version) {
    throwRepositoryError({
      code: `${domain.toLocaleUpperCase("en-GB")}_STALE_VERSION`,
      message: `This ${domain} changed after it was opened.`,
      details: { expectedVersion: ref.version ?? null, currentVersion: current.version },
      retryable: false,
      domain,
      traceId: `fixture-${domain}-stale-version`,
    });
  }
}

export class FixtureWorkQueueRepository {
  /** @param {{latencyMs?: number, getSession: () => WorkspaceSession, getProposal: () => ProposalDetail}} options */
  constructor({ latencyMs = 0, getSession, getProposal }) {
    this.latencyMs = latencyMs;
    this.getSession = getSession;
    this.getProposal = getProposal;
  }

  /** @param {{query?: string, type?: string, status?: string, cursor?: string | null, limit?: number}} [request] */
  async list(request = {}) {
    const session = this.getSession();
    requireAnyCapability(session, ["proposal:read", "import:prepare", "repricing:prepare", "audit:read"], "work");
    const proposal = this.getProposal();
    const query = normaliseQuery(request.query);
    const capabilities = {
      import: hasCapability(session, "import:prepare"),
      repricing: hasCapability(session, "repricing:prepare"),
      proposal: hasCapability(session, "proposal:read"),
    };
    const items = clone(FIXTURE_WORK_QUEUE_BASE).map((item) => {
      if (item.type === "proposal") {
        item.ref = clone(proposal.ref);
        item.status = proposal.state;
        item.counts = { attention: proposal.counts.blocked, total: proposal.counts.selected };
        const reviewerNext = proposal.state === "submitted" || proposal.override?.state === "pending";
        const nextOwner = proposal.state === "approved" ? proposal.assignedPublisher : reviewerNext ? proposal.assignedApprover : proposal.submissionOwner ?? proposal.author;
        item.nextActor = nextOwner?.displayName ?? "Unassigned";
        item.nextActorId = nextOwner?.id ?? null;
        item.needsCurrentActor = nextOwner?.id === session.actor.id;
        item.updatedAt = proposal.updatedAt ?? proposal.returnDecision?.decidedAt ?? proposal.submission?.submittedAt ?? proposal.handoffHistory?.at(-1)?.occurredAt ?? item.updatedAt;
        item.title = proposal.returnDecision && ["draft", "blocked"].includes(proposal.state) ? "Revise returned Proposal" : proposal.state === "submitted" ? "Review submitted Proposal" : proposal.state === "approved" ? "Publish approved Proposal" : proposal.state === "draft" ? "Submit prepared Proposal" : "Resolve Proposal blockers";
        item.reason = proposal.state === "submitted" ? `${proposal.title} · awaiting the assigned independent review.` : proposal.state === "approved" ? `${proposal.title} · approved; publication remains separate.` : proposal.returnDecision && ["draft", "blocked"].includes(proposal.state) ? `${proposal.title} · changes requested before a fresh review.` : proposal.state === "draft" ? `${proposal.title} · ready for submission.` : `${proposal.title} · resolve blockers before submission.`;
      } else {
        item.needsCurrentActor = item.type === "import" ? capabilities.import : capabilities.repricing;
        if (item.type === "repricing") item.reason = "Review calculated prices and line selection.";
      }
      const enabled = capabilities[item.type] === true;
      item.allowedActions = [action(
        "work.open",
        enabled,
        item.ref.version,
        enabled ? null : denial("MISSING_PERMISSION", "This item requires a capability that is not part of the resolved session."),
        // Queue identity is the change-set; opening it must target the Preview
        // it actually represents, including that Preview's own version.
        enabled ? item.type === "repricing" ? FIXTURE_PREVIEW_REF : item.ref : null,
      )];
      item.provenance = clone(FIXTURE_PROVENANCE);
      return item;
    }).filter((item) => capabilities[item.type])
      .filter((item) => !request.type || item.type === request.type)
      .filter((item) => !request.status || item.status === request.status)
      .filter((item) => !query || `${item.title} ${item.reason} ${item.type}`.toLocaleLowerCase("en-NG").includes(query));

    const response = paginate({
      kind: "work-queue-list",
      items,
      cursor: request.cursor,
      limit: request.limit,
      fallbackLimit: 20,
      cursorPrefix: "fixture-work:",
      domain: "work",
      totalCount: items.length,
      totalCountRelation: "exact",
      coverage: "complete-page",
      filterResult: { query: request.query?.trim() ?? "", type: request.type ?? null, status: request.status ?? null, matchedCount: items.length },
      allowedActions: [action("work.read", true, session.capabilityVersion, null)],
    });
    await wait(this.latencyMs);
    return response;
  }
}

export class FixtureCatalogRepository {
  /** @param {{latencyMs?: number, getSession: () => WorkspaceSession}} options */
  constructor({ latencyMs = 0, getSession }) {
    this.latencyMs = latencyMs;
    this.getSession = getSession;
  }

  /** @param {{query?: string, priceState?: string, status?: string, channelId?: string, locationId?: string, cursor?: string | null, limit?: number}} [request] */
  async list(request = {}) {
    const session = this.getSession();
    requireAnyCapability(session, ["catalog:read"], "catalog");
    const query = normaliseQuery(request.query);
    const items = clone(FIXTURE_CATALOG_SAMPLE).filter((item) => {
      const searchable = `${item.merchantSku} ${item.product.name} ${item.product.variant} ${item.channel.name} ${item.location.name}`.toLocaleLowerCase("en-NG");
      return (!query || searchable.includes(query))
        && (!request.priceState || item.priceState === request.priceState)
        && (!request.status || item.status === request.status)
        && (!request.channelId || item.channel.id === request.channelId)
        && (!request.locationId || item.location.id === request.locationId);
    }).map((item) => {
      item.allowedActions = [action("catalog.sku.read", true, item.ref.version, null, item.ref)];
      assertCatalogSkuSummary(item);
      return projectCatalogEconomics(item, session);
    });
    const hasFilters = Boolean(query || request.priceState || request.status || request.channelId || request.locationId);
    const response = paginate({
      kind: "catalog-list",
      items,
      cursor: request.cursor,
      limit: request.limit,
      fallbackLimit: 8,
      cursorPrefix: "fixture-catalog:",
      domain: "catalog",
      totalCount: FIXTURE_CATALOG_TOTAL,
      totalCountRelation: "exact",
      coverage: "bounded-sample",
      filterResult: {
        query: request.query?.trim() ?? "",
        priceState: request.priceState ?? null,
        status: request.status ?? null,
        channelId: request.channelId ?? null,
        locationId: request.locationId ?? null,
        sample: { availableCount: FIXTURE_CATALOG_SAMPLE.length, matchedCount: items.length },
        authoritativePopulation: { totalCount: FIXTURE_CATALOG_TOTAL, filteredCount: null, affectedByFilters: false },
        hasActiveFilters: hasFilters,
      },
      allowedActions: [action("catalog.read", true, session.capabilityVersion, null)],
    });
    await wait(this.latencyMs);
    return response;
  }

  /** @param {{skuId: string}} request */
  async getDetail(request) {
    const session = this.getSession();
    requireAnyCapability(session, ["catalog:read"], "catalog");
    if (typeof request?.skuId !== "string" || !/^[0-9a-f-]{36}$/i.test(request.skuId)) {
      throwRepositoryError({
        code: "CATALOG_CANONICAL_SKU_ID_REQUIRED",
        message: "Catalog routes require the canonical SKU UUID, not the Merchant SKU.",
        details: { suppliedId: request?.skuId ?? null },
        retryable: false,
        domain: "catalog",
        traceId: "fixture-catalog-canonical-id-required",
      });
    }
    const item = FIXTURE_CATALOG_SAMPLE.find((candidate) => candidate.id === request.skuId);
    if (!item) {
      throwRepositoryError({ code: "CATALOG_SKU_NOT_FOUND", message: "That Catalog SKU is not in the bounded fixture page.", details: { skuId: request.skuId }, retryable: false, domain: "catalog", traceId: "fixture-catalog-not-found" });
    }
    const summary = projectCatalogEconomics(clone(item), session);
    summary.allowedActions = [action("catalog.sku.read", true, summary.ref.version, null, summary.ref)];
    assertCatalogSkuSummary(summary);
    const detail = {
      kind: "catalog-sku-detail",
      ref: clone(summary.ref),
      canonicalSkuId: summary.canonicalSkuId,
      merchantSku: summary.merchantSku,
      summary,
      priceRecords: clone(item.priceRecords),
      allowedActions: [action("catalog.sku.read", true, summary.ref.version, null)],
      provenance: clone(FIXTURE_PROVENANCE),
    };
    await wait(this.latencyMs);
    return detail;
  }
}

export class FixtureImportRepository {
  /** @param {{latencyMs?: number, getSession: () => WorkspaceSession}} options */
  constructor({ latencyMs = 0, getSession }) {
    this.latencyMs = latencyMs;
    this.getSession = getSession;
    this.journeys = new Map(Object.values(FIXTURE_IMPORT_JOURNEYS).map((journey) => [journey.ref.id, clone(journey)]));
    this.summaries = new Map(FIXTURE_IMPORT_BATCHES.map((summary) => [summary.ref.id, clone(summary)]));
    this.operations = new Map();
    this.requests = new Map();
  }

  _requirePrepare() {
    const session = this.getSession();
    requireAnyCapability(session, ["import:prepare"], "import");
    return session;
  }

  /** @param {ResourceRef | undefined} ref @param {string} domain */
  _assertCurrentBatchRef(ref, domain) {
    if (!ref?.id || !ref.version) {
      throwRepositoryError({ code: "IMPORT_REF_REQUIRED", message: "An exact versioned import batch reference is required.", details: {}, retryable: false, domain, traceId: `fixture-${domain}-ref-required` });
    }
    const current = this.journeys.get(ref.id);
    if (!current || current.ref.kind !== ref.kind) {
      throwRepositoryError({ code: "IMPORT_BATCH_NOT_FOUND", message: "That import batch is not available in the Sample data fixture.", details: { batchId: ref.id }, retryable: false, domain, traceId: `fixture-${domain}-not-found` });
    }
    if (current.ref.version !== ref.version) {
      throwRepositoryError({ code: "IMPORT_STALE_VERSION", message: "This import batch changed after it was opened.", details: { expectedVersion: ref.version, currentVersion: current.ref.version }, retryable: false, domain, traceId: `fixture-${domain}-stale-version` });
    }
    return current;
  }

  /** @param {Record<string, any>} journey */
  _allowedActions(journey) {
    const ref = journey.ref;
    const actions = [
      action("import.read", true, ref.version, null, ref),
      action("import.resume", journey.stage !== "result", ref.version, journey.stage !== "result" ? null : denial("WRONG_STATE", "This Sample data import has reached its reconciled result."), journey.stage !== "result" ? ref : null),
    ];

    if (journey.stage === "upload" && journey.state === "draft") {
      actions.push(action("import.upload", true, ref.version, null, ref));
    } else if (journey.stage === "profile" && journey.state === "uploaded") {
      actions.push(action("import.profile", true, ref.version, null, ref));
    } else if (journey.stage === "map" && ["profiled", "needs-attention"].includes(journey.state)) {
      actions.push(action("import.mapping.save", true, ref.version, null, ref));
    } else if (journey.stage === "map" && journey.state === "mapped") {
      actions.push(action("import.validate", true, ref.version, null, ref));
    } else if (journey.stage === "review" && journey.state === "validated") {
      actions.push(action("import.review.read", true, ref.version, null, ref));
      actions.push(action(
        "import.review.acknowledge",
        true,
        ref.version,
        null,
        ref,
        { title: "Acknowledge Sample data consequence", body: "Confirm the reviewed mapping, warnings, exclusions and unresolved rows before the bounded Sample data operation can start.", confirmLabel: "Acknowledge review" },
      ));
    } else if (journey.stage === "commit" && journey.state === "ready-to-commit") {
      actions.push(action(
        "import.commit.start",
        true,
        ref.version,
        null,
        ref,
        { title: "Start Sample data commit", body: "This records a fixture-memory operation only. It does not write a live Catalog.", confirmLabel: "Start sample commit" },
      ));
    } else if (journey.stage === "commit" && journey.state === "awaiting-reconciliation") {
      const operation = [...this.operations.values()].find((candidate) => candidate.batchRef.id === ref.id);
      actions.push(action("import.commit.reconcile", Boolean(operation), operation?.ref?.version ?? ref.version, operation ? null : denial("WRONG_STATE", "The commit operation reference is unavailable."), operation?.ref ?? null));
    }

    actions.push(action("import.retry", false, ref.version, denial("CAPABILITY_UNAVAILABLE", "A separate Sample data retry mutation is not released.")));
    actions.push(action("import.export_rejected", false, ref.version, denial("CAPABILITY_UNAVAILABLE", "Rejected-row export is not released by the current backend contract.")));
    return actions;
  }

  /** @param {Record<string, any>} journey */
  _materialiseJourney(journey) {
    const response = clone(journey);
    response.stages = importStagesFor(response.stage, response.state);
    const operation = [...this.operations.values()].find((candidate) => candidate.batchRef.id === response.ref.id);
    if (operation) response.commit = { ...clone(response.commit), operation: this._materialiseOperation(operation), operationRef: clone(operation.ref), batchRef: clone(response.ref) };
    response.allowedActions = this._allowedActions(response);
    response.dataLabel = "Sample data";
    response.provenance = clone(FIXTURE_PROVENANCE);
    assertImportJourney(response);
    return response;
  }

  /** @param {Record<string, any>} operation */
  _materialiseOperation(operation) {
    const response = clone(operation);
    response.allowedActions = [
      action("import.commit.read", true, response.ref.version, null, response.ref),
      action("import.commit.reconcile", response.state === "unknown-outcome", response.ref.version, response.state === "unknown-outcome" ? null : denial("WRONG_STATE", "This Sample data operation has already been reconciled."), response.state === "unknown-outcome" ? response.ref : null),
    ];
    response.dataLabel = "Sample data";
    response.provenance = clone(FIXTURE_PROVENANCE);
    assertImportCommitOperation(response);
    return response;
  }

  /** @param {Record<string, any>} journey */
  _syncSummary(journey) {
    const existing = this.summaries.get(journey.ref.id) ?? this.summaries.get(FIXTURE_MAPPING_IMPORT_ID);
    const counts = clone(journey.result.counts);
    const reachedResult = journey.stage === "result";
    const reachedCommit = ["commit", "result"].includes(journey.stage);
    this.summaries.set(journey.ref.id, {
      ...clone(existing),
      kind: "import-batch-summary",
      ref: clone(journey.ref),
      title: journey.title,
      sourceFile: clone(journey.sourceFile),
      owner: clone(journey.owner ?? existing?.owner ?? null),
      stage: journey.stage,
      state: journey.state,
      counts: {
        ...counts,
        attempted: reachedCommit ? counts.attempted : 0,
        committed: reachedResult ? counts.committed : 0,
        rejected: reachedResult ? counts.rejected : 0,
        remaining: reachedResult ? counts.remaining : counts.input,
      },
      blocker: journey.stage === "map" && journey.state !== "mapped"
        ? { code: "UNMAPPED_REQUIRED_FIELD", message: "Effective time and ambiguous source fields still need a reviewed mapping." }
        : journey.stage === "commit" && journey.state === "awaiting-reconciliation"
          ? { code: "OPERATION_OUTCOME_UNKNOWN", message: "The Sample data operation must be reconciled before a result is shown." }
          : reachedResult && counts.rejected
            ? { code: "REJECTED_ROWS_REMAIN", message: "Four attempted rows were rejected and five input rows remain unresolved." }
            : null,
      updatedAt: "2026-08-22T10:00:00Z",
      dataLabel: "Sample data",
      provenance: clone(FIXTURE_PROVENANCE),
    });
  }

  /** @param {Record<string, any>} journey @param {Record<string, any>} changes */
  _advanceJourney(journey, changes) {
    const nextRef = { ...clone(journey.ref), version: String(Number(journey.ref.version) + 1) };
    const next = { ...clone(journey), ...clone(changes), ref: nextRef };
    next.stages = importStagesFor(next.stage, next.state);
    this.journeys.set(next.ref.id, next);
    this._syncSummary(next);
    return next;
  }

  /** @param {Record<string, any>} journey @param {string[]} stages @param {string[]} states @param {string} domain */
  _requireJourneyState(journey, stages, states, domain) {
    if (stages.includes(journey.stage) && states.includes(journey.state)) return;
    throwRepositoryError({
      code: "IMPORT_WRONG_STATE",
      message: "This import action is not available in the batch's current state.",
      details: { stage: journey.stage, state: journey.state, expectedStages: stages, expectedStates: states },
      retryable: false,
      domain,
      traceId: `fixture-${domain}-wrong-state`,
    });
  }

  /** @param {string} idempotencyKey @param {string} fingerprint @param {string} domain @param {() => import("./contracts.js").MutationResult<any>} mutate */
  _mutate(idempotencyKey, fingerprint, domain, mutate) {
    return applyIdempotent(this.requests, idempotencyKey, `${domain}:${fingerprint}`, domain, mutate);
  }

  /** @param {{query?: string, state?: string, cursor?: string | null, limit?: number}} [request] */
  async list(request = {}) {
    const session = this._requirePrepare();
    const query = normaliseQuery(request.query);
    const items = clone([...this.summaries.values()]).filter((item) => {
      const searchable = `${item.title} ${item.sourceFile.name} ${item.stage} ${item.state}`.toLocaleLowerCase("en-NG");
      return (!query || searchable.includes(query)) && (!request.state || item.state === request.state);
    }).map((item) => {
      item.allowedActions = [action("import.read", true, item.ref.version, null, item.ref)];
      return item;
    });
    const response = paginate({
      kind: "import-ledger-list",
      items,
      cursor: request.cursor,
      limit: request.limit,
      fallbackLimit: 20,
      cursorPrefix: "fixture-imports:",
      domain: "import",
      totalCount: items.length,
      totalCountRelation: "exact",
      coverage: "complete-page",
      filterResult: { query: request.query?.trim() ?? "", state: request.state ?? null, matchedCount: items.length },
      allowedActions: [
        action("import.read", true, session.capabilityVersion, null),
        action("import.create", true, session.capabilityVersion, null),
      ],
    });
    await wait(this.latencyMs);
    return response;
  }

  /** @param {{batchId?: string, ref?: ResourceRef, version?: string | null, stage?: string}} request */
  async getJourney(request) {
    this._requirePrepare();
    const batchId = request?.ref?.id ?? request?.batchId;
    const journey = batchId ? this.journeys.get(batchId) : null;
    if (!journey) {
      throwRepositoryError({ code: "IMPORT_BATCH_NOT_FOUND", message: "That import batch is not available in the Sample data fixture.", details: { batchId: batchId ?? null }, retryable: false, domain: "import", traceId: "fixture-import-not-found" });
    }
    const requestedVersion = request?.ref?.version ?? request?.version ?? null;
    if (request?.stage != null && !requestedVersion) {
      throwRepositoryError({ code: "IMPORT_REF_REQUIRED", message: "A version is required to open an import stage.", details: { batchId }, retryable: false, domain: "import", traceId: "fixture-import-stage-ref-required" });
    }
    if (request?.ref && request.ref.kind !== journey.ref.kind) {
      throwRepositoryError({ code: "IMPORT_BATCH_NOT_FOUND", message: "That exact import batch reference is not available.", details: { batchId }, retryable: false, domain: "import", traceId: "fixture-import-ref-kind-mismatch" });
    }
    if (requestedVersion && requestedVersion !== journey.ref.version) {
      throwRepositoryError({ code: "IMPORT_STALE_VERSION", message: "This import batch changed after the route was opened.", details: { batchId, expectedVersion: requestedVersion, currentVersion: journey.ref.version }, retryable: false, domain: "import", traceId: "fixture-import-stage-stale-version" });
    }
    if (request?.stage != null) {
      const requestedStageIndex = IMPORT_STAGE_ORDER.indexOf(request.stage);
      const recordedStageIndex = IMPORT_STAGE_ORDER.indexOf(journey.stage);
      if (requestedStageIndex < 0) {
        throwRepositoryError({ code: "IMPORT_STAGE_INVALID", message: "That import stage is not supported.", details: { requestedStage: request.stage }, retryable: false, domain: "import", traceId: "fixture-import-stage-invalid" });
      }
      if (requestedStageIndex > recordedStageIndex) {
        const resumeStage = IMPORT_STAGE_ORDER[recordedStageIndex];
        throwRepositoryError({
          code: "IMPORT_STAGE_NOT_AVAILABLE",
          message: `This Sample data journey has reached ${resumeStage}. Return to that stage before opening ${request.stage}.`,
          details: { batchId: journey.ref.id, requestedStage: request.stage, resumeStage, resourceVersion: journey.ref.version },
          retryable: false,
          domain: "import",
          traceId: "fixture-import-stage-not-available",
        });
      }
    }
    const response = this._materialiseJourney(journey);
    await wait(this.latencyMs);
    return response;
  }

  /** @param {{intent: string, idempotencyKey: string}} request */
  async create(request) {
    const session = this._requirePrepare();
    const intent = typeof request?.intent === "string" ? request.intent.trim() : "";
    if (!intent) throwRepositoryError({ code: "IMPORT_INTENT_REQUIRED", message: "Choose an import intent before creating the Sample data batch.", details: {}, retryable: false, domain: "import-create", traceId: "fixture-import-create-intent-required" });
    const fingerprint = JSON.stringify({ intent });
    const result = this._mutate(request?.idempotencyKey, fingerprint, "import-create", () => {
      if (this.journeys.has(FIXTURE_SAMPLE_IMPORT_ID)) {
        throwRepositoryError({ code: "IMPORT_ALREADY_EXISTS", message: "The Sample data import batch already exists in this repository session.", details: { batchId: FIXTURE_SAMPLE_IMPORT_ID }, retryable: false, domain: "import-create", traceId: "fixture-import-create-already-exists" });
      }
      const template = clone(FIXTURE_IMPORT_JOURNEYS[FIXTURE_MAPPING_IMPORT_ID]);
      const journey = {
        ...template,
        ref: { kind: "resource", id: FIXTURE_SAMPLE_IMPORT_ID, version: "1" },
        title: `${humaniseImportIntent(intent)} · sample`,
        owner: clone(session.actor),
        stage: "upload",
        state: "draft",
        stages: importStagesFor("upload", "draft"),
        sourceFile: { name: "No sample source selected", format: "CSV", isSynthetic: true },
        mapping: { ...template.mapping, savedTemplate: null, checkpoint: null },
        review: { ...template.review, consequence: "Start a bounded Sample data attempt only after every reviewed warning, exclusion and unresolved row is acknowledged.", acknowledgement: null },
        commit: { state: "not-started", status: "not-started", operationRef: null, batchRef: null, catalogWriteAuthoritative: false, persistenceScope: "fixture-memory-only" },
        result: { ...template.result, operationId: null, state: "not-started", persistent: false, persistenceScope: "fixture-memory-only", catalogWriteAuthoritative: false, resultingCatalogRef: null },
        dataLabel: "Sample data",
        provenance: clone(FIXTURE_PROVENANCE),
      };
      this.journeys.set(journey.ref.id, journey);
      this._syncSummary(journey);
      return { data: this._materialiseJourney(journey), mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{batchRef: ResourceRef, sourceFile: Record<string, any>, idempotencyKey: string}} request */
  async upload(request) {
    this._requirePrepare();
    const fingerprint = JSON.stringify({ batchRef: request?.batchRef, sourceFile: request?.sourceFile });
    const result = this._mutate(request?.idempotencyKey, fingerprint, "import-upload", () => {
      const journey = this._assertCurrentBatchRef(request?.batchRef, "import-upload");
      this._requireJourneyState(journey, ["upload"], ["draft"], "import-upload");
      if (!request?.sourceFile || request.sourceFile.isSynthetic !== true || typeof request.sourceFile.name !== "string" || !request.sourceFile.name) {
        throwRepositoryError({ code: "IMPORT_SAMPLE_SOURCE_REQUIRED", message: "Select the authorised synthetic sample source before upload.", details: {}, retryable: false, domain: "import-upload", traceId: "fixture-import-upload-source-required" });
      }
      const next = this._advanceJourney(journey, { stage: "profile", state: "uploaded", sourceFile: { ...clone(request.sourceFile), isSynthetic: true }, profile: { ...clone(journey.profile), status: "pending" } });
      return { data: this._materialiseJourney(next), mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{batchRef: ResourceRef, idempotencyKey: string}} request */
  async profile(request) {
    this._requirePrepare();
    const fingerprint = JSON.stringify({ batchRef: request?.batchRef });
    const result = this._mutate(request?.idempotencyKey, fingerprint, "import-profile", () => {
      const journey = this._assertCurrentBatchRef(request?.batchRef, "import-profile");
      this._requireJourneyState(journey, ["profile"], ["uploaded"], "import-profile");
      const next = this._advanceJourney(journey, { stage: "map", state: "profiled", profile: { ...clone(journey.profile), status: "complete", profiledAt: "2026-08-22T10:02:00Z" } });
      return { data: this._materialiseJourney(next), mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{batchRef: ResourceRef, mapping: Record<string, any>, idempotencyKey: string}} request */
  async saveMapping(request) {
    this._requirePrepare();
    const fingerprint = JSON.stringify({ batchRef: request?.batchRef, mapping: request?.mapping });
    const result = this._mutate(request?.idempotencyKey, fingerprint, "import-mapping", () => {
      const journey = this._assertCurrentBatchRef(request?.batchRef, "import-mapping");
      this._requireJourneyState(journey, ["map"], ["profiled", "needs-attention"], "import-mapping");
      if (!request?.mapping?.effectiveAt || !request.mapping.tradeCostTarget || !request.mapping.priceTarget) {
        throwRepositoryError({ code: "IMPORT_MAPPING_REQUIRED", message: "Resolve Trade Cost, Price and effective time before saving the Sample data mapping.", details: {}, retryable: false, domain: "import-mapping", traceId: "fixture-import-mapping-required" });
      }
      if (request.mapping.tradeCostTarget !== "cost.amountMinor" || request.mapping.priceTarget !== "price.amountMinor") {
        throwRepositoryError({ code: "IMPORT_MAPPING_UNSUPPORTED", message: "This sample supports Trade Cost as current cost and Price as current price only.", details: { supportedTradeCostTarget: "cost.amountMinor", supportedPriceTarget: "price.amountMinor" }, retryable: false, domain: "import-mapping", traceId: "fixture-import-mapping-unsupported" });
      }
      if (request.mapping.effectiveAt !== "2026-08-15T00:00:00+01:00") {
        throwRepositoryError({ code: "IMPORT_EFFECTIVE_TIME_UNSUPPORTED", message: "Use the supplied sample effective time: 15 Aug 2026, 00:00 GMT+1.", details: { supportedEffectiveAt: "2026-08-15T00:00:00+01:00" }, retryable: false, domain: "import-mapping", traceId: "fixture-import-effective-time-unsupported" });
      }
      const mappedRows = clone(journey.mapping.rows).map((row) => {
        if (row.source === "Trade Cost") return { ...row, target: request.mapping.tradeCostTarget, targetLabel: "Current cost", state: "mapped" };
        if (row.source === "Price?") return { ...row, target: request.mapping.priceTarget, targetLabel: "Current price", state: "mapped" };
        return row;
      });
      const next = this._advanceJourney(journey, {
        stage: "map",
        state: "mapped",
        mapping: {
          ...clone(journey.mapping),
          rows: mappedRows,
          requiredMapped: 9,
          ambiguityCount: 0,
          unmappedRequired: [],
          savedTemplate: { id: "7fbb3eb4-26c4-5080-b65e-27012d4b73ef", name: "Supplier cost update · sample", savedBy: this.getSession().actor.id, version: "4" },
          reviewContext: { effectiveAt: request.mapping.effectiveAt, currency: "NGN", source: "Import intent" },
          checkpoint: { serverDraftVersion: "4", mappedFields: 11, transformations: 3, corrections: 8, excludedRows: 2, warningAcknowledgements: 1 },
        },
      });
      return { data: this._materialiseJourney(next), mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{batchRef: ResourceRef, idempotencyKey: string}} request */
  async validate(request) {
    this._requirePrepare();
    const fingerprint = JSON.stringify({ batchRef: request?.batchRef });
    const result = this._mutate(request?.idempotencyKey, fingerprint, "import-validation", () => {
      const journey = this._assertCurrentBatchRef(request?.batchRef, "import-validation");
      this._requireJourneyState(journey, ["map"], ["mapped"], "import-validation");
      const next = this._advanceJourney(journey, { stage: "review", state: "validated", validation: { ...clone(journey.validation), validatedAt: "2026-08-22T10:05:00Z", state: "complete" } });
      return { data: this._materialiseJourney(next), mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{batchRef: ResourceRef, acknowledgement: boolean, idempotencyKey: string}} request */
  async acknowledgeReview(request) {
    this._requirePrepare();
    const fingerprint = JSON.stringify({ batchRef: request?.batchRef, acknowledgement: request?.acknowledgement });
    const result = this._mutate(request?.idempotencyKey, fingerprint, "import-review", () => {
      const journey = this._assertCurrentBatchRef(request?.batchRef, "import-review");
      this._requireJourneyState(journey, ["review"], ["validated"], "import-review");
      if (request?.acknowledgement !== true) {
        throwRepositoryError({ code: "IMPORT_ACKNOWLEDGEMENT_REQUIRED", message: "Acknowledge the reviewed Sample data consequence before opening Commit.", details: {}, retryable: false, domain: "import-review", traceId: "fixture-import-review-acknowledgement-required" });
      }
      const nextVersion = String(Number(journey.ref.version) + 1);
      const batchRef = { ...clone(journey.ref), version: nextVersion };
      const next = this._advanceJourney(journey, {
        stage: "commit",
        state: "ready-to-commit",
        review: { ...clone(journey.review), acknowledgement: { acknowledged: true, actor: clone(this.getSession().actor), acknowledgedAt: "2026-08-22T10:07:00Z" } },
        commit: { state: "ready", status: "ready-to-start", operationRef: null, batchRef, catalogWriteAuthoritative: false, persistenceScope: "fixture-memory-only" },
      });
      return { data: this._materialiseJourney(next), mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{batchRef: ResourceRef, idempotencyKey: string}} request */
  async commit(request) {
    this._requirePrepare();
    const fingerprint = JSON.stringify({ batchRef: request?.batchRef });
    const result = this._mutate(request?.idempotencyKey, fingerprint, "import-commit", () => {
      const journey = this._assertCurrentBatchRef(request?.batchRef, "import-commit");
      this._requireJourneyState(journey, ["commit"], ["ready-to-commit"], "import-commit");
      if ([...this.operations.values()].some((operation) => operation.batchRef.id === journey.ref.id)) {
        throwRepositoryError({ code: "IMPORT_COMMIT_ALREADY_EXISTS", message: "This import batch already has a commit operation.", details: { batchId: journey.ref.id }, retryable: false, domain: "import-commit", traceId: "fixture-import-commit-already-exists" });
      }
      const batchRef = { ...clone(journey.ref), version: String(Number(journey.ref.version) + 1) };
      const operationId = journey.ref.id === FIXTURE_SAMPLE_IMPORT_ID ? FIXTURE_SAMPLE_IMPORT_OPERATION_ID : `${journey.ref.id}-commit`;
      const operation = {
        kind: "import-commit-operation",
        ref: { kind: "resource", id: operationId, version: "1" },
        batchRef,
        state: "unknown-outcome",
        status: "awaiting-reconciliation",
        counts: { attempted: journey.result.counts.attempted, committed: null, rejected: null, remaining: null },
        idempotencyKey: request.idempotencyKey,
        catalogWriteAuthoritative: false,
        persistenceScope: "fixture-memory-only",
        dataLabel: "Sample data",
        provenance: clone(FIXTURE_PROVENANCE),
      };
      this.operations.set(operation.ref.id, operation);
      const next = this._advanceJourney(journey, {
        stage: "commit",
        state: "awaiting-reconciliation",
        commit: { state: "unknown-outcome", status: "awaiting-reconciliation", operationRef: clone(operation.ref), batchRef, catalogWriteAuthoritative: false, persistenceScope: "fixture-memory-only" },
      });
      return { data: { journey: this._materialiseJourney(next), operation: this._materialiseOperation(operation) }, mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }

  /** @param {{operationRef: ResourceRef}} request */
  async getCommitOperation(request) {
    this._requirePrepare();
    const ref = request?.operationRef;
    if (!ref?.id || !ref.version) throwRepositoryError({ code: "IMPORT_OPERATION_REF_REQUIRED", message: "An exact versioned commit operation reference is required.", details: {}, retryable: false, domain: "import-commit", traceId: "fixture-import-operation-ref-required" });
    const operation = this.operations.get(ref.id);
    if (!operation || ref.kind !== operation.ref.kind) throwRepositoryError({ code: "IMPORT_OPERATION_NOT_FOUND", message: "That Sample data commit operation is not available.", details: { operationId: ref.id }, retryable: false, domain: "import-commit", traceId: "fixture-import-operation-not-found" });
    if (operation.ref.version !== ref.version) throwRepositoryError({ code: "IMPORT_OPERATION_STALE_VERSION", message: "This commit operation changed after it was opened.", details: { expectedVersion: ref.version, currentVersion: operation.ref.version }, retryable: false, domain: "import-commit", traceId: "fixture-import-operation-stale-version" });
    const response = this._materialiseOperation(operation);
    await wait(this.latencyMs);
    return response;
  }

  /** @param {{operationRef: ResourceRef, idempotencyKey: string}} request */
  async reconcileCommit(request) {
    this._requirePrepare();
    const fingerprint = JSON.stringify({ operationRef: request?.operationRef });
    const result = this._mutate(request?.idempotencyKey, fingerprint, "import-reconciliation", () => {
      const ref = request?.operationRef;
      if (!ref?.id || !ref.version) throwRepositoryError({ code: "IMPORT_OPERATION_REF_REQUIRED", message: "An exact versioned commit operation reference is required.", details: {}, retryable: false, domain: "import-reconciliation", traceId: "fixture-import-reconciliation-ref-required" });
      const operation = this.operations.get(ref.id);
      if (!operation || ref.kind !== operation.ref.kind) throwRepositoryError({ code: "IMPORT_OPERATION_NOT_FOUND", message: "That Sample data commit operation is not available.", details: { operationId: ref.id }, retryable: false, domain: "import-reconciliation", traceId: "fixture-import-reconciliation-not-found" });
      if (operation.ref.version !== ref.version) throwRepositoryError({ code: "IMPORT_OPERATION_STALE_VERSION", message: "This commit operation changed after it was opened.", details: { expectedVersion: ref.version, currentVersion: operation.ref.version }, retryable: false, domain: "import-reconciliation", traceId: "fixture-import-reconciliation-stale-version" });
      if (operation.state !== "unknown-outcome") throwRepositoryError({ code: "IMPORT_WRONG_STATE", message: "This Sample data operation has already been reconciled.", details: { state: operation.state }, retryable: false, domain: "import-reconciliation", traceId: "fixture-import-reconciliation-wrong-state" });
      const journey = this.journeys.get(operation.batchRef.id);
      if (!journey || journey.ref.version !== operation.batchRef.version || journey.state !== "awaiting-reconciliation") {
        throwRepositoryError({ code: "IMPORT_STALE_VERSION", message: "The import batch no longer matches the commit operation precondition.", details: { batchId: operation.batchRef.id }, retryable: false, domain: "import-reconciliation", traceId: "fixture-import-reconciliation-batch-stale" });
      }
      const counts = clone(journey.result.counts);
      const nextBatchRef = { ...clone(journey.ref), version: String(Number(journey.ref.version) + 1) };
      const reconciledOperation = {
        ...clone(operation),
        ref: { ...clone(operation.ref), version: String(Number(operation.ref.version) + 1) },
        batchRef: nextBatchRef,
        state: "reconciled",
        status: counts.rejected > 0 || counts.remaining > 0 ? "partial-success" : "committed",
        counts: { attempted: counts.attempted, committed: counts.committed, rejected: counts.rejected, remaining: counts.remaining },
        reconciledAt: "2026-08-22T10:10:00Z",
      };
      this.operations.set(reconciledOperation.ref.id, reconciledOperation);
      const next = this._advanceJourney(journey, {
        stage: "result",
        state: reconciledOperation.status,
        commit: { state: "reconciled", status: reconciledOperation.status, operationRef: clone(reconciledOperation.ref), batchRef: nextBatchRef, catalogWriteAuthoritative: false, persistenceScope: "fixture-memory-only" },
        result: { ...clone(journey.result), operationId: reconciledOperation.ref.id, operationRef: clone(reconciledOperation.ref), state: reconciledOperation.status, persistent: true, persistenceScope: "fixture-memory-only", catalogWriteAuthoritative: false, resultingCatalogRef: null },
      });
      return { data: { journey: this._materialiseJourney(next), operation: this._materialiseOperation(reconciledOperation) }, mutation: { idempotencyKey: request.idempotencyKey, applied: true, deduplicated: false, authoritative: false } };
    });
    await wait(this.latencyMs);
    return result;
  }
}

export class FixtureRepricingDraftRepository {
  /** @param {{latencyMs?: number, getSession: () => WorkspaceSession}} options */
  constructor({ latencyMs = 0, getSession }) {
    this.latencyMs = latencyMs;
    this.getSession = getSession;
  }

  /** @param {{ref?: ResourceRef}} [request] */
  async getScope(request = {}) {
    const session = this.getSession();
    requireAnyCapability(session, ["repricing:prepare", "proposal:review"], "repricing");
    assertFixtureRef(request.ref, [FIXTURE_REPRICING_SCOPE.ref], "repricing");
    const response = clone(FIXTURE_REPRICING_SCOPE);
    response.allowedActions = [
      action("repricing.scope.read", true, response.ref.version, null),
      action("repricing.rule.read", true, FIXTURE_REPRICING_RULE.ref.version, null, FIXTURE_REPRICING_RULE.ref),
    ];
    assertRepricingScope(response);
    await wait(this.latencyMs);
    return response;
  }

  /** @param {{ref?: ResourceRef}} [request] */
  async getRule(request = {}) {
    const session = this.getSession();
    requireAnyCapability(session, ["repricing:prepare", "proposal:review"], "repricing");
    assertFixtureRef(request.ref, [FIXTURE_REPRICING_RULE.ref], "repricing", true);
    const response = clone(FIXTURE_REPRICING_RULE);
    const canEdit = hasCapability(session, "repricing:prepare");
    response.allowedActions = [
      action("repricing.rule.read", true, response.ref.version, null),
      action("repricing.rule.edit", canEdit, response.ref.version, canEdit ? null : denial("MISSING_PERMISSION", "Only a resolved repricing preparation capability can edit this draft rule.")),
      action("repricing.preview.read", true, response.ref.version, null, FIXTURE_PREVIEW_REF),
    ];
    assertRepricingRule(response);
    await wait(this.latencyMs);
    return response;
  }
}

export class FixtureProposalDirectoryRepository {
  /** @param {{latencyMs?: number, getSession: () => WorkspaceSession, getProposal: () => ProposalDetail}} options */
  constructor({ latencyMs = 0, getSession, getProposal }) {
    this.latencyMs = latencyMs;
    this.getSession = getSession;
    this.getProposal = getProposal;
  }

  /** @param {{query?: string, state?: string, cursor?: string | null, limit?: number}} [request] */
  async list(request = {}) {
    const session = this.getSession();
    requireAnyCapability(session, ["proposal:read"], "proposal");
    const current = this.getProposal();
    const query = normaliseQuery(request.query);
    const submissionOwner = current.submissionOwner ?? current.author;
    const nextActor = current.state === "approved" ? current.assignedPublisher
      : current.state === "submitted" || current.override?.state === "pending" ? current.assignedApprover : submissionOwner;
    const workflowActions = new Set(["proposal.draft.edit", "proposal.handoff", "proposal.submit", "override.request", "override.approve", "override.deny", "proposal.approve", "proposal.reject", "publication.start"]);
    // Read permission is not an assignment. The exact current-version action
    // projection must grant a workflow command as well as identify this actor.
    const needsCurrentActor = nextActor?.id === session.actor.id
      && current.allowedActions.some((item) => item.enabled && workflowActions.has(item.code));
    const items = clone(FIXTURE_PROPOSAL_DIRECTORY).filter((item) => item.ref.kind === "resource").map((item, index) => index === 0 ? {
      ...item,
      ref: clone(current.ref),
      title: current.title,
      state: current.state,
      readiness: current.readiness,
      author: clone(current.author),
      owner: clone(submissionOwner),
      submissionOwner: clone(submissionOwner),
      assignedApprover: clone(current.assignedApprover),
      assignedPublisher: clone(current.assignedPublisher),
      nextActor: clone(nextActor),
      needsCurrentActor,
      updatedAt: current.updatedAt ?? current.activity?.at(-1)?.occurredAt ?? current.returnDecision?.decidedAt ?? current.approval?.decidedAt ?? current.submission?.submittedAt ?? current.handoffHistory?.at(-1)?.occurredAt ?? item.updatedAt,
      counts: { lines: current.counts.selected, blocked: current.counts.blocked },
    } : item).filter((item) => (!request.state || item.state === request.state)
      && (!query || `${item.title} ${item.state} ${item.readiness}`.toLocaleLowerCase("en-NG").includes(query)))
      .map((item) => ({
        ...item,
        allowedActions: [action("proposal.read", true, item.ref.version, null, item.ref)],
        dataLabel: "Sample data",
        provenance: clone(FIXTURE_PROVENANCE),
      }));
    const response = paginate({
      kind: "proposal-list",
      items,
      cursor: request.cursor,
      limit: request.limit,
      fallbackLimit: 20,
      cursorPrefix: "fixture-proposals:",
      domain: "proposal",
      totalCount: items.length,
      totalCountRelation: "exact",
      coverage: "complete-page",
      filterResult: { query: request.query?.trim() ?? "", state: request.state ?? null, matchedCount: items.length },
      allowedActions: [action("proposal.read", true, session.capabilityVersion, null)],
    });
    await wait(this.latencyMs);
    return response;
  }
}

export class FixtureRuleRepository {
  /** @param {{latencyMs?: number, getSession: () => WorkspaceSession}} options */
  constructor({ latencyMs = 0, getSession }) {
    this.latencyMs = latencyMs;
    this.getSession = getSession;
  }

  /** @param {{query?: string, scope?: string, cursor?: string | null, limit?: number}} [request] */
  async list(request = {}) {
    const session = this.getSession();
    requireAnyCapability(session, ["rules:read", "repricing:prepare"], "rules");
    requireAnyCapability(session, [ECONOMICS_READ], "rules");
    const query = normaliseQuery(request.query);
    const items = clone(FIXTURE_RULES).filter((item) => (!request.scope || item.scope === request.scope)
      && (!query || `${item.code} ${item.name} ${item.scope}`.toLocaleLowerCase("en-NG").includes(query)))
      .map((item) => ({ ...item, allowedActions: [action("rules.read", true, item.ref.version, null, item.ref)] }));
    const response = paginate({
      kind: "rule-list",
      items,
      cursor: request.cursor,
      limit: request.limit,
      fallbackLimit: 20,
      cursorPrefix: "fixture-rules:",
      domain: "rules",
      totalCount: items.length,
      totalCountRelation: "exact",
      coverage: "complete-page",
      filterResult: { query: request.query?.trim() ?? "", scope: request.scope ?? null, matchedCount: items.length },
      allowedActions: [action("rules.read", true, session.capabilityVersion, null)],
    });
    await wait(this.latencyMs);
    return response;
  }

  /** @param {{ruleId: string}} request */
  async getDetail(request) {
    const session = this.getSession();
    requireAnyCapability(session, ["rules:read", "repricing:prepare"], "rules");
    requireAnyCapability(session, [ECONOMICS_READ], "rules");
    const rule = FIXTURE_RULES.find((candidate) => candidate.id === request?.ruleId);
    if (!rule) throwRepositoryError({ code: "RULE_NOT_FOUND", message: "That pricing rule is not available in the fixture.", details: { ruleId: request?.ruleId ?? null }, retryable: false, domain: "rules", traceId: "fixture-rule-not-found" });
    const response = clone(rule);
    response.kind = "pricing-rule-detail";
    response.explanation = `The ${rule.name} floor requires at least ${(rule.marginFloorBasisPoints / 100).toFixed(2)}% margin at ${rule.scope} scope.`;
    response.allowedActions = [
      action("rules.read", true, rule.ref.version, null),
      action("rules.edit", false, rule.ref.version, denial("CAPABILITY_UNAVAILABLE", "Rule administration is deferred from the launch workspace.")),
    ];
    await wait(this.latencyMs);
    return response;
  }
}

export class FixtureAuditDirectoryRepository {
  /** @param {{latencyMs?: number, getSession: () => WorkspaceSession, getEvents: () => AuditEvent[]}} options */
  constructor({ latencyMs = 0, getSession, getEvents }) {
    this.latencyMs = latencyMs;
    this.getSession = getSession;
    this.getEvents = getEvents;
  }

  /** @param {{entityType?: string, actorId?: string, eventType?: string, cursor?: string | null, limit?: number}} [request] */
  async list(request = {}) {
    const session = this.getSession();
    requireAnyCapability(session, ["audit:read", "proposal:read"], "audit");
    requireAnyCapability(session, [ECONOMICS_READ], "audit");
    const fullyAuthorised = hasCapability(session, "audit:read");
    const items = clone(this.getEvents()).reverse().filter((event) => {
      const insideParticipantScope = fullyAuthorised || event.object.id === FIXTURE_PROPOSAL_DIRECTORY[0].ref.id || event.actorId === session.actor.id;
      return insideParticipantScope
        && (!request.entityType || event.object.type === request.entityType)
        && (!request.actorId || event.actorId === request.actorId)
        && (!request.eventType || event.eventType === request.eventType);
    }).map((event) => ({
      ...event,
      allowedActions: [action("audit.event.read", true, event.object.version, null, { kind: "resource", id: event.object.id, version: event.object.version })],
    }));
    const response = paginate({
      kind: "audit-ledger-list",
      items,
      cursor: request.cursor,
      limit: request.limit,
      fallbackLimit: 20,
      cursorPrefix: "fixture-audit:",
      domain: "audit",
      totalCount: items.length,
      totalCountRelation: "exact",
      coverage: "complete-page",
      filterResult: {
        entityType: request.entityType ?? null,
        actorId: request.actorId ?? null,
        eventType: request.eventType ?? null,
        matchedCount: items.length,
        accessScope: fullyAuthorised ? "organisation-audit" : "owned-or-involved-proposals",
      },
      allowedActions: [action("audit.read", true, session.capabilityVersion, null)],
    });
    await wait(this.latencyMs);
    return response;
  }

  /** @param {{entityType: string, entityId: string, cursor?: string | null, limit?: number}} request */
  async getEntityHistory(request) {
    if (!request?.entityType || !request?.entityId) {
      throwRepositoryError({ code: "AUDIT_ENTITY_REQUIRED", message: "Entity type and canonical entity ID are required.", details: {}, retryable: false, domain: "audit", traceId: "fixture-audit-entity-required" });
    }
    const session = this.getSession();
    requireAnyCapability(session, ["audit:read", "proposal:read"], "audit");
    requireAnyCapability(session, [ECONOMICS_READ], "audit");
    const fullyAuthorised = hasCapability(session, "audit:read");
    const events = clone(this.getEvents()).filter((event) => event.object.type === request.entityType && event.object.id === request.entityId).reverse();
    const authoredEntityEvent = events.some((event) => event.actorId === session.actor.id);
    if (!fullyAuthorised && request.entityId !== FIXTURE_PROPOSAL_DIRECTORY[0].ref.id && !authoredEntityEvent) {
      throwRepositoryError({ code: "MISSING_PERMISSION", message: "This session may read audit evidence only for an owned or involved Proposal.", details: { entityId: request.entityId }, retryable: false, domain: "audit", traceId: "fixture-audit-entity-forbidden" });
    }
    if (!events.length) throwRepositoryError({ code: "AUDIT_HISTORY_NOT_FOUND", message: "No audit evidence is available for that entity.", details: { entityType: request.entityType, entityId: request.entityId }, retryable: false, domain: "audit", traceId: "fixture-audit-entity-not-found" });
    const response = paginate({
      kind: "audit-entity-history",
      items: events.map((event) => ({ ...event, allowedActions: [action("audit.event.read", true, event.object.version, null)] })),
      cursor: request.cursor,
      limit: request.limit,
      fallbackLimit: 25,
      cursorPrefix: `fixture-audit-${request.entityType}-${request.entityId}:`,
      domain: "audit",
      totalCount: events.length,
      totalCountRelation: "exact",
      coverage: "complete-page",
      filterResult: { entityType: request.entityType, entityId: request.entityId, matchedCount: events.length, readOnlyEvidence: true },
      allowedActions: [action("audit.read", true, session.capabilityVersion, null)],
    });
    await wait(this.latencyMs);
    return response;
  }
}

/**
 * Build the additive operational repositories against the same resolved
 * session and journey runtime as the existing Preview/Proposal repositories.
 *
 * @param {{latencyMs?: number, getSession: () => WorkspaceSession, getProposal: () => ProposalDetail, getEvents?: () => AuditEvent[]}} options
 */
export function createFixtureOperationalRepositories({ latencyMs = 0, getSession, getProposal, getEvents = () => FIXTURE_OPERATIONAL_AUDIT_EVENTS }) {
  return {
    workQueue: new FixtureWorkQueueRepository({ latencyMs, getSession, getProposal }),
    catalog: new FixtureCatalogRepository({ latencyMs, getSession }),
    imports: new FixtureImportRepository({ latencyMs, getSession }),
    repricing: new FixtureRepricingDraftRepository({ latencyMs, getSession }),
    proposals: new FixtureProposalDirectoryRepository({ latencyMs, getSession, getProposal }),
    rules: new FixtureRuleRepository({ latencyMs, getSession }),
    audit: new FixtureAuditDirectoryRepository({ latencyMs, getSession, getEvents }),
  };
}

export { FIXTURE_BASELINE_IMPORT_ID };
