# Complete PRD requirement ledger

12 September 2026. **379 unique requirements; all 14 domains.** Read this alongside [the executive benchmark](MVP_PRD_BENCHMARK.md). This ledger is a benchmark, not a completed implementation checklist.

## How to read the classifications

Frontend `sample-complete` means only the narrow sample behaviour; `sample-partial` is a limited demonstration. Backend `implemented-source` credits the narrowly reviewed source implementation, not deployment. `conflicting` means an observed model or control-flow disagreement; `absent` is based on the documented source inventory. `unverified` may mark an excluded boundary rather than missing functionality. **All integration rows are not-connected because the workspace explicitly rejects live mode.** This is one shared integration blocker, not 379 independent failed integrations.

P0 = correctness/security/authority release gate; P1 = core journey work; P2 = bounded expected/optional follow-up requiring a scope decision; P3 = explicit boundary or optional deferral. Priorities do not replace the PRD’s Must/Should/May wording. Conditional AI/notification safety rows are gates before enabling those capabilities, not observed attacks or a demand to build every optional use case first. Acceptance entries are future tests, not passing-test claims. Full page-tagged source bodies and machine-readable evidence are in [REQUIREMENTS_MATRIX.json](REQUIREMENTS_MATRIX.json). Physical PDF page numbers include divider pages.

## ORG: Organisation, membership and access (14)

### ORG-001 — Organisation Workspace Creation

PRD physical p. 76 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No organisation creation/profile editing covering sector, country/markets, currency and time zone.

**Do not misrepresent:** Company access is a sample submission-policy screen, not onboarding.

**Closure criterion:** Authorised admin creates/edits tenant profile with required fields; other users/tenants cannot mutate it.

Frontend evidence: [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10).

### ORG-002 — Workspace Data Isolation

PRD physical pp. 76, 77 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample tenant checks and RLS exist; explicit active membership is not resolved; Governance trusts headers; several required resource families absent.

**Do not misrepresent:** Tenant IDs and RLS do not prove authorised membership or complete isolation.

**Closure criterion:** Exercise two tenants through API reads/writes, history and revoked membership; no cross-tenant resources or metadata leak.

Frontend evidence: [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/fixtureCompanyRequests.js:81](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L81); [apps/workspace/src/RoleWorkspace.jsx:98](../../../../apps/workspace/src/RoleWorkspace.jsx#L98); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:65](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L65); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/db.ts:23](../../../../src/proposal/src/db.ts#L23); [src/proposal/migrations/0002_proposal_foundation.up.sql:266](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L266); [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/governance/src/context.ts:8](../../../../src/governance/src/context.ts#L8); [src/governance/src/server.ts:59](../../../../src/governance/src/server.ts#L59).

### ORG-003 — User Invitation

PRD physical p. 77 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No invite model, acceptance, role/scope assignment or Pending/Accepted/Expired/Revoked lifecycle found.

**Do not misrepresent:** Access examples are fixtures, not provisioned members.

**Closure criterion:** Invite with roles/scope; accept once; expire/revoke; reject wrong-tenant/reused invitations; audit transitions.

Frontend evidence: [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10).

### ORG-004 — User Membership States

PRD physical p. 77 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Active/Suspended/Deactivated membership or immediate revocation; no historical membership authority snapshot.

**Do not misrepresent:** Sample sign-out is not suspension.

**Closure criterion:** Suspend an active member; their existing token cannot perform a further protected action; prior records retain identity.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1086](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1086); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404).

### ORG-005 — Roles and Access Assignment

PRD physical pp. 77, 78 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Fixed fixture capabilities and JWT role strings are not administered assignments; backend checker uses creator rather than submitter.

**Do not misrepresent:** Role labels/arrays do not establish configurable permissions.

**Closure criterion:** Admin changes multiple roles with audit; future access updates immediately and submitter still cannot approve.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:540](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L540); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2301](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2301); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### ORG-006 — Scope-Based Access

PRD physical p. 78 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No user grants combining role with category/channel/location/business-unit or other supported scope.

**Do not misrepresent:** Pricing selection filters are not user authority limits.

**Closure criterion:** Scope-limited user cannot read/submit/approve outside grants through filters, IDs or APIs.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:65](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L65); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### ORG-007 — Sensitive Information Access

PRD physical p. 78 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Fixture projections protect costs/derived fields; server costs and margin responses lack user field gating; admins cannot configure it.

**Do not misrepresent:** Viewer-safe fixture data is not a server cost boundary.

**Closure criterion:** Deny raw costs, reconstructable floors/margins and sensitive text on every supported channel for a cost-restricted participant.

Frontend evidence: [apps/workspace/src/data/fixtureEconomicsVisibility.js:3](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L3); [apps/workspace/src/data/fixtureEconomicsVisibility.js:10](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L10); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/routes/catalog.ts:95](../../../../src/gateway/src/routes/catalog.ts#L95); [src/catalog/src/service.ts:134](../../../../src/catalog/src/service.ts#L134); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:503](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503).

### ORG-008 — Workspace Administration

PRD physical pp. 78, 79 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** One toggle and reference/margin writes do not implement profile/member/role/scope/workflow/control administration.

**Do not misrepresent:** Sample Account Owner is not complete administration.

**Closure criterion:** Admin manages supported configuration with audit but cannot approve/execute without separately granted authority.

Frontend evidence: [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/fixtureOperationalRepositories.js:1049](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1049); [apps/workspace/src/data/fixtures/repricingPreviewV0.js:196](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L196); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/gateway/src/routes/margin.ts:104](../../../../src/gateway/src/routes/margin.ts#L104); [src/margin/internal/handler/rules.go:63](../../../../src/margin/internal/handler/rules.go#L63); [src/margin/cmd/server/main.go:66](../../../../src/margin/cmd/server/main.go#L66); [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10).

### ORG-009 — Account Ownership

PRD physical p. 79 · **P0** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Owner sample correctly lacks approval/execution; no persisted ownership, transfer or last-owner guard.

**Do not misrepresent:** Named fixture owner does not ensure administrative continuity.

**Closure criterion:** Reject removing/deactivating final owner; support atomic ownership transfer without pricing authority escalation.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### ORG-010 — Authentication and Session Access

PRD physical p. 79 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample sign-in/out and JWT validation/expiry exist; no integrated real identity/recovery/revocation.

**Do not misrepresent:** JWT unit tests and mock sign-in do not prove production authentication.

**Closure criterion:** Verify real sign-in/logout/recovery/expiry/invalid sessions and suspension with preserved work.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1086](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1086); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31); [src/gateway/src/clients/service-auth.ts:4](../../../../src/gateway/src/clients/service-auth.ts#L4); [src/proposal/src/context.ts:28](../../../../src/proposal/src/context.ts#L28).

### ORG-011 — Organisation Setup Progress

PRD physical pp. 79, 80 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No tracked essential setup path through users/data/controls/workflow and first Initiative.

**Do not misrepresent:** Sample queue is not setup progress.

**Closure criterion:** New tenant completes only essential setup and reaches a usable first Initiative.

Frontend evidence: [apps/workspace/src/WorkflowGuidance.jsx:19](../../../../apps/workspace/src/WorkflowGuidance.jsx#L19); [apps/workspace/src/data/fixtureOperationalRepositories.js:992](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L992); [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### ORG-012 — Administrative Auditability

PRD physical p. 80 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample policy before/after history exists; backend does not cover required administrative events or implement readable audit APIs.

**Do not misrepresent:** Append-only table does not mean all actions emit audit records.

**Closure criterion:** Capture actor/time/target/old/new for every consequential admin action and authorise chronological retrieval.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:44](../../../../src/governance/src/domain/event-mapper.ts#L44); [src/governance/src/service.ts:25](../../../../src/governance/src/service.ts#L25); [src/margin/internal/repo/repo.go:77](../../../../src/margin/internal/repo/repo.go#L77); [src/margin/internal/repo/repo.go:103](../../../../src/margin/internal/repo/repo.go#L103).

### ORG-013 — Deletion and Historical Integrity

PRD physical pp. 80, 81 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Snapshots and immutable transitions exist; deletion/config-change historical identity/role/scope preservation is incomplete.

**Do not misrepresent:** Actor IDs alone are not historical authority.

**Closure criterion:** After user removal/config change, prior work and decisions retain original identity and authority context.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:44](../../../../src/governance/src/domain/event-mapper.ts#L44); [src/governance/src/service.ts:25](../../../../src/governance/src/service.ts#L25).

### ORG-014 — Minimum Workspace Readiness

PRD physical p. 81 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No real-workspace readiness or first-real-workflow activation evaluator.

**Do not misrepresent:** Synthetic journey must not count as tenant readiness/activation.

**Closure criterion:** Readiness requires active tenant/admin/pricing user/data/controls/workflow; activation requires a completed real structured workflow.

Frontend evidence: [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17); [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

## DATA: Pricing data and context (21)

### DATA-001 — Priceable Entity

PRD physical pp. 83, 84 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Only SKU/variant pricing is represented. Product is a parent, not independently price-bearing; service and organisation-defined directly priceable offerings, entity-type/status management and manual creation are missing.

**Do not misrepresent:** Do not equate SKU coverage with the minimum Product/SKU/Service/custom-offering model; categories remain selectors in both implementations, which is correct.

**Closure criterion:** Create and manage each required entity type with an Owómidé ID/name/type/status, price a product directly without fabricating a SKU, and vary monetary contexts without duplicating the entity.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:369](../../../../apps/workspace/src/OperationalWorkspace.jsx#L369); [apps/workspace/src/data/fixtures/operationalWorkspaceV0.js:78](../../../../apps/workspace/src/data/fixtures/operationalWorkspaceV0.js#L78); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/catalog/v1/catalog.proto:69](../../../../src/lib/proto/services/catalog/v1/catalog.proto#L69); [src/catalog/src/write-engine.ts:213](../../../../src/catalog/src/write-engine.ts#L213).

### DATA-002 — Organisation Pricing Dimensions

PRD physical p. 84 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample dimensions are fixed. Backend offers reusable channel/location/customer-segment resources but no Initiative consumption or configurable relevant-dimension model beyond those resources.

**Do not misrepresent:** Location/channel fixtures are not organisation dimension configuration. The PRD says relevant dimensions 'such as'; it does not independently mandate every illustrative dimension.

**Closure criterion:** Configure reusable pilot-relevant dimensions, apply them consistently to records and Initiative scopes, and demonstrate reuse without per-Initiative recreation.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:369](../../../../apps/workspace/src/OperationalWorkspace.jsx#L369); [apps/workspace/src/data/fixtures/operationalWorkspaceV0.js:78](../../../../apps/workspace/src/data/fixtures/operationalWorkspaceV0.js#L78); [apps/workspace/src/OperationalWorkspace.jsx:750](../../../../apps/workspace/src/OperationalWorkspace.jsx#L750); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/catalog/v1/catalog.proto:69](../../../../src/lib/proto/services/catalog/v1/catalog.proto#L69); [src/gateway/src/routes/catalog.ts:138](../../../../src/gateway/src/routes/catalog.ts#L138); [src/catalog/src/service.ts](../../../../src/catalog/src/service.ts).

### DATA-003 — Price Record and Current Price

PRD physical pp. 84, 85, 86 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Temporal contextual Price Records exist, but Proposal scope/preview collapses records to SKU only and drops unpriced entities; exact PriceRecord identity is not retained. Import overlap supersession has no explicit ambiguity/correction selection workflow.

**Do not misrepresent:** 'Current price' in the sample is prepared numeric evidence, not proof of DATA-003 resolution. Catalog's as-of record query must not be described as a unique contextual resolver.

**Closure criterion:** Test one entity with different locations/currencies/segments, overlapping candidates, future/history and missing prices. Resolve exactly one eligible record or explicit unresolved/unavailable state; persist its exact ID/context and require authorised conflict resolution.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:369](../../../../apps/workspace/src/OperationalWorkspace.jsx#L369); [apps/workspace/src/data/fixtures/operationalWorkspaceV0.js:78](../../../../apps/workspace/src/data/fixtures/operationalWorkspaceV0.js#L78); [apps/workspace/src/workspacePresenter.js:35](../../../../apps/workspace/src/workspacePresenter.js#L35); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/catalog/v1/catalog.proto:69](../../../../src/lib/proto/services/catalog/v1/catalog.proto#L69); [src/catalog/migrations/0002_catalog_foundation.up.sql:197](../../../../src/catalog/migrations/0002_catalog_foundation.up.sql#L197); [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts); [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/catalog/src/write-engine.ts:213](../../../../src/catalog/src/write-engine.ts#L213).

### DATA-004 — Cost Record and Applicable Unit Cost

PRD physical pp. 86, 87, 88 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** CostRecord has type/location/currency/history, but no explicit compatible cost unit/basis selection. Active margin FetchCosts queries all candidate types/locations and overwrites by SKU, losing record identity and selecting arbitrarily.

**Do not misrepresent:** A currentCost amount and margin result must not be represented as a PRD-compliant Applicable Unit Cost. 'cost_type=standard' is not evidence that the correct basis was selected.

**Closure criterion:** Retain multiple bases/periods; require compatible unit, currency, dimensions and effective context; return selected record or explicit assumption ID/basis. Ambiguous selection needs an authorised choice; incompatible units must prevent cost-dependent calculation.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:369](../../../../apps/workspace/src/OperationalWorkspace.jsx#L369); [apps/workspace/src/data/fixtures/operationalWorkspaceV0.js:78](../../../../apps/workspace/src/data/fixtures/operationalWorkspaceV0.js#L78); [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/catalog/v1/catalog.proto:69](../../../../src/lib/proto/services/catalog/v1/catalog.proto#L69); [src/catalog/migrations/0002_catalog_foundation.up.sql:197](../../../../src/catalog/migrations/0002_catalog_foundation.up.sql#L197); [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts); [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66).

### DATA-005 — Historical Price and Cost Context

PRD physical p. 88 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Catalog preserves economic history and as-of reads. Sample Proposal versions retain source snapshots, but neither layer fully preserves exact source PriceRecord/CostRecord and cost basis/unit in the decision snapshot; backend draft line replacement is not immutable controlled history.

**Do not misrepresent:** Do not discard credit for real temporal Catalog storage, but do not claim it alone preserves every Proposal's decision basis.

**Closure criterion:** Change current workspace price/cost after submission, then retrieve every historical Proposal version and reproduce the original amounts, dimensions, basis/unit and exact source-record references without current-value substitution.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:369](../../../../apps/workspace/src/OperationalWorkspace.jsx#L369); [apps/workspace/src/data/fixtures/operationalWorkspaceV0.js:78](../../../../apps/workspace/src/data/fixtures/operationalWorkspaceV0.js#L78); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/catalog/migrations/0002_catalog_foundation.up.sql:197](../../../../src/catalog/migrations/0002_catalog_foundation.up.sql#L197); [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto).

### DATA-006 — Manual Data Entry

PRD physical pp. 88, 89 · **P1** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** Read-only Catalog has no manual entity/price/cost entry. Backend allows dimension administration and import writes, but UpsertCanonical requires IMPORT and no authorised manual economic-record command exists.

**Do not misrepresent:** A SourceType.MANUAL enum or editable Proposal title is not manual structured pricing-context entry.

**Closure criterion:** Authorised manual create/update must use the same record validation, provenance/audit and temporal-history rules as import; conflicting current-price candidates must remain unresolved until corrected.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:369](../../../../apps/workspace/src/OperationalWorkspace.jsx#L369); [apps/workspace/src/data/fixtures/operationalWorkspaceV0.js:78](../../../../apps/workspace/src/data/fixtures/operationalWorkspaceV0.js#L78); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/routes/catalog.ts:138](../../../../src/gateway/src/routes/catalog.ts#L138); [src/catalog/src/service.ts](../../../../src/catalog/src/service.ts); [src/catalog/src/write-engine.ts:213](../../../../src/catalog/src/write-engine.ts#L213).

### DATA-007 — CSV Import

PRD physical pp. 89, 90 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Frontend runs supplied sample CSV only. Backend source supports real CSV/XLSX staging and canonical economic writes, but cost unit/basis mapping and contextual current-price ambiguity handling are incomplete; overlapping imported prices are superseded without a separate conflict choice.

**Do not misrepresent:** The sample explicitly does not upload the user's device file. Real pipeline source exists, but no current workspace-to-pipeline connection or end-to-end proof is available.

**Closure criterion:** Import an actual CSV with identifiers, names, dimensions and price/cost provenance; review mappings/issues before commit. Preserve prior economic rows and block unresolved context conflicts; CSV remains available without a connector.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:564](../../../../apps/workspace/src/OperationalWorkspace.jsx#L564); [apps/workspace/src/data/fixtureOperationalRepositories.js:461](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L461); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/service.py:407](../../../../src/data-pipeline/owomide_data_pipeline/service.py#L407); [src/data-pipeline/owomide_data_pipeline/mapping.py:85](../../../../src/data-pipeline/owomide_data_pipeline/mapping.py#L85); [src/data-pipeline/owomide_data_pipeline/canonical.py:121](../../../../src/data-pipeline/owomide_data_pipeline/canonical.py#L121); [src/catalog/src/write-engine.ts:213](../../../../src/catalog/src/write-engine.ts#L213).

### DATA-008 — Import Mapping

PRD physical p. 90 · **P1** · Frontend: sample-partial · Backend: implemented-source · Integration: not-connected

**Assessment:** The sample offers reviewed prepared mappings, not arbitrary column mapping. Backend source has mappings/transforms and precommit validation, but it is not connected to this frontend.

**Do not misrepresent:** Credit source-backed mapping/validation, not a live user-import journey.

**Closure criterion:** Connect arbitrary CSV header mapping and precommit row/field validation to the existing service; exercise recognised/unmapped/required/invalid/duplicate rows and verify no commit before review.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:564](../../../../apps/workspace/src/OperationalWorkspace.jsx#L564); [apps/workspace/src/data/fixtureOperationalRepositories.js:461](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L461); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/service.py:407](../../../../src/data-pipeline/owomide_data_pipeline/service.py#L407); [src/data-pipeline/owomide_data_pipeline/mapping.py:85](../../../../src/data-pipeline/owomide_data_pipeline/mapping.py#L85); [src/data-pipeline/owomide_data_pipeline/canonical.py:121](../../../../src/data-pipeline/owomide_data_pipeline/canonical.py#L121); [src/data-pipeline/owomide_data_pipeline/validation.py:232](../../../../src/data-pipeline/owomide_data_pipeline/validation.py#L232); [src/data-pipeline/owomide_data_pipeline/repository.py:1754](../../../../src/data-pipeline/owomide_data_pipeline/repository.py#L1754); [src/catalog/src/write-engine.ts](../../../../src/catalog/src/write-engine.ts).

### DATA-009 — Import Error Handling

PRD physical p. 90 · **P1** · Frontend: sample-partial · Backend: implemented-source · Integration: not-connected

**Assessment:** Sample shows partial/unknown/rejected row outcomes and reconciliation but lacks general row edit/retry. Backend EditRow/ExcludeRow and per-row commit savepoints provide source-backed correction and isolation, not integrated proof.

**Do not misrepresent:** Successful fixture reconciliation does not prove actual CSV row correction or database isolation in the current UI.

**Closure criterion:** Fail one row beside valid rows, show field/reason and imported/skipped/failed states, correct/retry the failed row without duplicating/corrupting successful records, and verify backend transaction outcomes.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:564](../../../../apps/workspace/src/OperationalWorkspace.jsx#L564); [apps/workspace/src/data/fixtureOperationalRepositories.js:461](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L461); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/service.py:407](../../../../src/data-pipeline/owomide_data_pipeline/service.py#L407); [src/data-pipeline/owomide_data_pipeline/validation.py:232](../../../../src/data-pipeline/owomide_data_pipeline/validation.py#L232); [src/data-pipeline/owomide_data_pipeline/repository.py:1754](../../../../src/data-pipeline/owomide_data_pipeline/repository.py#L1754); [src/catalog/src/write-engine.ts](../../../../src/catalog/src/write-engine.ts); [src/catalog/src/write-engine.ts:213](../../../../src/catalog/src/write-engine.ts#L213).

### DATA-010 — Duplicate Handling

PRD physical p. 91 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Reliable SKU identity and within-batch duplicate checks exist; matched entities are automatically enriched/upserted, while the sample only supplies prepared duplicate outcomes. No complete per-match update/skip/resolve choice is established.

**Do not misrepresent:** Identity uniqueness is necessary but does not satisfy the user's explicit control over a matching imported identifier.

**Closure criterion:** For an existing reliable organisation identifier, show the matching record and authorised update/skip/resolve choices; test ambiguous external IDs and retries without duplicate Priceable Entities.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:564](../../../../apps/workspace/src/OperationalWorkspace.jsx#L564); [apps/workspace/src/data/fixtureOperationalRepositories.js:461](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L461); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/validation.py:232](../../../../src/data-pipeline/owomide_data_pipeline/validation.py#L232); [src/data-pipeline/owomide_data_pipeline/repository.py:1754](../../../../src/data-pipeline/owomide_data_pipeline/repository.py#L1754); [src/catalog/src/write-engine.ts](../../../../src/catalog/src/write-engine.ts); [src/catalog/src/write-engine.ts:213](../../../../src/catalog/src/write-engine.ts#L213).

### DATA-011 — Data Source and Provenance

PRD physical p. 91 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Import/source IDs and times are retained in Catalog and sample provenance; consequential backend Proposal lines do not retain exact record linkage. Evidence-to-structured-data conversion and connector provenance have no implemented journey.

**Do not misrepresent:** Do not treat a source label or attachment as an authoritative Price/Cost Record; retained temporal records do not by themselves establish the Proposal-to-record link.

**Closure criterion:** Follow each consequential price/cost from source system/import/user/evidence through a validated canonical record into the exact Proposal snapshot, retaining available actor/time and distinguishing evidence from structured authority.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:369](../../../../apps/workspace/src/OperationalWorkspace.jsx#L369); [apps/workspace/src/data/fixtures/operationalWorkspaceV0.js:78](../../../../apps/workspace/src/data/fixtures/operationalWorkspaceV0.js#L78); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/catalog/v1/catalog.proto:69](../../../../src/lib/proto/services/catalog/v1/catalog.proto#L69); [src/catalog/migrations/0002_catalog_foundation.up.sql:197](../../../../src/catalog/migrations/0002_catalog_foundation.up.sql#L197); [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts); [src/data-pipeline/owomide_data_pipeline/service.py:407](../../../../src/data-pipeline/owomide_data_pipeline/service.py#L407); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255).

### DATA-012 — Data Freshness

PRD physical p. 92 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample exposes source/effective and stale-cost states; Catalog has recorded/effective timestamps. No Initiative freshness view exists, and Proposal's active cost fetch loses record timestamp/context.

**Do not misrepresent:** The sample is correctly labelled non-live. An effective date alone is not necessarily last-updated age or source retrieval freshness.

**Closure criterion:** Display last-updated/source-retrieval age where known in Catalog and consuming work, distinguish effective time from freshness, and retain the ages used in submitted decisions without claiming imports are real-time.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:369](../../../../apps/workspace/src/OperationalWorkspace.jsx#L369); [apps/workspace/src/data/fixtures/operationalWorkspaceV0.js:78](../../../../apps/workspace/src/data/fixtures/operationalWorkspaceV0.js#L78); [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/catalog/v1/catalog.proto:69](../../../../src/lib/proto/services/catalog/v1/catalog.proto#L69); [src/catalog/migrations/0002_catalog_foundation.up.sql:197](../../../../src/catalog/migrations/0002_catalog_foundation.up.sql#L197); [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255).

### DATA-013 — Pricing Context Snapshot

PRD physical pp. 92, 93 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample revision snapshots preserve its prepared scope/rule/preview and reasons, but omit exact economic record IDs and cost basis/unit/assumption context. Backend ProposalLine preserves numbers, not the complete controlled material context.

**Do not misrepresent:** Do not call an amount-only snapshot or catalogVersion an exact PriceRecord/Applicable Unit Cost decision snapshot.

**Closure criterion:** At submission retain exact price/cost record or assumption IDs, dimensions/currency/unit/basis/effective/source/freshness, and show unchanged retrieval after workspace updates across multiple revision cycles.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/workspacePresenter.js:35](../../../../apps/workspace/src/workspacePresenter.js#L35); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto); [src/catalog/migrations/0002_catalog_foundation.up.sql:197](../../../../src/catalog/migrations/0002_catalog_foundation.up.sql#L197); [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts).

### DATA-014 — Pricing Scope Selection

PRD physical pp. 93, 94 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Frontend scope selectors are fixed. Backend's bounded channel/category/product/segment/query DSL preserves selectors but omits location/direct entity selection and truncates to one 500-SKU page; SKU-only price mapping cannot represent exact contextual combinations.

**Do not misrepresent:** Prepared 1,248-row sample scope is not proof that the backend resolves 1,248 entities; category is correctly not itself the price-bearing object.

**Closure criterion:** Resolve the full selected group into explicit entity/dimension combinations, retain selector plus membership, expose missing/ambiguous entries, paginate all members and freeze the resolved scope before submission.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:750](../../../../apps/workspace/src/OperationalWorkspace.jsx#L750); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/scope-dsl.ts](../../../../src/proposal/src/domain/scope-dsl.ts); [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769).

### DATA-015 — Bulk Pricing Scope

PRD physical p. 94 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Common sample logic applies to a prepared multi-SKU scope. Backend bulk construction resolves only 500 SKUs and silently drops unpriced members; no Initiative object or complete entity-level exceptions/missing-input coverage exists.

**Do not misrepresent:** A bulk aggregate or sample row count cannot stand in for full-scope backend processing.

**Closure criterion:** Apply one action to a group above 500 members; prove every resolved member has an outcome, exception or explicit unavailable status, and reconcile totals without separate Initiatives per SKU.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:750](../../../../apps/workspace/src/OperationalWorkspace.jsx#L750); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/scope-dsl.ts](../../../../src/proposal/src/domain/scope-dsl.ts); [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769).

### DATA-016 — Data Validation

PRD physical pp. 94, 95 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Format/currency/date/reference validation and sample source blockers exist, but backend calculations can still consume SKU-collapsed price/cost candidates without unit/basis/context compatibility and ambiguity checks.

**Do not misrepresent:** Passing import validation or a non-null Money value is not sufficient validation for consequential economic calculations.

**Closure criterion:** Gate calculation/submission on exact current-price and applicable-unit-cost validity; retain contextual/historical records without using ambiguous/incompatible values and expose field/entity-specific errors instead of silent correction.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:564](../../../../apps/workspace/src/OperationalWorkspace.jsx#L564); [apps/workspace/src/data/fixtureOperationalRepositories.js:461](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L461); [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/validation.py:232](../../../../src/data-pipeline/owomide_data_pipeline/validation.py#L232); [src/data-pipeline/owomide_data_pipeline/repository.py:1754](../../../../src/data-pipeline/owomide_data_pipeline/repository.py#L1754); [src/catalog/src/write-engine.ts](../../../../src/catalog/src/write-engine.ts); [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66).

### DATA-017 — Restricted Pricing Context

PRD physical p. 95 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample responses redact direct/derived economics including nested revision history. Gateway /catalog/costs returns full records and Catalog batchGetCosts uses readContext service authentication without a distinct end-user economics permission/projection; absent AI/export surfaces remain unproven.

**Do not misrepresent:** Frontend redaction does not establish server confidentiality. Tenant/service authentication is not field-level restricted-economics authorisation.

**Closure criterion:** Use a restricted principal against direct catalog/proposal/analysis endpoints and prove costs, derived reversible metrics, nested snapshots, exports and AI context are omitted server-side; verify authorised users still receive exact evidence.

Frontend evidence: [apps/workspace/src/data/fixtureEconomicsVisibility.js](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/routes/catalog.ts:138](../../../../src/gateway/src/routes/catalog.ts#L138); [src/catalog/src/service.ts](../../../../src/catalog/src/service.ts); [src/lib/proto/services/catalog/v1/catalog.proto:69](../../../../src/lib/proto/services/catalog/v1/catalog.proto#L69).

### DATA-018 — Archiving

PRD physical p. 95 · **P1** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** Backend Product/SKU schemas contain archived status and reads exclude archived current entities, but no authorised archive command is exposed; frontend has no archive action or historical retrieval proof for archived entities.

**Do not misrepresent:** A stored archived flag is not an archive workflow, and hiding archived rows must not erase historical proposal context.

**Closure criterion:** Archive an authorised entity, prevent new active selection while preserving exact identity and economic history in prior work, and reject unauthorised archival.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:369](../../../../apps/workspace/src/OperationalWorkspace.jsx#L369); [apps/workspace/src/data/fixtures/operationalWorkspaceV0.js:78](../../../../apps/workspace/src/data/fixtures/operationalWorkspaceV0.js#L78); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/catalog/v1/catalog.proto:69](../../../../src/lib/proto/services/catalog/v1/catalog.proto#L69); [src/gateway/src/routes/catalog.ts:138](../../../../src/gateway/src/routes/catalog.ts#L138); [src/catalog/src/service.ts](../../../../src/catalog/src/service.ts); [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts).

### DATA-019 — Pricing Context Search and Filtering

PRD physical pp. 95, 96 · **P2** · Frontend: sample-complete · Backend: partial-source · Integration: not-connected

**Assessment:** The fixture supports useful catalog search/filter for its SKU domain. Backend supports identifiers/query/category/product/channel with pagination, but the broader entity model, relevant additional dimensions and integrated access-scoped UI are incomplete.

**Do not misrepresent:** Credit the functioning sample search; do not generalise SKU search to all required entity types or all illustrative dimensions.

**Closure criterion:** Connect access-scoped entity search to real records and demonstrate available identifiers and pilot-relevant dimensions, pagination and empty states; extend results to required non-SKU entities.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:369](../../../../apps/workspace/src/OperationalWorkspace.jsx#L369); [apps/workspace/src/data/fixtures/operationalWorkspaceV0.js:78](../../../../apps/workspace/src/data/fixtures/operationalWorkspaceV0.js#L78); [apps/workspace/src/data/fixtureOperationalRepositories.js:373](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L373); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts); [src/lib/proto/services/catalog/v1/catalog.proto:69](../../../../src/lib/proto/services/catalog/v1/catalog.proto#L69).

### DATA-020 — Minimum Context Requirement

PRD physical p. 96 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample separates unpriced/source-blocked/policy issues but only for prepared work. Backend can create sparse Proposal drafts, yet silently drops missing-price scope members and lacks separate optional/workflow/calculation/decision requirement classes.

**Do not misrepresent:** Allowing a sparse draft is not the same as preserving missing information visibly through readiness; silently removed entities make a scope look more complete than it is.

**Closure criterion:** Begin an Initiative with sparse context, then expose only the inputs required for each selected action/guardrail/stage; do not block optional context or permit unresolved mandatory inputs to disappear before submission.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:750](../../../../apps/workspace/src/OperationalWorkspace.jsx#L750); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/margin/internal/handler/validate_batch.go:22](../../../../src/margin/internal/handler/validate_batch.go#L22).

### DATA-021 — Bounded External Data Integration

PRD physical pp. 96, 97, 98 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Targeted connector/external-sync source and route search found no selected business/productivity connector. CSV and explicit FX conversion are useful adjacent features, not the bounded external data-integration capability.

**Do not misrepresent:** Older handoff deferrals cannot override the replacement PRD: capability is must; at least one validated-pilot connector is should. Universal synchronisation and additional connectors are explicitly not automatic MVP scope.

**Closure criterion:** Select a validated pilot connector and provide bounded authorised import with retrieval/source times through canonical Price/Cost Records, explicit unresolved selection, safe failure and continued CSV/manual fallback; do not promise real-time or bidirectional sync.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/OperationalWorkspace.jsx:564](../../../../apps/workspace/src/OperationalWorkspace.jsx#L564); [apps/workspace/src/data/fixtureOperationalRepositories.js:461](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L461); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/service.py:407](../../../../src/data-pipeline/owomide_data_pipeline/service.py#L407); [src/data-pipeline/owomide_data_pipeline/service.py:796](../../../../src/data-pipeline/owomide_data_pipeline/service.py#L796); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

## INIT: Pricing Initiatives (21)

### INIT-001 — Create Pricing Initiative

PRD physical p. 100 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Pricing Initiative create route/model exists; repricing-scope name and Proposal title/actor omit Initiative objective/type/owner/scope/urgency as a persistent separate object.

**Do not misrepresent:** Do not relabel a ChangeSet or Proposal as the Initiative without the required container semantics.

**Closure criterion:** Create an authorised Initiative with title, objective/reason, type, accountable owner, scope and priority; allow other optional context to be added later.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/OperationalWorkspace.jsx:750](../../../../apps/workspace/src/OperationalWorkspace.jsx#L750); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/RoleWorkspace.jsx](../../../../apps/workspace/src/RoleWorkspace.jsx); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-002 — Initiative Types

PRD physical pp. 100, 101 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Initiative type field or workflow exists. Sample price increases and backend's four numerical actions do not cover the required common work-type model.

**Do not misrepresent:** Action operators are not Initiative types; not every type needs a separate rigid workflow.

**Closure criterion:** Support the PRD's bounded common work types plus organisation-defined work, with shared flexible Initiative development and no forced SKU-only assumptions for new service pricing.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts).

### INIT-003 — Pricing Objective

PRD physical p. 101 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No persistent Initiative objective or free-text business-purpose field is present. A Proposal title or review reason is not a pricing objective.

**Do not misrepresent:** An explanatory adjustment sentence describes arithmetic, not why the organisation is undertaking the work.

**Closure criterion:** Require a clearly defined objective, support free-text beyond predefined choices, and carry it visibly into builder, analysis and Proposal preparation.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-004 — Initiative Scope

PRD physical pp. 101, 102 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Prepared scope/version snapshots and a backend ChangeSet scope DSL are reusable foundations, but no Initiative scope association exists; backend resolves incomplete SKU/context membership and no controlled group-change history.

**Do not misrepresent:** Categories are correctly selectors; a saved selector alone is not the exact entity/dimension scope required at submission.

**Closure criterion:** Attach selector and resolved entity/dimension membership to an Initiative, record consequential changes, show current group membership and freeze exact submission membership without later group changes rewriting it.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:750](../../../../apps/workspace/src/OperationalWorkspace.jsx#L750); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/scope-dsl.ts](../../../../src/proposal/src/domain/scope-dsl.ts); [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-005 — Initiative Ownership

PRD physical p. 102 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Proposal authorship/submission-owner handoff exists in the sample, not an accountable Initiative owner with transferable, recorded ownership.

**Do not misrepresent:** Proposal submission ownership must not be silently promoted to Initiative ownership or approval/execution authority.

**Closure criterion:** Maintain one accountable active Initiative owner, permit authorised transfer with actor/time history, and prove ownership does not grant approval or execution rights.

Frontend evidence: [apps/workspace/src/RoleWorkspace.jsx](../../../../apps/workspace/src/RoleWorkspace.jsx); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-006 — Collaborators

PRD physical p. 102 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Initiative participant list or add/remove collaborator command exists. Sample manager handoff and Proposal comments cover narrower activities.

**Do not misrepresent:** A participant or mention must not be treated as an organisation permission grant.

**Closure criterion:** Add relevant Initiative participants under explicit permissions and demonstrate each can only perform organisation-authorised contribution/review/implementation actions.

Frontend evidence: [apps/workspace/src/RoleWorkspace.jsx](../../../../apps/workspace/src/RoleWorkspace.jsx); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-007 — Initiative Summary

PRD physical p. 103 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Visible Proposal next steps and work-item summaries improve task understanding, but no persistent Initiative summary combines objective/type/owner/scope/lifecycle/urgency with current Proposal and next responsibility.

**Do not misrepresent:** The stage-labelled work queue does not purport to be an Initiative summary; do not retrofit that claim from its cleaner UX.

**Closure criterion:** Provide a persistent readable Initiative summary with every minimum field and exact current Proposal/next participant, without reconstructing it from activity history.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkflowGuidance.jsx](../../../../apps/workspace/src/WorkflowGuidance.jsx); [apps/workspace/src/RoleWorkspace.jsx](../../../../apps/workspace/src/RoleWorkspace.jsx); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-008 — Lifecycle State

PRD physical p. 103 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Initiative lifecycle model covers Initiated through Completed/Cancelled separately from Proposal decision states.

**Do not misrepresent:** Proposal Draft/Submitted/Approved/Returned and import/preview stages must not be substituted for Initiative lifecycle states.

**Closure criterion:** Expose all required primary Initiative lifecycle states and keep Approved/Rejected/Changes Requested/Authorised Within Policy exclusively Proposal decision states.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkflowGuidance.jsx](../../../../apps/workspace/src/WorkflowGuidance.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-009 — Controlled State Transitions

PRD physical p. 104 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Sample Proposal transition guards are useful but no Initiative transition engine, auditable lifecycle movement or return-to-development orchestration exists.

**Do not misrepresent:** Valid Proposal transitions cannot prove Initiative readiness, implementation confirmation or completion conditions.

**Closure criterion:** Exercise guarded Initiative transitions for development/review/approval/execution/implementation/completion, reject unresolved conditions and log actor/time; requested revisions return the Initiative to its appropriate earlier state.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255).

### INIT-010 — Initiative Priority and Urgency

PRD physical pp. 104, 105 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Queue ordering/issue urgency is prepared presentation, not an editable Initiative priority/urgency model.

**Do not misrepresent:** A highlighted blocker or due date is not recorded user-defined work priority, and urgency must never bypass governance.

**Closure criterion:** Allow authorised users to indicate bounded priority/urgency, use it consistently in work discovery, and show urgent work still requires the same decision/execution authority.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkflowGuidance.jsx](../../../../apps/workspace/src/WorkflowGuidance.jsx); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-011 — Target and Effective Dates

PRD physical p. 105 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample proposed effective date is versioned; economic records have effective periods. Initiative target decision/expiry date support and consequential date-change history are absent.

**Do not misrepresent:** PriceRecord effective time is not an Initiative decision deadline; Proposal effective date alone is incomplete.

**Closure criterion:** Where relevant, retain visible target-decision, proposed-effective and expiry dates on the Initiative and record consequential changes with their controlled-version effects.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/lib/proto/services/catalog/v1/catalog.proto:69](../../../../src/lib/proto/services/catalog/v1/catalog.proto#L69).

### INIT-012 — Initiative Context Aggregation

PRD physical pp. 105, 106 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Initiative organising view links authoritative context, Evidence, explicit Assumptions, builder, Scenarios, decisions/execution and monitoring while preserving originating objects/versions.

**Do not misrepresent:** Proposal tabs and attachments are not a canonical Initiative Context object; the PRD expressly forbids creating a competing information type with that name.

**Closure criterion:** Aggregate references in one Initiative view without copying canonical Price/Cost Records or promoting Evidence/comments/Assumptions to verified data; enforce each source object's permissions and version provenance.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/lib/proto/services/catalog/v1/catalog.proto:69](../../../../src/lib/proto/services/catalog/v1/catalog.proto#L69).

### INIT-013 — Initiative-Level Assumptions

PRD physical pp. 106, 107 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No explicit Assumption resource, editor, applicability/version linkage or historical preservation exists; numerical adjustment parameters and review comments are not labelled assumptions.

**Do not misrepresent:** Do not infer assumptions from comments, imported cost defaults or AI-inference fields; none satisfy the required explicit information class.

**Closure criterion:** Record material assumed value/premise and responsible user with applicability, rationale/evidence, time/version; distinguish verified inputs/targets/AI/comments and retain the original assumption in submitted history after verified replacement.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts).

