# Company onboarding: backend readiness and frontend handoff

Review date: 7 September 2026. Scope: checked-in monorepo source plus the CEO's role clarification supplied for this review. This is an implementation handoff, not a production security certification.

## Decision

**The hosted workspace is a reviewable prototype, not yet an onboarding-ready connected product.** There is substantial backend implementation to build on; the remaining work is not simply replacing sample data with `fetch` calls.

The workspace deliberately rejects live mode in [`workspaceRepositories.js`](../src/data/workspaceRepositories.js). Its versioned resources, server-authored actions, reconciliation states and exact scope accounting are richer than several current backend responses. Preserve that fail-closed boundary until the contracts and money-safety gates below pass.

This review did not inspect deployed service versions, Cloudflare account settings, production credentials or another engineer's unmerged branches, and did not run the backend integration suites. “Implemented” below means source exists, **not** that it has passed a current production acceptance run. The working tree includes another model's uncommitted polish work; this document does not alter it.

### 8 September frontend implementation addendum

The role journeys below now have an executable **in-memory fixture implementation**, not backend delivery. [`fixtureCompanyRequests.js`](../src/data/fixtureCompanyRequests.js), [`fixtureWorkspaceRepositories.js`](../src/data/fixtureWorkspaceRepositories.js) and [`companyRoles.contract.test.mjs`](../tests/data/companyRoles.contract.test.mjs) define the current consumer contract:

- `company.get()` / `company.updateAnalystSubmission({companyRef, analystCanSubmit, idempotencyKey})`: versioned, owner-authorized policy, member context and change history. The sample starts with `analystCanSubmit=true` solely to preserve the existing demo journey; **the production default is still undecided**. Updated sessions remove Analyst submission capability when disabled. This sample Account Owner receives policy authority only, not implicit pricing/executive powers.
- `proposals.updateDraft({proposalRef,title,idempotencyKey})` supports a versioned title edit; pricing edits still use a new Preview. `proposals.handoff({proposalRef,assigneeId,idempotencyKey})` changes the submission owner of an unlocked draft/blocked Proposal to an eligible Pricing Manager, retaining author, scope and blockers. Exact refs, idempotency/conflict checks, immutable prior snapshots and handoff activity are included. `proposals.getVersion({proposalRef})` explicitly reads retained versions with mutation actions disabled; ordinary stale deep links continue to fail closed.
- `proposals.submit()` captures the actual submitter and company-policy version. Both the original author and submitter are barred from approving/returning their own decision. A single assigned Finance, Commercial or Executive review is exercised with the same decision mechanism; **no sequential approval chain or financial thresholds are invented**. These are explicit fixture capability scenarios, not an approved production role-code migration.
- `proposals.decide({proposalRef,decision:'approve'|'reject',reason?,idempotencyKey})` reuses approval or records a reasoned **return for changes**. The latter creates a new draft/blocked version, retains prior submitted evidence, clears approval/submission/publication readiness, preserves blockers, and requires fresh submission and review. The exact production rejection/return state and event mapping still require backend contract approval; the backend discrepancy in R3 remains open.
- `requests.create({productReference,issue,reason,evidence?,context?,idempotencyKey})`, `requests.list()` and `requests.get({requestId,requestVersion?})` form separate Contributor intake. SKU/product references are typed text, never privileged cost-rich Catalog lookup. Evidence is an optional plain-text note/reference, **not uploaded storage**. Contributor lists are own-only; no Proposal or financial fields are returned.
- `requests.triage({requestRef,status,note,idempotencyKey})` allows the sample Pricing Manager to mark a request `reviewing`, `resolved` or `declined`. Internal notes remain manager-only, because they may reference protected pricing work; contributors receive safe status/time history. Completed requests cannot be reopened by this sample API. Request-to-draft conversion/linkage, uploaded evidence, real notification delivery and persistence remain backend/product work in R4/R9.
- The explicit sample capability `pricing:economics:read` controls field projections in [`fixtureEconomicsVisibility.js`](../src/data/fixtureEconomicsVisibility.js). Viewer retains selling prices and decision status but receives null costs, margins and policy floors, with `fieldVisibility.economics='restricted'`; matching policy inputs and remediation payloads are withheld. Current/historical Proposal notes are restricted; raw comments, Rules and participant Audit reads are denied. This is a **proposed fixture field policy**, not an approved production Viewer role mapping or service-side security. Authorized sample pricing/review/execution/audit actors retain their evidence. Confirm the field policy and implement the same boundary server-side in R2/R5.
- The shared money presenter now formats integer-string/BigInt minor units without converting large amounts through floating-point major units. Exact cents, negative sub-unit values and locale grouping are covered by [`workspaceMoney.contract.test.mjs`](../tests/data/workspaceMoney.contract.test.mjs). The browser still consumes the existing two-decimal money contract; this does not change backend arithmetic or currency support.

