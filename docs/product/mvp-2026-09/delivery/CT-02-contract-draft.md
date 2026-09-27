# CT-02 canonical contract draft

**Status: working draft for review; not ratified.** This document proposes a
transport-neutral domain contract for discussion. It does not settle D-01–08,
release an implementation package, change a protobuf or runtime contract, or
authorize a migration. CT-01 remains a prerequisite to implementation.

The accepted PRD is the target reference. Existing frontend fixtures, service
guidance and protobufs describe current seams and history; they are not proof
that the target model is implemented. `PRD_DISPOSITIONS.md` was not present in
the delivery directory when this draft was prepared.

## Contract boundaries

The model must keep these concepts separate. Similar names or a shared enum
must not collapse their meaning:

| Concept | Draft meaning | Must not imply |
| --- | --- | --- |
| Initiative | Org-scoped parent for the objective, pricing context, work, analysis and resulting controlled Proposals. | Approval, a price write, or a particular workflow profile. |
| Controlled Proposal version | Immutable business-content snapshot, identified as `proposalId + version`; a material replacement creates a new version with lineage. | A database update counter or inherited authority. |
| Concurrency revision | Opaque compare-and-swap token for a mutable working aggregate. It changes on accepted writes, including non-material edits. | A new controlled version, a decision, or permission to overwrite a newer revision. |
| Decision | A separately attributed formal outcome against one exact submitted Proposal version. | Review feedback, workflow progress, validity, or execution. |
| Validity | Whether a decision/version remains eligible under time, supersession and applicable conditions. | The decision status or current workflow step. |
| Workflow | Versioned, bounded routing and required actions around review and formal decisions. | An approval outcome or an unrestricted state graph. |
| Execution | A separately identified attempt to implement an authorized version, with requested and observed actuals. | Approval, successful transport, or aggregate business completion. |

Names and exact enum values for statuses, validity reasons, workflow steps and
authority scopes remain open where they depend on D-01–08. The types below are
illustrative domain shapes, not a wire schema.

## Candidate domain model

```text
Initiative {
  id, orgId, objective, ownerRef,
  lifecycle, scopeRef, contextRefs[],
  assumptionRefs[], collaboratorRefs[],
  createdAt, updatedAt, revision
}

PricingContextReference {
  entityRef, economicRecordRef, recordKind,
  dimensions { channel?, location?, customerSegment?, ... },
  value: ResolvedMoney | UnresolvedMoney,
  unit, basis,
  businessValidity { effectiveAt, effectiveUntil? },
  systemKnowledge { recordedAt, supersededAt? },
  provenance { sourceType, sourceRef, sourceItemRef?, actorRef? }
}

ResolvedMoney {
  amountMinor, currency
}

UnresolvedMoney {
  status: "missing" | "ambiguous" | "incompatible" | "unavailable",
  candidateRefs[], explanation
}

ProposalVersion {
  proposalId, initiativeId, version, sourceRefs[],
  contentSnapshot, createdBy, createdAt,
  submittedSnapshot?: { submittedBy, submittedAt, workflowRef, ... }
}

ProposalWorkingAggregate {
  proposalId, currentVersion, concurrencyRevision, workingContent
}

FormalDecision {
  id, proposalRef: { proposalId, version },
  outcome, actorRef, decidedAt, reason?,
  authorityEvidenceRef, workflowRef
}

VersionValidity {
  proposalRef: { proposalId, version },
  status, evaluatedAt, validUntil?, reasons[], sourceRefs[]
}

WorkflowInstance {
  id, workflowDefinitionRef, workflowDefinitionVersion,
  proposalRef: { proposalId, version },
  currentStepRef?, stepHistory[], status
}

ExecutionOperation {
  id, idempotencyKey, proposalRef: { proposalId, version },
  authorizedScopeRef, destinationRef?, requestedAt, requestedBy,
  status, itemResults[]
}

ExecutionItemResult {
  sourceLineRef, requestedValue?, actualValue?,
  status, observedAt?, evidenceRefs[], explanation?
}
```