### INIT-014 — Initiative Readiness

PRD physical p. 107 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample Proposal next-step/source blockers and backend margin submission gate provide narrower checks, but no Initiative readiness determination for objective, action, analysis, scope and required information.

**Do not misrepresent:** A margin result or enabled create-Proposal button is not evidence of full Initiative readiness.

**Closure criterion:** Before formal review identify every missing mandatory Initiative requirement and explain its action; permit optional context to remain absent and use authoritative guardrail/readiness results.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkflowGuidance.jsx](../../../../apps/workspace/src/WorkflowGuidance.jsx); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/margin/internal/handler/validate_batch.go:22](../../../../src/margin/internal/handler/validate_batch.go#L22); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-015 — Initiative Duplication

PRD physical pp. 107, 108 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No create-new-Initiative-from-existing operation exists. Sample startRevision deliberately revises the same Proposal and is not duplication.

**Do not misrepresent:** Do not count same-Proposal revision as the should-level duplication capability; the no-transfer-of-authority invariant is mandatory if reuse is provided.

**Closure criterion:** Should support a new Initiative from permitted prior structure with new editable identity, fresh governance evaluation and no copied valid approvals, policy authorisations or execution authority.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-016 — Initiative Search and Filtering

PRD physical p. 108 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Catalog/Proposal/queue search exists only for those resources; no Initiative search/list/filter projection by title/owner/lifecycle/type/urgency/scope/dates exists.

**Do not misrepresent:** Searching stage work items or SKUs is not access-scoped Initiative discovery.

**Closure criterion:** List/search accessible Initiatives with relevant identity, responsibility, lifecycle and scope/date criteria; verify other users' forbidden scopes do not leak through counts or results.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkflowGuidance.jsx](../../../../apps/workspace/src/WorkflowGuidance.jsx); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts).

### INIT-017 — Personal Work Visibility

PRD physical pp. 108, 109 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample Needs me queue surfaces stage-specific work and next actor; backend has Proposal status/actor foundations, not complete Initiative attention across owner/collaborator/reviewer/approver/implementation/mentions.

**Do not misrepresent:** Unique work-item counts and explicit overlapping line counts are honest UX; they must not be labelled unique Initiative counts without source identity.

**Closure criterion:** Build an authorised Initiative attention projection from explicit responsibility/assignment and current state, preserve linked stage identities, and reconcile counts without double-counting entities or inventing linkage.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkflowGuidance.jsx](../../../../apps/workspace/src/WorkflowGuidance.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255).

### INIT-018 — Hold and Cancel

PRD physical p. 109 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Initiative On Hold/Cancel command or retained lifecycle context exists. Backend ChangeSet discard is a different object/action.

**Do not misrepresent:** Proposal expiry/rejection/discard must not masquerade as Initiative On Hold or cancellation.

**Closure criterion:** Authorised Hold and Cancel record actor/time/reason; Hold preserves lifecycle context for resumption and Cancel retains all work/history without deleting underlying records or recasting Proposal validity.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-019 — Initiative Completion

PRD physical pp. 109, 110 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Initiative completion command, resolved-end-state check or completed read-only historical boundary exists.

**Do not misrepresent:** Proposal publication or operations completion alone is not complete Initiative resolution/monitoring history.

**Closure criterion:** Only complete after applicable workflow resolution, capture decision/execution/outcome/date where relevant, freeze consequential history and allow only separately auditable permitted annotations/corrections.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-020 — Initiative Historical Integrity

PRD physical p. 110 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample retains controlled Proposal revision lineage; Catalog retains economic history. No persistent Initiative relationship chain connects objective, analysis, pricing logic, decision authority, implementation and outcome.

**Do not misrepresent:** Credit real partial history without describing it as the full objective-to-outcome Initiative record.

**Closure criterion:** Retrieve a completed Initiative and navigate the exact objective/context/analysis/logic/Proposal/decision/execution/outcome versions, including revisions, without external communication or current-value reinterpretation.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/catalog/migrations/0002_catalog_foundation.up.sql:197](../../../../src/catalog/migrations/0002_catalog_foundation.up.sql#L197); [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### INIT-021 — Initiative and Proposal Separation

PRD physical p. 110 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Repricing working material is separate from Proposal, and sample controlled revisions retain one Proposal identity. The required broader Initiative and independent Scenario objects are absent; backend lacks controlled Proposal version selection.

**Do not misrepresent:** ChangeSet→Proposal is a useful narrower separation, not the PRD's Initiative→Builder/Scenarios→current Proposal hierarchy.

**Closure criterion:** Persist distinct Initiative, working builder/Scenario and controlled Proposal objects; allow exploration and historical/revised proposals in one Initiative while only its current valid Proposal version can progress.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:750](../../../../apps/workspace/src/OperationalWorkspace.jsx#L750); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto).

## BUILD: Pricing Builder (24)

### BUILD-001 — Builder Within Pricing Initiative

PRD physical p. 112 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Prepared adjustment work relates to scope/preview/Proposal, but not a Pricing Initiative, independent Scenarios or a general contributor-aware working builder.

**Do not misrepresent:** An adjustment screen is a bounded construction foundation, not the full Collaborative AI Pricing Builder.

**Closure criterion:** Make each active Initiative's builder accessible with explicit Initiative/scope/working-version/creator/contributor/context/Scenario references and no disconnected calculator state.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts).

### BUILD-002 — Pricing Action Definition

PRD physical pp. 112, 113 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample permits three prepared increase outcomes; backend repricing supports four adjustments. Direct new price, user target margin/markup, new offering pricing and bounded custom/qualitative actions are not builder capabilities.

**Do not misrepresent:** Margin/markup floor evaluation is an organisational guardrail, not a user-defined target-price strategy. The listed action menu is should, but supported quantitative actions must obey the required deterministic definitions.

**Closure criterion:** Define intended action and supported structured components; provide required ANALYSIS-002 formulas and distinguish directly entered/qualitative/unsupported values from calculated outputs. Support the bounded recommended action breadth without arbitrary executable code.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:237](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L237); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82).

### BUILD-003 — Pricing Objective Context

PRD physical p. 113 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Initiative objective exists to inherit or update in the builder; arithmetic consequence copy is the only purpose-like context.

**Do not misrepresent:** 'Increase each price' explains an operator, not objective→logic→proposed action.

**Closure criterion:** Display the Initiative's current objective beside structured logic/action and reflect material objective changes in working and controlled-version context.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts).

### BUILD-004 — Scope-Aware Construction

PRD physical pp. 113, 114 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample preserves a prepared selector and snapshot, but arbitrary entity/dimension construction is unavailable; backend's one-page SKU-only price map cannot preserve the complete affected commercial scope.

**Do not misrepresent:** Group selectors are correctly not priced as entities. The unresolved issue is full membership/context and controlled freeze, not demanding every illustrative selector.

**Closure criterion:** Preserve selector plus fully resolved entities/dimensions, make scope legible in construction, record working membership changes, and freeze the exact commercial scope incorporated into submission.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:750](../../../../apps/workspace/src/OperationalWorkspace.jsx#L750); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/scope-dsl.ts](../../../../src/proposal/src/domain/scope-dsl.ts); [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769).

### BUILD-005 — Structured Pricing Logic

PRD physical pp. 114, 115 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Machine-readable adjustment type/value exists; no builder-owned conditions, thresholds, initiative constraints or effective-period logic AST. Backend's typed all/any condition engine belongs to MarginRules, not a Pricing Strategy editor.

**Do not misrepresent:** Do not relabel organisational margin policies as user Pricing Strategy rules; builder thresholds must not create organisational Guardrails.

**Closure criterion:** Represent action/input/operator/value/condition/threshold/initiative constraint/effective period as bounded machine-readable components with understandable rendering and references to independent authoritative governance.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:59](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L59).

### BUILD-006 — Human-Readable Representation

PRD physical p. 115 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Prepared adjustment consequence and formula copy is clear, but broader logic, conditional failure behavior, exceptions and complete entity scope have no representation. Backend has structured values, not a full human-readable logical explanation contract.

**Do not misrepresent:** Credit the sample's clearer adjustment-versus-policy wording; do not claim understandable arbitrary conditional pricing logic.

**Closure criterion:** Render every supported structured action/condition in business language, showing what changes, inputs, exact affected entities, constraints and unsatisfied-condition behavior.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/proposal/src/domain/scope-dsl.ts](../../../../src/proposal/src/domain/scope-dsl.ts).

### BUILD-007 — Supported Pricing Inputs

PRD physical pp. 115, 116 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Current price and cost/margin work only within prepared evidence. Backend can choose a different location/cost type via SKU-only collapse; explicit cost basis/unit and manually supplied variables/parameters are absent.

**Do not misrepresent:** A shared SKU ID is not sufficient applicability; CostRecord Money is not automatically Applicable Unit Cost.

**Closure criterion:** Reference supported resolved inputs with record/assumption provenance and context; preserve missing/unresolved states and reject cross-location/channel/currency/cost-basis/unit substitution.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts).

### BUILD-008 — Parameters and Assumptions

PRD physical p. 116 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Only a small adjustment parameter/effective date exists. No typed assumption input, assumed-cost basis/currency/unit or distinction from verified context is persisted.

**Do not misrepresent:** A saved percentage or commercial target is not necessarily an Assumption, and a fixture cost cannot be relabelled assumed after calculation.

**Closure criterion:** Define known parameters separately from explicit assumptions, retain assumed cost amount/basis/currency/unit and responsible provenance, and show the distinction throughout preview and controlled snapshots.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### BUILD-009 — Conditions

PRD physical p. 117 · **P1** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** Sample offers no user condition editor. Backend scope filters and governance's bounded condition interpreter are adjacent primitives; no builder-owned pricing conditions persist through review.

**Do not misrepresent:** Governance rule conditions and category filters are not a complete user construction condition model.

**Closure criterion:** Allow bounded applicable conditions on supported facts/thresholds/dimensions/periods, evaluate deterministically where supported and retain their visible meaning in review and decision versions.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/proposal/src/domain/scope-dsl.ts](../../../../src/proposal/src/domain/scope-dsl.ts); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:59](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L59).

### BUILD-010 — Guardrails and Initiative-Specific Constraints

PRD physical pp. 117, 118 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample distinguishes adjustment from read-only policy but has no initiative constraints and selects one winner. Active backend evaluates only the top matched MarginRule, loses other applicable guardrails/statuses and configured behavior, and can retain stale outputs after edits.

**Do not misrepresent:** 'Most specific policy wins' describes current hierarchy behavior, not the PRD obligation to evaluate every independently applicable organisational Guardrail.

**Closure criterion:** Reference governance-owned Guardrails separately from initiative constraints; consume all authoritative state/threshold/value/treatment outcomes including Unable to Evaluate and refresh them after consequential builder changes.

Frontend evidence: [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:59](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L59); [src/margin/internal/handler/validate_batch.go:22](../../../../src/margin/internal/handler/validate_batch.go#L22); [src/proposal/src/service.ts:953](../../../../src/proposal/src/service.ts#L953); [src/proposal/src/repo/proposal-repository.ts:480](../../../../src/proposal/src/repo/proposal-repository.ts#L480).

### BUILD-011 — Bulk Pricing Construction

PRD physical pp. 118, 119 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Common prepared logic and row outcomes exist. Backend stops at 500 resolved SKUs and omits unpriced members; no complete entity-specific assumption/input/exception visibility across arbitrary scope.

**Do not misrepresent:** Do not treat a group as the price-bearing entity or count only successfully calculated rows as the entire selected scope.

**Closure criterion:** Apply one common rule to all resolved members, preserve every member's dimensions and output/inputs/assumptions/guardrails/exceptions/unavailable state, and reconcile a >500-member test scope.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:750](../../../../apps/workspace/src/OperationalWorkspace.jsx#L750); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts).

### BUILD-012 — Entity-Level Exceptions

PRD physical p. 119 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample supports fixed selected/excluded or policy exception work, not arbitrary per-entity deviations from a common pricing formula. Backend ProposalLine values can differ but no formal builder exception object/reason/result lineage exists.

**Do not misrepresent:** A margin-policy exception request is not the same as a builder-owned entity pricing exception.

**Closure criterion:** Authorised users define an entity/subscope deviation, required reason and resulting action; retain it beside the common logic in calculation, review and controlled submission.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts).

### BUILD-013 — Calculation Preview

PRD physical pp. 119, 120 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Preview covers prepared current/proposed price, delta and margin, but lacks cost basis/unit, gross profit, markup and assumptions. Backend baseline selection/zero-baseline handling/large-value arithmetic can conflict with deterministic definitions.

**Do not misrepresent:** A sample calculation preview is analytical output only, not decision authority or proof of full PRD economic coverage.

