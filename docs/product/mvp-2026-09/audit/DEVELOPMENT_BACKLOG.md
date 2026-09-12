# Development plan and backend handoff

12 September 2026. Proposed work, not implemented tickets or scheduled automations. Read with [the benchmark](MVP_PRD_BENCHMARK.md) and [379-row ledger](REQUIREMENTS_MATRIX.md).

These P0–P3 priorities are the **new PRD audit's release/dependency order**, not a claim that an earlier polish P0–P3 plan is complete. Owners below are proposed workstreams, not assignments sent to teammates. Do not connect the current fixture UI directly to production writes before the P0 gates are satisfied.

## Release sequence

| Slice | Priority and proposed owner | Deliverable and dependencies | Exit evidence |
| --- | --- | --- | --- |
| A. Ratify contracts | P0 · CEO + lead engineer + frontend lead | Confirm scope decisions; canonical entity/context, Initiative, version/state, authority and execution schemas. | Reviewed contracts, migration strategy and acceptance examples; no ambiguous use of “version”, “policy clear” or “implemented”. |
| B. Secure organisation entry | P0 · backend identity/platform; frontend access | Organisation setup, invitations/membership, roles/scopes, revocation, owner continuity, authenticated session; consistent gateway/service enforcement. Depends A. | Two-tenant authorised/denied API tests and browser login/invite/revocation journey. |
| C. Trustworthy pricing context | P0 · Catalog/Data Pipeline/Margin/Proposal; frontend data | Context-resolved prices/costs, provenance, full scope accounting, no silent cap/drop, correct precision and recomputation. Depends A; requires B for live data. | Golden calculations and multi-context/ambiguous/unpriced import cases reconciled from original input to displayed outcome. |
| D. Controlled decisions and controls | P0 · Proposal/Governance/Margin; frontend decisions | Immutable same-version submission; independent decision/validity/revision; all applicable Guardrails/treatments; submitter maker-checker; safe partial publication. Depends A–C. | Exact-version replay, stale/expired/unauthorised rejection, per-row partial/unknown outcome tests in immediate and scheduled paths. |
| E. Initiative-led construction | P1 · backend product domain + frontend workflow | Initiative, assumptions, supported Builder and deterministic analysis, named Scenarios/comparison/selection. Reuse C/D contracts. | One real persisted Initiative survives reload and supports alternatives without touching live prices. |
| F. Collaborative decision journey | P1 · Proposal/Governance/Notify + frontend | Evidence, comments, assignments, separate Review, bounded ordered approvals, distinct formal outcomes and default-disabled policy authorisation. Depends B/D/E. | Different users complete the configured workflow with exact role/scope and version-bound records. |
| G. Operational closure | P1 · execution/export/history + frontend | CSV/operational handoff, manual implementation confirmation, variance/partial outcomes, monitoring, completion, historical reads/search. Depends D–F. | Authorised → actual → observed values independently reconstructable with audit trail. |
| H. Attention and integration | P1 · Notify/gateway + frontend data adapters | Durable notifications and canonical personal/team queues; live adapters, API schemas/errors/pagination and restart-safe state. Parallel by domain after contracts settle. | Queue counts reconcile to underlying responsibilities; no fixture fallback masquerades as live success. |
| I. Bounded AI | P1 capability + P0 safety gates · data/AI/backend + frontend | Context interpretation and required bounded Builder assistance; user-scoped retrieval, explicit Apply, provenance, non-AI fallback. Depends B–G relevant context/history. | Grounding/permission/tool tests and real assisted task. If excluded from pilot, written CEO deviation—not “full PRD done”. |
| J. Pilot integration and refinements | P1/P2 · integration + UX + product | Bounded external integration framework; connector selected by pilot need; decide expected Should items and bounded polish. | Validated source/permission/failure behaviour, manual/import fallback, usability and accessibility evidence. |

P3 distinguishes **optional deferral candidates** (for example supported non-material post-submission editing, approval delegation or withdrawal under PROP-018/FLOW-018/027/028) from **MVP exclusions** (general chat, arbitrary workflow graphs/scripts, autonomous pricing/execution, universal connector coverage and unsupported forecasts). Exclusions are boundaries, not an authorised future backlog. Optional deferrals still need an explicit product decision. Do not move mandatory Initiative, same-version authority, manual execution, history or core contextual AI into P3 merely because they are harder.

## Backend contract handoff

The following are **proposed contract responsibilities**, not existing endpoint names. Keep the monorepo structure and current domain service boundaries where useful. Reuse Catalog temporal records, Data Pipeline import ledger, deterministic Margin foundations, Proposal transitions/outbox and Governance audit storage. Do not create a separate frontend repository or duplicate the same policy engine in the client.