New role fixtures are deliberately separate from FX-010's historical grounding: the original four actors and 25-event hash remain unchanged. New branch-specific activity is synthetic and does not claim a complete canonical FX-010 reconstruction. The frontend tests exercise positive/negative role, ownership, company isolation, version and replay cases; they are **not** proof of service-side authorization or tenant security. Existing live-adapter release gates are unchanged.

### 12 September frontend implementation addendum: versioned pricing revisions

The returned-Proposal pricing loop is now implemented in the **sample repository and frontend only**. This addendum extends the requested browser contract; it does not re-audit or close the source-backed backend findings in R1–R10, verify a deployed reject/revision service, or enable live mode.

- `proposals.startRevision({proposalRef,idempotencyKey})` is the exact-version, idempotent working-copy handoff. The fixture checks current returned-draft ownership, editable state and explicit read/edit/repricing/create capabilities before copying retained scope/rule/effective-time inputs. Replays are deduplicated and reopening the same returned version resumes its working copy; stale refs, wrong owners, locked state and missing retained inputs fail closed. Its response supplies versioned `scopeRef`, `ruleRef`, optional generated `previewRef`, and lineage fields for the returned Proposal reference, reviewed source Preview, return decision, initiating actor and time. Saved adjustments and Previews carry those lineage fields as `revisionOrigin`.
- Adjustment save and Preview generation use the existing versioned repricing seam, restricted to prepared +3.50%, +4.25% and +NGN 25.00 outcomes. The scope remains the retained prepared population. This does not implement arbitrary price editing, scope expansion or customer-data calculation. The backend still needs the complete-population/policy guarantees in R6.
- `proposals.createFromPreview` consumes the exact revision Preview and revalidates its current returned Proposal/rule lineage. Replacement keeps the Proposal ID and increments its version; author, submission owner and handoff/review provenance are retained. `revisionHistory` records source/replacement Proposal and Preview refs. Old Proposal and pricing-source snapshots survive multiple return/revise cycles as read-only evidence; opening a working copy does not rewrite the prior decision. Concurrent submission, handoff or other version changes invalidate a stale replacement.
- New pricing cannot reuse old exception, submission, approval or publication authority. Blockers are evaluated for its new source, source/scope repairs precede Proposal creation, and fresh exceptions/submission/independent approval precede separate execution. The revising actor is included in maker-checker protection alongside the original author and actual submitter. Durable transactions, idempotency storage and concurrency enforcement for this consumer contract remain R5/R7 backend work.
- `relatedProposalRef` is a read-authorized navigation projection for the exact revision lineage, not a new Preview mutation permission. It lets a saved adjustment or intermediate/repaired Preview open the current replacement version without rewriting `revisionOrigin`. Unrelated sources and callers lacking Proposal read receive no such link. Existing economics projections also redact sensitive return text in current/historical Proposal, adjustment/Preview origins, handoff metadata and repeated revision history; Contributor access remains denied. Matching server-side field policy and negative API tests are still required under R2/R5.

The sample queue now presents distinct workflow-stage items with per-item units and visible-item counts, explicitly warning that line counts may overlap. It does not invent a unique-line population or establish a consolidated backend queue. Proposal next-step actions are visible without opening people/permissions; supporting version evidence is disclosed on demand. Shared styled manager/filter dropdowns preserve keyboard selection and focus behavior. These frontend clarity changes do not deliver assignment persistence, notification transport or onboarding readiness in R9.