**Closure criterion:** Before Proposal creation show the action/baseline/inputs/method/status and all applicable price/delta/cost-basis/gross-profit/margin/markup/assumption/guardrail outcomes, with unavailable states rather than substituted estimates.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/workspacePresenter.js:35](../../../../apps/workspace/src/workspacePresenter.js#L35); [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:237](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L237); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/proposal/src/domain/diff.ts:7](../../../../src/proposal/src/domain/diff.ts#L7).

### BUILD-014 — Missing or Invalid Calculation Input Handling

PRD physical pp. 120, 121 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample exposes several missing/stale/currency blockers and rejects unprepared values. Backend silently drops missing-price entities, selects ambiguous costs and represents zero-baseline percentage as 0; no explicit-assumption/unsupported-calculation taxonomy.

**Do not misrepresent:** Unsupported prepared sample values are honestly rejected, but that is not complete action-specific missing-input diagnosis.

**Closure criterion:** For each affected action/entity distinguish verified calculation, explicit-assumption calculation, unavailable input and unsupported method; never turn unavailability into zero/unchanged pricing or an AI estimate.

Frontend evidence: [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/workspacePresenter.js:35](../../../../apps/workspace/src/workspacePresenter.js#L35); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66); [src/margin/internal/handler/validate_batch.go:22](../../../../src/margin/internal/handler/validate_batch.go#L22); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/proposal/src/domain/diff.ts:7](../../../../src/proposal/src/domain/diff.ts#L7).

### BUILD-015 — Draft State

PRD physical p. 121 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Editable saved adjustment/draft material is distinct from the sample Proposal, with controlled sample versions. Backend ChangeSet draft and Proposal draft exist but contributor-aware Builder state and immutable controlled pricing-logic version binding are incomplete.

**Do not misrepresent:** A mutable draft row is not a retained controlled version at formal submission.

**Closure criterion:** Permit authorised contributor edits in working draft without decision authority; establish a retrievable controlled version when submitted/incorporated into a Proposal and prevent later draft edits from mutating it.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto).

### BUILD-016 — Autosave and Working Continuity

PRD physical p. 121 · **P2** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample preserves dirty input during supported save failures and can resume its retained revision, but no general durable autosave/returning-Initiative continuity. Backend persists drafts but lacks complete version-safe working material.

**Do not misrepresent:** Autosave is should; returning to latest valid working state and protecting submitted/approved/authorised versions are must.

**Closure criterion:** Preserve working edits safely and restore latest valid Initiative builder state after returning; any autosave must target working material only, never controlled submitted/approved/authorised versions.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:953](../../../../src/proposal/src/service.ts#L953); [src/proposal/src/repo/proposal-repository.ts:480](../../../../src/proposal/src/repo/proposal-repository.ts#L480); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto).

### BUILD-017 — Version Creation

PRD physical pp. 121, 122 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample snapshots exact prepared rule/scope/preview and revised same-Proposal versions. Backend lacks an immutable retrievable Builder version linked at review/incorporation/revision/resubmission.

**Do not misrepresent:** Sample version IDs and repository tests do not prove a source-backed controlled-version backend contract.

**Closure criterion:** Create and retrieve immutable pricing-logic versions at all consequential points, link each to its Proposal decision basis and test multiple requested-change/resubmission cycles.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### BUILD-018 — Consequential Builder Change Detection

PRD physical p. 122 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample invalidates preview when supported adjustment changes and creates a fresh-authority replacement. Backend updateChangeSet updates scope/rule JSON but retains computed lines, and mutable Proposal drafts lack complete material-change version semantics.

**Do not misrepresent:** An updated rule displayed beside old outputs is a concrete stale-evidence correctness conflict, not just an absent general builder.

**Closure criterion:** Changing scope/logic/inputs/assumptions/constraints/output must invalidate or recompute analysis and trigger controlled-version rules after submission; governance changes remain separate and never silently rewrite a controlled builder/Proposal.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:953](../../../../src/proposal/src/service.ts#L953); [src/proposal/src/repo/proposal-repository.ts:480](../../../../src/proposal/src/repo/proposal-repository.ts#L480); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto).

### BUILD-019 — AI-Assisted Construction

PRD physical pp. 122, 123 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No invocable AI construction assistant or structured proposed-change application exists in the current workspace or backend routes/services searched.

**Do not misrepresent:** The replacement PRD makes AI assistance must, despite older handoff material treating AI as deferred. Deterministic margin 'intelligence' is not generative assistance.

**Closure criterion:** Provide bounded permission-aware AI construction assistance that proposes supported structured changes, identifies missing/contradictory information, and requires explicit authorised human application.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto); [src/gateway/src/routes](../../../../src/gateway/src/routes).

### BUILD-020 — AI Change Visibility

PRD physical p. 123 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No AI suggestion diff, accept/reject application or attributable applied-AI history exists.

**Do not misrepresent:** No silent AI replacement was observed because there is no AI path; that absence is not completed change-visibility capability.

**Closure criterion:** Show understandable before/after structured changes before application, allow reject, never silently overwrite user logic, and record suggestion origin plus applying human/time/version.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto); [src/gateway/src/routes](../../../../src/gateway/src/routes).

### BUILD-021 — Reusable Pricing Structures

PRD physical pp. 123, 124 · **P2** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample revision reuses its retained scope/rule in new working material without carrying prior decision authority. No general reuse-from-prior-work structure library or governance-aware reuse contract exists.

**Do not misrepresent:** Same-Proposal revision is useful partial reuse, not the full should-level reusable-structure feature; current governance and fresh authority remain mandatory when reuse is offered.

**Closure criterion:** Should allow authorised reuse of appropriate editable pricing structures/parameters/constraints with origin references; fetch applicable current governance and never copy historical approvals/authorisations/execution authority or make historical Guardrails independently editable.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts).

### BUILD-022 — Builder Validation

PRD physical pp. 124, 125 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Prepared inputs are bounded and source blockers gated, but complete builder validation/classes are missing. Backend ChangeSet updates validate JSON syntax only, allow stale lines and lack authoritative configured-treatment readiness semantics.

**Do not misrepresent:** Rejecting an unsupported sample parameter is good but cannot stand in for complete supported-method/input/scope/assumption/constraint validation.

**Closure criterion:** Validate complete supported builder structure and input constraints, surface canonical guardrail results, preserve explicit nondeterministic components, and leave formal submission/treatment decisions to PROP-009/GOV-025.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:953](../../../../src/proposal/src/service.ts#L953); [src/proposal/src/repo/proposal-repository.ts:480](../../../../src/proposal/src/repo/proposal-repository.ts#L480); [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/margin/internal/handler/validate_batch.go:22](../../../../src/margin/internal/handler/validate_batch.go#L22); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts).

### BUILD-023 — Pricing Logic Provenance

PRD physical p. 125 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample version/activity provenance and backend creators/timestamps exist, but no full material pricing-logic change history distinguishing user-authored, applied AI and reused structures.

**Do not misrepresent:** A Proposal creator or latest updated_at alone cannot attribute every material logic change or its origin.

**Closure criterion:** Retain creator/changer/time for every material logic version and distinguish direct human authorship, AI suggestion applied by a named human and reuse of identified prior work.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto).

### BUILD-024 — Builder Output

PRD physical pp. 125, 126 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Prepared rule/preview output feeds a sample Proposal, but complete structured inputs/baselines/assumptions/conditions/constraints/exceptions/method/status/source/guardrail results are not preserved across downstream contracts.

**Do not misrepresent:** A SKU/current/proposed/diff tuple is not a reproducible general Builder output; calculation and manual/qualitative commercial judgement must remain distinguishable.

**Closure criterion:** Define versioned builder output sufficient for reproducible calculation, Scenario evaluation, review, Proposal/decision/execution and history, retaining source context and authoritative governance references without fabricating unavailable evaluation.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255).

## ANALYSIS: Analysis and Scenarios (30)

### ANALYSIS-001 — Initiative-Level Analysis

PRD physical p. 128 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample repricing/Proposal views contain partial economic analysis, but no Initiative-owned analysis area linking full scope, selected/assumed unit cost, logic, assumptions, Scenarios and guardrails.

**Do not misrepresent:** A connected sample preview within its narrow workflow is not the PRD Initiative analytical environment.

**Closure criterion:** Give each Initiative a scoped analysis area whose source-record/assumption, builder-version, Scenario and authoritative guardrail references are explicit and permission-aware.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255).

### ANALYSIS-002 — Deterministic Pricing Calculation Coverage

PRD physical pp. 128, 129 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Current capabilities cover some adjustments and margin-floor arithmetic, not user direct-price/target-margin/target-markup actions, gross-profit/markup outputs, supported general logic and shared calculations across Scenarios.

**Do not misrepresent:** Do not infer user target-pricing support from a guardrail floor formula, or count existing Money fields as all required economic calculations.

**Closure criterion:** Provide all applicable required formulas/actions from one deterministic definition, preserve resulting current/proposed economic metrics and distinguish manual/qualitative/unsupported components; AI cannot redefine calculation methods.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:237](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L237); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### ANALYSIS-003 — Gross Profit Calculation

PRD physical pp. 129, 130 · **P1** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** No gross-profit-per-unit output/trace is surfaced or preserved. Arithmetic uses P−C internally for margin, but backend cost selection and context snapshots do not meet Applicable Unit Cost requirements.

**Do not misrepresent:** Intermediate subtraction inside a margin formula is not a traceable gross-profit product capability.

**Closure criterion:** Calculate P−C only with compatible currency/unit and a valid selected cost; preserve P,C,basis,unit,currency,record/assumption/effective context and return unavailable rather than constructing an alternative cost.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:237](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L237); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### ANALYSIS-004 — Gross Margin and Target-Margin Price Calculation

PRD physical pp. 130, 131 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample displays gross margin and computes a percentage-margin policy floor. No user-defined target-margin price action or unrounded target result is retained; selected cost basis/unit/provenance is incomplete.

**Do not misrepresent:** The floor helper is not the required target-margin builder capability; its permitted inputs need not match the target-price domain, so it must not be reused without explicit validation.

**Closure criterion:** Compute margin only for P>0; derive target price C/(1−m) only for valid C>0 and m<100%, permitting negative targets only under policy. Preserve exact/unrounded result, target and cost provenance, then evaluate rounded-price economics.

Frontend evidence: [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:237](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L237); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts).

### ANALYSIS-005 — Markup and Target-Markup Price Calculation

PRD physical pp. 131, 132 · **P1** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** Frontend has no markup metric or target-markup action. Active backend percentage-markup guardrail floor is partial arithmetic support, not user pricing-target calculation/output with unit/basis/record trace.

**Do not misrepresent:** Markup is not interchangeable with gross margin; the presence of a pct_markup floor enum does not complete the required analytical feature.

**Closure criterion:** Compute markup (P−C)/C and target price C×(1+m) for valid C>0; reject m<−100%, permit policy-allowed negatives, distinguish margin, and preserve target, unrounded result and exact cost/assumption context.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:237](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L237); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66).

### ANALYSIS-006 — Price Adjustment and Price Change Calculation

PRD physical pp. 132, 133, 134 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Backend supports four adjustments but returns 0% when Current Price is zero, rejects all zero-price results even at a valid 100% reduction, uses Number for large minor-unit values, and cannot retain an alternative baseline/record context. Sample UI only exposes prepared increases.

**Do not misrepresent:** Zero-baseline percentage is explicitly unavailable in the PRD, not 0%. Valid nonnegative formula output still requires separate policy checks; do not turn a formula limitation into invented governance.

**Closure criterion:** Test percentage/absolute increases/decreases and discount/markdown, including 0/100% and zero price; preserve explicit baseline type/value/source. Return unavailable Current Price comparisons when absent/unresolved and unavailable percent at zero, while allowing valid alternative-baseline calculation.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/workspacePresenter.js:35](../../../../apps/workspace/src/workspacePresenter.js#L35); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/proposal/src/domain/diff.ts:7](../../../../src/proposal/src/domain/diff.ts#L7); [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769).

### ANALYSIS-007 — Current and Proposed Economics

PRD physical pp. 134, 135 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample clearly separates current/proposed price and margin but omits gross-profit/markup. Backend current numeric price may come from SKU-only contextual collapse; no explicit alternative-baseline display contract.

**Do not misrepresent:** The side-by-side sample is a real usability gain, but 'Current' must refer to a uniquely applicable source PriceRecord, not any same-SKU record.

**Closure criterion:** Display current/proposed outcomes and meaningful deltas without manual reconstruction; preserve unavailable current-state metrics and label alternative baselines separately, using the same contextual record resolution and formulas.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/workspacePresenter.js:35](../../../../apps/workspace/src/workspacePresenter.js#L35); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/proposal/src/domain/diff.ts:7](../../../../src/proposal/src/domain/diff.ts#L7).

### ANALYSIS-008 — Scenario Creation

PRD physical p. 135 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No independently named, persistent multiple-Scenario create operation exists. Fixture scenario selectors are test/data variants, not user pricing alternatives within an Initiative.

**Do not misrepresent:** A sequence of repricing previews or Proposal versions is not a set of independently editable pricing Scenarios.

**Closure criterion:** Create multiple authorised Scenarios within one Initiative with relevant action/logic/assumptions/scope/outputs/guardrails/creator/time and separate identities.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### ANALYSIS-009 — Scenario Independence

PRD physical p. 135 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Scenario model exists to enforce exploratory isolation. Sample preview creation does not write live prices, but it is not proof of Scenario independence under modification/selection.

**Do not misrepresent:** The absence of execution from fixture previews is positive narrow behavior, not vacuous completion of missing Scenario isolation.

**Closure criterion:** Create/edit multiple Scenarios without modifying live prices, granting approval, replacing an approved Proposal or triggering execution; only explicit human progression creates a separate controlled Proposal basis.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### ANALYSIS-010 — Scenario Comparison

PRD physical pp. 135, 136 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No side-by-side Scenario comparison or trade-off surface/contract exists; current-versus-proposed is a different comparison.

**Do not misrepresent:** Two economic columns or a selected recommendation are not multi-alternative Scenario comparison.

**Closure criterion:** Compare available relevant price/delta/gross-profit/margin/markup/guardrail/assumption measures for multiple Scenarios, making unavailable inputs and trade-offs visible rather than only recommending one option.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### ANALYSIS-011 — Baseline Scenario

PRD physical p. 136 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample uses prepared current price as one preview baseline but has no Scenario baseline model. Backend same-SKU price collapse can select another context and no explicit alternative-baseline provenance exists.

**Do not misrepresent:** Defaulting to Current Price is should; using the correct contextual price and not fabricating/substituting a baseline are must.

**Closure criterion:** When unique contextual Current Price exists, default comparison to it; otherwise expose unavailable and only use an explicitly authorised supported alternative with source/assumption basis and clearly labelled improvement/deterioration measures.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/OperationalWorkspace.jsx:750](../../../../apps/workspace/src/OperationalWorkspace.jsx#L750); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### ANALYSIS-012 — Scope-Level Analysis

PRD physical pp. 136, 137 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample shows aggregate and SKU-level outcomes, including source/policy issues. Backend's capped/filtered membership can conceal unpriced or beyond-page entities; aggregate contributor/context trace is incomplete.

**Do not misrepresent:** Queue work-item overlap is now explicit, but queue line-attention counts are not economic scope aggregates or unique entities.

**Closure criterion:** Reconcile meaningful aggregates to exact contributing entity/dimension outcomes across full scope; do not conceal missing inputs, breaches, exceptions or negative outcomes, and never treat category/group as the priced object.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/OperationalWorkspace.jsx:750](../../../../apps/workspace/src/OperationalWorkspace.jsx#L750); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkflowGuidance.jsx](../../../../apps/workspace/src/WorkflowGuidance.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### ANALYSIS-013 — Priceable Entity-Level Outcomes

PRD physical p. 137 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Prepared entity rows distinguish eligible/source-blocked/policy issues. Backend drops unpriced entities, lacks complete dimensions and only returns violation subsets rather than all outcome states.

**Do not misrepresent:** The PRD's calculation for each available entity is should, but dimension association and ability to identify missing/exceptional/unevaluable entities are must.

**Closure criterion:** Produce or preserve one contextual result/status for each resolved affected entity, including within-logic, guardrail breach, missing input, exception and unsupported/unavailable calculation states.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/workspacePresenter.js:35](../../../../apps/workspace/src/workspacePresenter.js#L35); [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/margin/internal/handler/validate_batch.go:22](../../../../src/margin/internal/handler/validate_batch.go#L22).

### ANALYSIS-014 — Deterministic Guardrail Evaluation

PRD physical pp. 137, 138, 139 · **P0** · Frontend: conflicting · Backend: conflicting · Integration: not-connected

**Assessment:** Both sample and active backend choose a single top matching MarginRule. Backend returns breaches/errors as hardcoded BLOCK, omits pass/no-match evidence and loses independent applicable evaluations/treatment; sample precedence copy also states one winner.

**Do not misrepresent:** Deterministic evaluation is implemented; the conflict is single-winner semantics versus separately retained evaluations for every applicable Guardrail, plus conflating inability to evaluate with breach/treatment.

**Closure criterion:** Evaluate every governance-determined applicable Guardrail separately; retain ID/version/entity/dimensions/metric/operator/threshold/actual/inputs/state/time, distinguish Within/Breach/Unable to Evaluate, and apply only governance-configured treatment or proximity bands.

Frontend evidence: [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:59](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L59); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:237](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L237); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/margin/internal/handler/validate_batch.go:22](../../../../src/margin/internal/handler/validate_batch.go#L22).

### ANALYSIS-015 — Margin Floor Validation

PRD physical p. 139 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample margin breaches remain visible and missing costs block with distinct source evidence. Backend uses arbitrary SKU-collapsed cost and maps evaluation errors into BLOCK violations, not an explicit Unable to Evaluate result; no basis-change controlled snapshot.

**Do not misrepresent:** A conservative block on a missing cost is not permission to label it a confirmed margin breach or show zero floor/gap as evaluated evidence.

**Closure criterion:** Use exactly the analysis Applicable Unit Cost/basis for margin-floor evaluation; unresolved/missing/incompatible costs yield Unable to Evaluate, assumptions remain explicit, breaches stay visible and material cost/basis changes create fresh controlled decision context.

Frontend evidence: [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66); [src/margin/internal/handler/validate_batch.go:22](../../../../src/margin/internal/handler/validate_batch.go#L22); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:237](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L237); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82).

### ANALYSIS-016 — Missing Data

PRD physical pp. 139, 140 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample gives missing/stale source fields and unavailable metrics. Backend omits missing-price members, discards candidate ambiguity and emits zero-valued error evidence rather than a complete field/calculation/entity unavailability contract.

**Do not misrepresent:** Not crashing is not sufficient missing-data handling; omission can make incomplete analysis appear complete.

**Closure criterion:** Identify missing/invalid input, affected formula and entity for every unavailable calculation; preserve those rows in scope and never invent a substitute value or present an error as a numeric result.

Frontend evidence: [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/workspacePresenter.js:35](../../../../apps/workspace/src/workspacePresenter.js#L35); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66); [src/margin/internal/handler/validate_batch.go:22](../../../../src/margin/internal/handler/validate_batch.go#L22).

### ANALYSIS-017 — Explicit Assumption Use

PRD physical p. 140 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No explicit, policy-permitted assumption use in analysis or controlled Proposal assumption preservation is implemented.

**Do not misrepresent:** Use is may under policy; if used, marked/attributable/review-visible/version-preserved treatment is must. INIT-013/BUILD-008 independently require explicit Assumption capability.

**Closure criterion:** Where policy permits assumed inputs, label their values and origin, retain applying user and review visibility, preserve them with the Proposal version and never represent them as verified data.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### ANALYSIS-018 — Manual Scenario Inputs

PRD physical p. 140 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Scenario-specific manual input model; prepared adjustment entry is not an independent user-supplied target/discount/assumed-cost/estimated-outcome scenario value.

**Do not misrepresent:** Manually chosen commercial outcomes must not be described as deterministically derived or silently made canonical costs.

**Closure criterion:** Support authorised scenario-specific values with source type, preserving assumed cost amount/basis/currency/unit and attribution separately from structured CostRecords and deterministic outputs.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts).

### ANALYSIS-019 — Qualitative Decision Inputs

PRD physical pp. 140, 141 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample Proposal comments/review reasons preserve limited human context; no Initiative analysis references to typed Evidence/Assumptions/source-versioned interpretation exist. Backend line reason text is not a typed qualitative input model.

**Do not misrepresent:** Comments or reasons must not be promoted to Evidence, verified facts or calculation outputs merely because they influence review.

**Closure criterion:** Reference material qualitative inputs using their originating information type/source/version and preserve them in submitted history; distinguish user interpretation, AI interpretation, Evidence, structured context and Assumptions.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/RoleWorkspace.jsx](../../../../apps/workspace/src/RoleWorkspace.jsx); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### ANALYSIS-020 — AI-Assisted Analysis

PRD physical pp. 141, 142 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No invocable AI analysis interpretation or Scenario trade-off assistance exists in the current frontend/backend source searched.

**Do not misrepresent:** Old scope documents that defer AI conflict with this replacement PRD must. The deterministic engine is not AI-assisted analysis.

**Closure criterion:** Provide permission-aware AI explanations of preserved calculations/scenario differences/guardrails/assumptions and missing information without changing underlying deterministic methods, inputs or outputs.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto); [src/gateway/src/routes](../../../../src/gateway/src/routes).

### ANALYSIS-021 — AI Recommendation Boundary

PRD physical p. 142 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No AI recommendation or human Scenario selection boundary can be exercised because neither capability exists.

**Do not misrepresent:** No observed autonomous AI decision is not a completed recommendation boundary. Optional recommendation still needs mandatory non-authority and human-selection controls if offered.

**Closure criterion:** Label AI suggestions as unverified consideration, show available supporting basis where recommending, and require explicit authorised human Scenario selection without conferring decision or execution authority.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto); [src/gateway/src/routes](../../../../src/gateway/src/routes); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### ANALYSIS-022 — Calculation Traceability

PRD physical pp. 142, 143 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample shows formula/rounding and retained source versions, but does not retain unrounded results or exact economic record/basis/unit/assumption trace. Backend persists numeric lines/diffs and rule JSON, losing material cost/price selection provenance.

**Do not misrepresent:** A calculation label and rounding enum cannot alone reproduce the unrounded decision-relevant result across builder/analysis/Scenario/Proposal/guardrails.

**Closure criterion:** Preserve action/scope/baseline/source values and types/parameters/operator/formula/unrounded result/rounding/final proposed value for every material output and reproduce it from the controlled snapshot.

Frontend evidence: [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/workspacePresenter.js:35](../../../../apps/workspace/src/workspacePresenter.js#L35); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66).

### ANALYSIS-023 — Calculation Precision and Rounding

PRD physical p. 143 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Frontend uses BigInt and separates formatting, but rounds to minor units without retaining a separate unrounded result and formats all currencies to two decimals. Backend percentage repricing converts potentially int64-sized Money to Number before multiplication and rounds early.

**Do not misrepresent:** 'Deterministic minor-unit arithmetic' is true for the bounded FE helper, not the active backend percentage path or full pre-/post-rounding trace. No psychological pricing optimisation is required.

**Closure criterion:** Use exact sufficient-precision arithmetic, preserve unrounded and explicitly rounded values/method, apply currency precision correctly and recompute downstream economics from the final proposed value; test large int64 values, fractional targets and 0/2/3-decimal currencies.

Frontend evidence: [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/workspacePresenter.js:35](../../../../apps/workspace/src/workspacePresenter.js#L35); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/proposal/src/domain/diff.ts:7](../../../../src/proposal/src/domain/diff.ts#L7); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:237](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L237); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82).

### ANALYSIS-024 — Currency Consistency

PRD physical pp. 143, 144 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Direct adjustment and margin helpers check currency compatibility, and data pipeline has explicit FX snapshots. However contextual selection can choose an arbitrary other-currency record; analysis has no approved/assumed FX input provenance linked to work.

**Do not misrepresent:** An ISO code field or standalone conversion service is not automatically approved cross-currency analysis; the fixed-NGN fixture cannot prove multicurrency behavior.

**Closure criterion:** Reject incompatible monetary operands without approved conversion input; where permitted retain explicit assumed rate/source/date and derive compatible values without changing historical source records or silently selecting another currency.

Frontend evidence: [apps/workspace/src/data/pricingEngine.js:65](../../../../apps/workspace/src/data/pricingEngine.js#L65); [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/workspacePresenter.js:35](../../../../apps/workspace/src/workspacePresenter.js#L35); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:237](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L237); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/data-pipeline/owomide_data_pipeline/service.py:796](../../../../src/data-pipeline/owomide_data_pipeline/service.py#L796); [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66).

### ANALYSIS-025 — Scenario Selection

PRD physical p. 144 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample explicitly creates a draft Proposal from an exact saved preview, separate from approval. No independent Scenario or deliberate chosen-alternative reference exists; backend ChangeSet submission is narrower approach selection.

**Do not misrepresent:** Create Proposal from Preview is useful partial pricing-approach progression, not multi-Scenario selection or approval.

**Closure criterion:** Let an authorised human designate one Scenario/pricing approach, retain its exact version as the Proposal basis, and prove selection itself does not create approval/authorisation/execution rights.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255).

### ANALYSIS-026 — Analytical Completeness for Proposal Preparation

PRD physical pp. 144, 145 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample visibly separates source blockers from reviewable policy exceptions, but complete analytical input/assumption/unsupported-result checks are absent. Backend can silently drop entities, retain stale calculations and conflate errors/breaches with hardcoded blocking treatment.

**Do not misrepresent:** Analysis completeness must supply facts to Proposal readiness, not become a second submission-policy owner or label every guardrail breach a calculation error.

**Closure criterion:** Before Proposal preparation report calculation errors/unavailable inputs/invalid outputs/undefined assumptions/Unable to Evaluate guardrails independently from confirmed breaches; supply canonical evidence to PROP-009/GOV-025 without inventing treatment.

Frontend evidence: [apps/workspace/src/data/pricingEngine.js:156](../../../../apps/workspace/src/data/pricingEngine.js#L156); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkflowGuidance.jsx](../../../../apps/workspace/src/WorkflowGuidance.jsx); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:769](../../../../src/proposal/src/service.ts#L769); [src/margin/internal/handler/validate_batch.go:22](../../../../src/margin/internal/handler/validate_batch.go#L22); [src/proposal/src/service.ts:953](../../../../src/proposal/src/service.ts#L953); [src/proposal/src/repo/proposal-repository.ts:480](../../../../src/proposal/src/repo/proposal-repository.ts#L480); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255).

### ANALYSIS-027 — Analysis Snapshot

PRD physical pp. 145, 146 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample preserves prepared preview/rule/scope through Proposal versions and multiple revision cycles. Exact cost record/basis/unit/assumption and full financial analysis/Scenario snapshots are absent; backend Proposal lines and current margin fetch cannot reproduce complete historical analysis.

**Do not misrepresent:** Retained sourcePreviewRef or numeric price lines do not constitute the PRD's exact analysis snapshot.

**Closure criterion:** Freeze decision-relevant analysis with selected cost/basis/unit/currency/record-or-assumption/effective context and dependent outputs at submission, unaffected by later context, Scenario or assumed-input changes.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/catalog/migrations/0002_catalog_foundation.up.sql:197](../../../../src/catalog/migrations/0002_catalog_foundation.up.sql#L197); [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts).

### ANALYSIS-028 — Historical Analysis

PRD physical p. 146 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Historical sample Proposal versions are retrievable, and Catalog has as-of economic records. No prior-Initiative analysis/Scenario record exists, and backend lacks immutable analytical decision snapshots.

**Do not misrepresent:** Do not recompute historical analysis from current catalog values; temporal storage alone is not a preserved history-to-analysis relationship.

**Closure criterion:** Inspect prior Initiative Scenarios and analysis with original inputs/output/formulas/context versions after later live changes, including rejected/revised alternatives, without rerunning them against current data.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/catalog/migrations/0002_catalog_foundation.up.sql:197](../../../../src/catalog/migrations/0002_catalog_foundation.up.sql#L197); [src/catalog/src/repo/read-repository.ts](../../../../src/catalog/src/repo/read-repository.ts); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto); [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts).

### ANALYSIS-029 — Analysis Export

PRD physical p. 146 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Structured analysis export is explicitly disabled in the sample and no source-backed Initiative/Scenario analysis export route was found.

**Do not misrepresent:** This is should-level MVP scope, not a mandatory universal export suite; permissions/version/historical integrity remain must if offered.

**Closure criterion:** Should export relevant accessible Initiative/Proposal analysis in structured form using the exact authorised version and server-side direct/derived cost redaction, preserving historical identifiers and context.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto](../../../../src/lib/proto/services/proposal/v1/proposal.proto); [src/gateway/src/routes/proposals.ts](../../../../src/gateway/src/routes/proposals.ts).

### ANALYSIS-030 — Analytical Completeness Principle

PRD physical pp. 146, 147 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** The bounded repricing sample answers some current/proposed/change questions. It cannot show a full Initiative objective-to-economics narrative with explicit assumptions, complete independently evaluated guardrails and considered alternatives; backend source is likewise narrower.

**Do not misrepresent:** A polished complete sample Proposal journey is not MVP analytical completeness under the replacement PRD.

**Closure criterion:** Before submission, retrieve one Initiative that answers all six questions—current economics, proposed change, economic effect, assumptions, affected guardrails and alternatives—from preserved authoritative context; otherwise identify it as not decision-ready.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx](../../../../apps/workspace/src/WorkspaceApp.jsx); [apps/workspace/src/ProposalWorkspace.jsx](../../../../apps/workspace/src/ProposalWorkspace.jsx); [apps/workspace/src/OperationalWorkspace.jsx:810](../../../../apps/workspace/src/OperationalWorkspace.jsx#L810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1251](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1251); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:49](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L49); [src/proposal/src/service.ts](../../../../src/proposal/src/service.ts); [src/proposal/src/domain/repricing-rules.ts](../../../../src/proposal/src/domain/repricing-rules.ts); [src/margin/internal/handler/validate_batch.go:22](../../../../src/margin/internal/handler/validate_batch.go#L22); [src/margin/internal/client/catalog.go:66](../../../../src/margin/internal/client/catalog.go#L66).

## PROP: Controlled Proposals (22)

### PROP-001 — Pricing Proposal Definition

PRD physical p. 149 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Partial price/source/timing package lacks Initiative, objective, assumptions and complete supporting analysis.

**Do not misrepresent:** Proposal desk cannot stand for an entire Initiative.

**Closure criterion:** Create Initiative-linked package with action, scope, baseline, rationale, assumptions, analysis, controls and timing.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1691](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1691); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:117](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L117); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/src/service.ts:832](../../../../src/proposal/src/service.ts#L832); [src/proposal/migrations/0002_proposal_foundation.up.sql:121](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L121).

### PROP-002 — Initiative Relationship

PRD physical pp. 149, 150 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Mandatory exactly-one Initiative parent and complete work lineage absent.

**Do not misrepresent:** Preview/change-set ID is not an Initiative.

**Closure criterion:** Reject orphan/cross-tenant/multiple-parent proposals; navigate Initiative-to-source-to-decision-to-execution.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1691](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1691); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:117](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L117); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### PROP-003 — Proposal Creation