`amountMinor` is an integer in the currency's defined minor unit, never a
floating-point number. A money value is not fully identified by amount and
currency alone: retain the canonical entity/record identity, dimensions, unit,
basis, business-valid time, system-knowledge time and provenance alongside it.
Do not treat absent dimensions or incompatible bases as wildcards. Resolution
must return an explicit unresolved state with candidates/reason; it must not
choose the first match, substitute zero, or infer compatibility.

The `ProposalVersion.version` and `ProposalWorkingAggregate.concurrencyRevision`
are independent. Submission freezes the exact controlled version and source
references. A material change creates a new version and never transfers a
decision, policy authorisation, validity result or execution authority from the
old version. Non-material edits, if allowed, still use concurrency control and
must not mutate a submitted snapshot. What counts as material is not settled by
this draft.

Review comments or requests for clarification are activity, not formal
decisions. Decision outcome vocabulary, validity conditions, workflow
configuration limits, and the relationship between exceptions and decisions
must be ratified before implementation. A current status or a workflow
completion flag is not a substitute for evaluating validity against the exact
version.

## Command envelope and draft commands

These are domain-level command intentions only. They do not name REST routes or
RPCs and are not an authorization to add methods to `src/lib/proto`.

```text
CommandContext {
  orgId: authenticated context only,
  actorRef: authenticated actor only,
  idempotencyKey?: string,
  expectedConcurrencyRevision?: string,
  traceId?: string
}

CreateInitiative(context, objective, initialScope?, contextRefs?)
UpdateInitiative(context, initiativeRef, expectedRevision, changes)
CreateAnalysis(context, initiativeRef, inputRefs, assumptions, ruleRefs)
CreateScenario(context, initiativeRef, analysisRef, name, alternatives)
CreateProposal(context, initiativeRef, selectedSourceRefs, content)
SubmitProposal(context, proposalId, controlledVersion, expectedRevision)
RecordDecision(context, proposalId, controlledVersion, outcome, reason?)
CreateMaterialReplacement(context, proposalId, sourceVersion,
                          expectedRevision, changes)
StartExecution(context, proposalId, controlledVersion, authorizedScope,
               idempotencyKey)
ReconcileExecution(context, operationId, evidenceOrStatus)
```

Each consequential command names its exact aggregate and, where relevant,
controlled version and expected concurrency revision. The server derives
tenant, actor and permissions from trusted request context; caller-supplied
identity fields are not authoritative. Repeating a command with the same
idempotency key and same payload returns its recorded outcome. Reusing that key
with a different payload is a conflict. A timed-out write is an unknown
outcome, not a failed operation that is safe to repeat under a new key.

## Error shape and examples

The candidate transport-neutral error shape follows the existing workspace
envelope without promising an HTTP or gRPC mapping:

```json
{
  "error": {
    "code": "CONTEXT_AMBIGUOUS",
    "message": "More than one applicable cost record matches this context.",
    "details": {
      "entityRef": "sku:sku-17",
      "candidateRecordRefs": ["cost:cost-4", "cost:cost-9"],
      "missingDimensions": ["location"]
    },
    "retryable": false
  },
  "traceId": "trace-example"
}
```

Candidate domain codes include `INVALID_ARGUMENT`,
`CONTEXT_MISSING`, `CONTEXT_AMBIGUOUS`, `CONTEXT_INCOMPATIBLE`,
`STALE_REVISION`, `VERSION_NOT_CURRENT`, `INVALID_TRANSITION`,
`DECISION_NOT_AUTHORIZED`, `VERSION_NOT_VALID`, `IDEMPOTENCY_CONFLICT`,
`OUTCOME_UNKNOWN` and `CAPABILITY_UNAVAILABLE`. This list is illustrative;
status mappings, disclosure rules and the final code catalog require review.
Expected stale or denied commands must fail explicitly and must not return a
success-shaped fallback. Retriable transport failure is distinct from an
unknown write outcome; unknown operations require status/reconciliation before
any retry.

