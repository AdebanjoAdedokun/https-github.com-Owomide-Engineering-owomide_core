# Execution, history and operational handoff benchmark

Review date: 12 September 2026.

## Outcome

The current workspace is **not complete against the replacement PRD's execution → monitoring → historical knowledge journey**. It contains useful sample publication/recovery, source-version retention and audit presentation. The backend contains real Catalog write, effective-period preservation, proposal transitions, outbox and audit-ingestion foundations. Those are not yet the manual implementation, outcome-recording, authorised export and complete historical Initiative capabilities required by this PRD.

A connected frontend is not present: `apps/workspace/src/data/workspaceRepositories.js:17` rejects live mode, and `fixtureWorkspaceRepositories.js:2536` declares `fixture-memory` with network disabled. Nothing in this review is a deployed-service test or an assertion about unpublished branches.

## Sources and interpretation

- Current source: `source/prototype-prd.pdf`, **283 physical pages**.
- Independently verified SHA-256: `0abae9e27c514a8f0bdef9bd344d1f5eb75f033fb61495f7ebcc6a225c7ceba3`.
- Read the full foundation/scope/interpretation text (physical pp.1–76) and all **89 assigned requirement bodies**: EXEC-001–030, HIST-001–029 and EXPORT-001–030.
- Source indices: `source/requirements.json`, `source/pages.json`, `source/foundation-and-scope.txt`.
- PDF skill used for physical-page rendering and visual verification. Physical pp.236 (manual external implementation, confirmation and separate values), 252 (authority binding/snapshot preservation), and 277 (separate statuses/execution export validity) visually agree with extracted text.
- Render evidence: `[locally inspected PRD render]`, `p252.png`, `p277.png`. These are new renders of the current PDF; no previous one-page render was reused.
- The earlier one-page intake report remains intact in `prd-requirements-review.md` with a prominent superseded notice. Its zero-requirement finding does **not** describe the replacement source.
- Code root for every relative source reference in this report/matrix: `owomide_core`.
- Local HEAD and fetched `origin/main` both resolve to `67218abda3e2302bd3003075910cc3a5bfc02097`. Frontend working-tree edits were inspected as present; `git diff --name-only -- src` showed no backend modifications. This report does not judge backend work outside that verified source baseline.
- No instructions from the PDF were executed; no application source, permissions, live infrastructure, commits or deployments were changed.

The PRD expressly defines **Must/Must Not** as mandatory, **Should/Should Not** as expected MVP behaviour deferrable only by explicit product decision without breaking mandatory/core/governance/history requirements, **May** as optional, and **Not Required** as outside the minimum (pp.73–74). “Such as”, “for example” and “may include” do not silently add mandatory formats or features. The JSON retains original normative wording, not an invented requirements paraphrase.

Important scope boundaries:

- Manual implementation outside Owómidé is valid MVP execution (p.67, EXEC-005 pp.235–236). Broad connectors/autonomous execution are not prerequisites (pp.67–68, EXPORT-028 p.282).
- Proposed → authorised → actually implemented → observed outcome are different facts (EXEC-030 pp.246–247).
- Approved or Authorised Within Policy is a Proposal decision, not proof of implementation (pp.47–50).
- Monitoring need not be continuously automated, but real available outcomes and qualitative observations must be recordable (EXEC-016–023 pp.242–244).
- Submit freezes the **same** controlled Draft Proposal version; material post-submission change creates a new version (pp.37,46). Administrative mutation tokens must not silently become new controlled decision versions.
- AI monitoring/retrieval are optional in EXEC-022 and HIST-021, with mandatory constraints if introduced. HIST-011 attribution is mandatory when AI-assisted content materially affects pricing work. The replacement PRD separately requires bounded AI assistance (AI-001/005); the earlier CEO message deferring AI this period is a conflicting historical scope decision to reconcile, not an override of the current PRD. Optional monitoring/retrieval use cases must not be confused with that required bounded capability.