PRD physical pp. 150, 151 · **P0** · Frontend: conflicting · Backend: partial-source · Integration: not-connected

**Assessment:** Fixture can create blocked status and increments version on submit; backend draft lacks controlled versions and Initiative authority.

**Do not misrepresent:** Concurrency revision is displayed as controlled Proposal version.

**Closure criterion:** Create Draft v1; edit using separate concurrency revision; submit freezes same v1 without authority or execution.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1691](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1691); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:117](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L117); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1915](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1915); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:194](../../../../src/proposal/src/service.ts#L194); [src/proposal/src/repo/proposal-repository.ts:59](../../../../src/proposal/src/repo/proposal-repository.ts#L59); [src/proposal/src/service.ts:832](../../../../src/proposal/src/service.ts#L832); [src/proposal/migrations/0002_proposal_foundation.up.sql:121](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L121).

### PROP-004 — Current Proposal

PRD physical p. 151 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** One runtime proposal is not persisted per-Initiative current uniqueness/validity.

**Do not misrepresent:** Global sample current pointer is not one current proposal per Initiative.

**Closure criterion:** Two Initiatives each retain at most one current progressing proposal with readable historical alternatives.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1638](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1638); [apps/workspace/src/RoleWorkspace.jsx:331](../../../../apps/workspace/src/RoleWorkspace.jsx#L331); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### PROP-005 — Proposal Identification

PRD physical pp. 151, 152 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** IDs/timestamps exist; controlled version, Initiative and submitter authority binding incomplete.

**Do not misrepresent:** Changing transport ref is not a durable controlled decision ID.

**Closure criterion:** Persist stable proposal ID, controlled version, concurrency revision, Initiative, creator/submitter/time and current/history distinction.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1915](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1915); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404).

### PROP-006 — Proposal Content

PRD physical p. 152 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample prices/floors linked; full objective/assumptions/analysis/evidence versions/implementation context missing.

**Do not misrepresent:** Line grid plus exception is not full decision content.

**Closure criterion:** Reviewer can decide from one exact-version package; every source resolves a retained version.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1691](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1691); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:117](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L117); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:832](../../../../src/proposal/src/service.ts#L832); [src/proposal/migrations/0002_proposal_foundation.up.sql:121](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L121); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### PROP-007 — Proposal Source Traceability

PRD physical pp. 152, 153 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Fixture retains Preview/rule/scope; backend lacks cost/analysis/assumption/control snapshots and evaluates current margin at submit.

**Do not misrepresent:** change_set_id alone is not frozen provenance.

**Closure criterion:** After submission, current data/rule edits cannot change historical baseline inputs, calculations or applicable controls.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1638](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1638); [apps/workspace/src/RoleWorkspace.jsx:331](../../../../apps/workspace/src/RoleWorkspace.jsx#L331); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:832](../../../../src/proposal/src/service.ts#L832); [src/proposal/migrations/0002_proposal_foundation.up.sql:121](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L121); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/proposal/src/repo/proposal-repository.ts:191](../../../../src/proposal/src/repo/proposal-repository.ts#L191).

### PROP-008 — Scenario and Proposal Separation

PRD physical p. 153 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No analytical Scenario product object and deliberate selection-to-Proposal path.

**Do not misrepresent:** fixture-scenario means test provenance, not a PRD Scenario.

**Closure criterion:** Scenario selection remains separate and grants no authority; direct Builder-to-Proposal stays supported.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1691](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1691); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:117](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L117); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/src/service.ts:832](../../../../src/proposal/src/service.ts#L832); [src/proposal/migrations/0002_proposal_foundation.up.sql:121](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L121).

### PROP-009 — Proposal Readiness

PRD physical pp. 153, 154 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Bounded blockers lack full prerequisites; backend blocks every violation including WARN and lacks configured treatments.

**Do not misrepresent:** Within-floor is not complete readiness/policy authority; evaluation error is not confirmed breach.

**Closure criterion:** Test Warning/Escalation/Blocking/Unable-to-Evaluate distinctly plus mandatory content, timing and decision-path prerequisites.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2105](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2105); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/proposal/src/repo/proposal-repository.ts:191](../../../../src/proposal/src/repo/proposal-repository.ts#L191); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:503](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503).

### PROP-010 — Draft Proposal

PRD physical pp. 154, 155 · **P0** · Frontend: conflicting · Backend: partial-source · Integration: not-connected

**Assessment:** Fixture uses blocked as Proposal status; backend Draft editing lacks ownership/scope authority.

**Do not misrepresent:** Blocked readiness must not replace Draft decision status.

**Closure criterion:** New proposal remains Draft with separate readiness until submission; authorised edits never grant decision/execution authority.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1691](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1691); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:117](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L117); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2260](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2260); [apps/workspace/src/ProposalWorkspace.jsx:546](../../../../apps/workspace/src/ProposalWorkspace.jsx#L546); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:194](../../../../src/proposal/src/service.ts#L194); [src/proposal/src/repo/proposal-repository.ts:59](../../../../src/proposal/src/repo/proposal-repository.ts#L59); [src/proposal/src/service.ts:233](../../../../src/proposal/src/service.ts#L233); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129).

### PROP-011 — Proposal Submission and Decision Snapshot

PRD physical pp. 155, 156 · **P0** · Frontend: conflicting · Backend: partial-source · Integration: not-connected

**Assessment:** Fixture submission increments version; backend lacks immutable content/source/governance/workflow snapshot.

**Do not misrepresent:** Passing v7→v8 tests validate old semantics, not PRD same-version freeze.

**Closure criterion:** Freeze controlled vN without increment, preserving exact data/assumptions/analysis/control versions-results-treatments and decision configuration.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1915](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1915); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/proposal/src/repo/proposal-repository.ts:191](../../../../src/proposal/src/repo/proposal-repository.ts#L191); [src/proposal/src/service.ts:832](../../../../src/proposal/src/service.ts#L832); [src/proposal/migrations/0002_proposal_foundation.up.sql:121](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L121); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404).

### PROP-012 — Proposal Status

PRD physical pp. 156, 157 · **P0** · Frontend: conflicting · Backend: conflicting · Integration: not-connected

**Assessment:** No distinct Changes Requested/Rejected/Authorised Within Policy; blocked/published mix readiness/execution into decision status.

**Do not misrepresent:** Return for changes stores reject; publication changes Proposal state.

**Closure criterion:** Use canonical decision statuses with separate readiness, progress, execution and validity; distinct Approve/Reject/Request Changes commands.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2260](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2260); [apps/workspace/src/ProposalWorkspace.jsx:546](../../../../apps/workspace/src/ProposalWorkspace.jsx#L546); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1915](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1915); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/src/domain/state-machine.ts:9](../../../../src/proposal/src/domain/state-machine.ts#L9); [src/proposal/migrations/0002_proposal_foundation.up.sql:99](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L99); [src/proposal/src/service.ts:663](../../../../src/proposal/src/service.ts#L663); [src/proposal/src/domain/state-machine.ts:126](../../../../src/proposal/src/domain/state-machine.ts#L126).

### PROP-013 — Proposal Version Validity

PRD physical pp. 157, 158 · **P0** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Stale sample refs block writes, but Current/Superseded/Expired validity and reasons absent.

**Do not misrepresent:** Concurrency staleness is not supersession/expiry.

**Closure criterion:** Retain decision status while marking validity; never execute superseded/expired versions and show next action.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1915](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1915); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/proposal/src/service.ts:1004](../../../../src/proposal/src/service.ts#L1004).

### PROP-014 — Approval Progress

PRD physical p. 158 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Single reviewer display lacks required/completed/outstanding multi-stage progress.

**Do not misrepresent:** Alternative finance/commercial/executive samples are not a chain.

**Closure criterion:** Multiple-required proposal stays Awaiting Approval until all conditions complete and displays every stage.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/WorkflowGuidance.jsx:19](../../../../apps/workspace/src/WorkflowGuidance.jsx#L19); [apps/workspace/src/data/fixtureOperationalRepositories.js:992](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L992); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### PROP-015 — Changes Requested

PRD physical pp. 158, 159 · **P0** · Frontend: conflicting · Backend: absent · Integration: not-connected

**Assessment:** Safe returned revision retains reason but reject immediately creates draft; formal Changes Requested outcome missing.

**Do not misrepresent:** Changes Requested and Rejected must remain distinct semantic decisions and controlled outcomes; a shared typed decision endpoint is acceptable.

**Closure criterion:** Request Changes preserves its decision on vN, denies execution, then material correction creates Draft vN+1 with fresh review.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2260](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2260); [apps/workspace/src/ProposalWorkspace.jsx:546](../../../../apps/workspace/src/ProposalWorkspace.jsx#L546); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1638](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1638); [apps/workspace/src/RoleWorkspace.jsx:331](../../../../apps/workspace/src/RoleWorkspace.jsx#L331); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/state-machine.ts:9](../../../../src/proposal/src/domain/state-machine.ts#L9); [src/proposal/migrations/0002_proposal_foundation.up.sql:99](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L99).

### PROP-016 — Rejected Proposal

PRD physical p. 159 · **P0** · Frontend: conflicting · Backend: absent · Integration: not-connected

**Assessment:** No separate terminal rejection; fixture reject means correction and backend has no reject handler.

**Do not misrepresent:** Returned Draft is not Rejected Proposal.

**Closure criterion:** Reject preserves version/reason and no authority; renewed work explicitly creates a fresh version/decision path.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2260](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2260); [apps/workspace/src/ProposalWorkspace.jsx:546](../../../../apps/workspace/src/ProposalWorkspace.jsx#L546); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/state-machine.ts:9](../../../../src/proposal/src/domain/state-machine.ts#L9); [src/proposal/migrations/0002_proposal_foundation.up.sql:99](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L99).

### PROP-017 — Material Proposal Change

PRD physical pp. 159, 160 · **P0** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Safe bounded returned repricing exists; generic submitted/approved material-version fork does not.

**Do not misrepresent:** Prepared revision proves one sample path, not arbitrary revisions or production lineage.

**Closure criterion:** Material price/scope/assumption/timing change creates new controlled Draft, resets required review/authority and preserves old snapshot.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1638](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1638); [apps/workspace/src/RoleWorkspace.jsx:331](../../../../apps/workspace/src/RoleWorkspace.jsx#L331); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:233](../../../../src/proposal/src/service.ts#L233); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### PROP-018 — Non-Material Proposal Change

PRD physical pp. 160, 161 · **P3** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Optional post-submission non-material edit not supported; title editing is draft-only.

**Do not misrepresent:** Pre-submission title edit does not prove immutable-snapshot editing.

**Closure criterion:** Explicitly defer optional path; if enabled allowlist non-material fields, preserve snapshot and audit change.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2239](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2239); [apps/workspace/src/RoleWorkspace.jsx:341](../../../../apps/workspace/src/RoleWorkspace.jsx#L341); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:233](../../../../src/proposal/src/service.ts#L233); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404).

### PROP-019 — Proposal Supersession

PRD physical p. 161 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Old sample snapshots/read-only actions exist; no persisted Superseded validity/current-pointer model.

**Do not misrepresent:** Old read-only ref is not formal supersession.

**Closure criterion:** Replacement supersedes old current version, preserves decisions, closes obsolete actions and denies execution.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1638](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1638); [apps/workspace/src/RoleWorkspace.jsx:331](../../../../apps/workspace/src/RoleWorkspace.jsx#L331); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/proposal/src/service.ts:1004](../../../../src/proposal/src/service.ts#L1004).

### PROP-020 — Proposal Expiration

PRD physical p. 161 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Proposal expiry evaluator/validity; exception expiresAt and rollout effectiveAt are different concepts.

**Do not misrepresent:** Exception expiry is not Proposal expiry.

**Closure criterion:** Configured expiry retains history, marks Expired and blocks progression/execution until renewed decision.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2333](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2333); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:201](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L201); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/proposal/src/service.ts:1004](../../../../src/proposal/src/service.ts#L1004).

### PROP-021 — Decision and Execution Binding

PRD physical pp. 161, 162 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample execution binds exact ref; backend only proposal/line IDs with no controlled version/current-validity.

**Do not misrepresent:** Approved ID alone is not immutable authorised baseline.

**Closure criterion:** Execute/export only exact current valid authorised version; reject price/scope substitution and compare actual implementation.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2333](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2333); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:201](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L201); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/proposal/src/service.ts:1004](../../../../src/proposal/src/service.ts#L1004); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### PROP-022 — Proposal Historical Integrity

PRD physical pp. 162, 163 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample history and append-only backend events lack complete persistent version/source/authority reconstruction and readable APIs.

**Do not misrepresent:** Activity logs/catalog restore snapshots do not equal Proposal integrity.

**Closure criterion:** Reconstruct any version, sources, decisions, material changes, validity and implementation after later data/user/config changes.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1638](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1638); [apps/workspace/src/RoleWorkspace.jsx:331](../../../../apps/workspace/src/RoleWorkspace.jsx#L331); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:44](../../../../src/governance/src/domain/event-mapper.ts#L44); [src/governance/src/service.ts:25](../../../../src/governance/src/service.ts#L25); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

## COLLAB: Collaboration and Evidence (21)

### COLLAB-001 — Contextual Collaboration

PRD physical p. 165 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Proposal-only discussion is narrower than collaboration within a persistent Initiative; no Initiative collaboration container exists.

**Closure criterion:** Given an Initiative, when authorised participants contribute before a Proposal exists, then contributions remain attached to that Initiative and navigable from later decisions.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-002 — Comments

PRD physical p. 165 · **P1** · Frontend: sample-partial · Backend: implemented-source · Integration: not-connected

**Assessment:** Sample comments preserve actor/time/version; backend append-only Proposal comments preserve actor/time/body/object but the REST service-auth seam is not connected.

**Closure criterion:** Given an authorised participant, when a comment is added and the session reloads, then persisted author, timestamp, object and text are returned; other tenants cannot read it.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-003 — Threaded Discussion

PRD physical p. 166 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No reply/parent thread model or threaded composer was found. Threading is Should; unrestricted chat is not required.

**Closure criterion:** Given an existing discussion, when a permitted reply is added, then its parent and object context remain intact in historical reads.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-004 — Mentions

PRD physical p. 166 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No structured member mention, recipient resolution or mention notification exists; typing @ in plain text is not this capability.

**Closure criterion:** Given a mentioned user, when the mention is saved, then a contextual notification is created only if accessible; mentioning never grants access.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-005 — Assignments

PRD physical pp. 166, 167 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Sample draft handoff assigns a submission owner, not a general action assignment with related object, status and due date.

**Closure criterion:** Given an Initiative action, when assigned by an authorised user, then assignee, task, object, creator, time and relevant deadline persist.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-006 — Assignment Status

PRD physical p. 167 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Open/In Progress/Completed/Cancelled action-assignment lifecycle exists.

**Closure criterion:** Given an assignment, when its assignee completes it, then completion actor/time persist independently of the Initiative or Proposal state.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-007 — Supporting Evidence

PRD physical pp. 167, 168 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Request text and exception evidence references exist; no typed supporting Evidence record or attachment permission boundary exists.

**Closure criterion:** Given supplier evidence, when attached to pricing work, then it remains Evidence; creating a Cost Record requires a separate validated authorised action.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-008 — Evidence Metadata

PRD physical p. 168 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Request metadata identifies contributor/time, but free-text evidence has no independent provenance, observation date or typed identity.

**Closure criterion:** Given a recorded observation, when opened later, then source, contributor, submission and observation dates are distinguishable from system pricing data.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-009 — Manual Market Observations

PRD physical p. 169 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Contributor intake can capture a text concern, not structured manually gathered market observations for authorised pricing participants.

**Closure criterion:** Given an offline competitor observation, when recorded, then subject/value/context/date/source/observer can be retained and it is never labelled verified live intelligence.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-010 — Evidence Relevance

PRD physical p. 169 · **P2** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Evidence links only to an intake or exception in the sample; no association to an assumption, scenario or analytical claim.

**Closure criterion:** Given one evidence record, when linked to a scenario assumption, then the relation is visible without copying it into an unstructured attachment pile.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-011 — Review Feedback

PRD physical pp. 169, 170 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Comments and sample returns provide feedback, but formal pre-decision In Review feedback/readiness is not modelled separately from approval.

**Closure criterion:** Given work in In Review, when a reviewer requests clarification, then feedback is recorded without granting or denying execution authority.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-012 — Discussion Resolution

PRD physical p. 170 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No discussion/issue resolution state and resolver metadata exist.

**Closure criterion:** Given an unresolved issue, when resolved, then original text, replies, resolver and time remain visible.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-013 — Collaboration Activity

PRD physical pp. 170, 171 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Comments have their own append-only feed; no Initiative activity feed unifies mentions, assignments, evidence and resolution events.

**Closure criterion:** Given comments and action events, when Initiative history is opened, then each consequential contribution appears with actor, time and object link.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-014 — Access Control

PRD physical p. 171 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample reads gate proposal access/economics and Contributor requests are allowlisted. Backend comments require service identity and tenant context, not end-user role/scope/field permission.

**Do not misrepresent:** Fixture privacy controls must not be mistaken for server-enforced end-user access.

**Closure criterion:** Given a Contributor or revoked participant, when comment/list/deep-link APIs are called directly, then protected Proposal and economic content is denied before response construction.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-015 — Sensitive Evidence

PRD physical p. 171 · **P0** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Sample suppresses sensitive comments for restricted readers, but there is no per-Evidence access model; all participant access cannot be assumed equivalent.

**Closure criterion:** Given restricted financial Evidence in a shared Initiative, when a cost-restricted collaborator reads it or receives a mention, then neither raw content nor derived costs leak.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-016 — Version Context

PRD physical p. 171 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Frontend shows Proposal-version-bound comments; backend comment schema has proposal_id only, with no controlled version.

**Do not misrepresent:** The UI promises a version attachment the backend cannot represent.

**Closure criterion:** Given comments on Proposal v1 and v2, when v1 history is opened, then comments remain tied to the exact discussed snapshot and never migrate to v2.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-017 — Editing and Deletion

PRD physical pp. 171, 172 · **P2** · Frontend: sample-partial · Backend: implemented-source · Integration: not-connected

**Assessment:** Append-only backend grants prevent UPDATE/DELETE; the sample exposes no edit/delete. This is a useful integrity foundation, not proof of all collaboration retention.

**Closure criterion:** Given a consequential comment, when application credentials attempt mutation/deletion, then it is denied; any future edit feature preserves original meaning and attribution.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:319](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L319); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83).

### COLLAB-018 — AI in Collaboration

PRD physical p. 172 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional AI collaboration assistance is absent; no false attribution was observed because there is no AI feature to exercise.

**Closure criterion:** If discussion summarisation is introduced, given conflicting stakeholder comments, then summaries cite recorded statements and do not invent a human decision.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-019 — Collaboration Summary

PRD physical p. 172 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Proposal next-step guidance identifies blockers; no Initiative summary of unresolved discussion, tasks, reviews or evidence exists.

**Closure criterion:** Given outstanding collaboration, when the Initiative opens, then required people/actions are clear without reading the entire history.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-020 — Collaboration Boundary

PRD physical pp. 172, 173 · **P3** · Frontend: unverified · Backend: unverified · Integration: not-connected

**Assessment:** Boundary, not a missing mandatory feature: general chat, meetings and project-management tooling are explicitly not required.

**Closure criterion:** Given the agreed scope, then the pricing collaboration journey completes without building organisation-wide messaging or meetings.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### COLLAB-021 — Collaboration Completeness Principle

PRD physical p. 173 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Basic comments and request/decision text survive within sample objects; full contributor/action/issue/change reconstruction is absent.

**Closure criterion:** Given completed pricing work, when a new authorised employee inspects it, then they can explain who contributed, evidence, unresolved issues and what changed.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:380](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1967](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967); [apps/workspace/src/data/fixtureCompanyRequests.js:82](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

Backend evidence: [src/proposal/src/service.ts:540](../../../../src/proposal/src/service.ts#L540); [src/proposal/migrations/0002_proposal_foundation.up.sql:83](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

## FLOW: Workflow, Review and Approval (36)

### FLOW-001 — Bounded Workflow Configuration

PRD physical pp. 175, 176 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Only sample analyst submission toggle and test-selected single reviewer; no bounded Workflow Configuration Profile.

**Do not misrepresent:** A boolean policy or test stage switch is not a workflow editor; arbitrary scripts/graphs are expressly out of scope.

**Closure criterion:** Admin configures supported pricing-specific review/routing/approval parameters within fixed canonical lifecycle; rejects custom states/code and bypasses.

Frontend evidence: [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### FLOW-002 — Default Workflow Configuration

PRD physical pp. 176, 177 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No system-default profile for the full Initiated→Completed Initiative lifecycle.

**Do not misrepresent:** Operational sample proposal steps are not canonical Initiative stages.

**Closure criterion:** New tenant receives usable default pricing lifecycle without configuring custom structure; optional settings are not prerequisites.

Frontend evidence: [apps/workspace/src/WorkflowGuidance.jsx:19](../../../../apps/workspace/src/WorkflowGuidance.jsx#L19); [apps/workspace/src/data/fixtureOperationalRepositories.js:992](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L992); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1691](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1691); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:117](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L117); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### FLOW-003 — Workflow Configuration Profile Assignment

PRD physical p. 177 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Initiative-bound profile assignment, visible profile ID/version or supported selection criteria.

**Do not misrepresent:** Single assigned-stage fixture is not an assigned organisational profile.

**Closure criterion:** Each Initiative has one visible existing supported profile, selected by authorised supported criteria, never arbitrary generated graph.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1691](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1691); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:117](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L117); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### FLOW-004 — Review Stage

PRD physical pp. 177, 178 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Inspection/comments exist; no independent In Review stage, formal reviewer readiness, clarification work item or configured reviewers.

**Do not misrepresent:** Reading an approval screen or commenting does not complete required review.

**Closure criterion:** Required reviewer inspects context, comments/clarifies/confirms readiness; this alone never approves or policy-authorises.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### FLOW-005 — Review Completion

PRD physical pp. 178, 179 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No required-review completion model or gate for either decision path.

**Do not misrepresent:** Single approval action must not stand in for mandatory review completion.

**Closure criterion:** Incomplete required review blocks approval entry/policy authority; optional review does not block absent explicit configuration.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/proposal/src/repo/proposal-repository.ts:191](../../../../src/proposal/src/repo/proposal-repository.ts#L191); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### FLOW-006 — Proposal Submission into Approval Workflow

PRD physical p. 179 · **P0** · Frontend: conflicting · Backend: partial-source · Integration: not-connected

**Assessment:** Fixture submit creates new exposed version; backend transitions state but no configured routing/work items/frozen profile; REST boundary lacks service token/roles.

**Do not misrepresent:** Submission version increment violates p179; backend RPC source is not an integrated user route.

**Closure criterion:** Submit current ready Draft freezes same controlled version, resolves path/actors and creates accountable work items using a verified API boundary.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1915](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1915); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/proposal/src/repo/proposal-repository.ts:191](../../../../src/proposal/src/repo/proposal-repository.ts#L191); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31); [src/gateway/src/clients/service-auth.ts:4](../../../../src/gateway/src/clients/service-auth.ts#L4); [src/proposal/src/context.ts:28](../../../../src/proposal/src/context.ts#L28).

### FLOW-007 — Approval Workflow Entry Readiness

PRD physical pp. 179, 180 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample readiness checks local blockers/owner; no invalid-profile/unresolved-approver/routing/review gates.

**Do not misrepresent:** Named sample approver is not proof an organisation's workflow can begin.

**Closure criterion:** Missing profile, unresolved authority or mandatory review returns precise gate failure without duplicating analytical readiness calculation.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/proposal/src/repo/proposal-repository.ts:191](../../../../src/proposal/src/repo/proposal-repository.ts#L191).

### FLOW-008 — Approval Routing

PRD physical pp. 180, 181 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Test-selected reviewer alternatives are not configured routing by impact/scope/guardrail treatment.

**Do not misrepresent:** Labels do not imply authority thresholds or route calculation.

**Closure criterion:** Supported pricing-specific criteria select an authorised scoped approver/path; escalation consumes retained guardrail results and never grants authority.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/fixtureOperationalRepositories.js:1049](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1049); [apps/workspace/src/data/fixtures/repricingPreviewV0.js:196](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L196); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:503](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503).

### FLOW-009 — Sequential Approval

PRD physical p. 181 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No ordered approval chain; first approval directly completes proposal.

**Do not misrepresent:** Three sample approver types are alternatives, not sequential stages.

**Closure criterion:** Manager→Finance→Commercial configured sequence is enforced; later stage cannot decide early; current version stays Awaiting Approval until complete.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### FLOW-010 — Multiple Required Approvals

PRD physical pp. 181, 182 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** No all-required approvals predicate or completed/outstanding approvals display; one stage only.

**Do not misrepresent:** A single success tick cannot represent completion of a configured multiple-approval policy.