**Exact-version and stale-revision example**

```text
SubmitProposal(
  { orgId: authenticated, actorRef: authenticated, idempotencyKey: "submit-1",
    expectedConcurrencyRevision: "rev-12" },
  proposalId = "proposal-8",
  controlledVersion = 3
)

=> accepted submission references proposal-8/v3 and stores its immutable
   source/content snapshot; later edits cannot change what was submitted.

If the working aggregate is now rev-13, return STALE_REVISION with the current
revision/reference. Do not silently submit rev-13 or reinterpret v3.
```

**Context resolution example**

```text
Requested price context:
  entity = sku-17; channel = wholesale; location = Lagos;
  unit = case-of-12; business time = 2026-09-27T00:00:00Z;
  knowledge time = 2026-09-27T00:00:00Z

Resolved result retains:
  PriceRecord ref, NGN amountMinor, case-of-12 unit/basis,
  channel/location identity, effective interval, recorded interval,
  and import/manual source lineage.

If two candidate CostRecords differ by location, unit basis, or an unresolved
dimension, return UnresolvedMoney(status="ambiguous" or "incompatible", ...).
Do not return zero, choose a candidate by list order, or calculate margin from
an assumed conversion.
```

**Execution example**

An accepted `StartExecution` creates an operation for one authorized
`proposalId/version` and retains an idempotency key. If a downstream operation
reports one item updated and another rejected—or the response is lost—the
operation remains partial or unknown with item-level evidence. Neither
transport success nor a scheduled dispatch marks the Initiative complete.
Only reconciled observed actuals can support a business completion assessment.

## Service ownership and existing seams

| Concern | Owning boundary | Contract responsibility |
| --- | --- | --- |
| Browser composition | `apps/workspace` | Consume transport-neutral repository contracts. Components do not call services or `fetch` directly. Fixtures remain explicitly sample/fixture; the live-adapter gate stays closed until its release criteria pass. |
| Authentication and REST mapping | Gateway | Derive `orgId`/actor from trusted identity, propagate authenticated context, map transport errors. It owns no pricing, decision or workflow policy. |
| Initiative, Proposal versions, commands | Proposal domain (existing canonical Proposal writer) | Candidate owner for Initiative and controlled Proposal lifecycle, version lineage, submission and business commands. Exact table/API split remains a design decision after ratification. |
| Canonical entities and economics | Catalog | Own entity/SKU identity, controlled dimensions and immutable bitemporal CostRecord/PriceRecord. Exact identity resolution only; no fuzzy or ambiguous merge. |
| Untrusted source and import | Data Pipeline | Own raw/staging/import lineage; turn validated rows into typed Catalog commands. Never grant pricing-core access to raw/mapped data. |
| Deterministic validation | Margin | Own margin rules and batched evaluation evidence/violations. It reports results; it does not decide Proposal workflow or formal decisions. |
| Permission grants | RBAC | Own roles and grants; default deny and server-side checks. Exact Admin/Contributor packaging and permission scopes remain open. |
| Audit projection | Governance | Event subscriber only; append-only audit from producer events. No direct service writes/calls to Governance. |
| Notifications | Notify | Event subscriber for recipient-safe durable notifications; never authoritative for workflow completion. |

This is an ownership proposal bounded by existing service boundaries, not a
decision to transfer or combine schemas. Cross-service persistence remains
service-owned; share typed commands/events, not SQL tables. All customer-owned
records remain org-scoped.

## Compatibility and migration boundaries

1. **No wire/runtime change in CT-02 draft work.** Current message fields,
   event payloads, field numbers, generated clients, workspace repository
   behavior and database migrations remain unchanged.
2. **Known semantic gaps are release gates, not reasons to fake compatibility.**
   Existing `Proposal` protobuf has a single `state`, no Initiative parent,
   controlled version or concurrency revision. Current proposal events carry
   proposal identity but not the exact controlled version or complete authority
   evidence. Existing common `Money` carries amount and currency only; it does
   not encode economic record identity, unit/basis or the two time axes.
   `ResourceRef.version` in the workspace seam does not by itself provide an
   aggregate compare-and-swap revision. These fields must not be repurposed or
   inferred.