| Contract responsibility | Minimum information and invariants | Frontend dependency |
| --- | --- | --- |
| Session / membership / capabilities | Organisation, user, active membership, role codes, action/resource/scope grants, protected-field policy, permitted actions with structured reasons, current revocation. Roles are claims only after trusted resolution. | Real entry, safe navigation and controls; ability to explain denial without disclosing restricted data. |
| Organisation configuration | Profile, currency/timezone/markets, owners, supported role/scopes, analyst submit setting, bounded workflow and policy settings with versions. | Setup readiness, invitations, access administration and company settings. |
| Priceable Entity / contextual economic records | Stable entity and external IDs; type; dimensions; PriceRecord/CostRecord IDs, amounts/currency, unit/basis, effective period, provenance. Resolve unique applicable record or return missing/ambiguous—not zero/arbitrary. | Catalog and manual/import review, scope selection and trustworthy drill-down. |
| Import ledger | Input, validation, excluded/unresolved/attempted/applied/rejected counts and row errors; explicit acknowledgement; idempotent commit and immutable source lineage. | Real upload, correction and commit preview without unexplained count changes. |
| Initiative / working context | Stable parent ID, objective/type/owner/priority, scope, dates, typed assumptions, collaborators, canonical lifecycle and readiness, hold/cancel/completion history. | One coherent home for the whole job; avoid isolated Proposal screens as the primary model. |
| Builder / analysis / Scenario | Versioned structured supported inputs/actions/conditions; selected exact records; compatible-cost resolution; unrounded/final prices, deltas, GP/margin/markup; complete evaluation state; independent alternatives. | Forms, calculations, comparison and explicit selection with reliable stale-state handling. |
| Guardrails | Versioned definition/applicability/treatment; each applicable result, exact inputs, Within/Breach/Unable to Evaluate, policy version and effective context. | One consistent result across analysis, Preview, Proposal, Review and execution readiness. |
| Controlled Proposal | Stable ID + Initiative ID + controlled version + separate concurrency revision; immutable submitted snapshot; decision status + validity; exact submitter and source/analysis/configuration linkage. | Same vN through submit/decision, version history, material revision and safe stale-reference messages. |
| Decision / workflow / authority | Review distinct from decision; required order/actors/scopes/limits, approve/reject/request changes; actual-submitter exclusion; policy authorisation record separate from exception approval. | Role-specific inboxes, clear “who next/why”, independent approval and correction cycles. |
| Collaboration / Evidence / assignments | Object and optional controlled-version link, author/source/time, permitted content, structured task lifecycle, mentions, evidence relations and resolution history. | Contextual discussion without widening Contributor or economic visibility. |
| Execution / handoff | Exact authorised Proposal version, recipient/destination, operation/idempotency key, requested vs actual per-entity amount/scope/effective time, actor/evidence, partial/unknown/exception status and remediation. | Download/record implementation/reconcile; never label transport success as business completion. |
| History / work projections / Notify | Immutable events and read APIs; scoped pagination/search; authoritative current responsibility and distinct awareness; durable recipient-safe read/unread/deep links. | Reliable work queue, notifications and historical reconstruction across sessions. |
| AI invocation / application | Invoker-scoped context sources, uncertainty, output schema/provenance, explicit validated human Apply, retained version consequences and safe unavailable response. | Contextual assistant that reduces effort without modifying work or authority by itself. |

Every live command needs consistent errors, request tracing, idempotency where consequential, exact reference/concurrency handling and transactional publication of history/events. Every list must page over the authorised source set, not only locally loaded fixtures. Sensitive field projection must happen before serialisation, export, notification or AI context construction.

Do not just remove `LIVE_ADAPTER_NOT_RELEASED`. First implement a real adapter against the reviewed contracts, add authorised success and denied-path tests, handle loading/empty/error/stale/retry states, then explicitly enable the environment. The existing sample should remain recognisably separate from company data.

## BDD acceptance pack to implement

These are **future acceptance scenarios**. They were designed from the PRD and current source; they are not claimed as existing or passing tests. Use isolated fakes for unit regressions, disposable databases for service integration and a seeded multi-user browser environment for journey proof. Never exercise real prices to test failure paths.

### Access and identity

