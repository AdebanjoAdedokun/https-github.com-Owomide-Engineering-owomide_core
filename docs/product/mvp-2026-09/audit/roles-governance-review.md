# Roles, Proposals, Workflow and Governance — MVP PRD source benchmark

Read-only audit, 12 September 2026. Coverage: **109/109** assigned requirements: ORG 14, PROP 22, FLOW 36, GOV 37. The accompanying [requirement matrix](roles-governance-matrix.json) contains the complete indexed requirement text, exact PDF-page span, separate frontend/backend/integration status, evidence and a bounded acceptance check for every ID.

## Verdict and scope

The current workspace demonstrates a useful **fixture-only, single-proposal pricing journey**, including roles, redaction, draft handoff, independent review, returned-pricing revision and retained history. It is **not connected to the backend** and does not implement the PRD's complete organisation, Initiative, controlled-Proposal-version or configurable governance model.

The backend has substantive foundations: JWT authentication, internal service authentication in several domains, forced tenant RLS, proposal state transitions, deterministic margin evaluation, append-only transition/audit storage, and price publication. These are **source implementations, not a runtime-verified MVP workflow**. Several present behaviours also contradict the replacement PRD, rather than merely being absent.

| Layer | Classification counts |
|---|---|
| Frontend | 2 sample-complete; 64 sample-partial; 31 absent; 12 conflicting |
| Backend | 42 partial-source; 52 absent; 15 conflicting |
| Integration | 109 not-connected |
| Priority | 62 P0; 41 P1; 2 P2; 4 P3 |

“Sample-complete” applies only to the bounded identity-level maker-checker demonstrations (FLOW-013, GOV-019); it does not confer server or end-to-end completeness. P0 denotes a correctness/onboarding or authority prerequisite, not an estimate that each row requires an independent project. Many rows depend on the same small set of architectural decisions.

### Authoritative inputs

- CEO replacement PRD: 283 pages, supplied replacement identified by SHA prefix `0abae9e`. Full indexed ORG/PROP/FLOW/GOV requirement text was read, as were the relevant Product Foundation, canonical object/lifecycle model, MVP scope and interpretation rules in pages 1–76.
- PDF visual verification: pages **155, 156, 209 and 210** were rendered and inspected. These directly verify same-version submission, distinct Proposal status/validity concepts, required Guardrail treatments and default-disabled Policy Authorisation configuration. The source text, not code comments or old handoff documents, governs this comparison.
- Frontend: dirty current `apps/workspace` working tree on `polish/workspace-premium-desk`; existing application changes were preserved.
- Backend: **`67218abda3e2302bd3003075910cc3a5bfc02097`**, current `src/*` under this same monorepo, matching refreshed `origin/main` as confirmed by the lead audit. The separate `owomide_core` worktree was not used as backend baseline.
- Ref review reported by lead: current published Joshua governance/auth work is already merged; the only non-merged older Joshua difference identified is CI version bumps, not newer role behaviour. Unpublished or elsewhere-hosted work remains outside this source verdict.

[Accepted PRD](../source/prototype-prd.pdf)

### Evidence method and limitations

This is a **functional/source benchmark**, not a screenshot-based visual UX critique. The PDF skill was used to check the key original pages. No application source fixes, commits, live API calls, infrastructure launches or external writes were performed.

Relevant frontend repositories, fixtures, role projections, route access and workflow UI were read. Backend Gateway, Proposal, Catalog, Margin, Governance and active Python Intelligence code, service contracts and migrations were inspected. Searches included membership/invitations/ownership, role names and permissions, organisational scope, Initiative/Scenario references, policy authorisation, workflow configuration, review/rejection/change requests, supersession/expiry, urgency/deadlines/delegation/withdrawal and notifications. Negative results are reported alongside the present canonical model/route or explicit stub that bounds the claim. Absence means “not located in this inspected implementation,” not proof about unpublished systems.