**Closure criterion:** With two required approvers, first approval leaves pending progress; second valid decision completes; duplicates/stale decisions do not double-count.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/WorkflowGuidance.jsx:19](../../../../apps/workspace/src/WorkflowGuidance.jsx#L19); [apps/workspace/src/data/fixtureOperationalRepositories.js:992](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L992); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### FLOW-011 — Approval Actions

PRD physical p. 182 · **P0** · Frontend: conflicting · Backend: partial-source · Integration: not-connected

**Assessment:** Approve and its persisted transition/event exist in backend source; Reject and Request Changes are absent. The fixture conflates rejection with return for changes.

**Do not misrepresent:** Return for changes is internally reject, not a distinct formal action.

**Closure criterion:** Expose three distinguishable, authorised, recorded decision outcomes and corresponding canonical states; a shared typed decision endpoint is acceptable.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2260](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2260); [apps/workspace/src/ProposalWorkspace.jsx:546](../../../../apps/workspace/src/ProposalWorkspace.jsx#L546); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/state-machine.ts:9](../../../../src/proposal/src/domain/state-machine.ts#L9); [src/proposal/migrations/0002_proposal_foundation.up.sql:99](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L99); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404).

### FLOW-012 — Approval Record

PRD physical p. 182 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample actor/time/version/stage evidence exists; backend event lacks controlled version/authority/comment and full immutable approval record model.

**Do not misrepresent:** An immutable transition row is not every required Approval record field.

**Closure criterion:** Store immutable approver/decision/time/controlledVersion/authority/comment; later withdrawal appends an event without overwriting original.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### FLOW-013 — Maker-Checker Enforcement

PRD physical pp. 182, 183 · **P0** · Frontend: sample-complete · Backend: conflicting · Integration: not-connected

**Assessment:** Fixture identity checks author/submitter/reviser; backend only compares creator, allowing a different submitting approver to pass its pure checker.

**Do not misrepresent:** Creator≠approver is not submitter≠approver; role stacking does not cure it.

**Closure criterion:** Creator A, submitter B with approver role: B must be denied approval; independent authorised C may approve; repeat across roles/delegation.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:540](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L540); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2301](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2301); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81); [src/proposal/src/service.ts:663](../../../../src/proposal/src/service.ts#L663); [src/proposal/src/domain/state-machine.ts:126](../../../../src/proposal/src/domain/state-machine.ts#L126).

### FLOW-014 — Approval Authority

PRD physical p. 183 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Fixture owner/admin participation separated; server requires approver but lacks scope/limits/current-membership model.

**Do not misrepresent:** Literal approver role is not sufficient commercial authority evaluation.

**Closure criterion:** Admin-only denied approval; separate explicit grant permits only appropriate scoped/limited decisions while identity restrictions persist.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:540](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L540); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2301](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2301); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### FLOW-015 — Scope-Aware Approval

PRD physical p. 183 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No approval grants limited by business unit/category/region/channel/vendor/other supported scope.

**Do not misrepresent:** Assigned reviewer identity is not scoped approval authority.

**Closure criterion:** Approver for scope A cannot approve scope B or a mixed-scope proposal without complete applicable authority.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:65](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L65); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### FLOW-016 — Approval Binding to Controlled Proposal Version

PRD physical pp. 183, 184 · **P0** · Frontend: conflicting · Backend: partial-source · Integration: not-connected

**Assessment:** Fixture exact-ref checks are good but approval increments displayed version; backend approval references ID only, not submitted controlled snapshot.

**Do not misrepresent:** A new ref produced by approval obscures which controlled version was authorised.

**Closure criterion:** Approval record binds submitted vN snapshot without creating another controlled version; vN+1 cannot inherit approval.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1915](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1915); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### FLOW-017 — Workflow Treatment of Material Proposal Changes

PRD physical p. 184 · **P0** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Returned sample pricing replacement resets approval; no general submitted/approved material-edit restart workflow.

**Do not misrepresent:** One fixture correction path is not comprehensive material-change handling.

**Closure criterion:** Material edit invalidates relevant work items, creates new version and restarts required review/decision path without inherited authority.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1638](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1638); [apps/workspace/src/RoleWorkspace.jsx:331](../../../../apps/workspace/src/RoleWorkspace.jsx#L331); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/src/domain/state-machine.ts:9](../../../../src/proposal/src/domain/state-machine.ts#L9); [src/proposal/migrations/0002_proposal_foundation.up.sql:99](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L99).

### FLOW-018 — Workflow Treatment of Non-Material Proposal Changes

PRD physical p. 185 · **P3** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** No optional post-submission non-material-change workflow; supported title edits occur only in Draft.

**Do not misrepresent:** Draft title editing does not prove safe non-material correction after decision entry.

**Closure criterion:** If deferred, disallow post-submission edits; if enabled, preserve version/snapshot/decision and append a specifically non-material audit event.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2239](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2239); [apps/workspace/src/RoleWorkspace.jsx:341](../../../../apps/workspace/src/RoleWorkspace.jsx#L341); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:233](../../../../src/proposal/src/service.ts#L233); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404).

### FLOW-019 — Workflow Treatment of Changes Requested

PRD physical pp. 185, 186 · **P0** · Frontend: conflicting · Backend: absent · Integration: not-connected

**Assessment:** Return preserves reason and safe revision route but lacks Changes Requested state/current work-item closure and general review restart.

**Do not misrepresent:** Immediate draft replacement collapses formal change request and correction.

**Closure criterion:** Request Changes records reviewed version/status/reason, stops invalid outstanding actions, and new material version requires fresh review/approval.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2260](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2260); [apps/workspace/src/ProposalWorkspace.jsx:546](../../../../apps/workspace/src/ProposalWorkspace.jsx#L546); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1638](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1638); [apps/workspace/src/RoleWorkspace.jsx:331](../../../../apps/workspace/src/RoleWorkspace.jsx#L331); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/state-machine.ts:9](../../../../src/proposal/src/domain/state-machine.ts#L9); [src/proposal/migrations/0002_proposal_foundation.up.sql:99](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L99).

### FLOW-020 — Workflow Treatment of Rejection

PRD physical p. 186 · **P0** · Frontend: conflicting · Backend: absent · Integration: not-connected

**Assessment:** Separate rejection workflow absent; same fixture reject opens editable returned Draft.

**Do not misrepresent:** Rejection must not merely be a correction flag.

**Closure criterion:** Reject exact version, close pending decision actions, deny execution and retain rejection; renewed work follows explicit new Proposal/version process.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2260](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2260); [apps/workspace/src/ProposalWorkspace.jsx:546](../../../../apps/workspace/src/ProposalWorkspace.jsx#L546); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/state-machine.ts:9](../../../../src/proposal/src/domain/state-machine.ts#L9); [src/proposal/migrations/0002_proposal_foundation.up.sql:99](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L99).

### FLOW-021 — Approval Completion and Execution Readiness

PRD physical pp. 186, 187 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** One-stage sample requires approval then publish; backend override directly approves; all-required approvals, canonical validity and Initiative readiness absent.

**Do not misrepresent:** An exception approval is not completion of the organisation's full approval path.

**Closure criterion:** All configured decisions must complete before Approved; Initiative becomes Ready for Execution only for current valid authorised baseline.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2333](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2333); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:201](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L201); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81); [src/proposal/src/service.ts:663](../../../../src/proposal/src/service.ts#L663); [src/proposal/src/domain/state-machine.ts:126](../../../../src/proposal/src/domain/state-machine.ts#L126); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### FLOW-022 — Policy Authorisation Path

PRD physical pp. 187, 188 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Distinct configured non-AI Authorised Within Policy path and exact-version evaluation/record absent. Tenant opt-in is optional; supporting configuration is MUST under GOV027.

**Do not misrepresent:** Margin exception approval or floor pass is not Policy Authorisation.

**Closure criterion:** Default disabled; explicitly enabled eligible exact Draft snapshot evaluates policy/scope/authority/guardrail conditions, records result and grants authority only to that version.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2105](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2105); [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:663](../../../../src/proposal/src/service.ts#L663); [src/proposal/src/domain/state-machine.ts:126](../../../../src/proposal/src/domain/state-machine.ts#L126); [src/proposal/src/domain/state-machine.ts:9](../../../../src/proposal/src/domain/state-machine.ts#L9); [src/proposal/migrations/0002_proposal_foundation.up.sql:99](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L99).

### FLOW-023 — Policy Authorisation Boundary

PRD physical pp. 188, 189 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No policy-authorisation failure handling, fallback to item approval or attributable failed evaluation.

**Do not misrepresent:** Treating override-approved or no floor breaches as authorised would bypass policy boundaries.

**Closure criterion:** Fail policy path for missing/current-invalid/scope/authority/threshold/Blocking/required-unknown/Escalation conditions; route appropriately, never create authority on failure.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2105](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2105); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:663](../../../../src/proposal/src/service.ts#L663); [src/proposal/src/domain/state-machine.ts:126](../../../../src/proposal/src/domain/state-machine.ts#L126); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:503](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503).

### FLOW-024 — Urgent Workflow

PRD physical p. 189 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No qualifying urgent marker or bounded queue/notification treatment.

**Do not misrepresent:** Blocker severity and pricing attention are not user-declared urgency.

**Closure criterion:** Authorised user marks qualifying work urgent; prioritisation changes but no review/decision/guardrail/maker-checker gate is bypassed.

Frontend evidence: [apps/workspace/src/WorkflowGuidance.jsx:19](../../../../apps/workspace/src/WorkflowGuidance.jsx#L19); [apps/workspace/src/data/fixtureOperationalRepositories.js:992](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L992); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4).

### FLOW-025 — Approval Deadlines

PRD physical pp. 189, 190 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** SHOULD deadline/target-date model and approaching/overdue display absent; requires explicit deferral decision if not delivered.

**Do not misrepresent:** Proposal effective date or exception expiry is not an approval response deadline.

**Closure criterion:** Configure target response time; show pending/approaching/overdue consistently without changing authority.

Frontend evidence: [apps/workspace/src/WorkflowGuidance.jsx:19](../../../../apps/workspace/src/WorkflowGuidance.jsx#L19); [apps/workspace/src/data/fixtureOperationalRepositories.js:992](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L992); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### FLOW-026 — Escalation

PRD physical p. 190 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** SHOULD overdue bounded escalation is missing, not an arbitrary automation request.

**Do not misrepresent:** Reassigning a sample actor is not scoped escalation.

**Closure criterion:** Supported overdue trigger notifies/reroutes only to already-authorised users, audits event, preserves content/snapshot and never grants approval.

Frontend evidence: [apps/workspace/src/WorkflowGuidance.jsx:19](../../../../apps/workspace/src/WorkflowGuidance.jsx#L19); [apps/workspace/src/data/fixtureOperationalRepositories.js:992](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L992); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### FLOW-027 — Approval Delegation

PRD physical p. 190 · **P3** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional authorised approver delegation is absent; draft submission handoff is a different operation.

**Do not misrepresent:** Handoff must not be marketed as approval delegation.

**Closure criterion:** Explicitly defer optional delegation; if enabled configure scope/time/actor/audit and retain submitter identity maker-checker.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2239](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2239); [apps/workspace/src/RoleWorkspace.jsx:341](../../../../apps/workspace/src/RoleWorkspace.jsx#L341); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### FLOW-028 — Approval Withdrawal

PRD physical pp. 190, 191 · **P3** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional pre-irreversible-execution approval withdrawal absent.

**Do not misrepresent:** No withdrawal path is a deferrable capability, not permission to delete an approval.

**Closure criterion:** If enabled, policy authorises withdrawal before irreversible execution; append actor/time/reason/result state and retain original Approval.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2333](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2333); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:201](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L201); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/state-machine.ts:9](../../../../src/proposal/src/domain/state-machine.ts#L9); [src/proposal/migrations/0002_proposal_foundation.up.sql:99](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L99); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404).

### FLOW-029 — Workflow Treatment of Expiration

PRD physical p. 191 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Expired validity or closure of invalid pending decision/execution actions.

**Do not misrepresent:** Exception expiry and state-based publish checks do not govern Proposal expiry.

**Closure criterion:** Expiry preserves historical status/authority event, closes obsolete actions, blocks execution and prompts renewed decision.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2333](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2333); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:201](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L201); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/proposal/src/service.ts:1004](../../../../src/proposal/src/service.ts#L1004).

### FLOW-030 — Execution Readiness Gate

PRD physical pp. 192, 193 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample exact approved ref gate exists; backend approved-state gate lacks current version/validity/full decision/guardrail/workflow conditions.

**Do not misrepresent:** Approved state alone does not establish all execution readiness predicates.

**Closure criterion:** Gate checks exact current valid authorised snapshot and all remaining conditions; reject Draft/ChangesRequested/Rejected/pending/superseded/expired versions.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2333](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2333); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:201](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L201); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/proposal/src/service.ts:1004](../../../../src/proposal/src/service.ts#L1004); [src/proposal/src/service.ts:663](../../../../src/proposal/src/service.ts#L663); [src/proposal/src/domain/state-machine.ts:126](../../../../src/proposal/src/domain/state-machine.ts#L126).

### FLOW-031 — Workflow Visibility

PRD physical p. 193 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample next steps/owner/blockers clear for bounded flow; no full Initiative lifecycle/profile/chain visibility; backend only state.

**Do not misrepresent:** Polished next-action guidance is not evidence of configured multi-stage progress.

**Closure criterion:** Participants see current stage, completed/outstanding work, responsible party, pending approvals and actionable blockers directly.

Frontend evidence: [apps/workspace/src/WorkflowGuidance.jsx:19](../../../../apps/workspace/src/WorkflowGuidance.jsx#L19); [apps/workspace/src/data/fixtureOperationalRepositories.js:992](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L992); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/proposal/src/repo/proposal-repository.ts:191](../../../../src/proposal/src/repo/proposal-repository.ts#L191).

### FLOW-032 — Workflow Notifications

PRD physical p. 193 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No real notifications for review/approval/changes/rejection/policy/escalation/readiness; Notify runtime is explicit stub.

**Do not misrepresent:** Event emission and queue cards are not delivered notifications.

**Closure criterion:** Relevant configured events create access-safe notifications deep-linked to correct Initiative and controlled proposal context.

Frontend evidence: [apps/workspace/src/WorkflowGuidance.jsx:19](../../../../apps/workspace/src/WorkflowGuidance.jsx#L19); [apps/workspace/src/data/fixtureOperationalRepositories.js:992](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L992); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:44](../../../../src/governance/src/domain/event-mapper.ts#L44); [src/governance/src/service.ts:25](../../../../src/governance/src/service.ts#L25).

### FLOW-033 — Workflow Audit History

PRD physical pp. 193, 194 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Chronological sample events and some persistent backend events exist; missing routes/review/reject/change/policy/expiry/delegate/config coverage and audit reads.

**Do not misrepresent:** A partial event catalogue is not complete workflow history.

**Closure criterion:** Every supported consequential event is immutable, attributable, ordered and inspectable, with exact proposal/version/workflow references.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1638](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1638); [apps/workspace/src/RoleWorkspace.jsx:331](../../../../apps/workspace/src/RoleWorkspace.jsx#L331); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:44](../../../../src/governance/src/domain/event-mapper.ts#L44); [src/governance/src/service.ts:25](../../../../src/governance/src/service.ts#L25).

### FLOW-034 — Historical Authority Context

PRD physical p. 194 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample submission policy/stage context partial; backend decisions omit historical role/scope/limits/membership/workflow/policy snapshots.

**Do not misrepresent:** Current JWT claims cannot explain old decision authority.

**Closure criterion:** Change all current role/scope/profile/policy settings; prior decision still explains who had which authority under its exact historic path.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404); [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10).

### FLOW-035 — Workflow Configuration Changes

PRD physical pp. 194, 195 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Sample analyst-policy history/reference exists; no versioned Workflow Profile with prospective change and active-work migration rules.

**Do not misrepresent:** Versioning a single toggle is not workflow configuration versioning.

**Closure criterion:** Profile changes retain old/new/actor/time/effective period; submitted version keeps its profile unless an explicit audited version-governed migration occurs.

Frontend evidence: [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:44](../../../../src/governance/src/domain/event-mapper.ts#L44); [src/governance/src/service.ts:25](../../../../src/governance/src/service.ts#L25).

### FLOW-036 — Workflow Integrity Principle

PRD physical p. 196 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Bounded sample and partial backend events cannot reconstruct full submitted version, decision path, authority/configuration and implementation comparison.

**Do not misrepresent:** Fixture journey success cannot be called controlled end-to-end MVP.

**Closure criterion:** Reconstruct complete real-workflow chain from submitter and exact snapshot through authority decision and actual implementation without current-data reinterpretation.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2333](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2333); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:201](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L201); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:44](../../../../src/governance/src/domain/event-mapper.ts#L44); [src/governance/src/service.ts:25](../../../../src/governance/src/service.ts#L25).

## GOV: Governance and authority (37)

### GOV-001 — Role-Based Access Control

PRD physical p. 198 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** No configurable server Role×Action×Resource×Scope evaluator; backend has service allowlists plus sparse literal-role checks.

**Do not misrepresent:** Client capability gates cannot establish server RBAC.

**Closure criterion:** Configure grants then test every protected read/write server-side with allow/deny permutations, independently of visible controls.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/workspaceAccess.js:18](../../../../apps/workspace/src/workspaceAccess.js#L18); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:193](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/gateway/src/routes/margin.ts:104](../../../../src/gateway/src/routes/margin.ts#L104); [src/margin/internal/handler/rules.go:63](../../../../src/margin/internal/handler/rules.go#L63); [src/margin/cmd/server/main.go:66](../../../../src/margin/cmd/server/main.go#L66); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/proposal/src/service.ts:1004](../../../../src/proposal/src/service.ts#L1004).

### GOV-002 — Core MVP Roles

PRD physical p. 198 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** SHOULD eleven-role baseline has ten role concepts in sample, no Workspace Admin identity; backend only admin/approver checks and JWT strings, not canonical role definitions.

**Do not misrepresent:** Finance label maps to approver; Executor maps to publisher; Auditor to governance_auditor. New labels are not migrated backend roles.

**Closure criterion:** Ratify canonical codes/labels/permission combinations for all eleven or explicitly defer SHOULD roles without weakening mandatory separation/scope checks.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### GOV-003 — Account Owner

PRD physical p. 199 · **P0** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Sample owner has one policy permission and no pricing authority; ownership/membership/admin continuity management absent.

**Do not misrepresent:** Owner label does not implement transfer/last-owner invariants.

**Closure criterion:** Owner manages supported administration, cannot remove final owner or approve/execute without explicit separate permission.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### GOV-004 — Workspace Admin

PRD physical p. 199 · **P1** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** No Workspace Admin sample/configuration product; backend admin only guards catalog reference writes, margin administration not end-user gated.

**Do not misrepresent:** Import preparation or Auditor labels must not imply Workspace Admin authority.

**Closure criterion:** Admin can manage supported user/role/scope/profile/control/settings with audit, without implicit pricing approval or execution.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/fixtureOperationalRepositories.js:1049](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1049); [apps/workspace/src/data/fixtures/repricingPreviewV0.js:196](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L196); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/gateway/src/routes/margin.ts:104](../../../../src/gateway/src/routes/margin.ts#L104); [src/margin/internal/handler/rules.go:63](../../../../src/margin/internal/handler/rules.go#L63); [src/margin/cmd/server/main.go:66](../../../../src/margin/cmd/server/main.go#L66).

### GOV-005 — Pricing Manager

PRD physical pp. 199, 200 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Sample Pricing Manager prepares/receives/submits draft and triages intake; Initiative/collaborator/scope/workflow coordination model absent.

**Do not misrepresent:** Ada sample is not a production Pricing Manager role grant.

**Closure criterion:** Manager works within authorised Initiative scope and coordinates/submits without acquiring approval unless separately granted.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2239](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2239); [apps/workspace/src/RoleWorkspace.jsx:341](../../../../apps/workspace/src/RoleWorkspace.jsx#L341); [apps/workspace/src/data/fixtureCompanyRequests.js:81](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L81); [apps/workspace/src/RoleWorkspace.jsx:98](../../../../apps/workspace/src/RoleWorkspace.jsx#L98); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:194](../../../../src/proposal/src/service.ts#L194); [src/proposal/src/repo/proposal-repository.ts:59](../../../../src/proposal/src/repo/proposal-repository.ts#L59); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### GOV-006 — Pricing Analyst

PRD physical p. 200 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Sample analyst can prepare prices and conditionally submit, with no approval; analysis/Scenario/Initiative contribution and server role model absent.

**Do not misrepresent:** Analyst-can-submit is sample company choice, not a PRD mandate or production default.

**Closure criterion:** Analyst performs authorised preparation/analysis without formal approval; organisation-approved submission policy enforced at server boundary.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:194](../../../../src/proposal/src/service.ts#L194); [src/proposal/src/repo/proposal-repository.ts:59](../../../../src/proposal/src/repo/proposal-repository.ts#L59); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### GOV-007 — Pricing Contributor

PRD physical p. 200 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Contributor sample provides own pricing-intake text; no assigned portions of Initiative work, evidence attachments, assignments or defined pricing inputs.

**Do not misrepresent:** Intake request is not an Initiative or a Proposal and should remain labelled as such.

**Closure criterion:** Contributor accesses only assigned permitted work/context, comments/evidence/inputs; cannot broaden authority or see other contributors' restricted work.

Frontend evidence: [apps/workspace/src/data/fixtureCompanyRequests.js:81](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L81); [apps/workspace/src/RoleWorkspace.jsx:98](../../../../apps/workspace/src/RoleWorkspace.jsx#L98); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### GOV-008 — Finance Approver

PRD physical pp. 200, 201 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Finance fixture uses approver code and line floor evidence; backend approval lacks finance-specific scope/limits and actual-submitter checker.

**Do not misrepresent:** Finance display label does not establish configured financial authority.

**Closure criterion:** Finance approval requires assigned financial authority within scope/limit, exact snapshot and independent actor; denial is server-enforced.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/fixtureEconomicsVisibility.js:3](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L3); [apps/workspace/src/data/fixtureEconomicsVisibility.js:10](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L10); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### GOV-009 — Commercial Approver

PRD physical p. 201 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Commercial fixture may be selected as one reviewer; backend only approver code, no commercial routing or authority model.

**Do not misrepresent:** commercial_approver label/capability is fixture-only and not a server contract.

**Closure criterion:** Commercially required work routes to permitted commercial authority, with market/customer/revenue context, exact version and scope checks.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### GOV-010 — Executive Approver

PRD physical p. 201 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Executive sample is an alternative single reviewer; no higher-authority threshold/profile or server executive grant.

**Do not misrepresent:** Executive identity is not an override of governance or a implemented escalation chain.

**Closure criterion:** Higher-authority work requires explicit scoped executive authority and all maker-checker/version/required-stage controls.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:540](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L540); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2301](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2301); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### GOV-011 — Executor

PRD physical pp. 201, 202 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Fixture separates publisher from approver and exact ref; backend publish/schedule checks user identity/approved state, not executor scope or controlled validity.

**Do not misrepresent:** A publisher label and approved flag do not prove execution authority.

**Closure criterion:** Executor can act only on current valid authorised version in execution scope; cannot edit snapshot/action/scope or create authority.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2333](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2333); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:201](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L201); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/proposal/src/service.ts:1004](../../../../src/proposal/src/service.ts#L1004); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1).

### GOV-012 — Viewer

PRD physical p. 202 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Viewer sample has read-only/redacted capabilities; backend lacks viewer/default-deny action/field/scope boundary.

**Do not misrepresent:** Safe fixture Viewer does not mean a viewer-token user is denied server writes or costs.

**Closure criterion:** Viewer can inspect permitted fields/resources only; all mutation and restricted field APIs deny even direct requests.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureEconomicsVisibility.js:3](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L3); [apps/workspace/src/data/fixtureEconomicsVisibility.js:10](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L10); [apps/workspace/src/workspaceAccess.js:18](../../../../apps/workspace/src/workspaceAccess.js#L18); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:193](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/routes/catalog.ts:95](../../../../src/gateway/src/routes/catalog.ts#L95); [src/catalog/src/service.ts:134](../../../../src/catalog/src/service.ts#L134); [src/proposal/src/service.ts:194](../../../../src/proposal/src/service.ts#L194); [src/proposal/src/repo/proposal-repository.ts:59](../../../../src/proposal/src/repo/proposal-repository.ts#L59); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/proposal/src/service.ts:1004](../../../../src/proposal/src/service.ts#L1004).

### GOV-013 — Auditor

PRD physical p. 202 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample Auditor reads bounded history; backend audit substrate exists but read APIs unimplemented and no auditor-specific authority; restore boundary lacks end-user permissions.

**Do not misrepresent:** governance_auditor sample is not an implemented read-only audit backend role.

**Closure criterion:** Authorised auditor reconstructs history read-only within scope; cannot restore/change configuration absent explicit additional permission.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:44](../../../../src/governance/src/domain/event-mapper.ts#L44); [src/governance/src/service.ts:25](../../../../src/governance/src/service.ts#L25); [src/governance/src/context.ts:8](../../../../src/governance/src/context.ts#L8); [src/governance/src/server.ts:59](../../../../src/governance/src/server.ts#L59).

### GOV-014 — Multiple Roles

PRD physical p. 202 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Role arrays exist; no administered union evaluator; backend same-creator check does not prohibit actual submitter approval.

**Do not misrepresent:** Multiple roles must not be interpreted as exempting identity restrictions.

**Closure criterion:** Combining analyst/approver/admin roles yields only authorised grants; same individual still cannot approve their submitted work.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:540](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L540); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2301](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2301); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### GOV-015 — Permission Categories

PRD physical pp. 202, 203 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample explicit capability categories broad but Reject/Request Changes merged; backend distinguishes services/approver/admin only and leaves key actions ungated.

**Do not misrepresent:** Action-specific buttons are not server action permissions.

**Closure criterion:** Define independent action permissions across resources/scopes, including Reject versus Request Changes; API bypass never authorises hidden actions.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/workspaceAccess.js:18](../../../../apps/workspace/src/workspaceAccess.js#L18); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:193](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L193); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2260](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2260); [apps/workspace/src/ProposalWorkspace.jsx:546](../../../../apps/workspace/src/ProposalWorkspace.jsx#L546); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/proposal/src/service.ts:194](../../../../src/proposal/src/service.ts#L194); [src/proposal/src/repo/proposal-repository.ts:59](../../../../src/proposal/src/repo/proposal-repository.ts#L59); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/proposal/src/service.ts:1004](../../../../src/proposal/src/service.ts#L1004).

### GOV-016 — Resource-Level Permissions

PRD physical pp. 203, 204 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample domain read/write gates and own intake exist; server RLS isolates org but not required per-resource action grants; missing Initiative/Scenario/Policy/Execution resources.

**Do not misrepresent:** Domain URLs and tenant RLS are not resource-level authorisation.

**Closure criterion:** Same user has demonstrably different grants on costs, Initiative, Proposal, decision and audit objects; direct ID access follows resource policy.

Frontend evidence: [apps/workspace/src/workspaceAccess.js:18](../../../../apps/workspace/src/workspaceAccess.js#L18); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:193](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L193); [apps/workspace/src/data/fixtureEconomicsVisibility.js:3](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L3); [apps/workspace/src/data/fixtureEconomicsVisibility.js:10](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L10); [apps/workspace/src/data/fixtureCompanyRequests.js:81](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L81); [apps/workspace/src/RoleWorkspace.jsx:98](../../../../apps/workspace/src/RoleWorkspace.jsx#L98); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/db.ts:23](../../../../src/proposal/src/db.ts#L23); [src/proposal/migrations/0002_proposal_foundation.up.sql:266](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L266); [src/gateway/src/routes/catalog.ts:95](../../../../src/gateway/src/routes/catalog.ts#L95); [src/catalog/src/service.ts:134](../../../../src/catalog/src/service.ts#L134); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### GOV-017 — Scope-Based Authority

PRD physical p. 204 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No configured organisational authority scope model; pricing filters and org transaction are not scope grants.

**Do not misrepresent:** Channel/category filter does not prove authority over resulting rows.

**Closure criterion:** Out-of-scope resource reads/edits/approvals/execution denied; mixed scope evaluated explicitly and consistently.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:65](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L65); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81).