1. **Tenant isolation (ORG-002, GOV-015–018):** Given two organisations and similarly named records, when A requests B's IDs through list/detail/comment/history/export, then access is denied without leaking existence or economic values.
2. **Revocation (ORG-004/010, GOV-033):** Given an active browser/API session, when membership is suspended or revoked, then subsequent reads/mutations and old notification links obey current access while historical actor attribution survives.
3. **Last owner (ORG-009):** Given the only active owner, when removal or transfer is attempted, then the company cannot become ownerless; authorised transfer is recorded.
4. **Analyst submission setting (GOV-006/015):** Given an Analyst allowed to edit but not submit, when they call submit directly, then it fails; a permitted Manager can take responsibility and submit the same controlled draft. Changing the company setting has scoped, auditable effect.
5. **Contributor boundary (GOV-007, COLLAB-014):** Given request-only access, when a Contributor submits evidence then probes Proposal routes/IDs, then only their permitted request content is visible; internal triage and Proposal economics stay private.
6. **Derived economics (DATA-017, GOV-021/022):** Given cost-restricted access, when detail/search/notes/export/notification/AI responses are produced, then neither raw cost nor reconstructable margin/floor/profit information leaks.
7. **Service identity:** Given authorised and unauthorised end users, when Gateway calls Proposal/Catalog/Margin/Governance, then internal identity is validated and end-user grants are preserved; valid requests succeed and invalid requests fail for the correct reason.

### Context, calculations and scope

8. **Contextual records (DATA-003/004):** Given one entity with different channel/location/currency/basis records, when a scope is analysed, then the exact applicable PriceRecord and compatible CostRecord are selected and retained; order of API results cannot change the answer.
9. **Ambiguity (DATA-003/013):** Given overlapping candidates or missing cost basis, when analysis runs, then the value is unresolved/Unable to Evaluate and no arbitrary default or inferred zero is used.
10. **Complete population (DATA-014, BUILD-004):** Given more than500 entities including unpriced/excluded/unresolved records, when scope is built, then all source members are accounted for through paging and classifications; nothing silently disappears.
11. **Partial import (DATA-008/009):** Given valid, invalid, warning, duplicate and excluded rows, when approved attempted rows are committed, then row outcomes reconcile to the input ledger and retry does not duplicate canonical records.
12. **Changed logic (BUILD-018/022):** Given computed lines, when scope/rule/assumption changes, then analysis becomes stale or is recomputed before use; new logic cannot be paired with old outputs.
13. **Calculation edges (ANALYSIS-003–007/023):** Given zero Current Price, large amounts, applicable currency precisions and rounding boundaries, when adjustment/target-margin/markup is calculated, then exact final economics match golden values; zero-baseline percentage is unavailable.
14. **All Guardrails (ANALYSIS-014, GOV-023–025):** Given two applicable controls, one warning and one blocking, when analysed, then both results/versions/treatments persist independently; a missing input is not falsely represented as a measured breach.
15. **Historical rule configuration (GOV-034):** Given a submitted decision using policy vN, when the rule is edited/deactivated, then the original definition/result remains reconstructable and newer settings do not silently rewrite it.
16. **Scenario isolation (ANALYSIS domain):** Given two named alternatives, when one is changed/selected, then the other and Current Price remain unchanged; selected analysis becomes traceable Proposal input only through explicit progression.

### Initiative and controlled decisions

17. **Persistent parent (INIT, PROP-001):** Given new work, when created and later reopened, then its objective, owner, scope, assumptions, collaborators and related records remain under one Initiative; an orphan Proposal is rejected.
18. **Review versus approval (COLLAB-011, FLOW):** Given In Review work, when feedback or clarification is recorded, then it creates no formal decision or execution authority.
19. **Freeze same version (PROP-003/011):** Given Draft v1, when submitted and later approved, then both actions reference v1 and the submitted snapshot stays immutable; concurrency revision may change independently.
20. **Actual submitter (FLOW-013, GOV-019):** Given A creates and B submits, when B also has approver/admin roles, then B cannot approve; permitted independent C may decide only within scope/limits.
21. **Distinct decisions (FLOW-011, PROP-015):** Given an awaiting decision, when Approve, Reject or Request Changes is chosen, then distinct semantics, reasons and history persist; a typed shared API may implement all three.
22. **Material revision (PROP-017/021, FLOW-017):** Given an authorised or returned version, when materially changed, then new Draft v2 is created with lineage, v1 remains inspectable, and earlier authority does not migrate.
23. **Ordered approval (FLOW-009):** Given required Finance then Executive approval, when the second actor acts early or outside limits, then it is denied; completion requires the configured independent sequence.
24. **Policy authorisation (FLOW-022/023, GOV-027/028):** Given the default-disabled policy path, then no automatic authority exists. After authorised configuration, only exact qualifying controlled versions receive a distinct recorded non-AI authorisation; exception approval or an Eligible badge alone is insufficient.
25. **Version validity (PROP-013, EXEC-001):** Given expired/superseded/rejected/changes-requested work, when execution or executable export is requested, then it is denied without erasing historical decisions.
26. **Scope/urgency (FLOW-024, GOV-026):** Given urgent work outside an actor's authority, when they attempt a decision, then urgency changes attention, not permission or required independence.