Consumer-contract evidence: [`fixtureWorkspaceRepositories.js`](../src/data/fixtureWorkspaceRepositories.js), [`contracts.js`](../src/data/contracts.js), [`fixtureEconomicsVisibility.js`](../src/data/fixtureEconomicsVisibility.js), [`revision-loop.contract.test.mjs`](../tests/data/revision-loop.contract.test.mjs) and [`workspace-journey-acceptance-bdd.test.jsx`](../tests/workspace-journey-acceptance-bdd.test.jsx). Queue, main-action, redaction and dropdown behavior is specified by the corresponding workspace BDD tests. No backend release status or final test totals are changed by this addendum.

## 1. What already exists—and what the browser cannot yet rely on

| Area | Source-backed foundation | Remaining connection gap |
| --- | --- | --- |
| Identity | Gateway verifies bearer JWTs using a secret or JWKS; derives tenant and user context. | Token issuance is a configured dev user. No discovered company creation, invitation, membership administration, session read/refresh/revoke or company-policy API. [`auth.ts`](../../../src/gateway/src/routes/auth.ts), [middleware](../../../src/gateway/src/middleware/auth.ts). |
| Catalog | Canonical SKU identity, org-scoped dimensions, temporal costs/prices, cursor reads, restricted canonical writes, transactional outbox and integration-test sources. | Workspace list/detail aggregation, field visibility, authoritative counts and complete page navigation must be mapped to the browser contract. Do not replace canonical UUIDs with display SKUs. [Service](../../../src/catalog/src/service.ts), [contract](../../../src/lib/proto/services/catalog/v1/catalog.proto), [migration](../../../src/catalog/migrations/0002_catalog_foundation.up.sql). |
| Import | CSV/XLSX upload, profiling, mapping, validation, row editing/exclusion, canonical commit and operation reads are implemented. | The frontend's single recoverable journey, exact-version acknowledgement and result/reconciliation contract need an explicit adapter and concurrency agreement. The backend `CommitBatchRequest` currently contains `batch_id` and `confirm_warnings`, not the frontend's reviewed resource/version/idempotency shape. [Gateway](../../../src/gateway/src/routes/data-pipeline.ts), [Python service](../../../src/data-pipeline/owomide_data_pipeline/service.py), [proto](../../../src/lib/proto/services/data_pipeline/v1/data_pipeline.proto). |
| Repricing | Persisted change sets, percentage/absolute adjustments, scope building and conversion to a Proposal exist. | Scope/preview take one 500-SKU Catalog page; unpriced SKUs are dropped. Preview does not currently return the workspace's policy evidence, blocker ledger, immutable preview versions or four remediation operations. [Service](../../../src/proposal/src/service.ts), [rule arithmetic](../../../src/proposal/src/domain/repricing-rules.ts). |
| Margin | Batched validation uses canonical costs and the Python intelligence evaluator; rules, floor arithmetic and structured violations exist. | Workspace needs positive as well as negative line evidence, applied policy/version, complete context and safe resolution actions. `ValidateBatch` currently reduces evaluator output to violations, so an empty violation list cannot populate all the UI's “policy clear” evidence. [Handler](../../../src/margin/internal/handler/validate_batch.go), [intelligence rules](../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py). |
| Proposals | Draft CRUD, submit, approve, comments, override request/approval, publish, scheduled rollout and outbox exist. Maker-checker is present for normal approval and override-request approval. | Capability enforcement is incomplete; mutation/resource versions and rejection are missing from the exposed contract. Publication outcomes need reconciliation. [Service](../../../src/proposal/src/service.ts), [state machine](../../../src/proposal/src/domain/state-machine.ts), [proto](../../../src/lib/proto/services/proposal/v1/proposal.proto). |
| Governance | Append-only audit storage, subscribers, snapshots and restore implementation exist. | Activity feed, entity history and snapshot-list service handlers explicitly throw `Unimplemented`. The frontend history is fixture evidence, not a connected audit read. [Service](../../../src/governance/src/service.ts), [subscribers](../../../src/governance/src/subscribers/audit-subscriber.ts). |
| Work queue / handoffs | Frontend fixture queue connects operational surfaces. | No discovered consolidated backend queue, assignment/claim API, role-aware counts or actionable notification delivery. Gateway registers no queue route. [Gateway composition](../../../src/gateway/src/server.ts). |
| Notifications / external delivery | Event infrastructure exists. | Notify's Dockerfile runs a “not yet implemented” message. No verified ERP/POS/commerce connector delivery implementation was found in this review. Catalog publication is not proof of external-channel delivery. [Notify](../../../src/notify/Dockerfile). |

