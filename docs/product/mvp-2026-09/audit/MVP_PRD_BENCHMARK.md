# Owómidé MVP: PRD versus current product

**Decision report · 12 September 2026 · Frontend, backend and integration benchmark**

## Executive conclusion

**The current product is not complete against the replacement PRD and is not ready to onboard real companies.** It is a useful, increasingly coherent **sample-backed SKU repricing and Proposal workspace**, alongside substantial backend foundations. The replacement PRD describes a broader **Initiative-led collaborative pricing system**, with contextual data, pricing construction, Scenarios, controlled decisions, implementation recording, monitoring and historical learning.

We should retain the good work. We should not treat the remaining work as “connect the APIs” or another visual-polish pass. Some capabilities are absent; others exist but use a model that must change. Those two categories need different engineering work.

The highest-risk current-source findings are:

1. Contextual prices and costs are reduced to SKU-only values; unresolved/unpriced scope can disappear.
2. Server permission boundaries do not match the sample's role/economics controls, and Proposal service-auth forwarding is incomplete.
3. The displayed Proposal version changes on submission/approval; the PRD instead freezes the same controlled version and separates decision, validity, workflow and execution state.
4. Only one matching margin rule is evaluated; every applicable Guardrail and its treatment must remain separately accountable.
5. Both immediate and scheduled publication discard Catalog per-row results before marking the whole Proposal published.
6. Initiative, Scenario, manual implementation/variance, monitoring, complete history, durable notifications and contextual AI remain missing or substantially incomplete.

This report is a benchmark only. It does not implement fixes, change permissions, publish prices, deploy, commit or certify production.

## Read the evidence at the right depth

- [Development sequence, backend handoff and BDD release gates](DEVELOPMENT_BACKLOG.md)
- [All 379 requirement assessments](REQUIREMENTS_MATRIX.md) and [machine-readable full source wording/evidence](REQUIREMENTS_MATRIX.json)
- [Current screen-by-screen evidence](UI_FLOW_AUDIT.md)
- [Repository/source verification](REPOSITORY_BASELINE.md)
- Detailed reviews: [pricing/data/analysis](pricing-data-review.md), [roles/workflow/governance](roles-governance-review.md), [collaboration/AI/visibility](collaboration-ai-visibility-review.md), [execution/history/export](execution-history-review.md).

## 1. Exactly what was compared

The replacement PDF is **283 physical pages**, 2,330,079 bytes, SHA-256 `0abae9e27c514a8f0bdef9bd344d1f5eb75f033fb61495f7ebcc6a225c7ceba3`. All **379 numbered requirements across 14 domains**, plus foundation, lifecycle, scope and interpretation material, were read across four reviewers. Key original pages were rendered to check definitions, controlled-version semantics and requirement strength. Page references throughout mean physical PDF pages, including dividers.

The frontend baseline is the actual dirty `polish/workspace-premium-desk` checkout in `owomide-frontend-monorepo`, not only committed main. The backend baseline is fetched `origin/main`, **67218abda3e2302bd3003075910cc3a5bfc02097**. Fetch succeeded; fast-forward pull reported already up to date. The main tip is the 6 September Cloudflare-assets merge. There are no open PRs in this remote. The recent published `joshua/*` governance/auth branches are already merged; the only Joshua branch with an extra unmerged commit contains old CI action-version changes, not new permissions work.

**No newer published roles implementation was found.** This does not prove the lead engineer has no unpublished work. A later branch/repository/commit can be assessed as a delta without restarting the PRD benchmark. The separate `owomide_core` folder is an older documentation worktree and was not mistaken for the latest service implementation.

### Evidence labels

| Label | What it means here |
| --- | --- |
| Sample-complete / sample-partial | Demonstrated narrowly in the fixture frontend; not persistent live behaviour. |
| Implemented-source / partial-source | Credited from inspected backend code/schema/contracts; not necessarily deployed or integration-tested. |
| Conflicting | An observed calculation, state model or control-flow discrepancy with the PRD. |
| Absent | Not found in the inspected route, repository, schema and implementation inventory; not a claim about unpublished systems. |
| Not connected | The workspace explicitly rejects live mode. This is one common integration gate, not 379 independent integration failures. |