### GOV-018 — Effective Permission Evaluation

PRD physical p. 204 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample checks action/ref/actor; backend does not verify active membership, all actions/resources or permitted scope before consequential work.

**Do not misrepresent:** Authenticated JWT plus service identity is not complete effective permission evaluation.

**Closure criterion:** Every protected action verifies active member, role-action grant, resource access, scope and governance restrictions; failure of any denies safely.

Frontend evidence: [apps/workspace/src/workspaceAccess.js:18](../../../../apps/workspace/src/workspaceAccess.js#L18); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:193](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L193); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:540](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L540); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2301](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2301); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:65](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L65); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/src/service.ts:194](../../../../src/proposal/src/service.ts#L194); [src/proposal/src/repo/proposal-repository.ts:59](../../../../src/proposal/src/repo/proposal-repository.ts#L59); [src/gateway/src/routes/margin.ts:104](../../../../src/gateway/src/routes/margin.ts#L104); [src/margin/internal/handler/rules.go:63](../../../../src/margin/internal/handler/rules.go#L63); [src/margin/cmd/server/main.go:66](../../../../src/margin/cmd/server/main.go#L66); [src/gateway/src/routes/catalog.ts:95](../../../../src/gateway/src/routes/catalog.ts#L95); [src/catalog/src/service.ts:134](../../../../src/catalog/src/service.ts#L134).

### GOV-019 — Maker-Checker Separation

PRD physical pp. 204, 205 · **P0** · Frontend: sample-complete · Backend: conflicting · Integration: not-connected

**Assessment:** Sample enforces user-level submitter restriction; backend tests creator equality and override-requester equality instead.

**Do not misrepresent:** Different creator is not sufficient independence from submitter.

**Closure criterion:** User B submits user A's proposal and holds approval/admin/owner roles; B is always denied same-version approval, C succeeds only if authorised.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:540](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L540); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2301](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2301); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81); [src/proposal/src/service.ts:663](../../../../src/proposal/src/service.ts#L663); [src/proposal/src/domain/state-machine.ts:126](../../../../src/proposal/src/domain/state-machine.ts#L126).

### GOV-020 — Commercial Authority Separation

PRD physical p. 205 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample separates preparation/admin/execution from approval; backend explicit approver gate exists but no full authority scope or configurable grants.

**Do not misrepresent:** Exception approval and operational participation cannot implicitly complete commercial decision authority.

**Closure criterion:** Participation grants do not grant approve; explicit commercial grant still observes identity, scope and decision-stage limits.

Frontend evidence: [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/workspaceAccess.js:18](../../../../apps/workspace/src/workspaceAccess.js#L18); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:193](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81); [src/proposal/src/service.ts:663](../../../../src/proposal/src/service.ts#L663); [src/proposal/src/domain/state-machine.ts:126](../../../../src/proposal/src/domain/state-machine.ts#L126).

### GOV-021 — Cost Visibility

PRD physical p. 205 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Independent sample economics capability exists; backend catalog and margin routes lack end-user economics checks across outputs.

**Do not misrepresent:** UI redaction is not cost access control for API/export/AI paths.

**Closure criterion:** Cost-restricted pricing participant receives safe projections on every supported domain/channel and cannot call raw cost endpoints.

Frontend evidence: [apps/workspace/src/data/fixtureEconomicsVisibility.js:3](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L3); [apps/workspace/src/data/fixtureEconomicsVisibility.js:10](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L10); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/routes/catalog.ts:95](../../../../src/gateway/src/routes/catalog.ts#L95); [src/catalog/src/service.ts:134](../../../../src/catalog/src/service.ts#L134); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:503](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503).

### GOV-022 — Protection Against Derived Cost Disclosure

PRD physical pp. 205, 206 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample removes cost-derived margins/floors and free-text reasons; backend returns raw cost and derivable floors/gaps without a field policy.

**Do not misrepresent:** Nulling visible cost while returning reconstructable derived outputs would still disclose it.

**Closure criterion:** Test raw cost, price-plus-margin/floor combinations, policy/evaluation outputs and notes; denied user cannot reconstruct restricted cost.

Frontend evidence: [apps/workspace/src/data/fixtureEconomicsVisibility.js:3](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L3); [apps/workspace/src/data/fixtureEconomicsVisibility.js:10](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L10); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/routes/catalog.ts:95](../../../../src/gateway/src/routes/catalog.ts#L95); [src/catalog/src/service.ts:134](../../../../src/catalog/src/service.ts#L134); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:503](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503).

### GOV-023 — Guardrail Definition and Management Authority

PRD physical pp. 206, 207 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Read-only floor examples; server margin-rule CRUD lacks policy-manager permission, name/operator/treatment range/history, and evaluates only winning matching rule.

**Do not misrepresent:** A minimum-margin policy/rule is partial Guardrail, not Strategy/Builder pricing logic or all applicable controls.

**Closure criterion:** Authorised governance user configures identifiable/versioned supported constraints and treatments; all applicable controls evaluated separately; later changes cannot rewrite submitted snapshot.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:1049](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1049); [apps/workspace/src/data/fixtures/repricingPreviewV0.js:196](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L196); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/routes/margin.ts:104](../../../../src/gateway/src/routes/margin.ts#L104); [src/margin/internal/handler/rules.go:63](../../../../src/margin/internal/handler/rules.go#L63); [src/margin/cmd/server/main.go:66](../../../../src/margin/cmd/server/main.go#L66); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:503](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503); [src/margin/internal/repo/repo.go:77](../../../../src/margin/internal/repo/repo.go#L77); [src/margin/internal/repo/repo.go:103](../../../../src/margin/internal/repo/repo.go#L103).

### GOV-024 — Guardrail Enforcement and Ownership Boundary

PRD physical pp. 207, 208 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Margin delegates quantitative evaluation to Intelligence, which is a sound boundary; no canonical retained evaluation/config consumed across Builder/Scenario/workflow/policy/execution.

**Do not misrepresent:** Do not call deterministic Python Intelligence generative AI; governance/control ownership is still incomplete.

**Closure criterion:** One authoritative evaluation/config version travels through all consumers; mutable inputs refresh via analysis, submitted snapshots never silently refresh.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:1049](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1049); [apps/workspace/src/data/fixtures/repricingPreviewV0.js:196](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L196); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:503](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/proposal/src/repo/proposal-repository.ts:191](../../../../src/proposal/src/repo/proposal-repository.ts#L191); [src/proposal/src/service.ts:832](../../../../src/proposal/src/service.ts#L832); [src/proposal/migrations/0002_proposal_foundation.up.sql:121](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L121).

### GOV-025 — Guardrail Behavioural Treatment

PRD physical pp. 208, 209 · **P0** · Frontend: conflicting · Backend: conflicting · Integration: not-connected

**Assessment:** No configurable Warning/Approval Escalation/Blocking treatment; backend converts evaluation error and breach to BLOCK, and state machine blocks even WARN.

**Do not misrepresent:** Unable to Evaluate is not Breach; floor-clear does not mean Authorised Within Policy.

**Closure criterion:** For each treatment verify gate/routing/visibility; preserve unknown separately, keep Within Guardrail non-adverse, and never redefine treatment by screen/AI.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:1049](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1049); [apps/workspace/src/data/fixtures/repricingPreviewV0.js:196](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L196); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2105](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2105); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:503](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503); [src/proposal/src/service.ts:255](../../../../src/proposal/src/service.ts#L255); [src/proposal/src/repo/proposal-repository.ts:191](../../../../src/proposal/src/repo/proposal-repository.ts#L191).

### GOV-026 — Approval Authority Levels

PRD physical pp. 209, 210 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No configurable approval authority limits by price change/margin/discount/category/BU/scope/significance.

**Do not misrepresent:** Higher-title reviewer is not a threshold model.

**Closure criterion:** A scoped approver cannot approve beyond configured limit; crossing threshold routes to a separately qualified authority.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:115](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L115); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2292](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2292); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1007](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1007); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:65](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L65); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:370](../../../../src/proposal/src/service.ts#L370); [src/proposal/src/domain/state-machine.ts:81](../../../../src/proposal/src/domain/state-machine.ts#L81); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### GOV-027 — Policy Authorisation Configuration

PRD physical pp. 210, 211 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** MUST support organisational Policy Authorisation configuration; absent. Enabling per organisation is optional and default must remain disabled.

**Do not misrepresent:** Cannot dismiss configuration as wholly optional because FLOW022 tenant opt-in is MAY; analyst-submission toggle is unrelated.

**Closure criterion:** Default disabled; only policy/admin authority changes versioned configuration; enablement alone grants no Proposal authority.

Frontend evidence: [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2105](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2105); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/domain/state-machine.ts:9](../../../../src/proposal/src/domain/state-machine.ts#L9); [src/proposal/migrations/0002_proposal_foundation.up.sql:99](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L99); [src/proposal/src/service.ts:663](../../../../src/proposal/src/service.ts#L663); [src/proposal/src/domain/state-machine.ts:126](../../../../src/proposal/src/domain/state-machine.ts#L126).

### GOV-028 — Policy Authorisation Governance Enforcement

PRD physical pp. 211, 212 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No configured policy-path governance checks or exact controlled snapshot consumption; override approval is a different human decision.

**Do not misrepresent:** Authorising an exception is not automatically Authorised Within Policy.

**Closure criterion:** Verify enabled/valid policy, invoking authority/scope, retained control versions/results/treatments; any required failure denies policy authority and follows explicit fallback.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2105](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2105); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/service.ts:663](../../../../src/proposal/src/service.ts#L663); [src/proposal/src/domain/state-machine.ts:126](../../../../src/proposal/src/domain/state-machine.ts#L126); [src/margin/internal/handler/validate_batch.go:82](../../../../src/margin/internal/handler/validate_batch.go#L82); [src/data-pipeline/owomide_data_pipeline/intelligence/rules.py:503](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503).

### GOV-029 — No Implicit Privilege Escalation

PRD physical p. 212 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample handoff only selects already-capable submitters and grants no role; Initiative owner/collaborator/mention model absent and server lacks full resource grants.

**Do not misrepresent:** Draft ownership change must not be mistaken for new organisation authority.

**Closure criterion:** Assignment/mention/collaboration/ownership never increases grants; all next actions re-evaluate existing permission and scope.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2239](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2239); [apps/workspace/src/RoleWorkspace.jsx:341](../../../../apps/workspace/src/RoleWorkspace.jsx#L341); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/fixtureCompanyRequests.js:81](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L81); [apps/workspace/src/RoleWorkspace.jsx:98](../../../../apps/workspace/src/RoleWorkspace.jsx#L98); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/proposal/src/service.ts:194](../../../../src/proposal/src/service.ts#L194); [src/proposal/src/repo/proposal-repository.ts:59](../../../../src/proposal/src/repo/proposal-repository.ts#L59).

### GOV-030 — AI Permission Inheritance

PRD physical pp. 212, 213 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No user-facing AI permission-inheritance implementation. Deterministic margin service is internal service-authenticated, not a generative AI user context.

**Do not misrepresent:** Internal service-token protection does not prove AI Role×Action×Resource×Scope inheritance.

**Closure criterion:** Invoking AI receives only the user's authorised/redacted context; cross-scope/restricted cost/history prompts cannot reveal denied data.

Frontend evidence: [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17); [apps/workspace/src/data/fixtureEconomicsVisibility.js:3](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L3); [apps/workspace/src/data/fixtureEconomicsVisibility.js:10](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L10).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:122](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L122); [src/lib/proto/services/intelligence/v1/intelligence.proto:11](../../../../src/lib/proto/services/intelligence/v1/intelligence.proto#L11); [src/gateway/src/routes/catalog.ts:95](../../../../src/gateway/src/routes/catalog.ts#L95); [src/catalog/src/service.ts:134](../../../../src/catalog/src/service.ts#L134).

### GOV-031 — AI Authority Boundary

PRD physical p. 213 · **P1** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** No generative AI governed action layer found; deterministic Intelligence exposes evaluation only, a useful separation but not full product enforcement.

**Do not misrepresent:** Deterministic engine must not be conflated with autonomous AI or policy authority.

**Closure criterion:** AI assists only; human-only formal decisions and non-AI configured policy evaluation enforce all consequential action authority at server boundary.

Frontend evidence: [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161).

Backend evidence: [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:122](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L122); [src/lib/proto/services/intelligence/v1/intelligence.proto:11](../../../../src/lib/proto/services/intelligence/v1/intelligence.proto#L11); [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68).

### GOV-032 — Permission Change Behaviour

PRD physical p. 213 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample analyst policy updates future currentSession capability and records past ref; server JWT roles persist until expiration with no fresh membership/permission resolution.

**Do not misrepresent:** Refreshing sample policy is not immediate role/scope revocation.

**Closure criterion:** Change grant/scope and deny subsequent action from an already-issued token; historic authority remains frozen.

Frontend evidence: [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2183](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2183); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404).

### GOV-033 — User Suspension and Revocation

PRD physical pp. 213, 214 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No member suspension/deactivation or immediate protected-action revocation; sign-out only sample local state.

**Do not misrepresent:** Session expiry is not immediate suspension enforcement.

**Closure criterion:** Suspend/deactivate user; all existing sessions stop protected work immediately, while comments/analyses/decisions/execution/audit remain attributable.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1086](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1086); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:45](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L45); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:161](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L161); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404).

### GOV-034 — Governance Configuration Versioning and Historical Context

PRD physical pp. 214, 215 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample toggle and proposal snapshots retain some config; backend margin updates overwrite old state and deactivation does not increment version; broader governance snapshots absent.

**Do not misrepresent:** A numeric margin version without old rows/events cannot reconstruct prior governance.

**Closure criterion:** Every consequential role/scope/control/profile/policy change stores immutable old/new/id/version/actor/time/effect; submitted decision preserves its original configuration.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/margin/internal/repo/repo.go:77](../../../../src/margin/internal/repo/repo.go#L77); [src/margin/internal/repo/repo.go:103](../../../../src/margin/internal/repo/repo.go#L103); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:44](../../../../src/governance/src/domain/event-mapper.ts#L44); [src/governance/src/service.ts:25](../../../../src/governance/src/service.ts#L25).

### GOV-035 — Permission Failure Behaviour

PRD physical p. 215 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample repository gates and structured failures are sound; server checks inconsistent/missing and governance trusted-header boundary remains weak.

**Do not misrepresent:** Hiding controls cannot compensate for missing API checks; blanket unauthenticated failure on broken proposal forwarding is not correct authorisation.

**Closure criterion:** Bypass UI and request each denied resource/action; API denies without mutation or restricted payload, returns clear stable permission error.

Frontend evidence: [apps/workspace/src/workspaceAccess.js:18](../../../../apps/workspace/src/workspaceAccess.js#L18); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:193](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L193); [apps/workspace/src/data/fixtureEconomicsVisibility.js:3](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L3); [apps/workspace/src/data/fixtureEconomicsVisibility.js:10](../../../../apps/workspace/src/data/fixtureEconomicsVisibility.js#L10); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/proposal/src/context.ts:85](../../../../src/proposal/src/context.ts#L85); [src/catalog/src/context.ts:68](../../../../src/catalog/src/context.ts#L68); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31); [src/gateway/src/clients/service-auth.ts:4](../../../../src/gateway/src/clients/service-auth.ts#L4); [src/proposal/src/context.ts:28](../../../../src/proposal/src/context.ts#L28); [src/gateway/src/routes/catalog.ts:95](../../../../src/gateway/src/routes/catalog.ts#L95); [src/catalog/src/service.ts:134](../../../../src/catalog/src/service.ts#L134); [src/gateway/src/routes/margin.ts:104](../../../../src/gateway/src/routes/margin.ts#L104); [src/margin/internal/handler/rules.go:63](../../../../src/margin/internal/handler/rules.go#L63); [src/margin/cmd/server/main.go:66](../../../../src/margin/cmd/server/main.go#L66); [src/governance/src/context.ts:8](../../../../src/governance/src/context.ts#L8); [src/governance/src/server.ts:59](../../../../src/governance/src/server.ts#L59).

### GOV-036 — Governance Audit Trail

PRD physical pp. 215, 216 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Some sample policy events and backend audit substrate; required membership/grants/scopes/control/profile changes not all emitted/readable.

**Do not misrepresent:** Audit table existence is not comprehensive governance auditability.

**Closure criterion:** Verify every consequential governance command emits actor/action/target/time/old/new and authorised history resolves it.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/fixtureCompanyRequests.js:46](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L46); [apps/workspace/src/RoleWorkspace.jsx:193](../../../../apps/workspace/src/RoleWorkspace.jsx#L193); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:44](../../../../src/governance/src/domain/event-mapper.ts#L44); [src/governance/src/service.ts:25](../../../../src/governance/src/service.ts#L25); [src/margin/internal/repo/repo.go:77](../../../../src/margin/internal/repo/repo.go#L77); [src/margin/internal/repo/repo.go:103](../../../../src/margin/internal/repo/repo.go#L103).

### GOV-037 — Governance Integrity Principle

PRD physical p. 216 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Cannot reliably reconstruct role/authority/resource/scope/control/configuration context for every real action; pieces exist but missing server enforcement and snapshots.

**Do not misrepresent:** Fixture-safe actors and recorded events do not establish complete governance integrity.

**Closure criterion:** For every action show who/authority/resource/permitted scope/applicable controls/separation/config at time; deny if required proof cannot be established.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:126](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L126); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:76](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L76); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:147](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L147); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:540](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L540); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2301](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2301); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/middleware/auth.ts:34](../../../../src/gateway/src/middleware/auth.ts#L34); [src/gateway/src/routes/auth.ts:10](../../../../src/gateway/src/routes/auth.ts#L10); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/proposal/src/domain/state-machine.ts:1](../../../../src/proposal/src/domain/state-machine.ts#L1); [src/proposal/migrations/0002_proposal_foundation.up.sql:67](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L67); [src/proposal/src/service.ts:404](../../../../src/proposal/src/service.ts#L404); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:44](../../../../src/governance/src/domain/event-mapper.ts#L44); [src/governance/src/service.ts:25](../../../../src/governance/src/service.ts#L25).

## AI: Contextual AI (35)

### AI-001 — Contextual AI Assistance

PRD physical p. 218 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Contextual assistance is mandatory in the PRD and absent from both runtime surfaces.

**Do not misrepresent:** Earlier CEO chat defers AI; replacement PRD AI-001/005 explicitly requires it. Resolve scope with CEO rather than silently counting AI as delivered or out of scope.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Invoke AI from a permitted Initiative/Builder/analysis/Proposal context and verify the corresponding context is inherited.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-002 — User-Initiated AI

PRD physical pp. 218, 219 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** There is no AI application boundary to verify; consequential actions must be user-invoked when AI is introduced.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Generating a suggestion leaves authoritative work unchanged; only an explicit permitted application may mutate it.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-003 — Permission Inheritance

PRD physical p. 219 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No invoking-user-scoped retrieval or tool policy exists for an AI service.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then A user and their AI session receive identical tenant/object/scope limits, including after revocation.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-004 — Cost Visibility Enforcement

PRD physical p. 219 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No AI cost-redaction or derived-cost disclosure tests exist.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then A cost-restricted actor cannot retrieve costs directly or reconstruct them through margin, markup, summaries or historical comparisons.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-005 — Pricing Context Interpretation

PRD physical pp. 219, 220 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Mandatory pricing-context interpretation is not implemented.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Ask for pricing context and receive source-grounded facts, missing inputs and relevant history without fabricated data.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-006 — Pricing Work Construction

PRD physical p. 220 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional AI pricing construction is absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Generated strategy/rationale remains proposed until a permitted user applies validated structured content.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-007 — Natural Language to Structured Pricing Logic

PRD physical pp. 220, 221 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Expected natural-language-to-supported-Builder conversion is absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Convert a price change with an 18% constraint; preview supported fields and keep an initiative constraint distinct from an organisational Guardrail.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-008 — Structured Output Validation

PRD physical p. 221 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No AI output schema/normal validation integration exists.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Malformed scope, unsupported formulas and unauthorised edits from AI fail the same validation as human edits.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-009 — Analysis Assistance

PRD physical pp. 221, 222 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional analysis interpretation is absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Explain saved deterministic outputs without replacing them or inventing financial outcomes.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-010 — Deterministic Calculation Boundary

PRD physical p. 222 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Deterministic calculation foundations exist, including integer-based margin/markup floors and frontend money helpers. The AI boundary that must consume, never replace, authoritative calculations is absent and unverified; no active AI violation is claimed.

**Do not misrepresent:** Deterministic IntelligenceService is not conversational or generative AI.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Provide only authoritative calculated values/evaluations to AI; missing or invalid calculations remain unavailable, not invented.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1424](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1424).

