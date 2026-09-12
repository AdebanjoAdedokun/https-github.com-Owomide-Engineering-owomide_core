import { throwRepositoryError } from "./domainError.js";
import { assertOperationalList } from "./contracts.js";
import { FIXTURE_PROVENANCE, FIXTURE_SESSION } from "./fixtures/repricingPreviewV0.js";
import { FIXTURE_EVIDENCE_SESSIONS } from "./fixtures/proposalJourneyV0.js";

const clone = (value) => structuredClone(value);
const pause = (ms) => ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
const has = (session, code) => session.effectiveCapabilities.includes(code);
const stamp = () => new Date().toISOString();

function fail(code, message, domain, details = {}) {
  throwRepositoryError({ code, message, domain, details, retryable: false, traceId: `fixture-${domain}-${code.toLowerCase()}` });
}
function requirePermission(session, capabilities, domain) {
  if (!capabilities.some((code) => has(session, code))) fail("MISSING_PERMISSION", "This sample session cannot access this workspace area.", domain);
}
function action(code, enabled, version, message = "This session does not have permission.", denialCode = "MISSING_PERMISSION") {
  return { code, enabled, requiredVersion: version, reason: enabled ? null : { code: denialCode, message }, confirmation: null, decision: null };
}
function exactRef(ref, expected, domain) {
  if (ref?.kind !== expected.kind || ref?.id !== expected.id) fail("RESOURCE_NOT_FOUND", "This resource is not available.", domain);
  if (ref.version !== expected.version) fail("STALE_VERSION", "This record changed. Reload it before saving.", domain, { currentVersion: expected.version });
}
function textField(value, field, max, required = true) {
  if (value == null && !required) return "";
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
    fail("REQUEST_INVALID", `${field} must be ${required ? "1" : "0"}–${max} characters.`, "pricing-request", { field });
  }
  return value.trim();
}
function mutation(ledger, session, key, command, input, apply) {
  if (typeof key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key)) fail("IDEMPOTENCY_KEY_INVALID", "Use a valid request key.", command);
  // Tenant + actor namespace prevents another actor replaying a sensitive response.
  const ledgerKey = `${session.organisation.id}:${session.actor.id}:${key}`;
  const fingerprint = JSON.stringify({ command, input });
  const old = ledger.get(ledgerKey);
  if (old) {
    if (old.fingerprint !== fingerprint) fail("IDEMPOTENCY_KEY_REUSED", "This key belongs to a different request.", command);
    return { data: clone(old.result.data), mutation: { ...old.result.mutation, deduplicated: true } };
  }
  const result = { data: apply(), mutation: { idempotencyKey: key, applied: true, deduplicated: false, authoritative: false } };
  ledger.set(ledgerKey, { fingerprint, result: clone(result) });
  return clone(result);
}

export function createFixtureCompanyState(organisation = FIXTURE_SESSION.organisation) {
  return {
    organisation: clone(organisation),
    ref: { kind: "resource", id: `${organisation.id}:submission-policy`, version: "1" },
    // Compatibility default for the existing sample journey, NOT production policy.
    analystCanSubmit: true,
    history: [],
    requests: [],
    requestSequence: 0,
  };
}

export function fixtureHandoffCandidates() {
  return Object.values(FIXTURE_EVIDENCE_SESSIONS)
    .filter((session) => has(session, "proposal:handoff:receive") && has(session, "proposal:submit"))
    .map((session) => clone(session.actor));
}