## Coverage ledger

The exhaustive machine-readable ledger is `execution-history-matrix.json`: **89 unique IDs**, each with original requirement text, physical pages, frontend/backend/integration status, concrete file:line/function evidence, gap, risk of misleading presentation, priority and future acceptance criterion.

| Dimension | Counts |
| --- | --- |
| Frontend | 35 sample-partial; 50 absent; 2 conflicting; 2 sample-complete |
| Backend | 26 partial-source; 57 absent; 4 conflicting; 2 implemented-source |
| Integration | 89 not-connected |
| Priority | 33 P0; 36 P1; 17 P2; 3 P3 |

These are **requirement-row classifications, not 89 independent features or a completion percentage**. Several IDs share the same missing canonical record or export subsystem. Optional/conditional/boundary requirements are included for traceability; their absence is not automatically a mandatory MVP failure. “Implemented-source” means the inspected source implements that narrowly scoped behaviour, not that deployed runtime or end-to-end integration was verified.

## Highest-risk correctness findings

### 1. Server publication lacks execution permission and canonical authority gates — P0

`src/proposal/src/service.ts:439` authenticates the gateway service, requires a nonempty user, reads the Proposal and tests the old state machine. It does not check an Executor role/resource/scope capability. `src/gateway/src/routes/proposals.ts:79` adds no such gate. The state machine's PUBLISH path (`src/proposal/src/domain/state-machine.ts:103`) checks only `approved`.

The exact controlled Proposal version, Current/Superseded/Expired validity, policy-authorisation basis, Initiative readiness, timing/conditions and implementation information required by EXEC-001 are not modelled there. The frontend sample's stronger `publish:execute` and assigned-publisher gates (`fixtureWorkspaceRepositories.js:2360`) cannot protect a direct backend request.

Relevant IDs: EXEC-001, EXEC-002, EXEC-028, EXPORT-010/016/026. This must be closed before exposing real pricing writes.

### 2. Partial Catalog failures can be concealed as published — P0

Catalog's `applyPriceChanges` uses per-row savepoints and returns individual results plus a summary (`src/catalog/src/write-engine.ts:295`). The Proposal client returns that response unchanged (`src/proposal/src/clients/catalog.ts:26`), but `publishProposal` discards it and immediately marks the Proposal published (`src/proposal/src/service.ts:495–523`).

The scheduled worker repeats the same pattern (`src/proposal/src/workers/scheduled-rollout.ts:144–180`). Therefore a successfully returned RPC with rejected rows is not distinguished from complete implementation. This is source-evidenced control flow, not a production incident claim.

The frontend models unknown/incomplete/retry outcomes, but they are fixed fixtures (`FIXTURE_PUBLICATION_STATES`, `proposalJourneyV0.js:201`) and do not repair the server path. Its fixed 1,227 requested/four-unresolved accounting is not a general entity-level execution ledger for a changed scope.

Relevant IDs: EXEC-010/011/014/029. Persist and reconcile actual per-entity outcomes; aggregate completion must never hide unresolved rows.

### 3. Controlled decision versions and operational states are not the PRD model — P0

Frontend `nextProposalVersion` snapshots the prior resource but is called on submit (`fixtureWorkspaceRepositories.js:2201`) and approve (`:2312`), as well as administrative actions. This conflates a concurrency/mutation revision with a controlled Proposal decision version. Backend `Proposal` contains no controlled version or validity field (`src/lib/proto/services/proposal/v1/proposal.proto:49`) and changes Approved to published (`proposal-repository.ts:265`).

The PRD requires separate Proposal decision status, Proposal version validity, Initiative lifecycle and execution status. An approval must attach to the exact submitted version, not a newly numbered version created merely by approving.

Relevant IDs: HIST-002/003/004/007/008, EXEC-002/010, EXPORT-009. Align the shared model and migrate the existing tests deliberately; do not just rename labels.