Backend evidence: [src/margin/internal/domain/floor_calculator.go:24](../../../../src/margin/internal/domain/floor_calculator.go#L24); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-011 — Scenario Assistance

PRD physical p. 222 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional AI scenario suggestions are absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Suggested alternatives remain exploratory until a user explicitly creates or selects a Scenario.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-012 — Risk and Inconsistency Detection

PRD physical p. 223 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional advisory inconsistency detection is absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then AI flags inconsistent rationale as advice, not as a new authoritative blocker or Guardrail.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-013 — Missing Information Detection

PRD physical p. 223 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Expected missing-information assistance is absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Explain required, useful and optional inputs distinctly, without promoting optional context into a mandatory blocker.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-014 — Collaboration Assistance

PRD physical p. 223 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional discussion synthesis is absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Summaries distinguish recorded participant statements from inference and link back to accessible contributions.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-015 — Proposal Preparation

PRD physical pp. 223, 224 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional AI Proposal preparation is absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then AI drafts a decision summary; the authorised human remains responsible for explicit submission.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-016 — Review Assistance

PRD physical p. 224 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional review assistance is absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then AI can explain a controlled version but cannot produce a formal approve/reject/request-changes decision.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-017 — Historical Knowledge Retrieval

PRD physical pp. 224, 225 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Expected permission-scoped historical retrieval is absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then An authorised user retrieves relevant previous initiatives and outcomes; restricted history is excluded.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-018 — Historical Context Separation

PRD physical p. 225 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Historical/current context separation cannot be verified for an absent AI feature.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then A retrieved old price is labelled historical and is never substituted for Current Price.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-019 — Data Freshness Awareness

PRD physical p. 225 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No AI response model retains freshness distinctions.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Responses preserve import/observation dates and never call recorded data live without a real live source.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-020 — Evidence Awareness

PRD physical p. 225 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No evidence-linked AI explanation surface exists.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then A response distinguishes structured data, Evidence, assumptions, history and inference with practical source links.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-021 — Uncertainty and Missing Basis

PRD physical pp. 225, 226 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No uncertainty or grounded-answer validation is implemented for AI.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Missing competitor prices, cost or authority produce an explicit limitation rather than invented facts.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-022 — Explicit Application of AI Output

PRD physical p. 226 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No explicit Apply/Insert/Create Scenario transaction exists for AI output.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Producing an answer makes no structured change; an authorised Apply action validates and persists it atomically.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-023 — AI Change Preview

PRD physical p. 226 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No before/after preview for consequential AI modifications exists.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Before applying an AI edit, the user sees changed values/scope/logic and can cancel without side effects.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-024 — AI Attribution

PRD physical pp. 226, 227 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No AI-assisted content attribution record exists.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Applied content preserves AI origin, human applier and time, with authority retained by that human.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-025 — AI Conversation Context

PRD physical p. 227 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Initiative-scoped conversation context or promotion to structured objects exists.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then A critical assumption in conversation is not part of the decision snapshot until explicitly applied to the correct object.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-026 — AI and Versioning

PRD physical p. 227 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No AI material-change path is connected to controlled versioning.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then An AI-applied material edit creates a new controlled version and does not inherit earlier execution authority.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-027 — AI and Guardrails

PRD physical pp. 227, 228 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No governed AI explanation pathway exists; ordinary pricing intent must not silently modify organisational controls.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then AI consumes authoritative Guardrail definition/result/treatment and cannot invent applicability, near-threshold results or exception authority.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-028 — AI and Approval Authority

PRD physical pp. 228, 229 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No AI authority is granted today; the constraint still needs enforcement tests if AI tools are introduced.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Tool calls to approve/reject/request changes/policy-authorise are denied to AI; configured non-AI policy evaluation remains distinguishable.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-029 — AI and Execution Authority

PRD physical p. 229 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No AI execution tools exist; human-only recording must remain explicit in a future implementation.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then An AI suggestion cannot record or confirm implementation; a permitted human must perform that action.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-030 — AI and Governance Administration

PRD physical p. 229 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No AI governance administration exists; future tools must not grant or change authority autonomously.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Prompted permission, Guardrail, delegation or autonomy changes cannot bypass an authorised governance operation.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-031 — Adversarial or Conflicting Content

PRD physical pp. 229, 230 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No prompt-injection handling or untrusted-content isolation has been implemented for AI.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Instructions embedded in Evidence, imports or comments are treated as business data and cannot override tools, permissions or governance.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-032 — AI Failure Handling

PRD physical p. 230 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** The current sample is non-AI, but AI outage/degradation behaviour is untested because AI is absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Simulate AI timeout/error and continue supported non-AI work with existing authoritative records unchanged.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-033 — AI Feedback

PRD physical p. 230 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Expected AI feedback/discard controls are absent.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then Users flag incorrect/incomplete output or discard it without altering structured pricing work.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-034 — AI Activity History

PRD physical p. 230 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No consequential AI suggestion/application/change history exists.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then History distinguishes suggestion, explicit application and subsequent human modification without logging every routine prompt as a formal decision.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

### AI-035 — AI Completeness Principle

PRD physical p. 231 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** The PRD AI completeness principle is not satisfied by the deterministic pricing engine or an unimplemented future promise.

**Do not misrepresent:** Earlier CEO chat defers AI; replacement PRD AI-001/005 explicitly requires it. Resolve scope with CEO rather than silently counting AI as delivered or out of scope.

**Applicability:** AI feature absent. No observed AI violation is alleged; constraints are mandatory when the capability is introduced. P0 denotes a release gate for that capability, not a request to build each optional AI use case first.

**Closure criterion:** Given the AI capability is enabled, then For an applied AI action, reconstruct permitted inputs, suggestion, human application, resulting change, validation and retained authority.

Frontend evidence: [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032); [apps/workspace/src/data/workspaceRepositories.js:17](../../../../apps/workspace/src/data/workspaceRepositories.js#L17).

Backend evidence: [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31); [src/data-pipeline/owomide_data_pipeline/intelligence/service.py:112](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112).

## EXEC: Execution and monitoring (30)

### EXEC-001 — Execution Eligibility

PRD physical pp. 233, 234 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Sample has exact-ref, actor and approved gates, but neither side implements the PRD's Initiative Ready for Execution + Current/Superseded/Expired + policy-authorisation/timing gate; backend lacks Executor permission on publish.

**Do not misrepresent:** Backend approval alone is effectively treated as sufficient to publish; frontend stronger fixture checks must not be described as server enforcement.

**Closure criterion:** Given each forbidden status, stale/expired version, missing executor scope or blocking condition, when execution is attempted directly, then no write begins; exact currently authorised eligible version alone succeeds.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2360](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2360); [apps/workspace/src/ProposalWorkspace.jsx:427](../../../../apps/workspace/src/ProposalWorkspace.jsx#L427).

Backend evidence: [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31); [src/proposal/src/context.ts:84](../../../../src/proposal/src/context.ts#L84); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-002 — Ready for Execution State

PRD physical p. 234 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Publication review shows approved scope, version, publisher and timing, but there is no canonical Initiative Ready for Execution record; backend replaces Proposal Approved with published and does not preserve separate decision/validity/execution status.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given an approved current Proposal and complete implementation information, when readiness is reached, then Initiative is Ready for Execution, Proposal remains Approved, and implementation remains Not Started.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:472](../../../../apps/workspace/src/ProposalWorkspace.jsx#L472); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129).

### EXEC-003 — Execution Ownership

PRD physical pp. 234, 235 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Fixture uses a fixed assignedPublisher; no assign/reassign implementation-owner journey or persisted implementation ownership in backend.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given an authorised manager and eligible executor, when ownership is assigned, then responsibility and audit event change but the authorised scope/version/prices do not.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2360](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2360); [apps/workspace/src/ProposalWorkspace.jsx:472](../../../../apps/workspace/src/ProposalWorkspace.jsx#L472).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-004 — Execution Instructions

PRD physical p. 235 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Manifest includes sample counts, anchor line and effective time, but not complete entity/dimension-level implementation instructions; backend reads stored proposal lines for Catalog changes, without full controlled instruction snapshot or conditions.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given a current authorised version, when instructions open, then every intended entity/dimension/action/timing is derived from that snapshot despite later workspace changes.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:472](../../../../apps/workspace/src/ProposalWorkspace.jsx#L472); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1863](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1863).

Backend evidence: [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/catalog/src/repo/mappers.ts:178](../../../../src/catalog/src/repo/mappers.ts#L178); [src/lib/proto/services/proposal/v1/proposal.proto:61](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L61).

### EXEC-005 — Manual External Execution

PRD physical pp. 235, 236 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No form/API records implementation completed manually outside Owómidé; the only execution path is a simulated frontend Catalog write or backend Catalog apply.

**Do not misrepresent:** Catalog-write confirmation is not proof of live ERP/POS/commerce implementation; do not relabel this existing release flow as external execution.

**Closure criterion:** Given external manual work, when an authorised executor records what was implemented, then Owómidé creates a separate implementation record without requiring a connector.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439).

### EXEC-006 — Implementation Confirmation

PRD physical p. 236 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No implementation confirmation command captures implementing user, actual timestamp, actual effective date, implementation status and actual state.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given completed external implementation, when Executor confirms with required actual values, then a version-bound record is stored with actor/time and incomplete input is rejected.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-007 — Authorised and Implemented Value

PRD physical pp. 236, 237 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No distinct authorised-value versus actual-implemented-value capture; backend copies proposed_price directly to Catalog.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given authorised 100 and actually implemented 98, when confirmation is recorded, then both values survive separately and the authorised snapshot remains 100.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1863](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1863).

Backend evidence: [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-008 — Execution Variance

PRD physical p. 237 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No variance comparison for actual value, scope, dimension, timing or omitted/extra entities; recovery counts represent write failures, not authorised-versus-actual variance.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given differing actual scope/value/timing, when implementation is recorded, then variance links to the exact authority version without modifying it.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2389](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2389).

Backend evidence: [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171).

### EXEC-009 — Material Execution Deviation

PRD physical pp. 237, 238 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No material execution-deviation guard/remediation workflow or Implementation Exception record. Existing margin override is pre-decision governance, not permission to reinterpret an implemented deviation.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given a material deviation before implementation, block or require fresh authority; given one discovered afterward, preserve actual facts, record exception and remediation without retroactive approval.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/ProposalWorkspace.jsx:427](../../../../apps/workspace/src/ProposalWorkspace.jsx#L427).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-010 — Execution Status and Partial Implementation

PRD physical pp. 238, 239 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Fixture separates publication operation and proposal and shows unknown/incomplete/recovery, but lacks the five canonical execution states/component actual records and uses fixed 1,227-row sample counts. Backend ignores Catalog per-row outcomes then marks Proposal published.

**Do not misrepresent:** Backend can conceal partial row failures as published. Fixture recovery is prepared evidence, not a durable implementation ledger or proof for arbitrary scopes.

**Closure criterion:** Given a batch with some rejected or omitted entities, when the operation returns, then only confirmed entities count as implemented and aggregate remains partial/exception; Proposal decision status remains unchanged.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2389](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2389); [apps/workspace/src/data/fixtures/proposalJourneyV0.js:201](../../../../apps/workspace/src/data/fixtures/proposalJourneyV0.js#L201); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:647](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L647).

Backend evidence: [src/catalog/src/write-engine.ts:295](../../../../src/catalog/src/write-engine.ts#L295); [src/proposal/src/service.ts:495](../../../../src/proposal/src/service.ts#L495); [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129).

### EXEC-011 — Failed or Blocked Implementation

PRD physical p. 239 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample displays unresolved Catalog writes and bounded retry but cannot record executor failure reason/scope/notes. Backend Catalog has row errors and worker retries/failure, not manual blocked-implementation record or Initiative unresolved gate.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given blocked implementation, when executor records scope/reason/time/notes, then the Initiative cannot complete until resolution is recorded.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2389](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2389).

Backend evidence: [src/catalog/src/write-engine.ts:295](../../../../src/catalog/src/write-engine.ts#L295); [src/proposal/src/service.ts:495](../../../../src/proposal/src/service.ts#L495); [src/proposal/src/workers/scheduled-rollout.ts:102](../../../../src/proposal/src/workers/scheduled-rollout.ts#L102).

### EXEC-012 — Implementation Evidence

PRD physical pp. 239, 240 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Expected evidence attachment support is absent for execution records. The evidence types in the PRD are examples, not four required formats; when evidence exists its durable execution association is mandatory.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given a supported attachment, when attached to an execution record, then authorised readers can retrieve it there after refresh; unrelated users cannot.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-013 — Execution History

PRD physical p. 240 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Prepared publication start/reconcile/retry events exist; backend persists published event/transition. Assignment, manual confirmation, variance, correction and monitoring-linked execution events are missing.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given a real execution with partial confirmation and correction, when history is read, then chronological attributable events cover each consequential step without replacing earlier facts.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2465](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2465); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556).

Backend evidence: [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:45](../../../../src/governance/src/domain/event-mapper.ts#L45).

### EXEC-014 — Current Price Update

PRD physical pp. 240, 241, 242 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Backend preserves prior Price Records and effective fragments, but no confirmed implementation record/actual-value authority bridge exists; frontend does not mutate real Catalog. Version/Execution Record linkage and actual confirmed-subset semantics remain incomplete.

**Do not misrepresent:** The Catalog write machinery is real source implementation, but neither an export nor approval can be equated to externally confirmed Current Price.

**Closure criterion:** Given a confirmed partial implementation at T, when Current Price updates, then only confirmed exact contexts get actual new price from T, old records/effective history survive and both records trace to execution and exact Proposal version.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:472](../../../../apps/workspace/src/ProposalWorkspace.jsx#L472); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/catalog/src/write-engine.ts:558](../../../../src/catalog/src/write-engine.ts#L558); [src/catalog/src/write-engine.ts:295](../../../../src/catalog/src/write-engine.ts#L295); [src/proposal/src/service.ts:495](../../../../src/proposal/src/service.ts#L495); [src/proposal/src/service.ts:467](../../../../src/proposal/src/service.ts#L467); [src/proposal/src/workers/scheduled-rollout.ts:118](../../../../src/proposal/src/workers/scheduled-rollout.ts#L118).

### EXEC-015 — Monitoring State

PRD physical p. 242 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional entry into Monitoring has no Initiative state/surface/API. Absence alone is not a Must failure, but mandatory outcome recording remains separately missing (EXEC-017/020/021).

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given implemented pricing work where monitoring is used, when entering Monitoring, then decision/implementation state and observations remain distinct.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-016 — Monitoring Period

PRD physical p. 242 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Expected configurable monitoring review date/period is absent. Continuous automated monitoring is explicitly not required.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given monitoring is relevant, when user chooses supported review date/period, then it is persisted and visible without requiring a live analytics feed.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-017 — Monitoring Metrics

PRD physical pp. 242, 243 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No post-implementation outcome recording UI/API. Sales/revenue/volume/margin examples are optional category examples, not an obligation to invent unavailable data.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given available post-implementation information, when user records a supported quantitative outcome, then value/unit/source/time and Initiative linkage persist.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-018 — Baseline Comparison

PRD physical p. 243 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Expected pre/post comparison absent; whenever provided it must label structured/imported/manual provenance, not manufacture causal impact.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given sufficient baseline and recorded outcome, when comparing, then baseline dates, units and both data sources are identified; insufficient information yields no fabricated result.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-019 — Objective Assessment

PRD physical p. 243 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Expected Achieved/Partially Achieved/Not Achieved/Unable to Determine objective assessment is not implemented.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given a monitored Initiative, when selecting an objective assessment and optional note, then it persists separately from implementation completion.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-020 — Qualitative Outcome Recording

PRD physical p. 243 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No qualitative outcome entry; proposal comments are not a monitoring record attached to an implemented Initiative.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given non-numeric commercial feedback, when recorded as an outcome, then no numeric KPI is required and the observation is linked to execution/Initiative.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-021 — Monitoring Data Provenance

PRD physical pp. 243, 244 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No monitoring provenance schema because outcome records are absent; imports/audit timestamps elsewhere do not satisfy it.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given manual/imported outcome information, when saved/read, then available source, observation/recording time and manual-versus-automatic origin remain explicit.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-022 — AI Monitoring Assistance

PRD physical p. 244 · **P3** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** AI monitoring assistance is May, not a minimum obligation. No monitoring-AI integration exists; non-fabrication constraints apply if introduced. This optional use case does not remove the replacement PRD's separate bounded-AI requirements.

**Do not misrepresent:** No current AI monitoring surface claims capability; optional absence is not a mandatory MVP gap.

**Closure criterion:** If monitoring AI is introduced, given missing performance data, then it states the limitation, cites supplied records and does not fabricate numbers or causation.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-023 — Outcome Attribution Boundary

PRD physical p. 244 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No outcome record model distinguishes observations from human/AI interpretations. This is mandatory when outcomes are represented, including in a workflow without AI.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given an observed sales change and a user's interpretation, when displayed, then both are labelled separately and no causal pricing claim is inferred automatically.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-024 — Follow-Up Pricing Work

PRD physical pp. 244, 245 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Expected monitored-outcome→new Initiative follow-up is absent. Existing returned-proposal revision is the same work, not a new Initiative with independent objective/history.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given monitoring identifies follow-up, when creating new pricing work, then a new Initiative links the context but inherits no decision/execution authority.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1810](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1810); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-025 — Completion Readiness

PRD physical p. 245 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No canonical Initiative completion-readiness check; publication completion ends at audit. Conditions are conditional, not a universal requirement for extended monitoring.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given required implementation exceptions or outcome obligations remain, when closing an implemented Initiative, then completion is prevented with specific remaining obligations; no unnecessary monitoring delay otherwise.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-026 — Completion Summary

PRD physical p. 245 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Expected final objective→authority→actual implementation→variance→outcome summary is absent; existing publication status is only operational write accounting.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given completed work, when summary is opened, then exact authority and actual outcome are distinguishable and material variance is not hidden.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2465](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2465).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-027 — Historical Execution Integrity

PRD physical p. 246 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample preserves some Proposal/source history but publication runtime holds only one prepared operation, not durable execution history. Backend append-only price history/events help, but no immutable version-bound implementation record.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given a later pricing change, when old execution is retrieved, then authorised and actual values/scope/time stay as recorded at the earlier implementation.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2389](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2389).

Backend evidence: [src/catalog/src/write-engine.ts:558](../../../../src/catalog/src/write-engine.ts#L558); [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15).

### EXEC-028 — Execution Permission Enforcement

PRD physical p. 246 · **P0** · Frontend: sample-partial · Backend: conflicting · Integration: not-connected

**Assessment:** Fixture correctly separates publish:execute from review/read and assigned publisher. Backend publish checks gateway/user and approved state but no execution role/resource/scope permission; manual confirmation permission is not implemented.

**Do not misrepresent:** Passing frontend capability tests does not protect a direct backend request; backend enforcement is a release blocker.

**Closure criterion:** Given a Viewer or Approver without execution authority, when directly invoking publish/confirm, then server denies before Catalog or any execution mutation.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2360](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2360).

Backend evidence: [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31); [src/proposal/src/context.ts:84](../../../../src/proposal/src/context.ts#L84).

### EXEC-029 — Execution Auditability

PRD physical p. 246 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Some actor/time/Proposal/operation lineage exists, but no persisted authorised-versus-actual execution record, policy-authorisation path, variance or outcome linkage; source version is absent backend.

**Do not misrepresent:** No production readiness is established: the workspace is fixture-memory only.

**Closure criterion:** Given any real implemented action, when audited, then exact authority basis, executor, actual facts, discrepancy and outcome are reconstructible across later changes.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2465](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2465); [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556).

Backend evidence: [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:45](../../../../src/governance/src/domain/event-mapper.ts#L45); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXEC-030 — Execution and Monitoring Completeness Principle

PRD physical pp. 246, 247 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Current journey reaches sample approval→Catalog publication→audit, not required actual implementation→observed outcome lifecycle. Core manual workflow must work without broad connectors.

**Do not misrepresent:** Calling the currently demonstrated publication-to-audit journey end-to-end MVP complete would overstate the 283-page PRD.

**Closure criterion:** Given real company data, when a multi-actor pricing workflow completes through manual external implementation and outcome recording, then proposal, authority, execution and observations remain separate and inspectable.

Frontend evidence: [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17); [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439).

## HIST: History and knowledge (29)

### HIST-001 — Persistent Pricing Record

PRD physical p. 249 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Proposal/source/revision events exist in memory and backend proposal/comments/transitions persist, but no complete persistent Initiative record spanning assumptions/scenarios/reviews/execution/monitoring/closure.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given consequential work is completed and the application restarts, then authorised users can reconstruct the Initiative and all related lifecycle records.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### HIST-002 — Controlled Version Historical Integrity

PRD physical pp. 249, 250 · **P0** · Frontend: conflicting · Backend: partial-source · Integration: not-connected

**Assessment:** Source snapshots are retained in memory, but sample increments controlled-looking Proposal version on submit/approval/administrative mutations; submitted decision snapshot is not a dedicated immutable backend object. Draft-only editing protection is useful but insufficient.

**Do not misrepresent:** Current version labels mix mutation concurrency and controlled decision versions. Existing tests intentionally expect submission/approval increments contrary to current PRD.

**Closure criterion:** Given Draft v1 is submitted, then v1 freezes without version increment; later permitted descriptive corrections are audited separately and original submitted evidence/authority remains unchanged.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1863](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1863); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2201](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2201).

Backend evidence: [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24).

### HIST-003 — Proposal Version Identifier

PRD physical p. 250 · **P0** · Frontend: conflicting · Backend: absent · Integration: not-connected

**Assessment:** Frontend displays resource versions but conflates them with state transitions and lacks canonical Current/Superseded/Expired validity. Backend Proposal has no controlled-version field or retained version endpoint.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given Proposal P v1/v2, then stable P identity, version identifier, decision status and validity are distinct; old v1 remains retrievable after v2 is Current.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2201](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2201).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24).

### HIST-004 — Controlled Proposal Version Creation History

PRD physical pp. 250, 251 · **P0** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Returned-pricing revision stores old/new refs, actor, timestamp, reason and source lineage. No backend controlled-version creation history; sample also increments versions on non-material actions.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given material post-submission change, when replacement is created, then a version-created event links exact old/new versions, actor/time/reason; original decision/status stays historical.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1810](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2201](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2201).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24).

### HIST-005 — Previous Version Preservation

PRD physical p. 251 · **P0** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Explicit getVersion returns in-memory retained snapshots with read-only actions, but no user-facing complete version archive or durable backend version retrieval.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given a superseded version, when authorised history read is requested after reload/restart, then its contents, creator/submission and decision are returned without current-value substitution.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24).

### HIST-006 — Version Comparison

PRD physical pp. 251, 252 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No controlled-version comparison UI/API; prior/source refs and audit before/after do not provide comparative price/scope/rule/assumption/guardrail analysis.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given two accessible controlled versions, when comparing, then material deltas are identified without manually juxtaposing raw snapshots.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/workspaceRouting.js:17](../../../../apps/workspace/src/workspaceRouting.js#L17).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11); [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/gateway/src/routes/governance.ts:37](../../../../src/gateway/src/routes/governance.ts#L37).

### HIST-007 — Decision Authority Binding

PRD physical p. 252 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample replacement clears prior approval and retains earlier detail; backend decisions bind proposal ID only, not controlled version. Policy-authorisation history is absent on both.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given v1 approved then materially revised v2, then v1 authority remains permanently attached only to v1, v2 needs fresh authority, and no event relabels prior approval as v2 approval.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1810](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2201](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2201).

Backend evidence: [src/proposal/src/repo/proposal-repository.ts:129](../../../../src/proposal/src/repo/proposal-repository.ts#L129); [src/governance/src/domain/event-mapper.ts:45](../../../../src/governance/src/domain/event-mapper.ts#L45); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### HIST-008 — Historical Preservation of Proposal Decision Snapshot

PRD physical pp. 252, 253 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample retains economic source/rule/scope per version; backend proposal lines retain price baseline, but governance snapshot is current Catalog after publish/import, not complete submitted Proposal evidence/guardrail/workflow snapshot.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given source prices/costs/rules/evidence/config change after submission, when historical proposal is read, then its original versioned decision basis is unchanged and no recalculation uses current values.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1863](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1863); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/governance/src/domain/snapshot.ts:14](../../../../src/governance/src/domain/snapshot.ts#L14); [src/governance/src/subscribers/snapshot-subscriber.ts:19](../../../../src/governance/src/subscribers/snapshot-subscriber.ts#L19).

### HIST-009 — Activity Timeline

PRD physical pp. 253, 254 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample audit timeline and role events cover limited flows; backend maps seven event types and read endpoint is unimplemented. Initiative/scenario/review/monitoring/closure events missing.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given an Initiative with consequential lifecycle events, when timeline is read, then events are chronological, canonical, linked and permission-filtered.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:952](../../../../apps/workspace/src/OperationalWorkspace.jsx#L952); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556).

Backend evidence: [src/governance/src/domain/event-mapper.ts:45](../../../../src/governance/src/domain/event-mapper.ts#L45); [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/gateway/src/routes/governance.ts:37](../../../../src/gateway/src/routes/governance.ts#L37).

### HIST-010 — Activity Attribution

PRD physical p. 254 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample dynamic events contain actor/action/time/object/version and source type; backend audit contains actor/action/time/entity but event contract lacks controlled version and explicit human/system origin semantics.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given human and system actions, when inspected, then actor/origin, action, time, object and applicable controlled version are unambiguous.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/OperationalWorkspace.jsx:952](../../../../apps/workspace/src/OperationalWorkspace.jsx#L952).

Backend evidence: [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/domain/event-mapper.ts:45](../../../../src/governance/src/domain/event-mapper.ts#L45).

### HIST-011 — AI Attribution

PRD physical p. 254 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** AI-assisted applied-change attribution is absent; there is no current applied-AI work path. Attribution is mandatory when AI-assisted content materially affects pricing work and is a dependency of the replacement PRD's bounded-AI capability. The earlier CEO deferral conflicts with that full-PRD scope and requires an explicit scope decision; it does not make this control optional.

**Do not misrepresent:** Generic human event fields do not establish AI attribution. Do not describe this mandatory conditional control as a wholly optional AI enhancement or infer a present violation from an absent AI runtime.

**Closure criterion:** Given AI-assisted content materially affects pricing work, when an authorised human applies it, then history records AI assistance, applying human, timestamp and affected object, and never assigns human decision accountability to AI.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/governance/src/domain/event-mapper.ts:45](../../../../src/governance/src/domain/event-mapper.ts#L45); [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15).

### HIST-012 — Administrative History

PRD physical pp. 254, 255 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Company analyst-submission policy mutation has local history; wider role/permission/authority/workflow/guardrail/cost-access changes lack a complete administrative audit event path in current mapped backend events.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given a consequential governance setting changes, then its before/after/actor/time is append-only and remains inspectable after later settings changes.

Frontend evidence: [apps/workspace/src/data/fixtureCompanyRequests.js:112](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L112); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2204](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2204).

Backend evidence: [src/governance/src/domain/event-mapper.ts:45](../../../../src/governance/src/domain/event-mapper.ts#L45); [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/gateway/src/routes/governance.ts:37](../../../../src/gateway/src/routes/governance.ts#L37).

### HIST-013 — Historical Governance Context

PRD physical p. 255 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample stores company policy ref, approval-stage context and economic policy evidence; backend margin/override events are incomplete governance-at-decision snapshots. No full versioned workflow/policy-authorisation configuration retention.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given policy/authority configuration changes later, when opening an earlier decision, then the original governing configuration/evaluation remains resolvable.

Frontend evidence: [apps/workspace/src/data/fixtureCompanyRequests.js:112](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L112); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2204](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2204); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1863](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1863); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522).

Backend evidence: [src/governance/src/domain/event-mapper.ts:45](../../../../src/governance/src/domain/event-mapper.ts#L45); [src/governance/src/domain/snapshot.ts:14](../../../../src/governance/src/domain/snapshot.ts#L14); [src/governance/src/subscribers/snapshot-subscriber.ts:19](../../../../src/governance/src/subscribers/snapshot-subscriber.ts#L19); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24).

### HIST-014 — Historical Identity Preservation

PRD physical p. 255 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample clones actor/role into some events and static identities; backend stores actor ID as text without user-delete FK loss, but historical display identity/role snapshots and departed-user retrieval are not proven.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given an actor is renamed/suspended/departed or changes role, then earlier actions still show their recorded accountable identity; do not replace with Unknown user.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureCompanyRequests.js:112](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L112); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2204](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2204).

Backend evidence: [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24).

### HIST-015 — Audit Record Integrity

PRD physical p. 255 · **P0** · Frontend: sample-complete · Backend: implemented-source · Integration: not-connected

**Assessment:** Read-only sample audit exposes no edit/delete operation. Backend audit table grant is SELECT/INSERT only and ingest is idempotent; ordinary-user silent rewrite/delete is prevented by that source design. Administrative correction and runtime privilege verification remain required before deployment.

**Do not misrepresent:** Source-level append-only audit foundation exists; this is not a claim that deployed database privileges or the unimplemented read API were exercised.

**Closure criterion:** Given an ordinary user attempts audit edit/delete, then it is denied; if administrative correction is supported, a linked new correction event is appended rather than overwriting.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:1101](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1101); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2465](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2465).

Backend evidence: [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15).

### HIST-016 — Searchable Pricing History

PRD physical pp. 255, 256 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** UI searches loaded sample events; Proposal list searches sample title/status. Backend supports current Proposal state/actor listing but historical Initiative search and audit service reads are absent.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given authorised historical records beyond first page, when searching supported criteria, then complete paginated matching results are returned with tenant/scope protection.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:952](../../../../apps/workspace/src/OperationalWorkspace.jsx#L952); [apps/workspace/src/data/fixtureOperationalRepositories.js:984](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L984); [apps/workspace/src/data/fixtureOperationalRepositories.js:1101](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1101).

Backend evidence: [src/proposal/src/repo/proposal-repository.ts:619](../../../../src/proposal/src/repo/proposal-repository.ts#L619); [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/gateway/src/routes/governance.ts:37](../../../../src/gateway/src/routes/governance.ts#L37).

### HIST-017 — Historical Filtering

PRD physical p. 256 · **P2** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample offers entity/system toggles and fixed Last 30 days text, not actual range/location/channel/type/owner historical filters. Backend state/actor filter and stubbed audit date parameters only.

**Do not misrepresent:** Last 30 days is currently a displayed label, not evidence of implemented historical date filtering.

**Closure criterion:** Given historical filters are selected, then server query and result count reflect supported dimensions/date range and clearing restores results.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:952](../../../../apps/workspace/src/OperationalWorkspace.jsx#L952); [apps/workspace/src/data/fixtureOperationalRepositories.js:984](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L984).

Backend evidence: [src/proposal/src/repo/proposal-repository.ts:619](../../../../src/proposal/src/repo/proposal-repository.ts#L619); [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/gateway/src/routes/governance.ts:37](../../../../src/gateway/src/routes/governance.ts#L37).

### HIST-018 — Historical Initiative View

PRD physical p. 256 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Proposal evidence and audit detail are partial historical views, not a coherent Initiative record with alternatives, actual implementation and observed outcome.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given completed work, when historical Initiative opens, then trigger, reasoning, versions, authority, implementation and outcome can be understood together.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2465](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2465); [apps/workspace/src/OperationalWorkspace.jsx:952](../../../../apps/workspace/src/OperationalWorkspace.jsx#L952); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/gateway/src/routes/governance.ts:37](../../../../src/gateway/src/routes/governance.ts#L37); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### HIST-019 — Organisational Pricing Knowledge

PRD physical pp. 256, 257 · **P2** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Historical source snapshots are useful groundwork, but reusable completed-Initiative knowledge/search workflow is not available. Existing same-work return revision is not complete organisational reuse.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given previous completed work, when starting related pricing work, then authorised context can be discovered and explicitly copied into new working material.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1810](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1810); [apps/workspace/src/data/fixtureOperationalRepositories.js:984](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L984).

Backend evidence: [src/proposal/src/repo/proposal-repository.ts:619](../../../../src/proposal/src/repo/proposal-repository.ts#L619); [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24).

### HIST-020 — Reuse Without Authority Transfer

PRD physical p. 257 · **P0** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Sample material revision clears approval/publication and retains source; there is no general historical reuse/new-Initiative workflow in backend. The no-authority-transfer rule is mandatory whenever reuse is added.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given historical context reused into new work, then new ID/working state is created and prior approval/policy-authorisation/execution/validity does not transfer.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1810](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522).

Backend evidence: [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11); [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171).

### HIST-021 — AI Historical Retrieval

PRD physical p. 257 · **P3** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** AI historical retrieval is May in this requirement; no implemented historical retrieval integration exists. Permission and historical-versus-current interpretation constraints apply if added. Broader AI scope is governed by the replacement PRD's AI requirements, not silently removed by the earlier deferral.

**Do not misrepresent:** This optional capability is not a mandatory independent delivery gap under HIST-021; it does not override separate AI requirements elsewhere in the PRD.

**Closure criterion:** If retrieval AI is introduced, given inaccessible or historical records, then it cannot reveal protected data or present past decisions as current execution instructions.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503); [apps/workspace/src/data/fixtureOperationalRepositories.js:1101](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1101).

Backend evidence: [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/gateway/src/routes/governance.ts:37](../../../../src/gateway/src/routes/governance.ts#L37); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### HIST-022 — Decision Rationale Preservation

PRD physical pp. 257, 258 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample return/override/comments/source evidence preserves limited rationale; backend proposal line reason/comments/override justification exist, but objective/assumptions/scenarios/review/policy-authorisation explanation is not unified.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given a consequential historical decision, then a reader can explain why it was made using retained rationale and decision context, not price alone.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:427](../../../../apps/workspace/src/ProposalWorkspace.jsx#L427); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1810](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1810); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1863](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1863).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/governance/src/domain/event-mapper.ts:45](../../../../src/governance/src/domain/event-mapper.ts#L45).

### HIST-023 — Record Retention

PRD physical p. 258 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Frontend history resides in memory and cannot survive a fresh repository/runtime. Backend persists audit/proposals with no automatic deletion shown, but supported organisation retention policy/restore/retrieval agreement is missing.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given supported retention period and application/service restart, then completed pricing history remains available; retention never silently deletes required decision basis.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522).

Backend evidence: [src/governance/migrations/0002_audit_log_foundation.up.sql:13](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L13); [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/gateway/src/routes/governance.ts:37](../../../../src/gateway/src/routes/governance.ts#L37).

### HIST-024 — Exportable Historical Record

PRD physical p. 258 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Expected history export has no generator/UI; EXPORT-027 independently makes authorised historical export mandatory. Export permission/redaction must be applied.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given authorised history export, then original context and permitted data are exported, with restricted fields excluded.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureOperationalRepositories.js:1101](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1101).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703).