export function createFixtureCompanyRequests({ state, getSession, latencyMs = 0 }) {
  const ledger = new Map();
  const sessionFor = (capabilities, domain) => {
    const session = getSession();
    requirePermission(session, capabilities, domain);
    if (session.organisation.id !== state.organisation.id) fail("MISSING_PERMISSION", "This company is not available to this session.", domain);
    return session;
  };
  const companyDetail = (session) => ({
    kind: "company-policy", ref: clone(state.ref), organisation: clone(state.organisation),
    policy: { analystCanSubmit: state.analystCanSubmit },
    members: Object.values(FIXTURE_EVIDENCE_SESSIONS).map((member) => ({
      ...clone(member.actor), roleCodes: [...member.roleCodes], roleLabels: [...member.roleLabels],
    })),
    handoffCandidates: fixtureHandoffCandidates(),
    allowedActions: [action("company.read", true, state.ref.version), action("company.policy.update", has(session, "company:policy:update"), state.ref.version)],
    history: clone(state.history), dataLabel: "Sample data", provenance: clone(FIXTURE_PROVENANCE),
  });
  const requestDetail = (row, session) => {
    // Explicit allowlist: never spread an internal row or a linked Proposal.
    const canTriage = has(session, "request:triage") && ["submitted", "reviewing"].includes(row.status);
    return {
      kind: "pricing-request", ref: clone(row.ref), status: row.status,
      productReference: row.productReference, issue: row.issue, reason: row.reason,
      evidence: row.evidence, evidenceType: "text", context: row.context,
      requester: clone(row.requester), createdAt: row.createdAt, updatedAt: row.updatedAt,
      // Internal triage notes may mention protected work; contributor receives status only.
      triage: has(session, "request:triage") ? clone(row.triage) : null,
      history: has(session, "request:triage") ? clone(row.history) : row.history.map(({ status, occurredAt }) => ({ status, occurredAt })),
      allowedActions: [action("request.read", true, row.ref.version), action("request.triage", canTriage, row.ref.version,
        has(session, "request:triage") ? "This request is already closed." : "Only the pricing team can triage this request.",
        has(session, "request:triage") ? "WRONG_STATE" : "MISSING_PERMISSION")],
      dataLabel: "Sample data", provenance: clone(FIXTURE_PROVENANCE),
    };
  };
  const findReadable = (id, session) => {
    const row = state.requests.find((item) => item.ref.id === id && item.organisationId === session.organisation.id);
    if (!row || (!has(session, "request:triage") && row.requester.id !== session.actor.id)) fail("REQUEST_NOT_FOUND", "This pricing request is not available.", "pricing-request");
    return row;
  };

  return {
    company: {
      async get() {
        const session = sessionFor(["company:read"], "company");
        await pause(latencyMs);
        return companyDetail(session);
      },
      async updateAnalystSubmission(request) {
        const session = sessionFor(["company:policy:update"], "company");
        if (typeof request?.analystCanSubmit !== "boolean") fail("COMPANY_POLICY_INVALID", "Choose whether analysts can submit drafts.", "company");
        const result = mutation(ledger, session, request.idempotencyKey, "company-policy", {
          companyRef: request.companyRef, analystCanSubmit: request.analystCanSubmit,
        }, () => {
          exactRef(request.companyRef, state.ref, "company");
          const fromRef = clone(state.ref);
          const before = state.analystCanSubmit;
          state.ref.version = String(Number(state.ref.version) + 1);
          state.analystCanSubmit = request.analystCanSubmit;
          state.history.push({ fromRef, toRef: clone(state.ref), actor: clone(session.actor), before, after: state.analystCanSubmit, occurredAt: stamp(), authoritative: false });
          return companyDetail(session);
        });
        await pause(latencyMs);
        return result;
      },
    },
    requests: {
      async list({ cursor = null, limit = 25 } = {}) {
        const session = sessionFor(["request:read:own", "request:triage"], "pricing-request");
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) fail("PAGE_LIMIT_INVALID", "Choose a page size from 1 to 200.", "pricing-request");
        // Cursor is scoped to this actor and organization, not reusable across sessions.
        const prefix = `requests:${session.organisation.id}:${session.actor.id}:`;
        if (cursor !== null && (typeof cursor !== "string" || !cursor.startsWith(prefix) || !/^\d+$/.test(cursor.slice(prefix.length)))) fail("CURSOR_INVALID", "Reload the request list.", "pricing-request");
        const offset = cursor === null ? 0 : Number(cursor.slice(prefix.length));
        if (!Number.isSafeInteger(offset)) fail("CURSOR_INVALID", "Reload the request list.", "pricing-request");
        const rows = state.requests.filter((row) => row.organisationId === session.organisation.id && (has(session, "request:triage") || row.requester.id === session.actor.id));
        const items = rows.slice(offset, offset + limit).map((row) => requestDetail(row, session));
        const result = {
          kind: "pricing-request-list", items, viewScope: has(session, "request:triage") ? "team" : "own",
          page: { cursor, nextCursor: offset + items.length < rows.length ? `${prefix}${offset + items.length}` : null, returnedCount: items.length, limit, totalCount: rows.length, totalCountRelation: "exact", coverage: "complete-page", exhaustive: true },
          filterResult: {}, allowedActions: [action("request.read", true, "1"), action("request.create", has(session, "request:create"), "1"), action("request.triage", has(session, "request:triage"), "1")],
          dataLabel: "Sample data", provenance: clone(FIXTURE_PROVENANCE),
        };
        assertOperationalList(result, "pricing-request-list");
        await pause(latencyMs);
        return result;
      },
      async get({ requestId, requestVersion } = {}) {
        const session = sessionFor(["request:read:own", "request:triage"], "pricing-request");
        const row = findReadable(requestId, session);
        if (requestVersion != null && requestVersion !== row.ref.version) fail("STALE_VERSION", "This request changed. Reload it to see the current status.", "pricing-request");
        const result = requestDetail(row, session);
        await pause(latencyMs);
        return result;
      },
      async create(request) {
        const session = sessionFor(["request:create", "request:read:own"], "pricing-request");
        requirePermission(session, ["request:create"], "pricing-request");
        const input = {
          productReference: textField(request?.productReference, "Product or SKU reference", 160),
          issue: textField(request?.issue, "Issue", 120), reason: textField(request?.reason, "Reason", 2000),
          evidence: textField(request?.evidence, "Evidence note", 2000, false),
          context: textField(request?.context, "Channel or location", 240, false),
        };
        const result = mutation(ledger, session, request?.idempotencyKey, "pricing-request-create", input, () => {
          const now = stamp();
          const row = {
            ...input, ref: { kind: "resource", id: `sample-request-${++state.requestSequence}`, version: "1" },
            organisationId: session.organisation.id, requester: clone(session.actor), status: "submitted",
            createdAt: now, updatedAt: now, triage: null, history: [{ status: "submitted", occurredAt: now }],
          };
          state.requests.unshift(row);
          return requestDetail(row, session);
        });
        await pause(latencyMs);
        return result;
      },
      async triage(request) {
        const session = sessionFor(["request:triage"], "pricing-request");
        if (!["reviewing", "resolved", "declined"].includes(request?.status)) fail("REQUEST_STATUS_INVALID", "Choose a supported triage outcome.", "pricing-request");
        const note = textField(request.note, "Triage note", 1000);
        const result = mutation(ledger, session, request.idempotencyKey, "pricing-request-triage", {
          requestRef: request.requestRef, status: request.status, note,
        }, () => {
          const row = findReadable(request.requestRef?.id, session);
          exactRef(request.requestRef, row.ref, "pricing-request");
          if (!["submitted", "reviewing"].includes(row.status)) fail("REQUEST_WRONG_STATE", "Closed requests cannot be triaged again.", "pricing-request");
          row.ref.version = String(Number(row.ref.version) + 1);
          row.status = request.status;
          row.updatedAt = stamp();
          row.triage = { actor: clone(session.actor), note, occurredAt: row.updatedAt };
          row.history.push({ status: row.status, occurredAt: row.updatedAt, actor: clone(session.actor), note });
          return requestDetail(row, session);
        });
        await pause(latencyMs);
        return result;
      },
    },
  };
}