### 4. Current Price lacks a confirmed-implementation bridge — P0

Catalog has valuable source implementation: economic period validation/provenance (`write-engine.ts:558`) and historical price supersession plus effective-period fragments (`:1051`). It should be reused, not rebuilt.

However, publication copies proposed prices directly, using `new Date()` for immediate effective timing (`src/proposal/src/service.ts:467`), without a separately recorded actual implementation value, confirmation event, exact controlled version or observed external proof. An internal Catalog write is not evidence that an ERP/POS/commerce system of record changed.

Relevant IDs: EXEC-006/007/008/009/014, EXPORT-017/020/029. Connect confirmed exact-scope implementation to Price Records while preserving old applicability and actual variance.

## Missing core journey and records

### Manual implementation and monitoring — P1, with P0 integrity dependencies

There is no execution-confirmation or monitoring repository in the frontend composition (`fixtureWorkspaceRepositories.js:2503`), no such route (`workspaceRouting.js:17`), and no manual execution/monitoring methods in Proposal RPC/service inventory (`proposal.proto:11`, `service.ts:171`). Meaningful implementation/monitoring symbol searches across backend source found no alternative record/API owner.

The current flow ends at publication recovery and audit (`ProposalWorkspace.jsx:492`). A complete MVP requires:

1. Assign an implementation owner and read exact version-bound instructions.
2. Export/hand off or implement externally by a supported manual process.
3. Record actual value/scope/effective time/user, including partial, blocked and variant outcomes.
4. Attach relevant execution evidence and record remediation without retrospectively extending authority.
5. Record available numeric and qualitative observations with source/timestamp and separate interpretation.
6. Assess the objective/complete applicable obligations; preserve final authorised-versus-actual-versus-observed summary.
7. Create separate follow-up work where needed, without inheriting authority.

Supported monitoring categories are product choices; the PRD examples do not require fabricating every KPI or deploying automated analytics. Extended monitoring periods are not universally required.

### Exports and external operational handoff — P1, with P0 permission/authority guards

Frontend export is explicitly unavailable (`repricingPreviewV0.js:150`; rejected-row export in `fixtureOperationalRepositories.js:534`). `/exports` and all subpaths return 501 (`src/gateway/src/routes/data-pipeline.ts:703`). Searches found no applicable CSV download generator.

No selected external connector was found in the inspected frontend or backend source; EXPORT-028 is absent on both sides. The internal Proposal-to-Catalog write path is not credited as an external integration. This finding does not require broad connectors: the mandatory manual/import/export/handoff fallback must remain usable while a bounded connector is selected from validated pilot requirements.

Implement structured CSV and historical export with purpose, exact version, scope/entity/external IDs, currency/number/date definitions, protected-field redaction and audit attribution. A download must not become implementation; later implementation must link back to the exact handoff. A current valid export must revalidate authority and fields before generation. Native connector choices require pilot evidence, not an assumed universal ERP/POS integration programme.

### Historical reconstruction and search — P1, with P0 immutable decision storage

Frontend retained Maps/read-only getters are meaningful sample groundwork (`fixtureWorkspaceRepositories.js:522,1906`), and returned revision clears earlier authority (`:1810`). They are not persistent history or a complete user-facing Initiative archive.

Backend audit ingestion is real and append-only: tenant RLS, unique event id, actor/time/entity payload, SELECT/INSERT-only service grants (`governance/migrations/0002_audit_log_foundation.up.sql:15`; `audit-repo.ts:4`). However, `getActivityFeed`, `getEntityHistory` and `listSnapshots` explicitly throw Unimplemented (`governance/src/service.ts:24`). Catalog snapshots taken after import/publication are not submitted Proposal decision snapshots (`governance/src/domain/snapshot.ts:14`; `snapshot-subscriber.ts:19`).