## 2. Release-blocking work, in priority order

The IDs below are **handoff IDs, not existing GitHub issue numbers**. The frontend still names BE-001–BE-013 and BE-015–BE-018 in [`liveBackendGate.js`](../src/data/liveBackendGate.js). Their individual definitions were not found in this checkout. The lead engineer must reconcile those tickets with this list rather than mark them complete from UI evidence. BE-014 remains excluded from the existing gate.

### R1 · P0 · Repair the authenticated Gateway → Proposal path

**Owner:** Gateway + Proposal; security review by platform lead.

[`proposals.ts`](../../../src/gateway/src/routes/proposals.ts), [`change-sets.ts`](../../../src/gateway/src/routes/change-sets.ts) and [`override-requests.ts`](../../../src/gateway/src/routes/override-requests.ts) currently forward only `x-org-id` and `x-user-id`. Every corresponding Proposal handler calls `ServiceAuthenticator.authorize(..., ["gateway_svc"])`; approval also reads `x-user-roles`. The shared client factory does not add an authentication interceptor. The checked-in path therefore lacks both required service authentication and approval-role propagation.

Add a scoped, short-lived Proposal service token and trusted actor/tenant/capability context, using the established Catalog/Data Pipeline signed-boundary pattern. Do not forward browser-supplied identity headers. Apply equivalent internal caller authentication to Governance: its current context reads tenant/user headers and its server has no service-auth interceptor.

**Gate:** Real Gateway-to-service tests prove valid calls work, spoofed headers and invalid/wrong-audience service tokens fail, absent permissions fail, and one tenant cannot read or mutate another tenant's IDs. Do not weaken service authentication to make a frontend demo work.

### R2 · P0 · Release real company identity and capability enforcement

**Owner:** Identity/Gateway owner (lead engineer to assign) + all resource-owning services.

Required persisted concepts: organization, user, membership, role assignment, invitation, company policy version and revocation. A dedicated new service is not prescribed; ownership must be explicit. For an assisted first pilot, operators may provision the company, but invited users must still receive real tenant-bound identities and revocable access. Do not expose the dev login as company authentication.

Release a session DTO containing actor, organization, membership state, role labels, effective capabilities, safe navigation and company-policy version. Provide invitation acceptance, sign-out/revocation and expired-session recovery through the chosen identity provider/BFF. Choose cookie or bearer session transport deliberately; implement its security controls and test cross-origin hosting accordingly.

Enforce resource reads and every command server-side. Current Proposal create/edit/submit/publish and read handlers do not check dedicated business capabilities; `requireApproverRole` checks only the literal `approver` role. Margin mutation handlers likewise do not establish a complete user-role policy. Tenant isolation alone does not enforce Contributor, Viewer or Analyst restrictions.

**Gate:** Direct API calls—not only hidden buttons—deny prohibited actions, revoked membership stops working, read denials do not leak resource content, and `allowedActions` agrees with service enforcement. Preserve approval versus execution separation.

### R3 · P0 · Implement the CEO role delta without inventing a new hierarchy

**Owner:** Product/CEO freezes mapping; Identity + Proposal implement; frontend consumes capabilities.

| Role/change | Required behavior | Backend work / unresolved decision |
| --- | --- | --- |
| Pricing Analyst | Can create/edit authorized drafts. Submission can be disabled by each company. An authorized colleague can pick up the draft and submit it. | Separate `proposal.draft.create` / `proposal.draft.edit` from `proposal.submit`; proposed names are not released API names. Persist `analystCanSubmit` (final name/default to be agreed), policy version and audited changes. Define draft visibility/assignment and the handoff queue. Changing the flag must not grant approval or execution. |
| Pricing Contributor | Sends a pricing concern with reason/evidence in a separate intake flow. Cannot read actual Proposals or use Proposal comments. | New tenant-owned request entity and intake endpoints; see R4. Do not silently grant Catalog cost/margin visibility: the permitted product lookup fields still need a decision. |
| Commercial / Executive Approver | Reuse one decision mechanism, with distinct authority and business scope. | Resolve qualifying commercial versus executive cases, routing/escalation, whether stages are sequential or alternative, and how Finance interacts. Reusing a button must not make every approver interchangeable. Backend evaluates stage, assignment, scope and maker-checker. |
| Account Owner / Pricing Manager / Finance Approver / Executor / Viewer / Auditor | Rename existing approved roles; retain the intended underlying permissions. | Publish a signed-off old-code → new-label → capability/scope mapping and migration. Do not infer Account Owner powers or conflate Viewer with Auditor. The current repo's `admin` / `approver` strings are not a complete mapping. No new powers through relabeling. |
| AI Assistant | Deferred until the data-team dependency is ready. | No onboarding gate for AI. Existing deterministic intelligence does not imply an AI assistant is shipped. |
| Vendor Manager / Forward Deployed Engineer / Workspace Admin | No new Vendor role; normal approval handles cases. FDE reserved for later. Workspace Admin removed. | Do not offer these as assignable roles. Do not create a replacement “super-admin” role under another label without product approval. |

