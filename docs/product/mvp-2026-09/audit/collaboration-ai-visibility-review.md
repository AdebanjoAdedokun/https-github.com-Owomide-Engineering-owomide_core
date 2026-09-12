# Collaboration, contextual AI and work visibility

12 September 2026. All 85 COLLAB, AI and NOTIF requirements assessed against the replacement PRD. This is a source/fixture benchmark, not a connected-service certification. The complete wording, physical pages, separate frontend/backend status and future acceptance conditions are in [the domain ledger](collaboration-ai-visibility-matrix.json).

## What we can retain

The sample has meaningful version-bound Proposal comments, actor/time attribution, identity-gated reads and a separate Contributor request box. It projects restricted request fields deliberately and preserves internal triage notes outside the Contributor response. These are useful patterns for the live contract. See [comment repositories](../../../../apps/workspace/src/data/fixtureWorkspaceRepositories.js#L1967), [comment UI](../../../../apps/workspace/src/ProposalWorkspace.jsx#L380) and [request projection](../../../../apps/workspace/src/data/fixtureCompanyRequests.js#L82).

The backend also has a real Proposal comment implementation, with author, timestamp, object and body, tenant-scoped storage and append-only service grants. This earns narrow source credit for COLLAB-002/017, not credit for complete pricing collaboration. See [comment handlers](../../../../src/proposal/src/service.ts#L540) and [comment schema/grants](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83).

Work-queue labels now distinguish actual work items from overlapping line populations. Proposal next-actor guidance is substantially clearer. The deterministic pricing engine is real calculation groundwork; the active Python service is not an AI assistant merely because its service name contains “Intelligence.”

## Consequential gaps

| Area | Current limitation | Required direction |
| --- | --- | --- |
| Initiative collaboration | Discussion begins at Proposal; there is no persistent Initiative before the formal decision object. | Attach context, contributions, feedback and action assignments to the Initiative and preserve relevant exact-version links. |
| Backend comment permission | Service authentication and tenant context are checked, but role/resource/scope and restricted economics are not enforced there. | Enforce end-user access before reading/writing content; do not rely on a hidden frontend tab. |
| Version attachment | UI promises “Comments stay with this version”; backend has only `proposal_id`, not controlled version. | Add exact-version/object references and preserve old discussions on old snapshots. |
| Evidence | Free text/evidence references exist; no complete typed supporting Evidence/provenance/access model. | Define source/observer/time/context and access. Support a bounded set of forms; not every illustrative file format is mandatory. |
| Assignments and review | Draft handoff exists, but no general action lifecycle or distinct pre-decision Review workspace. | Persist assignment owner, object, status and applicable due time; feedback must not grant approval. |
| Notifications | Proto declarations and placeholder container, no implementation or in-product inbox. | Durable events, permitted recipients, read/unread, safe deep links, revocation, deduplication and action relevance. |
| Queue truth | Proposal rows read current sample state; import/repricing rows start from static fixture data and infer responsibility from capability. | Project canonical records, separating personal awareness from assigned action-required counts. |

The backend version mismatch is directly visible in [the migration](../../../../src/proposal/migrations/0002_proposal_foundation.up.sql#L83). The service-auth forwarding seam is [Proposal route headers](../../../../src/gateway/src/routes/proposals.ts#L31). Fixing forwarding must be paired with correct user authorisation; making every request fail is not a valid permission implementation.

Notify's [Dockerfile](../../../../src/notify/Dockerfile#L4) says it is unimplemented, its [migration](../../../../src/notify/migrations/0001_create_schema.up.sql#L4) is a placeholder, and its [proto](../../../../src/lib/proto/services/notify/v1/notify.proto#L10) is only a contract. Toasts are not durable notifications. Backend [Proposal listing](../../../../src/proposal/src/repo/proposal-repository.ts#L619) does read canonical records; the cross-lifecycle notification projection is missing, not proven contradictory. The observed static-state discrepancy belongs to [the frontend queue repository](../../../../apps/workspace/src/data/fixtureOperationalRepositories.js#L301).

## AI scope needs an explicit decision

The earlier CEO message deferred AI this period. The replacement PRD requires contextual assistance and pricing-context interpretation (AI-001/005, physical pp218–220); BUILD-019/020 also require bounded construction and explicit application. These cannot both be called the same completed scope without a documented change.

No AI runtime, context builder, model/tool policy, user-scoped retrieval, response/source interface or Apply transaction was found in the inspected production-source inventory. The frontend composition rejects live mode and the server route inventory contains no AI route. Existing [integer floor calculations](../../../../src/margin/internal/domain/floor_calculator.go#L24) and [deterministic evaluation service](../../../../src/data-pipeline/owomide_data_pipeline/intelligence/service.py#L112) deserve partial credit for AI-010's deterministic foundation, not conversational capability.

Two honest release labels are possible:

- A deliberately narrower **non-AI pilot**, with CEO-approved PRD deviations, while the manual workflow and all applicable controls still work.
- The **full replacement-PRD MVP**, including bounded contextual AI with source grounding, permission parity, explicit human application, normal validation, provenance, immutable-version rules and safe failure.

Neither path requires every optional AI example first. Scenario suggestions, review synthesis and historical AI retrieval have their own May/Should wording. Conditional P0 AI rows are safety gates **before enabling those capabilities**, not evidence of an existing AI exploit and not dozens of independent present bugs. AI cannot approve, reject, policy-authorise, change governance or confirm implementation. Deterministic outputs remain authoritative; imported instructions are untrusted business content; AI failure must not block supported non-AI work.

## Interpretation safeguards

- NOTIF-001 includes personally relevant awareness through ownership, collaboration or mention. NOTIF-002/026 require action counts to reflect actual responsibility. Do not turn all awareness items into assigned obligations or hide relevant awareness altogether.
- In-product notifications and read/unread are mandatory. External email/chat channels are not mandatory. Preferences are optional, and cannot disable critical controls if introduced.
- Threading and issue resolution are expected Should behaviours; general chat/meetings/project management are explicitly not required.
- Supporting Evidence must not silently become a Cost Record or Current Price. A deliberate validated conversion is a different action with its own provenance.
- Confidentiality covers derived margins/floors, free-text contributions, notifications, exports, search and future AI—not just hiding the cost column.

## Verification and next handoff

Root review read all 85 normative requirement bodies, the foundational definitions and relevant production repositories/routes/schemas. Current desktop/mobile screenshots of queue, Proposal discussion and access settings are in [the visual flow review](UI_FLOW_AUDIT.md). Independent peer review corrected the backend queue classification, credited deterministic foundations and protected the personal-awareness distinction.

All integration rows are `not-connected` because [live composition is deliberately rejected](../../../../apps/workspace/src/data/workspaceRepositories.js#L17). The shared test record is in the executive benchmark; subset reruns are not added again. Acceptance criteria in the matrix are future tests, not completed BDD runs.

Build canonical Initiative/version/access contracts first, then contextual comments/Evidence/tasks and durable attention projections. The bounded AI slice must consume those same contracts. No application source or live company data was changed by this audit.