The [repository factory](../../../../apps/workspace/src/data/workspaceRepositories.js#L17) throws `LIVE_ADAPTER_NOT_RELEASED` for live mode. Hosting the frontend on Cloudflare does not change that. The hosted deployment was not compared to this dirty local worktree.

PRD pp73–74 govern interpretation: **Must/Must Not** are mandatory when applicable; **Should** needs an explicit justified product deferral; **May** is optional. Examples are not an instruction to implement every listed variant. Requirement-row counts are not a meaningful product completion percentage, so none is provided.

## 2. Capability map: what exists versus what remains

| Domain / IDs | Useful current frontend/backend evidence | Principal outstanding work |
| --- | --- | --- |
| ORG · 14 | Sample identities, access examples, submission toggle; JWT validation and tenant RLS foundations. | Real organisation setup, invitations, active membership, role/scope administration, revocation, ownership continuity, onboarding readiness. |
| DATA · 21 | Catalog/record/import sample UI; temporal Price/Cost records, dimensions, import validation and row isolation in services. | Product/service/custom Priceable Entities, manual records, full contextual resolution and unit/cost-basis provenance; ambiguity-safe scope; selected external integration. |
| INIT · 21 | Proposal title/owner/scope and next-action fragments. | Persistent Initiative as parent: objective/type/priority, scope, assumptions, collaborators, dates, lifecycle, hold/cancel/completion and lineage. |
| BUILD · 24 | Prepared frontend adjustments; four backend percentage/absolute operators and rule parsing. | Bounded structured construction, conditions/inputs/assumptions, human-readable logic, validation/recalculation, controlled reuse and AI-assisted application. |
| ANALYSIS · 30 | Deterministic price/floor/margin helpers and preview blockers. | General target-margin/markup/GP outputs, exact rounding trace, all-applicable evaluations, unresolved semantics; named isolated Scenarios and comparison/selection. |
| PROP · 22 | Sample revisions, snapshots, authority UI, comments; backend draft/submission/approval and outbox. | Initiative parent, immutable full decision package, stable controlled version, distinct statuses/validity, exact-version authority and material revision. |
| COLLAB · 21 | Sample comments and separate Contributor intake; backend append-only basic comments. | Initiative collaboration, structured Evidence/provenance, mentions, assignments, pre-decision review; protected exact-version linkage and action resolution. |
| FLOW · 36 | Sample manager handoff/independent approver/revision; one backend approval transition. | Bounded company workflow profiles, separate Review, ordered/multiple required approvals, distinct change request/rejection, urgency, policy-authorised path. |
| GOV · 37 | Sample role grants/redaction; service authentication in several domains, RLS and some role checks. | Canonical server grants/scopes/limits, submitter maker-checker, immutable configuration, all Guardrail treatments, non-AI policy authorisation and auditable authority. |
| AI · 35 | Deterministic calculation foundation only; no contextual assistant runtime. | Bounded contextual assistance, grounding, permission parity, explicit human Apply, normal validation/attribution, prompt-injection boundary and non-AI fallback. |
| EXEC · 30 | Sample publication/recovery; actual Catalog write and scheduled-worker source. | Safe partial-result reconciliation, exact authority gates, manual implementation/variance/evidence, confirmed actual price, monitoring/objective outcome. |
| HIST · 29 | Sample history/revision references; persistent audit ingestion and Catalog history. | Controlled decision snapshots and complete linked Initiative history; functioning historical reads/search, access-safe reconstruction and applied-AI attribution. |
| NOTIF · 29 | Sample next-actor queue; notification proto only. | Durable in-product notifications, personal awareness versus action assignment, deadlines, current-record projections, deep links/revocation and deduplication. |
| EXPORT · 30 | Disabled UI/capability boundaries; internal Catalog integration is not an external connector. | Structured operational/historical export, exact-version permission/validity checks, auditable handoff; selected connector according to pilot need. |

## 3. The product model must change before the screen inventory grows

| Current shorthand | Required distinction |
| --- | --- |
| Repricing/Proposal is “the work” | **Initiative** is the accountable parent; Builder, analysis, Scenarios, Proposals, decisions, execution and outcomes belong to it. |
| SKU + price + cost | **Priceable Entity + commercial context + exact Price Record + compatible Applicable Unit Cost**, with source/basis/unit/currency/time and unresolved states. |
| Margin policy wins | A pricing **Strategy/Builder Rule** is user construction. Organisational **Guardrails** are governed controls; analysis evaluates each applicable one; workflow consumes their retained results/treatments. |
| New version on every mutation | Controlled material **Proposal version** is separate from concurrency revision. Submit freezes vN; approval concerns vN; material replacement creates vN+1. |
| Blocked → approved → published | Separate **readiness**, **Proposal decision**, **version validity**, **workflow progress**, **execution progress**, and **Initiative stage**. |
| Policy clear / override approved | Neither automatically means **Authorised Within Policy**. That is a separate default-disabled, configured, non-AI decision path. |
| Published / export downloaded | Not proof of external **implementation**. Preserve authorised action, actual action, variance and observed outcome separately. |

Canonical Initiative stages are **Initiated → In Development → In Review → Awaiting Approval → Ready for Execution → Implemented → Monitoring → Completed**, with supported path rules rather than an assumption that every stage takes the same time. On Hold preserves the prior stage; Cancelled requires its own treatment. Proposal expiry is not a substitute Initiative stage.

Canonical Proposal decisions are **Draft, Awaiting Approval, Changes Requested, Rejected, Approved, Authorised Within Policy**. Version validity is **Current, Superseded, Expired**. Execution status is **Not Started, In Progress, Partially Implemented, Implemented, Implementation Exception**. These are not alternate names for one status field.

## 4. Correctness issues to fix before real data

### Context and financial outputs

`buildScope` explicitly requests one 500-SKU page, maps PriceRecords by SKU alone and silently drops unpriced members ([source](../../../../src/proposal/src/service.ts#L792)). Margin's Catalog client similarly overwrites cost candidates by SKU, losing basis/context/provenance ([source](../../../../src/margin/internal/client/catalog.go#L66)). Richer Catalog storage is therefore not enough: the consumers must resolve it correctly. DATA-003/004/014–016; BUILD-004/007; ANALYSIS-003–007/022.

`updateChangeSet` changes rule/scope while retaining previously computed lines ([repository](../../../../src/proposal/src/repo/proposal-repository.ts#L480)). `computeDiff` reports 0% for a zero baseline where the PRD requires unavailable ([source](../../../../src/proposal/src/domain/diff.ts#L7)). Percentage operations also convert minor units to Number. Invalidate/recompute consequential changes, preserve exact calculation inputs, distinguish unrounded from final rounded output and verify currency precision. BUILD-018/022; ANALYSIS-006/023/026.

### Permissions and authority

Catalog cost reads authenticate a service, not the complete end-user economics permission ([service](../../../../src/catalog/src/service.ts#L134)). Publication lacks an Executor/action-scope gate ([service](../../../../src/proposal/src/service.ts#L439)). Proposal REST headers omit the service bearer/roles required downstream ([routes](../../../../src/gateway/src/routes/proposals.ts#L31)). Governance RPC trusts nonempty context without the same service/user protection. Fix these together; an unusable route is not a security solution. ORG-002/006/007; GOV-015–022/035; EXEC-001.

Backend approval compares approver identity to the creator, not necessarily the actual submitter ([approval context](../../../../src/proposal/src/service.ts#L391)). A manager who submits another analyst's draft must not approve that submission just because they are not its creator. Store the actual submitter with the controlled version. FLOW-013; GOV-019.

### Controlled versions, Guardrails and publication

Sample submit and approve each increment displayed Proposal version ([submit](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2201), [approve](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L2312)). The backend lacks that complete controlled-version model. Existing green tests assert the old behaviour. Update contract, storage and tests together. “Return for changes” currently stores reject semantics; separate semantic outcomes are necessary, but a shared typed decision endpoint is acceptable. PROP-003/011/012/015/021; FLOW-011/016.

The active Python evaluator calculates only `matched[0]` ([source](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/rules.py#L503)); the Margin handler collapses breaches and errors into blocking ([source](../../../../src/margin/internal/handler/validate_batch.go#L95)). Preserve each applicable Guardrail and its Within/Breach/Unable to Evaluate result, configured Warning/Approval Escalation/Blocking treatment and historical configuration. ANALYSIS-014/015; GOV-023–025/034.

Catalog can return a successful RPC containing rejected rows. Both [direct publication](../../../../src/proposal/src/service.ts#L495) and [scheduled rollout](../../../../src/proposal/src/workers/scheduled-rollout.ts#L144) discard that response and record aggregate publication. Per-row savepoint handling deliberately returns rejection rather than throwing ([Catalog](../../../../src/catalog/src/write-engine.ts#L390)). This is a confirmed source-level false-completion path, not a claimed production incident. EXEC-010/011/014/029.

## 5. Roles: what changed, what is still only a demonstration

The current frontend already demonstrates much of the earlier CEO note: draft-tier Analyst submission configuration, manager handoff, a separate Contributor request box, Finance/Commercial/Executive example actors, Executor/Viewer/Auditor labels and restricted projections. That effort should be retained. **Those role names do not establish server-enforced capability, active membership, resource scope or approval limits.**

| Role concern | Benchmark outcome |
| --- | --- |
| Analyst can draft but may not submit | Useful sample toggle/handoff. Persist per-company settings and enforce submit separately from create/edit on the server. Analyst must not gain approval automatically. |
| Contributor cannot read Proposals | Earlier restrictive intake is represented in the sample. New GOV-007 allows defined participation according to grants; that does **not** require opening all Proposals. Keep intake safe; clarify whether scoped collaboration should be enabled. |
| Finance/Commercial/Executive approval | Shared decision mechanics are valid. Current backend recognises literal `approver`, not a complete canonical mapping with stage, scope and authority limits. Sequential/multiple approvals need workflow support, not just new names. |
| Account Owner versus Admin | Ownership/member administration is absent. New PRD GOV-002/004 includes Workspace Admin, while the earlier CEO note removed it. Decide the role packaging explicitly; administrative authority must never imply commercial approval. |
| Executor | Sample `publisher` maps to Executor, but backend publication has no equivalent end-user guard. Execution also needs actual manual outcome recording, not only Catalog writes. |
| Viewer and Auditor | Read-only and protected-field policies must work across direct APIs/history/export/search, not only screen visibility. Audit read APIs are currently stubbed. |
| Vendor Manager / Forward Deployed Engineer | Do not invent these as MVP blockers from old role documents. Specialised roles are optional supported permission combinations, not a reason to expand scope. |

The detailed role-code table and direct evidence are in [the governance review](roles-governance-review.md). A role rename alone will not close these gaps.

## 6. Target end-to-end journey and frontend work

1. **Enter and join a real workspace:** landing → authentication/invitation → active organisation, role and scope → setup readiness. The current Continue flow is explicitly sample access.
2. **Establish pricing context:** import or authorised manual entry → mapping/validation → reconcile all input rows → choose unambiguous contextual prices and costs. Preserve source Evidence and unknowns.
3. **Create an Initiative:** objective, business rationale, type, priority, owner, scope and relevant dates/assumptions; choose collaborators without granting unrelated visibility.
4. **Construct and analyse:** supported Builder actions/conditions → deterministic outcomes and all applicable Guardrails. Where useful, create named alternatives and compare/select a Scenario; a direct Builder → Proposal path is also valid. Exploratory edits do not touch live prices.
5. **Collaborate and review:** comments, Evidence and action assignments linked to the work; pre-decision review is not formal approval. Resolve what blocks readiness.
6. **Create/freeze the decision package:** Proposal vN retains exact source records, strategy, analysis, assumptions, relevant Evidence and Guardrail configuration/results. Submit the same vN through the permitted path.
7. **Obtain authority:** independent scoped human decision(s), or deliberately configured non-AI policy authorisation. Show why the exact version is authorised; preserve requests for changes/rejection independently.
8. **Hand off and record implementation:** export or supported connector/manual operation → actual per-entity implementation and timestamps → partial/variance/remediation. A download is not implementation.
9. **Monitor and close:** record available observations, compare authorised/actual/outcome, assess the objective where applicable, complete obligations and preserve searchable history. New follow-up work gets new authority.

Contextual AI helps within permitted steps but does not replace this non-AI journey. A single persistent Initiative overview should show the purpose, stage, next responsible person and pending decision; detail belongs behind relevant drill-downs. Do not solve the broader scope by adding every datum to each repricing row.

## 7. Design assessment, without an unsupported “premium complete” claim

The current captures show a calmer Catalog and Preview: contained numbers, fewer competing colours, explicit source/SKU identity, contextual calculations and clearer next actions. The Catalog full-record layout no longer reproduces the severe wrapped-date/narrow-text example in the earlier user screenshot. These are genuine improvements in the inspected state.

The remaining cognitive burden is structural as well as visual: several screens repeat version/policy/system explanations; comments are far below repeated Proposal framing on mobile; “Independent review” conflates the narrower old journey with the new distinct Review/Approval stages; the navigation lacks an Initiative home. Technical provenance should remain available without dominating routine decisions.

Eight fresh captured states and their strengths, risks and limits are in [the visual review](UI_FLOW_AUDIT.md). This is not an all-screen, all-width, all-role accessibility certification. The landing/login replay was blocked by a local entry-tab/browser restriction after the marketing dev server was initially unavailable; no successful entry capture is claimed. Hosted production was not inspected.

## 8. Fresh verification and what it does not prove

| Check | Result |
| --- | --- |
| Workspace data/contracts | 155 passed |
| Workspace BDD/component suites | 189 passed across 15 files |
| Workspace hosting checks | 8 passed |
| **Workspace unique total** | **352 passed** via `pnpm --filter @owomide/workspace test:all` |
| Proposal unit suite | 61 passed |
| Governance unit suite | 23 passed |
| Gateway auth/login/Catalog/Margin subset | 14 passed |
| Marketing and workspace production builds | Both passed via `pnpm build:frontends` |

The selected backend suites add **98 distinct local tests**. Agent reruns of frontend subsets and the same backend suites are not counted twice. The test runtime reported Node20 below the declared Node >=22 in one backend command; repeat under the supported CI runtime before a release.

These are isolated tests, primarily fixture contracts and jsdom BDD—not a running multi-service acceptance environment. No real import, database migration/RLS integration, actual-user lifecycle, service-to-service permission chain, external implementation, AI evaluation, hosted build parity, backups/restore or load/security programme was certified. Safe proposed BDD scenarios in the ledger/backlog are **not** presented as already passing tests.

Passing tests are valuable, but several assert the old semantics. New PRD acceptance tests must deliberately replace those expectations, not simply preserve a green suite.

## 9. Decisions needed before estimating the next implementation

| Decision | Why it matters | Recommended working position |
| --- | --- | --- |
| Full PRD MVP or explicitly narrower non-AI pilot? | Earlier CEO deferral conflicts with mandatory AI-001/005 and BUILD-019/020. | Record the exception if piloting without AI; do not label that pilot full PRD completion. |
| Workspace Admin packaging | Earlier removed role reappears in GOV-002/004. | Separate administrative grants from approval; confirm whether a named role or Owner-admin combination fulfils the expected model. |
| Contributor access | Earlier absolute Proposal isolation versus new permission-defined contribution. | Preserve deny-by-default; expose only deliberately granted objects/actions, retaining separate request intake. |
| First pilot entity/context and cost basis | Determines meaningful data contracts and calculation acceptance. | Validate with real anonymised examples; support PRD minimum entity types without building a universal ERP. |
| Workflow and authority profile | Ordered approvers, scope/limits, review and policy-authorisation qualification need concrete settings. | Bounded default profile, exact configuration history, policy path disabled by default. |
| Implementation source of truth | Internal Catalog write is not proof that a merchant's operational prices changed. | Define acceptable human confirmation/evidence and variance handling; retain manual execution fallback. |
| Selected external connector | DATA-021 expects bounded capability and a pilot-selected connector; broad coverage is excluded. | Choose from validated pilot need; do not arbitrarily add ERP/POS/CRM connectors. |

No arbitrary delivery dates or feature-completion percentages are defensible before these decisions and contract changes. The [backlog](DEVELOPMENT_BACKLOG.md) groups the 379 rows into implementable dependency slices and explicit release gates.

**Recommended next step:** a CEO/lead-engineer contract review of the seven decisions above, followed by the P0 foundations and one connected Initiative-to-recorded-outcome vertical slice. Preserve and refine the existing visual system around that coherent journey.