**Important source discrepancy:** The CEO reports an existing approve/reject mechanism. This checkout exposes `ApproveProposal` and `ApproveOverride`, but no reject/deny RPC, Proposal rejection state or state-machine event. The override table allows `rejected`, yet no matching decision handler was found. Confirm the implementation/branch with the lead engineer. Until reconciled, rejection is **not verified delivered**.

**Gate:** Company A's Analyst can save but cannot submit; Company B can enable submission independently. A manager can resume A's authorized draft; unrelated users cannot. Distinct approver scope tests prevent a commercial decision from satisfying an executive-only requirement. Historical decisions retain their original actor, role/authority and policy version after role renames.

### R4 · P0 for Contributor onboarding · Separate pricing-request intake

**Owner:** Proposal-domain owner or another explicitly assigned intake owner + Gateway + Data Pipeline/object storage for evidence.

Proposed contract, to be agreed before generation:

- `POST /pricing-requests` with permitted product/reference, channel context, observed issue, explanation and validated evidence references; idempotency key required.
- `GET /pricing-requests` and `GET /pricing-requests/:id` with contributor-safe own-request projections. Triage staff receive a separately authorized richer projection.
- A triage/assignment command and controlled conversion/link to a draft. The original request and evidence remain attributed to the contributor. Conversion does not disclose Proposal IDs, prices, comments or approval state to the contributor.
- Persist `org_id`, requester, reference snapshot, evidence object metadata, state, assignee, version, timestamps and internal draft linkage. Final triage statuses and supported attachment types/limits require product confirmation.

Evidence uploads require authorized object access, size/type validation, retention rules and a safe download policy. Signed links must not become cross-tenant shortcuts. Contributor notifications describe request progress only.

**Gate:** A contributor can submit, reopen and track their permitted request; proposal list/detail/comments/export/audit and direct URL/API access remain denied. Request A's receipt never reveals a related Proposal. Cross-tenant and another-contributor access fail according to the agreed ownership policy.

### R5 · P0 · Freeze and release the browser contract

**Owner:** Gateway/BFF + frontend; each service owns authoritative domain fields.

Use [`contracts.js`](../src/data/contracts.js) as the browser's requested seam, not a claim that those DTOs already exist on the wire. Release OpenAPI and generated clients only after agreeing:

- Stable resource ID **and version**; required-version optimistic concurrency on consequential mutations; idempotency request and replay/conflict semantics.
- Money as lossless minor-unit strings plus currency; margin basis points distinct from price-change percentages and markup.
- Server-authored `allowedActions`, denial reason, required version, exact navigation target and confirmation consequence. No permission inference from display role names.
- Cursor pages with truthful returned count, next cursor, total-count relation and coverage; filters apply server-side to the declared population.
- One domain error envelope with code, trace ID, retryability and actionable details. The current Gateway returns `{code,message,details}`, while the workspace expects `{error:{...},traceId}`; specify an adapter or change the published response consistently.
- Exact actor/context and allowed field redactions. No UI-calculated “authoritative” counts or borrowed audit history.

**Gate:** The same contract/BDD scenarios run against a real Gateway adapter. Every repository method used by a released route is mapped or deliberately unavailable; live mode cannot fall back to fixture responses. Capture the generated contract version in the release record.

### R6 · P0 · Make preview populations and margin evidence trustworthy

**Owner:** Proposal + Catalog + Margin/Data Pipeline; frontend formats only.