3. **Fixtures are compatibility evidence, not live behavior.** Current
   fixture-specific readiness, Proposal states and replacement flows must not
   be presented as the canonical server model. Do not remove
   `LIVE_ADAPTER_NOT_RELEASED` or turn live failures into fixture successes.
4. **After ratification only:** define additive or versioned protobuf/event
   evolution with explicit producer/consumer mapping and data backfill
   semantics. Preserve deployed field numbers and meanings; never silently
   reinterpret an existing enum, `version`, event or money field. A breaking
   contract requires the repository's versioning and consumer rollout plan.
5. **Migration plan remains unapproved.** No migration is included here. A
   later implementation plan must identify the owning service schema for each
   new record, tenant/RLS and indexes, immutable history, backfill source and
   ambiguity policy, dual-read/write avoidance, expand/verify/cutover/contract
   ordering, rollback limits and old-client behavior. Proposal, Catalog,
   Governance and Data Pipeline data cannot be joined by shared SQL.
6. Cross-service implementation remains blocked until the affected contract
   and migration compatibility are explicitly accepted. This draft does not
   close CT-02 or any implementation dependency.

## Open decisions and exact blockers

All entries below remain **open**. Proposed contract details that depend on
them are intentionally not selected here.

| Decision | Unresolved choice / required ratification | Contract and implementation blocked |
| --- | --- | --- |
| D-01 | Full PRD target versus any explicitly bounded pilot deviation; timing/scope of AI, while the manual journey remains usable. | Final outcome scope, AI invocation/application references and complete-delivery claims; FE-11, BE-09 and IN-04 remain gated by the product decision. |
| D-02 | Workspace Admin as a named role or a supported grant package, distinct from pricing approval. | Canonical role/profile names, administrative permission bundle and membership/settings commands; FE-01/08 and BE-01/05. |
| D-03 | Preserve request-only, deny-by-default Contributor boundary or ratify deliberate additional scoped collaboration grants. | Initiative collaboration targets, resource/action scopes and safe projections; FE-01/07 and BE-01/06. |
| D-04 | Validate pilot entity types and representative records, required dimensions, currency/time and cost basis. | Required `PricingContextReference` dimensions, unit/basis compatibility and resolver outcomes. Until decided, missing/ambiguous values stay unresolved; FE-02/04, BE-02/03 and IN-03. |
| D-05 | Bounded workflow/authority profile, required order and scopes/limits, actual-submitter checks; policy authorisation stays disabled by default until exact supported qualification/configuration is agreed. | Workflow definition fields, decision eligibility, authority evidence and validity predicates; FE-08 and BE-05. |
| D-06 | Manual implementation evidence accepted by the pilot and treatment of material variance; internal Catalog success/export is not external implementation. | `ExecutionOperation` actual-value evidence, confirmation authority, variance states and completion predicate; FE-09 and BE-07. |
| D-07 | One external connector selected from validated pilot need, retaining manual/import fallback. | Destination/connector binding and live execution adapter; do not add a connector portfolio or assume one; IN-03. |
| D-08 | Explicit Must/Should/May disposition, including expected Should deferrals and optional PROP-018/FLOW-018/027/028; exclusions are not an authorized backlog. | Required/optional contract facets and release acceptance; CT-01 and final IN-04 reconciliation. |

The accountable deciders and recorded dispositions remain as listed in
`DECISIONS.md`. This draft records no accepted option, date, rationale,
contract version or superseding decision. Until those records are completed,
dependent implementation packages remain blocked.

## Review outcome

This artifact is a draft proposal for contract review only. No producer or
consumer compatibility is claimed; no migration, endpoint, permission grant,
connector, AI authority or runtime behavior is released. CT-02 acceptance and
all implementation evidence remain outstanding.