### Implementation, history and attention

27. **Partial RPC result (EXEC-010/011/029):** Given two authorised lines and a Catalog response with one UPDATED and one REJECTED, when direct or scheduled publication runs, then no aggregate completed/published event hides the rejection; per-line results and operation identity persist.
28. **Unknown and retry (EXEC-014):** Given timeout after a potentially successful write, when status is checked/retried, then unknown remains explicit until reconciled and retries do not duplicate or conceal successful lines. Repeat all-rejected and missing-result cases.
29. **Executor permission (EXEC-001):** Given Approved vN but a non-Executor, when publish/confirm is called directly, then server denies it; a permitted Executor still needs valid version/scope/timing.
30. **Export is not execution (EXPORT-009/010/029):** Given a permitted handoff download, when the file is generated, then access/version/purpose and redaction are checked and audited, but no implementation status or Current Price is advanced merely by download.
31. **Actual variance (EXEC-006–011/030):** Given an authorised price/timing, when actual external implementation differs, then actual values, evidence, actor and time remain separate; variance triggers supported treatment without retrospectively broadening authority.
32. **Monitoring and completion (EXEC-016–023, INIT):** Given implemented work, when observations/objective assessment are recorded, then measured data and interpretation remain distinct; completion respects applicable obligations and retains a final summary.
33. **Historical reconstruction (HIST-001–008):** Given role/configuration/data changes after completion, when history is reopened, then exact source, submitted version, authority, actual implementation and outcome are reconstructable under current read permissions.
34. **Personal relevance (NOTIF-001/002/026/028):** Given awareness of work but no assigned obligation, when personal work is displayed, then awareness is distinct from action-required counts; completion/reassignment updates all projections from canonical records.
35. **Durable notification (NOTIF-005–009/020/023):** Given one event delivered twice, when received/read/reopened after access removal, then deduplication/read state persist, reading never completes business work and inaccessible content stays protected.
36. **Evidence separation (COLLAB-007/008/016):** Given supplier material attached to v1, when used in a discussion then converted intentionally to a Cost Record, then the original Evidence and validated record remain distinct and linked; v1 discussion never migrates to v2.

### AI and experience gates

37. **Grounded and permission-scoped AI (AI-001–005/018–021):** Given restricted historical and current context, when assistance is invoked, then it uses permitted inputs, labels freshness/sources/uncertainty and cannot invent unavailable economics.
38. **Human Apply and attribution (BUILD-019/020, AI-008/022–026, HIST-011):** Given an AI suggestion, then authoritative work is unchanged until explicit permitted Apply; normal validation, actor/time/AI provenance and material-version consequences are preserved.
39. **No AI authority or injection (AI-027–031):** Given hostile instructions inside imported Evidence or a prompted approval tool call, then no approval, policy authorisation, governance change or implementation confirmation is performed by AI.
40. **Degradation and live journey:** Given AI/connector failure or a stale network response, then supported manual work remains usable, stale responses do not overwrite current state and the UI explains recovery. Run the complete permitted multi-user journey on desktop and mobile with browser reload/back/deep links, keyboard navigation, focus restoration, custom select behaviour, inspector scroll isolation and no table overlap.

## Real-company onboarding gate

Do not sign off based on screen count. Require:

- A written pilot scope and resolved deviations from the replacement PRD, including AI and role packaging.
- Production-suitable identity/membership and server-enforced tenant/resource/field boundaries.
- A complete persisted Initiative-to-authority-to-actual-outcome journey using representative authorised pilot data, including failure and revision paths.
- Correct contextual calculations and complete population accounting.
- Verified per-entity execution outcomes; internal Catalog publication never masquerades as external confirmation.
- Readable permission-safe historical reconstruction, handoff and responsible work queues.
- Supported-runtime CI, migration/rollback and backup/restore evidence, environment/secrets configuration, operational logging/alerts and recovery ownership. These operational gates are engineering release recommendations, not invented numbered PRD requirements.
- Actual browser usability/accessibility testing at relevant widths/zoom with multiple real roles; automated fixture BDD alone is insufficient.
- Hosted-build parity with the reviewed commit and no unintended sample/live crossover.

The next implementation can proceed as parallel domain work once Slice A is agreed, but release claims should be made on verified vertical slices, not on a collection of individually polished pages.