Fix the single-page 500-SKU cap or reject oversized scopes explicitly with a truthful limit/recovery action. Return requested/matched/priced/selected/eligible/blocked/excluded/unpriced accounting; never silently discard unpriced products. Pin exact canonical cost/price, dimensions, effective time, scope and rule versions in preview evidence.

Expose policy evaluation for **all** selected lines: current cost and freshness, margin/floor arithmetic, applied rule/version and scope, matching/explanation trace, no-match/error distinction, evaluator version and exact line context. Current `Violation` attribution is not sufficient when the same SKU occurs in multiple channels; use stable preview-line identity and dimensions rather than SKU alone.

Make apply-floor, exclude, refresh-cost and repair-dimension server-validated versioned operations, or explicitly restrict the UI to released alternatives. Refresh/repair must use real newly accepted canonical evidence, not invent new cost or dimension values. Stale-cost/dimension blockers must not be waived as margin exceptions.

Reconcile arithmetic: backend percentage adjustment currently converts `bigint` to `Number` before rounding; the fixture engine is integer-only. Bound supported amounts/precision or implement lossless arithmetic and shared golden tests. Distinguish percentage price movement from gross-margin floors and markup. A “+3.5% price” rule must not be described as “+3.5 margin points.”

**Gate:** Tests cover >500 and the product's 1,248-line example, unpriced/excluded lines, duplicate SKU contexts, tie-breaking, rounding boundary/large amounts, currency mismatch, absent/stale cost, no policy match and evaluator failure. Preview totals reconcile; old versions remain readable; a stale tab cannot mutate its successor.

### R7 · P0 · Versioned decisions and honest publication outcomes

**Owner:** Proposal + Catalog + Governance; platform owns worker reliability.

Proposal proto messages currently lack immutable resource versions; draft update replaces its line records. Release exact-version submit/approve/reject/override decisions with decision reason, authority snapshot and protected evidence. Prevent concurrent draft-edit/submit races. Define rejected/returned-for-changes behavior without silently editing a submitted decision copy. Comments and complete history must follow the agreed version visibility.

Publication requires a durable operation record and status read/reconcile contract: exact approved version, selected line/destination population, idempotency key, attempted/applied/rejected/pending result and per-line reasons. The immediate publish handler and scheduled worker currently await `ApplyPriceChanges` but discard its `WriteSummary` and row outcomes before marking the Proposal published. This is incompatible with Catalog's structured partial-write results and the workspace's incomplete/unknown-outcome UI.

Only verified completion may say “Published.” A timeout means unknown until reconciled, not safe to retry. After reconciliation, retry only unresolved scope under the operation's defined idempotency semantics. Schedule reads must expose effective time, timezone presentation, state, failure and recovery; approve and execute remain separate authorities.

Decide what the initial release actually delivers: canonical Catalog update, export file or external connector delivery. Do not show ERP/POS/commerce delivery success unless real acknowledgements exist. Export/connector work is a pilot gate only if promised to that pilot; the completion language must match the released boundary.

**Gate:** Integration tests interrupt before/after Catalog commit and before Proposal/outbox finalization, include partial rejection, replay, double-click/concurrent execution, worker restart and scheduled failure. No duplicate price application; no false full-success state; complete audit lineage remains reconstructable.

### R8 · P0 · Connect recoverable import and audit reads

**Owner:** Data Pipeline + Catalog + Governance + Gateway; frontend owns recovery presentation.

For import, agree a server-recoverable Upload → Profile → Map → Validate → Review → Commit → Result projection. The acknowledgement must bind the actual reviewed mapping/validation version and exclusions; a later row edit must invalidate old acknowledgement. Expose real operation status and exact attempted/committed/rejected/remaining counts. Keep merchant SKU organization-scoped, canonical SKU UUID stable, and channel/location/segment creation explicitly authorized. Provide safe row-error correction and export only when the corresponding contract exists.

Implement Governance's activity/entity-history reads with cursor pagination, tenant/field authorization, actor attribution and version lineage. Verify event coverage for comments, role/policy changes, draft handoff, rejection, intake and publication outcomes; additions to locked event schemas require their normal versioned contract review. Governance remains an event subscriber, not a synchronous command dependency.