### HIST-025 — Audit Search

PRD physical p. 258 · **P2** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample search/toggles cover limited audit event/actor/object text. Gateway has entity/actor/date parameters but service is explicitly unimplemented.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given an auditor selects supported user/action/initiative/proposal/date criteria, then results come from complete authorised audit store rather than only loaded sample page.

Frontend evidence: [apps/workspace/src/OperationalWorkspace.jsx:952](../../../../apps/workspace/src/OperationalWorkspace.jsx#L952); [apps/workspace/src/data/fixtureOperationalRepositories.js:1101](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1101).

Backend evidence: [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/gateway/src/routes/governance.ts:37](../../../../src/gateway/src/routes/governance.ts#L37); [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15).

### HIST-026 — System Event Recording

PRD physical pp. 258, 259 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Prepared publication and local revision events exist; backend maps blocked/published events only, with no version-validity, policy-authorisation, export denial or configurable permission-denial coverage.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given a consequential system block/expiry/version event, when audit policy requires recording, then an attributable system event links the exact object/version and preserves earlier decision authority history.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2465](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2465).

Backend evidence: [src/governance/src/domain/event-mapper.ts:45](../../../../src/governance/src/domain/event-mapper.ts#L45); [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15).

### HIST-027 — Record Consistency

PRD physical p. 259 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample shares canonical-event projection for two audit surfaces, but generated/role journeys omit later publication events when role events exist; backend shared audit store exists yet read projections are unimplemented. Cross-surface/version parity unproven.

**Do not misrepresent:** Fixture history is not durable production history; backend source findings do not establish integrated runtime behaviour.

**Closure criterion:** Given the same decision event is displayed in proposal and organisation history, then ID/time/version/meaning agree, including generated revision-to-publication journeys.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556); [apps/workspace/src/data/fixtureOperationalRepositories.js:1101](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1101); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2465](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2465).

Backend evidence: [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15); [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/gateway/src/routes/governance.ts:37](../../../../src/gateway/src/routes/governance.ts#L37).

### HIST-028 — Pricing Knowledge Boundary

PRD physical pp. 259, 260 · **P3** · Frontend: sample-complete · Backend: implemented-source · Integration: not-connected

**Assessment:** The inspected history stores are own-workspace records; no external pricing-knowledge database is required by this ID. This boundary should stay explicit rather than becoming a new MVP dependency.

**Do not misrepresent:** No independent missing mandatory capability: this ID explicitly excludes broad external knowledge coverage.

**Closure criterion:** Given internal historical work is available, then core retrieval can operate without a broad external market-knowledge database.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:1101](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1101).

Backend evidence: [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15).

### HIST-029 — Historical Reconstruction Principle

PRD physical p. 260 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Full reconstruction is impossible without persistent Initiative context, controlled versions, implementation and outcome records; existing source/snapshot/audit work covers parts only.

**Do not misrepresent:** Gapless canonical sample audit events are not proof of complete organisational pricing history.

**Closure criterion:** Given any completed consequential Initiative, then a permitted user answers all PRD reconstruction questions including alternatives, exact authority, actual implementation and observed outcome from Owómidé.

Frontend evidence: [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2465](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2465); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1863](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1863).

Backend evidence: [src/proposal/migrations/0002_proposal_foundation.up.sql:24](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L24); [src/governance/src/service.ts:24](../../../../src/governance/src/service.ts#L24); [src/gateway/src/routes/governance.ts:37](../../../../src/gateway/src/routes/governance.ts#L37); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

## NOTIF: Notifications and work visibility (29)

### NOTIF-001 — Personal Work Queue

PRD physical p. 262 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Needs me derives next Proposal actor but import/repricing attention is capability-based; no complete personal Initiative/task/execution/monitoring queue.

**Do not misrepresent:** Capability to act is not the same as an assigned unresolved responsibility.

**Closure criterion:** Given personal work relevance through ownership, collaboration or mention, show accessible awareness items; separately label and count actions only where this user has actual responsibility.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-002 — Action Required Separation

PRD physical p. 262 · **P0** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Proposal next-actor distinction is modelled; import/repricing treats capability as responsibility. Visibility alone can be counted as work requiring action.

**Do not misrepresent:** Capability to act is not the same as an assigned unresolved responsibility.

**Closure criterion:** Given visible but unassigned work, it appears in relevant workspace visibility, not the personal action-required count.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-003 — Workspace-Level Visibility

PRD physical p. 263 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Queue/Proposal directories exist, but the PRD Initiative/review/execution/monitoring views and scoped backend aggregation do not.

**Closure criterion:** Given scoped organisation activity, managers see canonical states from authoritative records without expanding access.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-004 — Pricing Initiative Status Visibility

PRD physical p. 263 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No Initiative listing with type/lifecycle/urgency/owner/deadline exists; current queue represents import, Preview and Proposal.

**Closure criterion:** An Initiative list shows current owner, resolved scope, stage, urgency, next action and relevant date without opening every item.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-005 — Notification Events

PRD physical pp. 263, 264 · **P1** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** Notify has a contract and placeholder container, not event fan-out. Transient toasts are not durable notifications.

**Do not misrepresent:** A toast, generated proto or service design note is not a delivered notification system.

**Closure criterion:** An assignment/review/approval/change/execution event creates a durable relevant in-product notification.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-006 — Notification Recipient

PRD physical p. 264 · **P0** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** Notification proto includes org/user but no implemented recipient selection or access revalidation.

**Closure criterion:** Recipients resolve from current workflow responsibility and scope, with inaccessible content redacted before storage/delivery.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-007 — Notification Context

PRD physical pp. 264, 265 · **P1** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** Proto title/body/event_type do not establish an implemented Initiative/action/context projection.

**Closure criterion:** Every delivered notification identifies what happened, why, related work and whether action is required.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-008 — Direct Navigation

PRD physical p. 265 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No notification UI or contextual target routing exists.

**Closure criterion:** Opening a notification navigates to the exact permitted object/version or a safe revoked/stale destination.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-009 — In-Product Notifications

PRD physical p. 265 · **P1** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** Read/unread and MarkRead are declared in proto only; migration is SELECT1 and no service exists.

**Do not misrepresent:** A toast, generated proto or service design note is not a delivered notification system.

**Closure criterion:** After an event, unread notifications persist across sessions; marking read updates notification state only.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-010 — External Notification Boundary

PRD physical p. 265 · **P3** · Frontend: unverified · Backend: unverified · Integration: not-connected

**Assessment:** Boundary: email is optional; SMS/WhatsApp/Slack/Teams are not required and must not block core workflow.

**Closure criterion:** Users complete the pricing journey using in-product attention mechanisms without external chat/email integrations.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-011 — Notification and Authority Separation

PRD physical pp. 265, 266 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No notification authority boundary can yet be exercised; sample action checks do not implement notification delivery.

**Closure criterion:** Receiving a notification does not enable edit/approval/execution actions without current server authority.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-012 — Pending Approval Queue

PRD physical p. 266 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Awaiting approval status filter exists; it is not a full assigned approver queue with sequence, urgency and due dates.

**Closure criterion:** Given multiple approvers, show only decisions currently assigned to this approver, with controlled version and relevant deadline.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-013 — Review Queue

PRD physical p. 266 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No separate assigned pre-approval Review queue exists.

**Closure criterion:** Reviewers see their requested reviews, status, urgency and applicable due date, distinct from formal approval decisions.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-014 — Execution Queue

PRD physical pp. 266, 267 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Ready to publish and incomplete rollout tabs model Catalog release, not assigned manual execution/partial implementation/overdue work.

**Closure criterion:** An Executor sees assigned authorised actions and actual partial/exception/overdue implementation state.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-015 — Owner Visibility

PRD physical p. 267 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Sample next actor/blockers assist a Proposal owner, but missing Initiative/tasks limit end-to-end owner visibility.

**Closure criterion:** An owner can identify the next responsible person and reason for every blocked review, approval, execution or monitoring step.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-016 — Urgency Visibility

PRD physical p. 267 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No High/Urgent Initiative priority field or visual/order treatment exists.

**Closure criterion:** Urgent work is visibly prioritised without bypassing maker-checker or any other control.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-017 — Due Dates

PRD physical p. 267 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Updated/effective timestamps are shown; assignment/review/approval deadlines and due/overdue status are absent.

**Closure criterion:** Display due time and upcoming/due/overdue classification using the applicable timezone, not last-updated time.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-018 — Escalation Visibility

PRD physical pp. 267, 268 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No bounded escalation event or previous/current responsible-person visibility exists.

**Closure criterion:** After configured escalation, show cause, previous and new responsibility and required action without granting new authority implicitly.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-019 — Completed Work Visibility

PRD physical p. 268 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Proposal directory/history is not a completed Initiative view. No canonical completion removes resolved Initiative tasks from personal work.

**Closure criterion:** Completion removes outstanding action items but retains historical Initiative access and recorded outcomes.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-020 — Read Versus Resolved State

PRD physical p. 268 · **P0** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** Read bool is defined separately in proto but no implementation proves reading cannot resolve business work.

**Closure criterion:** Marking an approval notification read leaves Proposal decision, task completion and implementation state unchanged.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-021 — Duplicate Notification Control

PRD physical p. 268 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No durable event deduplication or bounded notification reminder policy exists.

**Closure criterion:** Duplicate delivery of the same event creates one attention item; overdue reminders follow bounded configured intervals.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-022 — Notification Preference Boundary

PRD physical p. 268 · **P2** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** Preferences proto exists without implementation or critical-notification policy protection. Preferences are optional.

**Closure criterion:** If preferences are enabled, a user cannot disable mandatory governance/security notifications required by company policy.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-023 — Access Revocation

PRD physical pp. 268, 269 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No notification revocation handling exists.

**Closure criterion:** After access is removed, new delivery and previously stored deep links cannot disclose restricted content.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-024 — Workspace Filtering

PRD physical p. 269 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Status and local query filtering exist, but not scoped Initiative owner/type/urgency/dimension/date filters.

**Closure criterion:** Filters operate over authorised server results and cursor context; changing filters cannot reveal restricted work.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-025 — Workspace Search

PRD physical p. 269 · **P1** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Search is limited to fixture rows/Proposal metadata rather than an authorised pricing-work search index/API.

**Closure criterion:** Search by supported Initiative/entity/Proposal/owner identifiers returns permitted work beyond the current loaded page.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-026 — Action Count Visibility

PRD physical pp. 269, 270 · **P0** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Counts distinguish work items from overlapping line counts, but import/repricing action ownership is inferred from capability.

**Do not misrepresent:** Capability to act is not the same as an assigned unresolved responsibility.

**Closure criterion:** Action badges equal unresolved responsibilities assigned to the current user; visible shared work is not automatically counted.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

### NOTIF-027 — Notification History

PRD physical p. 270 · **P1** · Frontend: absent · Backend: partial-source · Integration: not-connected

**Assessment:** Notification history is only a proto contract; it cannot substitute for auditable pricing records.

**Closure criterion:** Recent read/unread history is available while deleting/expiring a notification leaves canonical business history intact.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31).

### NOTIF-028 — Authoritative Record Principle

PRD physical p. 270 · **P0** · Frontend: conflicting · Backend: partial-source · Integration: not-connected

**Assessment:** Frontend Proposal rows project current sample state, but import/repricing rows clone static base data. Backend Proposal listing reads canonical proposal and proposal_line records; full Initiative/execution projections are absent, not evidenced as contradictory.

**Closure criterion:** After completing an import or changing an Initiative responsibility, all relevant queues/counts update from authoritative records without stale fixture-like rows.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/lib/proto/services/notify/v1/notify.proto:10](../../../../src/lib/proto/services/notify/v1/notify.proto#L10); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31); [src/proposal/src/repo/proposal-repository.ts:619](../../../../src/proposal/src/repo/proposal-repository.ts#L619).

### NOTIF-029 — Work Visibility Completeness Principle

PRD physical pp. 270, 271 · **P1** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Current next-action guidance helps the sample; no full urgency/deadline/responsibility model supports the complete lifecycle.

**Closure criterion:** Each user can explain why work needs them, urgency, due time, required action and destination; managers can locate the responsible bottleneck.

Frontend evidence: [apps/workspace/src/data/fixtureOperationalRepositories.js:301](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301); [apps/workspace/src/OperationalWorkspace.jsx:301](../../../../apps/workspace/src/OperationalWorkspace.jsx#L301); [apps/workspace/src/WorkspaceApp.jsx:2032](../../../../apps/workspace/src/WorkspaceApp.jsx#L2032).

Backend evidence: [src/notify/Dockerfile:4](../../../../src/notify/Dockerfile#L4); [src/notify/migrations/0001_create_schema.up.sql:4](../../../../src/notify/migrations/0001_create_schema.up.sql#L4); [src/gateway/src/server.ts:31](../../../../src/gateway/src/server.ts#L31).

## EXPORT: Export and operational handoff (30)

### EXPORT-001 — Structured Pricing Export

PRD physical p. 273 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Mandatory structured/CSV export absent: Preview export disabled, no download generator, backend /exports returns 501.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given supported tabular pricing data and permission, when exporting, then a usable CSV with defined fields is generated.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703).

### EXPORT-002 — Authorised Action Export

PRD physical pp. 273, 274 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No authorised-action export; exact controlled-version snapshot source and current authority binding must be implemented before operational handoff.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given authorised v1 and later draft v2, when exporting v1 for permitted execution, then only exact valid v1 snapshot values appear; invalid/superseded authority is refused.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:1863](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1863).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXPORT-003 — Execution Export Content

PRD physical p. 274 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No execution CSV schema/manifest. Must identify each actual priceable entity and dimensions, not substitute group selector; listed content is Should/where applicable.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given multi-entity authorised work, when exported, then receiving team can identify each entity/dimension/value/timing and required context without guessing.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureOperationalRepositories.js:373](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L373).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/catalog/src/repo/mappers.ts:178](../../../../src/catalog/src/repo/mappers.ts#L178); [src/lib/proto/services/proposal/v1/proposal.proto:61](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L61).

### EXPORT-004 — Bulk Export

PRD physical pp. 274, 275 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Bulk pricing-action export absent; existing bounded table page is not complete export population.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given multiple entities including exceptions, when exporting, then complete authorised scope and entity-level results/exceptions survive independently of current page.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703).

### EXPORT-005 — External Identifiers

PRD physical p. 275 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Catalog identity groundwork exists but configured external SKU/ERP/POS/listing identifiers are not exposed in an operational export.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given configured merchant SKU/external IDs, when handoff CSV is generated, then those exact IDs are included and never invented.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureOperationalRepositories.js:373](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L373).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/catalog/src/repo/mappers.ts:178](../../../../src/catalog/src/repo/mappers.ts#L178); [src/lib/proto/services/proposal/v1/proposal.proto:61](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L61).

### EXPORT-006 — Export Permission

PRD physical p. 275 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No export capability enforcement endpoint exists. Generic proposal/audit read membership is not sufficient to grant protected export.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given wrong tenant/role/resource/scope export request, then server refuses and no protected file is generated.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureOperationalRepositories.js:1101](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1101).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/gateway/src/routes/proposals.ts:31](../../../../src/gateway/src/routes/proposals.ts#L31); [src/proposal/src/context.ts:84](../../../../src/proposal/src/context.ts#L84).

### EXPORT-007 — Restricted Cost Data

PRD physical p. 275 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No generated export to verify redaction. Current read projections are useful but require separate export checks.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given an authorised exporter without cost permission, when exporting, then cost/margin/derived sensitive values and free-text leakage are excluded.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureOperationalRepositories.js:1101](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L1101).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703).

### EXPORT-008 — Export Type Separation

PRD physical pp. 275, 276 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No export-purpose model; analytical, historical and execution exports need distinct labelling and authority semantics.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given an exploratory/Draft export is permitted, then file and UI explicitly state not authorised for execution; purpose cannot grant authority.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703).

### EXPORT-009 — Proposal Status, Validity and Execution Status Visibility

PRD physical pp. 276, 277 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No export status fields; backend model itself combines decision with published and lacks controlled validity, so exporting it directly would violate canonical status separation.

**Do not misrepresent:** Do not serialize backend state='published' as Proposal Status=Implemented or imply approval implies implementation.

**Closure criterion:** Given Approved+Superseded or Approved+Partially Implemented, then exported decision, validity and execution fields retain each fact separately.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXPORT-010 — Unauthorised Execution Protection

PRD physical p. 277 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No execution-export validation; disabled export currently denies all, but usable operational export needs exact Current/valid/authorised readiness checks.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given Draft/Awaiting Approval/Changes Requested/Rejected/Superseded/Expired or blocked authority, then execution export is denied; separately permitted historical export is clearly non-current.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2360](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2360).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439).

### EXPORT-011 — Version Identification

PRD physical p. 278 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No generated controlled-work export containing Proposal/version identification; backend controlled-version identifier is absent.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given exported controlled work, then exact persistent Proposal ID plus controlled version is present and traceable.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXPORT-012 — Export Timestamp

PRD physical p. 278 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No consequential export event/generation timestamp. Export generation time must be recorded even where file timestamp is only operationally appropriate.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given export generation, then durable event records generation time and file includes it where appropriate.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703).

### EXPORT-013 — Export Attribution

PRD physical p. 278 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No exporter/type/Initiative/version attributable export event.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given a consequential export, then user/time/type/Initiative/exact version can be retrieved in history.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/governance/src/repo/audit-repo.ts:4](../../../../src/governance/src/repo/audit-repo.ts#L4); [src/governance/migrations/0002_audit_log_foundation.up.sql:15](../../../../src/governance/migrations/0002_audit_log_foundation.up.sql#L15).

### EXPORT-014 — Export Audit Event

PRD physical p. 278 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Execution/sensitive export audit generation absent; generic ingest does not emit this event.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given an execution or sensitive pricing export, then generating it appends audit event in related history without duplicate event on safe replay.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:556](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L556).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/governance/src/domain/event-mapper.ts:45](../../../../src/governance/src/domain/event-mapper.ts#L45).

### EXPORT-015 — Export After Proposal Change

PRD physical p. 278 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No retained export manifest/version supersession model.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given old exported v1 and authorised replacement v2, then v1 export remains historical and v2 requires a new export, without relabelling old output.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXPORT-016 — Expired Pricing Action

PRD physical p. 279 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No expiry-validity export guard; canonical version validity is also not modelled by current backend.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given expired action, then operational export is refused while authorised historical export remains clearly historical.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXPORT-017 — Effective-Date Visibility

PRD physical p. 279 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No execution export of intended effective date/period; existing direct backend publish substitutes current time and must not become export contract.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given authorisation effective at T and export at U, then file preserves T explicitly rather than replacing it with U.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/ProposalWorkspace.jsx:472](../../../../apps/workspace/src/ProposalWorkspace.jsx#L472).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/proposal/src/service.ts:467](../../../../src/proposal/src/service.ts#L467); [src/proposal/src/workers/scheduled-rollout.ts:118](../../../../src/proposal/src/workers/scheduled-rollout.ts#L118).

### EXPORT-018 — Human-Readable Handoff

PRD physical p. 279 · **P2** · Frontend: sample-partial · Backend: absent · Integration: not-connected

**Assessment:** Existing on-screen publication manifest partially explains version/actor/effective time but no human-readable external operational handoff across full scope/conditions.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given an authorised action, when handoff summary opens, then recipient understands what/where/when/version/exceptions across actual scope.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:472](../../../../apps/workspace/src/ProposalWorkspace.jsx#L472); [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439).

### EXPORT-019 — External Operational Handoff State

PRD physical p. 279 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No separate exported/handed-off state record or handoff timestamp/responsible user/version/implementation owner.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given action handed outside, then handoff record captures responsible actor/time/exact version/owner without changing implementation status.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXPORT-020 — Handoff Is Not Implementation

PRD physical p. 280 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No export/handoff model; existing Catalog publication must not be reused as automatic external implementation confirmation.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given CSV is downloaded or action marked Handed Off, then Initiative remains not implemented until separate authorised confirmation.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439).

### EXPORT-021 — Implementation Reference

PRD physical p. 280 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No optional external implementation reference recording field/API; connector operation ID is not user-provided ERP/ticket evidence.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given external confirmation with or without an external reference, then both valid cases can be recorded; no unused reference is required.

Frontend evidence: [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXPORT-022 — Exported Versus Implemented Comparison

PRD physical p. 280 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No linked authorised→exported/handoff→actual chain or comparison.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given an export and later implementation, then their exact entity/value/version relationship and discrepancies are inspectable.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXPORT-023 — Re-Export

PRD physical p. 280 · **P2** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Optional regeneration unavailable with absent export subsystem; repeated consequential export should be attributable without creating new Proposal or authority.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** If re-export is supported, given same still-valid version, then regenerated output is attributed as new export event and no Proposal version/decision changes.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703).

### EXPORT-024 — Data Formatting

PRD physical pp. 280, 281 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No CSV column/currency/numeric/date/identifier format contract or roundtrip tests.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given decimal money, differing currencies/timezones and special characters, then CSV uses defined lossless formats and safely escapes cells without ambiguous operational instructions.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703).

### EXPORT-025 — Missing Operational Identifier

PRD physical p. 281 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No export schema with configured required operational identifiers or preflight validation. Catalog external identifiers exist but export cannot detect missing configured fields.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given a configured-required identifier is missing, then preflight surfaces the affected entity and never invents a mapping; non-required fields need not block.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureOperationalRepositories.js:373](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L373).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/catalog/src/repo/mappers.ts:178](../../../../src/catalog/src/repo/mappers.ts#L178); [src/lib/proto/services/proposal/v1/proposal.proto:61](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L61).

### EXPORT-026 — Export Validation

PRD physical p. 281 · **P0** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Mandatory execution-export preflight entirely absent: current authority/version, required fields/scope/effective dates and blockers.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given each required export condition fails in turn, then no operational export is issued; complete current valid authority succeeds with exact manifest.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2360](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2360).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).

### EXPORT-027 — Historical Export

PRD physical pp. 281, 282 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** Mandatory authorised historical export absent; Catalog snapshot storage is not a historical pricing export API.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given later workspace changes, when exporting historical decision, then original context is retained and no current-value recalculation occurs.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:522](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L522).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/governance/src/domain/snapshot.ts:14](../../../../src/governance/src/domain/snapshot.ts#L14); [src/governance/src/subscribers/snapshot-subscriber.ts:19](../../../../src/governance/src/subscribers/snapshot-subscriber.ts#L19).

### EXPORT-028 — Bounded External Integration

PRD physical p. 282 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No selected external connector was found in the inspected frontend or backend source. Connector selection depends on validated pilot needs, not universal breadth. Mandatory fallback export/manual handoff is also missing; the core workflow must remain completable without a native connector.

**Do not misrepresent:** Internal Proposal→Catalog service calls and CSV imports are not proof of selected external operational connector integration. Broad connector coverage is explicitly not required.

**Closure criterion:** Given no native connector, then company completes pricing through manual/import/export/handoff; implement only customer-validated bounded connector after its requirement is confirmed.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/catalog/src/service.ts:252](../../../../src/catalog/src/service.ts#L252); [src/catalog/src/write-engine.ts:561](../../../../src/catalog/src/write-engine.ts#L561).

### EXPORT-029 — External System Authority

PRD physical p. 282 · **P0** · Frontend: sample-partial · Backend: partial-source · Integration: not-connected

**Assessment:** Export is disabled, which currently avoids a false export-success claim. Existing UI promises Catalog writes, not external ERP/POS updates; future external claims require separate confirmation.

**Do not misrepresent:** Current Catalog-write UI must remain distinguished from external system-of-record implementation; do not advertise simulated publication as live external propagation.

**Closure criterion:** Given an external system remains live-price authority, then download/handoff reports only that fact and never claims it changed external prices without implementation evidence.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/ProposalWorkspace.jsx:472](../../../../apps/workspace/src/ProposalWorkspace.jsx#L472); [apps/workspace/src/data/fixtureWorkspaceRepositories.js:2503](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2503).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/proposal/src/service.ts:439](../../../../src/proposal/src/service.ts#L439).

### EXPORT-030 — Operational Handoff Completeness Principle

PRD physical pp. 282, 283 · **P1** · Frontend: absent · Backend: absent · Integration: not-connected

**Assessment:** No complete handoff record joining exact authorised version/entities/prices/timing/exporter/owner and later actual confirmation/variance.

**Do not misrepresent:** Export is explicitly unavailable, not a working MVP capability. Disabled/stubbed export is fail-closed but not feature completion.

**Closure criterion:** Given an authorised action leaves Owómidé, then a permitted user can answer all operational handoff completeness questions from linked records.

Frontend evidence: [apps/workspace/src/data/fixtures/repricingPreviewV0.js:150](../../../../apps/workspace/src/data/fixtures/repricingPreviewV0.js#L150); [apps/workspace/src/data/fixtureOperationalRepositories.js:534](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L534); [apps/workspace/src/ProposalWorkspace.jsx:472](../../../../apps/workspace/src/ProposalWorkspace.jsx#L472); [apps/workspace/src/ProposalWorkspace.jsx:492](../../../../apps/workspace/src/ProposalWorkspace.jsx#L492).

Backend evidence: [src/gateway/src/routes/data-pipeline.ts:703](../../../../src/gateway/src/routes/data-pipeline.ts#L703); [src/proposal/src/service.ts:171](../../../../src/proposal/src/service.ts#L171); [src/lib/proto/services/proposal/v1/proposal.proto:11](../../../../src/lib/proto/services/proposal/v1/proposal.proto#L11).