Add complete immutable submitted-version snapshots and linked Initiative/decision/execution/outcome history, searchable with actual server-side pagination, date/scope filters and permissions. Current “Last 30 days” UI is just text, not an implemented date filter (`OperationalWorkspace.jsx:969`). Define retention and historical identity behaviour; ordinary users must not rewrite evidence.

## Verification performed

Read-only, local tests run on the inspected working tree:

| Command / scope | Result |
| --- | --- |
| `node --test tests/data/proposalJourney.contract.test.mjs tests/data/revision-loop.contract.test.mjs tests/data/operationalWorkspace.contract.test.mjs` in apps/workspace | **50 passed** |
| `./node_modules/.bin/vitest run src/tests/unit --reporter=dot` in src/proposal | **61 passed**, 4 files |
| Same unit command in src/governance | **23 passed**, 3 files |

Total: **134 local tests passed**. No database, connector, deployed-service, mobile/browser or full end-to-end integration test was run for this benchmark. No application tests/source were changed.

These tests validate existing contracts. They do not establish new PRD compliance: for example, the current Proposal journey test explicitly expects submit v7→v8 and approval v8→v9, the model conflict above. The acceptance strings in the matrix are **future acceptance criteria**, not a claim those tests already exist or pass.

## Search basis and limits

Before marking capabilities absent, inspected:

- Frontend route inventory, repository composition/contracts, PublicationReview/PublicationStatus, Proposal version/history methods, audit list/entity/UI, company-policy history and disabled export capabilities.
- Backend Proposal/gateway methods and protobufs; Proposal schema/repository/state machine; Catalog application response/provenance/effective-period logic; scheduled rollout; Governance event mapper, audit schema/store, read-service stubs and Catalog snapshots; export gateway boundary.
- Repository searches for CSV export/download generation; execution/implementation records; implemented values; monitoring records/objective assessment; historical search/retrieval; retention and administrative/AI event coverage, excluding generated protocol noise where appropriate.

Absence means absent in this inspected source/contract inventory, not a claim about another unpublished branch or future plan. The separate root repository baseline covers branch freshness. Related canonical requirements (FLOW-030, PROP-011/013/017/021, DATA-003 and governance) must be completed consistently by their owning workstreams rather than independently redefined here.

## Decisions/ambiguities to resolve without inventing scope

- Which pilot's system is the live-price system of record, and what counts as sufficient authorised manual implementation confirmation/evidence?
- Which pricing dimensions/external identifiers are mandatory for that pilot's operational handoff?
- What constitutes a material value/scope/timing deviation, and which remediation path is required? The PRD demands treatment but these IDs do not provide a universal numeric threshold.
- Which Initiative types require monitoring, review period or objective assessment before completion? Not every type needs an extended monitoring window.
- What supported historical retention policy and departed-user identity presentation should apply?
- Which expected Should behaviours are explicitly deferred without breaking mandatory manual workflow/history? P2 means expected work needing a product decision, not permission to silently omit it.
- Which selected native connector is justified by pilot demand? Broad or unattended connector publishing is explicitly not a minimum dependency.

## Recommended closure order

1. **P0:** canonical version/status/authority contracts; server execution permissions; partial-row correctness; immutable actual-versus-authorised evidence; safe Current Price transition.
2. **P1:** manual implementation/exception/outcome records, mandatory CSV/authorised/historical exports, auditable handoff, complete history read/search, connected adapters and restart-safe persistence; retain AI attribution as a mandatory dependency when material AI-assisted work is applied, with the historical AI deferral explicitly reconciled against current PRD scope.
3. **P2:** explicitly decide/schedule version comparisons, richer history filters, execution attachments, monitoring periods/assessments/summaries and follow-up convenience where they are not required to satisfy the core pilot workflow.
4. **P3:** optional AI monitoring/historical retrieval and the explicitly unnecessary broad external knowledge/connector expansion.

The product can become a coherent MVP through a reliable manual operational handoff. It does not need autonomous publishing to close this gap.