All integration rows are `not-connected` because [createWorkspaceRepositories](../../../../apps/workspace/src/data/workspaceRepositories.js#L17) rejects live mode with `LIVE_ADAPTER_NOT_RELEASED`. No `implemented-source` status was awarded to an entire assigned backend requirement where only constituent primitives exist. The complete indexed text may include the next section's introduction at a page boundary; `pages` retains that exact indexed span.

## Ten most important discrepancies

### 1. A real organisation cannot complete mandatory onboarding or access revocation

**ORG-001–011, ORG-014; GOV-001–004, GOV-017–018, GOV-032–033. PRD pages 76–81, 198–200, 204, 213–214. P0.**

The sample company model holds an organisation snapshot, a single analyst-submission toggle and fixture members. There are no invitations, editable role/scope assignments, membership states, ownership transfer, last-owner safety or essential setup/readiness workflow. Backend authentication verifies JWT claims but does not look up current membership or revoke existing sessions when a member is suspended. The development login checks one configured email/password.

Evidence: [company state](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46), [CompanyAccess](../../../../apps/workspace/src/RoleWorkspace.jsx#L193), [JWT middleware](../../../../src/gateway/src/middleware/auth.ts#L34), [development login](../../../../src/gateway/src/routes/auth.ts#L10).

**Decision:** establish the bounded identity/organisation contract before live onboarding: active membership, supported role grants, scoped permission evaluation, session revocation, ownership continuity and historical identity. Do not expand this into an unnecessary enterprise-SSO project; the PRD explicitly excludes mandatory initial SSO.

### 2. The server does not enforce the same cost and action boundaries as the sample

**ORG-002, ORG-006–007; GOV-015–018, GOV-021–022, GOV-035. PRD pages 76–78, 202–206, 215. P0.**

The fixture carefully removes costs, margins, floors, remediation details and sensitive free-text lineage. Catalog's actual cost route forwards a valid internal bearer and roles, but `batchGetCosts` returns costs after service/org/UUID validation without checking end-user economics permission or SKU scope. Margin configuration writes similarly lack an end-user policy-management guard.

Do not overstate this as “no service auth anywhere.” Catalog, Margin and Data Pipeline have internal tokens. **Proposal routes are a specific inconsistent boundary:** their header helper forwards only organisation/user IDs, while the Proposal service requires an internal bearer and approval roles; the transport factory does not add them. Governance RPC currently has only an error interceptor and trusts nonempty org/user headers; its restore path is staging-only but not role-authorised. These are source findings, not an attempted live exploit.

Evidence: [sample redaction](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L10), [Catalog route headers](../../../../src/gateway/src/routes/catalog.ts#L95), [cost return](../../../../src/catalog/src/service.ts#L134), [Margin write](../../../../src/margin/internal/handler/rules.go#L63), [Proposal forwarding](../../../../src/gateway/src/routes/proposals.ts#L31), [service token helpers](../../../../src/gateway/src/clients/service-auth.ts#L4), [Proposal authenticator](../../../../src/proposal/src/context.ts#L28), [Governance adapter](../../../../src/governance/src/server.ts#L59).

**Decision:** one server-side Role × Action × Resource × Scope policy, including raw and derivable field disclosure. Prove both authorised success and denied direct API requests; a broken endpoint that rejects everyone is not correct authorisation.

### 3. Backend maker-checker protects the creator, not necessarily the actual submitter

**FLOW-013, GOV-019. PRD pages 182–183 and 204–205. P0.**

The current frontend uses identity-level author, actual submitter and pricing-reviser checks. Backend approval supplies the proposal creator `actor_id` to the state machine. If A created the proposal and B submitted it, the pure state machine does not know B is its submitter. B's `approver` role plus a different creator passes the stated check. This must remain separate from the broken REST forwarding issue: the RPC/domain logic itself is insufficient.

Evidence: [fixture identity guard](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L540), [backend approval context](../../../../src/proposal/src/service.ts#L391), [creator comparison](../../../../src/proposal/src/domain/state-machine.ts#L81).

**Acceptance:** A creates; B submits and holds approval/admin/owner roles; B cannot approve. Independent authorised C can approve only within scope/limits. Store actual submitter identity with the controlled version.

### 4. Controlled Proposal versions are conflated with concurrency/state revisions

**PROP-003, 005, 011; FLOW-006, 016. PRD pages 150–152, 155–156, 179 and 183–184. P0.**

The PRD explicitly says submission freezes the **same Draft Proposal version**, not a second version solely for entering a decision path. Fixture `submit` advances the displayed `ref.version` and `approve` advances it again. Draft title edits and ownership handoff do likewise. The backend has no controlled-version column or complete immutable decision snapshot at all.

Evidence: [nextProposalVersion](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522), [submit increment](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2201), [approval increment](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2312), [backend schema](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24).

**Decision:** separate stable Proposal ID, controlled Proposal version, transport/concurrency revision, decision status and validity. Draft v1 → submitted/approved v1; a subsequent material change → new Draft v2. The current tests passing v7→v8 on submission prove the old contract, not replacement-PRD compliance.

### 5. Rejection, requested changes, readiness and execution are not independent concepts

**PROP-010, 012–013, 015–016, 019–020; FLOW-011, 019–021, 029. PRD pages 154–161, 182, 185–187, 191. P0.**

The frontend button says “Return for changes” but sends/stores `decision: reject`, immediately creating a new Draft version. There is no distinct terminal Rejected outcome. Backend states are only draft/submitted/blocked/approved/published. The PRD needs Draft, Awaiting Approval, Changes Requested, Rejected, Approved and Authorised Within Policy, with Current/Superseded/Expired validity separate. Blocked is readiness; publication is execution, not a replacement Proposal decision status.

Backend **Approve is implemented in source**, including an approver check, persisted transition and `ProposalApproved` outbox event; Reject and Request Changes are absent. FLOW-011 is therefore `partial-source`, not `absent`. The requirement is for distinct authorised decision semantics, preserved outcomes and canonical states—not separate API endpoints. A shared typed `decide` command can satisfy it without conflating rejection with requested correction. See [approval implementation](../../../../src/proposal/src/service.ts#L370) and [decision event/persistence](../../../../src/proposal/src/service.ts#L404).

The newly added returned-pricing path **does** preserve rejection text, reviewed source snapshots, original author/submission ownership and fresh decision requirements. That is useful bounded evidence, but it needs the canonical status/version model rather than more synonyms.

Evidence: [return decision](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2260), [dialog](../../../../apps/workspace/src/ProposalWorkspace.jsx#L546), [safe revision origin](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1658), [backend states](../../../../src/proposal/src/domain/state-machine.ts#L1).

**Acceptance:** three distinct formal decision outcomes, whether exposed through separate commands or a shared typed endpoint; retained reviewed version; correction generates a new version only when materially changed; superseded/expired/pending/rejected/changes-requested versions never supply execution authority.

### 6. Proposal remains disconnected from the mandatory Pricing Initiative

**PROP-001–008, 021–022; FLOW-002–003, 036. PRD pages 149–153, 161–162, 176–177, 196; foundation pages 33–42. P1, with authority binding P0.**

Preview/change-set → Proposal is not the canonical Initiative → Builder/analysis/Scenario → Proposal relationship. Both implementations lack the exactly-one Initiative parent, per-Initiative current proposal, lifecycle and complete objective/assumption/evidence/analysis lineage. An analytical Scenario is also absent; fixture-scenario provenance is a testing concept.

Evidence: [sample Proposal](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L117), [source change-set](../../../../src/proposal/src/service.ts#L832), [Proposal schema](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24).

**Decision:** make Initiative the parent container, without overbuilding an ERP. Require its ID in Proposal creation; constrain current applicable proposal per Initiative and preserve versioned sources. This is a product object gap, not a navigation-only gap.

### 7. Single-stage reviewer examples do not implement bounded workflow or authority levels

**FLOW-001–010, 014–015, 024–026, 031–035; GOV-026. PRD pages 175–183, 189–195, 209–210. P1/P0.**

Finance, Commercial and Executive are alternative fixture stages selected by a test harness; the runtime explicitly says `single-assigned-stage`. There are no administered profiles, required independent review, sequential approval, multiple-required approvals, pricing-specific routes, scoped authority limits, urgent treatment or notification delivery. Notify is an explicit runtime stub.

Evidence: [single stage](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115), [one backend approval](../../../../src/proposal/src/service.ts#L370), [Notify stub](../../../../src/notify/Dockerfile#L4).

**Decision:** define a bounded profile with supported pricing-specific fields and fixed canonical lifecycle. Sequential approval is MUST. Do **not** build arbitrary state graphs, scripts, executable routing expressions or general automation: the PRD explicitly excludes them.

### 8. Policy Authorisation is missing and must not be inferred from an exception approval

**FLOW-022–023, GOV-027–028; PROP-012, 021. PRD pages 156–157, 161–162, 187–189, 210–212. P1 capability; P0 correctness boundary.**

The PRD separates human Approval from the configured non-AI Authorised Within Policy path. Tenant opt-in is optional in FLOW-022, but GOV-027 says the system **must support configuration**, disabled by default. No such path/configuration/evaluation record exists. Backend `approveOverride` directly changes a blocked Proposal to approved; frontend exception approval instead returns a ready/blocked Draft requiring fresh submission/review. Neither behaviour is Policy Authorisation.

Evidence: [backend override promotion](../../../../src/proposal/src/service.ts#L716), [fixture override decision](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2105), [sample company toggle](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46).

**Decision:** explicitly model exception decisions, human item-level approvals and policy authorisations as different records. Policy eligibility consumes exact submitted snapshot, scope/authority, retained controls and configured thresholds; enablement or floor-clear alone grants nothing.

### 9. Margin floors are not yet the PRD's general, versioned Guardrail governance

**PROP-009, 011; GOV-023–025, 034; FLOW-008. PRD pages 153–156, 180–181, 206–209, 214–215. P0.**

The active path is Go Margin → authenticated Python deterministic Intelligence. That separation is real and valuable. Python collects matching rule IDs then calculates only `matched[0]`; the PRD requires every applicable Guardrail to remain separately evaluable. Margin maps confirmed breach **and evaluation error** to BLOCK, while proposal submission treats even incoming WARN as blocking. Warning/Approval Escalation/Blocking are not configurable distinct treatments.

Existing rule updates overwrite prior configuration while incrementing a number; deactivation does not even advance that number. Thus later reconstruction cannot recover the prior threshold/scope/treatment/active state from the rule table alone.

Evidence: [active delegation](../../../../src/margin/internal/handler/validate_batch.go#L82), [winning-rule calculation](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503), [violation mapping](../../../../src/margin/internal/handler/validate_batch.go#L132), [overwriting config](../../../../src/margin/internal/repo/repo.go#L77), [deactivation](../../../../src/margin/internal/repo/repo.go#L103).

**Decision:** distinguish organisational Guardrail from Strategy and Builder Rule; governance owns definition/applicability/treatment, analysis owns deterministic evaluation, downstream surfaces consume the same retained result. Preserve unknown separately from breach and version every consequential configuration.

### 10. Immutable events do not yet prove exact decision authority or execution readiness

**ORG-012–013; PROP-021–022; FLOW-012, 021, 030, 033–036; GOV-011, 034, 036–037. PRD pages 80–81, 161–162, 182, 186–187, 192–196, 201–202, 214–216. P0/P1.**

Forced-RLS append-only transitions and audit rows are meaningful foundations. However backend Approval records identify proposal ID, approver, creator and time—not exact controlled version, scope, permission/authority limits or workflow/policy configuration. Governance history endpoints are unimplemented. Publish and schedule require approved state and authenticated user, but not executor permission, scoped authority, current-version validity or the complete readiness predicate.

Evidence: [immutable grants](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L317), [Approval event](../../../../src/proposal/src/service.ts#L404), [audit stubs](../../../../src/governance/src/service.ts#L25), [publication checks](../../../../src/proposal/src/service.ts#L439), [schedule checks](../../../../src/proposal/src/service.ts#L1004).

**Acceptance:** reconstruct why exact vN was authorised, using authority/configuration valid at that time; current role/data changes do not reinterpret it. Execute/export only its current valid immutable baseline, attribute actual implementation, and retain original decisions after expiry/supersession/withdrawal.

## Role-code versus label reconciliation

The PRD's core role list is SHOULD; each role's mandatory boundary still applies. Conditional “may” examples do not require every listed activity in every role.

| PRD role | Current sample code | Backend evidence / unresolved mapping |
|---|---|---|
| Account Owner | `account_owner` | No ownership/member model or role check found |
| Workspace Admin | No sample identity | `admin` only for catalog reference administration; not a complete canonical role |
| Pricing Manager | `pricing_manager` | No role-specific server grant/evaluator |
| Pricing Analyst | `pricing_analyst` plus `import_admin` | No equivalent scoped analyst server contract |
| Pricing Contributor | `pricing_contributor` | Sample intake only; no Initiative contribution authority |
| Finance Approver | `approver` | Literal `approver` accepted, no financial scope/limit model |
| Commercial Approver | `commercial_approver` | Not recognised by `requireApproverRole` unless separately given `approver` |
| Executive Approver | `executive_approver` | Same issue; higher title must not bypass rules |
| Executor | `publisher` | Publish handler has no executor/publisher user-role guard |
| Viewer | `viewer` | No server default-deny read-only/field-scope mapping |
| Auditor | `governance_auditor` | Audit reads stubbed; no auditor-specific read-only grant |

Evidence: [fixture mapping](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45), [sample grants](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L78), [backend approval role](../../../../src/proposal/src/context.ts#L85), [catalog admin role](../../../../src/catalog/src/context.ts#L68).

Do not rename roles in isolation. Agree canonical role codes plus action/resource/scope grants, then adapt labels and contracts. Existing owner/analyst/commercial examples are explicitly labelled sample-only and should retain that honesty.

## Product decisions and bounded next work

1. **P0 authority/onboarding contract:** active membership + role/action/resource/scope + field visibility; current server enforcement and revocation; last-owner invariant. Fix contract semantics before connecting fixture flows to live writes.
2. **P0 Proposal model:** controlled version versus concurrency revision; same-version submit; complete snapshot; canonical decision statuses and independent validity. Ratify material versus optional non-material change rules.
3. **P1 Initiative and bounded workflow:** exactly-one parent; usable default profile; required review; ordered/multiple approval; authority limits; exact-profile retention and prospective configuration.
4. **P1/P0 policy path:** explicit, default-disabled non-AI Policy Authorisation configuration and evaluation, never inferred from margin exception approval. Decide the supported initial qualification fields without unrestricted expressions.
5. **P0 control model:** versioned Guardrails, separate per-applicable evaluation, canonical treatment and unknown handling; freeze configuration/results with decisions.
6. **P1 operational closure:** real workflow notifications, inspectable historical authority, current-valid authorised execution baseline and implementation linkage. Existing sample progress is not activation.

**Explicitly deferrable choices:** optional post-submission non-material editing (PROP-018/FLOW-018), authorised approval delegation (FLOW-027), and pre-irreversible-execution withdrawal (FLOW-028) are P3 only if explicitly deferred. This report is not itself that product approval. Deadlines (FLOW-025) and overdue escalation (FLOW-026) are SHOULD/P2: deferral needs a documented reason and must not weaken mandatory gates. Urgent marking (FLOW-024), sequential approval (FLOW-009), and Policy Authorisation configuration (GOV-027) must not be quietly moved into those optional buckets.

## Verification executed

All checks below were safe local pure tests against the inspected source; no service infrastructure or live writes were started.

| Working directory | Exact command | Result |
|---|---|---|
| `apps/workspace` | `node --test tests/data/*.test.mjs` | **155/155 passed**, 0 failed/skipped |
| `src/proposal` | `pnpm test:unit` | **61/61 passed**, 4 files |
| `src/governance` | `pnpm exec vitest run src/tests/unit` | **23/23 passed**, 3 files |
| `src/gateway` | `pnpm exec vitest run src/tests/auth.test.ts src/tests/auth-login.test.ts src/tests/margin-routes.test.ts src/tests/catalog-routes.test.ts` | **14/14 passed**, 4 files |

These results show consistency with **current implementation tests**, not satisfaction of 109 PRD requirements. In particular, existing state-machine and fixture-version expectations encode semantics the replacement PRD changes. Database RLS and service integrations were inspected in source; they were not executed against infrastructure in this audit. Browser/visual and broader suite results are owned by the lead audit and are not counted again here.

## Deliverables and change boundary

- [109-row matrix](roles-governance-matrix.json)
- This review, covering the same 109 IDs without blanket unsupported claims.

Only these two requested audit artifacts were authored. Existing application changes were not edited, reverted, committed or published.