**Gate:** A real customer-shaped CSV/XLSX—not just seed fixtures—can be mapped, corrected, committed after an interrupted request, and verified in Catalog without duplicating writes or dropping unresolved rows. A second user sees the exact recorded decision history. Unauthorized users cannot retrieve hidden Proposal evidence through Audit.

### R9 · P1 / assisted-pilot gate · Company setup, next actor and notifications

**Owner:** Product + Identity/Gateway + Catalog/Margin + Notify.

Release setup for company identity, currency/timezone, channels/locations/segments, initial catalog and margin policy, invited team and execution boundary. Assisted setup is acceptable if documented; a visually empty workspace with no route to configure these is not self-service onboarding. Clarify who may change each setting through the agreed role map.

Provide role-aware queue projection with counts, assignment, next action and source links. Analyst → manager, contributor → triage, submitter → approver and approver → executor must each have an actual next-owner path. Until Notify is implemented, do not say “X notified”; offer an explicit manual handoff and disclose it to pilot users. Self-service beta requires tested invitation/action delivery and retry/dead-letter handling, not merely emitted events.

**Gate:** A new company with no seeded fixtures reaches its first successful governed price change. Every handoff reaches an authorized person, and empty/blocked states explain the next step without exposing another role's data.

### R10 · P0 before real customer data · Deployment and operational proof

**Owner:** Platform/security lead + service owners + QA.

Cloudflare static hosting establishes frontend availability, not backend deployment. The checked-in [Workers configuration](../wrangler.toml) declares static assets only; the [deployment guide](../../../docs/frontend-deployment.md) describes Kubernetes `/api` routing. Confirm which live routing topology is actually selected. Pages can remain the frontend host; no repo split is required. Keep credentials server-side and never put secrets in `VITE_*` variables.

Evidence required: production identity configuration with dev login disabled; restrictive origins/session policy; protected service boundaries; migrations and tenant RLS validation; secret rotation; encrypted transport/storage policy; backup/restore drill; request tracing; queue/outbox lag and failure alerts; upload retention; support incident ownership and release rollback. Set recovery objectives and pilot population/load limits with the team rather than inventing them here.

**Gate:** Real-domain landing → login → workspace → expired session → login return → logout works; `/api` does not return the SPA; direct links refresh; no localhost/sibling-host guesswork; role/tenant isolation and money-failure BDD pass through deployed Gateway; rollback and recovery evidence is attached to the release record.

## 3. Delivery sequence and acceptance ownership

1. **Lead engineer + Product:** reconcile branch discrepancies, freeze role/capability mapping, decision stages, pilot publication boundary and the existing BE ticket mapping.
2. **Identity/Gateway + service owners, in parallel:** R1/R2; contract-first R3/R4; complete R6/R7/R8 service work. Add migrations as new files; do not rewrite applied migrations.
3. **Gateway + frontend:** R5 generated adapter and authoritative view projections. Keep fixture access explicitly separated while integration tests are being built.
4. **Product + Notify + frontend:** R9 first-company setup and real handoffs. Do not silently turn provisional workflow descriptions into shipped product claims.
5. **Independent QA + platform:** R10 staging proof, negative role/tenant tests, failure/recovery tests and desktop/mobile journey tests. Release authorization belongs to the team's production approval process, not a passing visual review.

The release record must name source SHA, contract version, migrations, deployed service versions, test results, known pilot restrictions, owner and rollback procedure. No existing source test is marked passed by this document.

## 4. Decisions still requiring confirmation

- Does the CEO's rejection implementation exist on another branch or deployment? Which role codes currently back each renamed role?
- Who owns company identity/membership and request intake? What IdP/session model is selected?
- What is the default Analyst-submit setting, who may change it, and which users may pick up another analyst's draft?
- Which approval cases require Commercial, Finance and/or Executive authority, and are those decisions sequential or alternative?
- What data can a Contributor search or attach, and who can view another contributor's requests?
- Is first launch assisted-pilot or self-service? What maximum scope, currency set and data freshness policy are supported?
- Does “publish” initially mean Catalog, approved export or acknowledged connector delivery? Which destinations are actually contracted for the first companies?
- What backend is currently deployed behind the hosted frontend, and which existing BE issues have independent evidence of completion?

These are scoped product/integration decisions. AI Assistant, FDE access, a Vendor Manager role and a Workspace Admin role must not be added to fill them.
