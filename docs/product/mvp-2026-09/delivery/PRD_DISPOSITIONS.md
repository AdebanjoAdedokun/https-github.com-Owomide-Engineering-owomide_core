# PRD requirement dispositions — CT-01 draft

**Status: pending human decision.** This is a decision aid, not a ratification or a change to the accepted PRD. The benchmark's 379-row assessment and source requirement text remain the audit baseline. No status below claims implementation or changes the source requirement's normative wording.

## Apply the source definitions

Use the replacement PRD's definitions (physical pp. 73–74) as recorded in the audit:

- **Must / Must Not:** mandatory whenever its stated condition applies.
- **Should / Should Not:** expected MVP behaviour. A deferral requires an explicit product decision and must not break mandatory, core-workflow, governance, or history integrity.
- **May:** optional; absence alone is not an MVP failure. Decide whether a selected optional capability is included, deferred, or excluded.
- **Not Required:** outside the minimum. Treat as a scope boundary, not an automatically authorised future backlog.

Examples and phrases such as “may include” do not expand the normative requirement. Conditional safety requirements remain binding whenever the related capability is introduced. A disposition never converts sample evidence into backend or connected acceptance.

## Exhaustive source-modal occurrence crosswalk — generated, not ratified

[CT-01_SOURCE_CLASSIFICATION.json](CT-01_SOURCE_CLASSIFICATION.json) contains exactly one record for every stable ID in the 379-row benchmark matrix. It is generated and checked without dependencies using:

```sh
python docs/product/mvp-2026-09/delivery/scripts/ct01_source_classification.py
python docs/product/mvp-2026-09/delivery/scripts/ct01_source_classification.py --check
```

The six separate `source_modal_flags` are deterministic, case-insensitive phrase-occurrence flags extracted from the exact `requirement` strings in `REQUIREMENTS_MATRIX.json`: **Must**, **Must Not**, **Should**, **Should Not**, **May**, and **Not Required**. The extraction prevents “Must Not” from also setting “Must”, and likewise for “Should Not”. Each record cites the benchmark and its corresponding domain matrix, includes source pages, SHA-256 hashes and source snippets for the exact requirement strings in both matrices, and independent modal/conditional flags and evidence from each. The generator compares the two requirement strings byte-for-byte and records text, modal-flag, and conditional-term differences per row; these differences remain review items, not silently reconciled classifications. The original accepted PRD PDF remains the normative source; this crosswalk does not re-extract or claim equivalence with its PDF text. The audit priority and gap are copied into distinct fields and are not used to derive modal flags or dispositions.

These are literal source-text occurrences, not a machine claim that every occurrence is normative in context. The `semantic_review.needs_modal_review` flag calls out absent explicit modals and specific ambiguous wording cues (including choice-framed “should” and “may include” examples). Conditional terms are separately surfaced with snippets; their presence does not resolve the condition's scope. For example, DATA-010 remains flagged for modal review and ORG-014 has no explicit modal phrase. Human interpretation and all product dispositions remain open; this crosswalk does not ratify D-01–08, choose a pilot, or decide whether any Should/May behaviour will be delivered.

## Exhaustive 379-row owner disposition inventory — generated, not ratified

[CT-01_REQUIREMENT_DISPOSITIONS.json](CT-01_REQUIREMENT_DISPOSITIONS.json) contains exactly one auditable row for each benchmark requirement ID. Each row keeps the exact benchmark-extracted PRD text and PDF page/hash reference, occurrence-level source-modal evidence, the benchmark's recorded implementation states/evidence, its corresponding domain-matrix text and assessment, and the frontend/backend/integration/final-disposition evidence owners in distinct fields. Source disagreements and occurrence-crosswalk review cues are visible without choosing which version is correct.

Every owner disposition is `open`; decision, decider, date, authoritative reference, rationale, and compatibility impact remain empty because D-01–08 are not ratified. `owner-review-required` identifies rows with a recorded textual/assessment difference or a crosswalk wording cue; `no-automated-review-cue` is not an interpretation or approval. The inventory makes no implementation claim and does not decide which Should/May items ship.

The inventory is reproducible and checked with the Python standard library:

```sh
python docs/product/mvp-2026-09/delivery/scripts/ct01_disposition_inventory.py
python docs/product/mvp-2026-09/delivery/scripts/ct01_disposition_inventory.py --check
```

## Partial hand-curated source-class notes — AGENT DRAFT, not ratified

The grouped notes below are a source-backed but partial human-curated interpretation. They are retained as an unratified decision aid and must not be mistaken for the exhaustive occurrence-level crosswalk linked above. The prior grouped counts describe only those hand-curated notes; they do not establish complete semantic interpretation or product dispositions.

Sources: [benchmark JSON](../audit/REQUIREMENTS_MATRIX.json), [pricing/data](../audit/pricing-data-matrix.json), [roles/governance](../audit/roles-governance-matrix.json), [collaboration/AI/visibility](../audit/collaboration-ai-visibility-matrix.json), and [execution/history](../audit/execution-history-matrix.json). Review evidence: [pricing/data](../audit/pricing-data-review.md), [roles/governance](../audit/roles-governance-review.md), [collaboration/AI/visibility](../audit/collaboration-ai-visibility-review.md), and [execution/history](../audit/execution-history-review.md).

Source classes are kept separate from the audit's P0–P3 priority, gap, and evidence-facet fields. “Must + Should” means the same requirement contains expected MVP behaviour and an independently binding condition or safety rule; deferring the Should part cannot remove the Must part. “May” is recorded only where the source permits an optional capability/choice, not as a claim that every example following “may include” is an independently required feature. The exact source wording remains in the linked matrices. Priorities and implementation gaps remain in those matrices and reviews; neither is a disposition.

### Should / Should Not

The following section lists **100 distinct requirement IDs**: 99 rows recorded here as containing a Should/Should Not classification, plus DATA-010, whose wording remains unresolved. These are the IDs included in this draft, not a claim that they are all such rows in the 379-row baseline. Scope summaries preserve conditions; they do not settle whether a Should is delivered or deferred.

| Requirement IDs | Source normative class | Conditional scope / expected behaviour |
| --- | --- | --- |
| DATA-007 | Must + Should | Structured CSV import is required; the enumerated import contents are expected, subject to availability/authorization conditions. |
| DATA-008 | Must + Should | Mapping is required; identifying recognized, missing, invalid, duplicate, and unimportable fields/rows is expected before commit. |
| DATA-011 | Should + Must | Available source provenance should be retained; known origin/actor/time details should be preserved. Mandatory record-model and evidence-separation rules still apply. |
| DATA-012 | Must + Should Not | Freshness must be shown when applicable; manually entered or imported values should not be represented as real-time. |
| DATA-016 | Must + Should | Validation is mandatory before consequential use; detecting the listed relevant data issues is expected. Mandatory unresolved/invalid handling remains binding. |
| DATA-019 | Must + Should | Entity lookup is required; filtering should cover relevant available identifiers/dimensions. |
| DATA-021 | Must + Should | Bounded external integration is required; at least one connector should be selected from validated pilot/customer requirements. Additional connectors are not implied. |
| DATA-010 | **Unresolved wording; not counted as Should** | “Whether the operation should update, skip, or resolve” frames an importer's choice among alternatives, not clearly an expected-MVP Should. Keep the row visible for human interpretation; do not use it to infer a deferral. |
| INIT-002 | Must + Should | Common pricing-work types are required; type should add structure without forcing a rigid workflow. |
| INIT-003 | Must + Should | An objective is required; it should explain the organisation's intended outcome. |
| INIT-010 | Must + Should | Priority/urgency indication is required; a bounded Normal/High/Urgent model is expected and must not bypass governance. |
| INIT-013 | Must + Should | Explicit assumptions are required; material assumptions should carry the stated attribution, scope, basis, evidence, time, and version details where applicable. |
| INIT-015 | Should + Must | Users should be able to create a new initiative from relevant prior structure. The new work must not inherit prior decision, policy-authorisation, or execution authority. |
| INIT-019 | Must + Should | Completion is allowed only after the applicable workflow resolves; completion should capture decision, execution status, relevant outcome/monitoring, and date. |
| BUILD-002 | Must + Should | Pricing-action construction is required; the listed supported action families are expected. Qualitative/unsupported components must remain distinct from deterministic outputs. |
| BUILD-011 | Must + Should | Bulk work and entity-level outcomes are required; common logic should be applicable across the selected resolved scope. |
| BUILD-016 | Must + Should | Working continuity is required; preserving active authorized edits to reduce loss is expected. Autosave must not overwrite controlled versions. |
| BUILD-021 | Should + Must | Reuse of appropriate prior pricing structures is expected; reuse must create new editable material and cannot transfer governance configuration or authority. |
| ANALYSIS-007 | Must + Should | Current/proposed economics must be distinguished; side-by-side relevant measures are expected where data permits. |
| ANALYSIS-008 | Must + Should | Multiple scenarios are required; scenario records should carry relevant identity, action, assumptions, scope, outputs, guardrail state, creator, and time. |
| ANALYSIS-010 | Must + Should | Scenario comparison is required; comparison should include relevant available economic and guardrail measures and expose trade-offs. |
| ANALYSIS-011 | Must + Should + May | An unambiguous Current Price should be the default baseline; an authorized alternative baseline may be defined only where supported and must remain distinct. |
| ANALYSIS-013 | Must + Should | Entity-level outcomes are required; common logic should calculate/preserve each applicable entity result when inputs exist. |
| ANALYSIS-021 | Must + Should + May | AI may suggest a scenario but cannot make the decision; where AI recommends an option, users should understand the available basis. |
| ANALYSIS-024 | Must + Should | Monetary inputs must be currency-compatible; where an assumed exchange rate is permitted, its source/date should be preserved. |
| ANALYSIS-029 | Must + Should | Authorized structured analysis export is expected; access, cost visibility, versioning, and history controls remain mandatory. |
| GOV-002 | Should + May | The enumerated core role model should be supported. Additional specialized roles may be configured with supported permission combinations; the role-specific limits remain binding. |
| PROP-022 | Must + Should | Consequential proposals must remain reconstructable; an authorized user should be able to determine the listed version, basis, actor, decision, and execution facts. |
| FLOW-025 | Must + Should | Target response dates/deadlines should be supported where appropriate; pending, approaching-deadline, and overdue states must be visible to relevant users. |
| FLOW-026 | Must + Should | Bounded overdue escalation should be supported; it must not become arbitrary automation or grant authority. |
| COLLAB-001 | Must + Should | Initiative collaboration is required; users should understand the object/decision context to which each contribution refers. |
| COLLAB-003 | Should + Must + Not Required | Replies should be supported where follow-up discussion is needed; threads must stay with their initiating context. Unrestricted organization-wide chat is not required. |
| COLLAB-004 | Must + Should | Mentions are required; user identity, appropriate notification, and return navigation are expected and must not grant permission. |
| COLLAB-005 | Must + Should | Action assignment is required; the listed assignment fields should be present, with due date conditional where applicable. |
| COLLAB-006 | Should + Must | Assignment statuses should include the listed states; completion must remain attributable. |
| COLLAB-008 | Should + Must | Evidence metadata should retain available fields; distinction from structured data and AI interpretation is mandatory. |
| COLLAB-009 | Must + Should | Manual market observations are required; the listed observation fields are expected, but observations must not be represented as verified/live intelligence. |
| COLLAB-010 | Should | Evidence should be associable with the specific pricing-work component it informs; examples do not mandate every evidence subtype. |
| COLLAB-012 | Should + Must | Authorized users should be able to resolve discussions/issues where appropriate; original thread, responses, resolver, time, and historical access must remain. |
| COLLAB-016 | Should + Must | Exact version context should be preserved when contributions relate to controlled versions; historical review must identify the discussed version. |
| COLLAB-017 | Should + Must | Historical integrity should be protected; where editing/deletion is permitted, changes/disappearance must remain appropriately traceable. |
| COLLAB-019 | Should + Should Not | A concise outstanding-collaboration view is expected; users should not have to inspect the full activity history to see incomplete work. |
| COLLAB-021 | Should | Consequential collaboration should preserve enough context to reconstruct contributors, evidence, issues, actions, unresolved items, and resulting changes. |
| AI-001 | Must + Should | Contextual AI is required in relevant contexts; it should inherit the invoked object's context. The AI safety boundaries remain mandatory. |
| AI-007 | Should + Must | Natural-language-to-supported-builder translation is expected; users must review/apply output, and AI cannot create/modify governance controls. |
| AI-013 | Should + Must | AI should help identify information relevant to progress while distinguishing system requirements from quality-improving and optional context. |
| AI-017 | Should + Must | AI should help authorized users locate/understand relevant prior work; retrieval must respect the invoking user's permissions. |
| AI-019 | Should + Must | When timestamps/freshness are available, AI should preserve that distinction; it must not call manual/imported/historical data live without support. |
| AI-020 | Should + Should Not | Where evidence informs an AI response, users should be able to identify its basis where practical; AI should not blur structured data, evidence, assumptions, history, and inference. |
| AI-023 | Should | Before consequential AI changes, users should understand the change; relevant differences should be shown when existing structured work is modified. |
| AI-024 | Must + Should | Applied AI content must be attributable; the system should preserve AI origin, applying human, and application time. |
| AI-025 | Should + Must | Active-work AI conversations should retain enough context for continuity; consequential pricing facts must be applied to structured records, not live solely in conversation. |
| AI-033 | Should | Users should be able to flag useful, incorrect, incomplete, or inappropriate output and discard it without affecting underlying work where applicable. |
| AI-034 | Should + Must | Consequential AI actions should appear in relevant history with distinct generation/application/change/human-modification events; routine prompts need not overload formal audit unless material. |
| NOTIF-001 | Should | Each active user should have a personal view of work that requires or may require attention; awareness must not be mistaken for assigned responsibility. |
| NOTIF-003 | Must + Should | Relevant organization-level activity visibility is required; workspace categories should cover the listed work states while respecting role/scope. |
| NOTIF-004 | Must + Should | Listings must support current-state understanding; the listed summary fields should be shown where relevant. |
| NOTIF-005 | Must + Should | Consequential awareness/action notifications are required; the listed event types should be included where relevant. |
| NOTIF-007 | Must + Should | Notifications must carry enough context; relevant proposal, assignment, or workflow stage should be identified where applicable. |
| NOTIF-008 | Must + Should Not | Notification navigation must land in authorized context; users should not need to search manually for the Initiative. |
| NOTIF-009 | Must + Should | In-product unread/read states are required; users should be able to mark notifications read. |
| NOTIF-012 | Must + Should | Approvers need a clear pending-decision view; relevant listed context should appear on each item. |
| NOTIF-015 | Must + Should | Owners must identify blocked/awaiting work; relevant states should include the examples. |
| NOTIF-016 | Must + Should | High/Urgent work must be distinguishable; urgency should affect prominence without changing governance. |
| NOTIF-017 | Must + Should | Defined deadlines must be displayed; the system should identify upcoming, due, and overdue work. |
| NOTIF-019 | Should + Must | Recent completed work should remain accessible but not outstanding; resolved tasks must leave active action queues while history remains. |
| NOTIF-021 | Should + May | Duplicate notifications should be avoided for unchanged conditions; repeated overdue reminders may be generated if bounded and purposeful. |
| NOTIF-024 | Should + Must | Workspace views should filter by relevant dimensions; filtering must respect access scope. |
| NOTIF-025 | Must + Should | Authorized pricing-work search is required; listed identifiers should be supported where relevant. |
| NOTIF-026 | Should + Must | A clear outstanding-action count is expected; it must count unresolved responsibilities, not general activity. |
| NOTIF-027 | Should + Must | Users should access recent relevant notification history; it cannot replace the pricing audit record. |
| NOTIF-029 | Should | Work visibility should answer the listed user/manager questions about attention, urgency, due action, location, blockers, and next owner. |
| EXEC-004 | Must + Should | Authorized instructions must identify what to implement; applicable operational fields should be present and derived from the exact authorized version. |
| EXEC-012 | Should + Must | Users should be able to attach relevant execution evidence; evidence must remain linked to the execution record. |
| EXEC-014 | Should + Must | When confirmed implementation is kept in Owómidé, actual values should update/create the applicable Price Record and Current Price; prior history, exact scope, and variance controls remain mandatory. |
| EXEC-016 | Should + Not Required | Where relevant, users should define a monitoring period/review date; continuous automated monitoring is not required. |
| EXEC-018 | Should + Must | Where baseline data exists, users should compare outcomes with it and identify whether the basis was structured, imported, or manually entered. |
| EXEC-019 | Should + May | Users should record the listed objective assessment; explanatory notes may accompany it. |
| EXEC-024 | Should + Must | Where monitoring indicates further action, an authorized user should be able to create a separate Initiative with its own objective, versions, decisions, and execution history. |
| EXEC-026 | Should + Must | Completed Initiatives should retain a concise objective-to-outcome summary; the authorized/implemented distinction and source records must not be lost. |
| HIST-006 | Should + Should Not | Users should compare relevant controlled versions and material differences, not have to perform that reconstruction manually. |
| HIST-009 | Must + Should | Each Initiative needs a chronological timeline; relevant event classes should be included. |
| HIST-016 | Must + Should | Authorized historical search is required; the listed relevant search criteria should be supported. |
| HIST-017 | Should | Historical filtering should cover relevant lifecycle, entity, date, dimension, and user facets. |
| HIST-018 | Must + Should | History must remain coherent; users should be able to determine why work existed, what changed, the decision, implementation, and outcome. |
| HIST-019 | Should + May | Completed work should be reusable knowledge; relevant prior records may provide context to future work. |
| HIST-023 | Must + Should | History must follow the supported retention policy; completed records should default toward preservation rather than automatic deletion. |
| HIST-024 | Should + Must | Authorized historical export is expected; any export must respect access restrictions. |
| HIST-025 | Should | Users with audit authority should be able to inspect activity by relevant dimensions. |
| HIST-026 | Must + Should + May | Relevant material system-enforced events should be recorded; examples and permission-denial logging remain conditional on relevance/policy. |
| HIST-029 | Should + Must | Authorized users should be able to reconstruct the listed lifecycle facts; failure to reconstruct makes the history incomplete. |
| EXPORT-003 | Must + Should | Where applicable, execution exports should include structured implementation context; required entity-level attribution and access controls remain binding. |
| EXPORT-005 | Should + Must | Configured external identifiers should be available in operational exports; the condition is that an organization maintains them. |
| EXPORT-012 | Must + Should | Every consequential export must record generation time; timestamp inclusion in output is expected where operationally appropriate. |
| EXPORT-018 | Should | A human-readable implementation summary is expected, including the listed action/scope/timing/version/exception details. |
| EXPORT-019 | Should + Must | External handoff state should be recordable when handoff occurs; required attribution fields must identify event, actor, version, and owner where applicable. |
| EXPORT-021 | Should + Must + Not Required | External references should be recordable when available; the MVP must not require one where the organization does not use it. |
| EXPORT-022 | Should | When an export exists, the authorized→handed-off→actual chain should be preserved to expose discrepancies. |
| EXPORT-023 | May + Should + Must | Authorized users may regenerate an export for the same valid version; consequential export events should be attributable, and re-export must not create new authority/version. |
| EXPORT-025 | Should + Must | A missing configured-required identifier should be surfaced before operational export; the system must not invent identifiers. |

**Draft count:** 99 listed rows classified as source Should and/or Should Not, plus DATA-010 retained as one unresolved wording row (100 distinct IDs listed in this section). Modal occurrences that merely quote a user-choice question or enumerate examples are not silently treated as a freestanding Should feature. Where source or audit priority/gap is needed for a row, use its per-row matrix fields; a P-level never changes the class above. Completeness against the source set is unverified.

### May — optional or permissioned scope, not a disposition

These **AGENT DRAFT** entries identify explicit optional capabilities or permissioned alternatives in the source; “May” does not mean excluded, deferred, selected, or implemented. Safety clauses in the same row remain mandatory. This is a list of requirement-level options rather than every “may include” example.

| Requirement IDs | Source normative class | Conditional scope / AGENT DRAFT question |
| --- | --- | --- |
| ORG-005, GOV-014 | Must + May | Multi-role assignment/role stacking is permitted where the organization requires it, without weakening identity restrictions. **AGENT DRAFT question:** does the pilot require multiple simultaneous roles? |
| GOV-002 | Should + May | The core role list is expected; additional specialized roles may be configured using supported permission combinations. Do not use the optional extension to defer required role boundaries. |
| INIT-015 | Should + May + Must | Duplication from relevant prior structure is expected; permitted reusable elements are optional, and historical authority may not transfer. |
| ANALYSIS-011 | Must + Should + May | Current Price is the expected default baseline; a different baseline may be explicitly selected by an authorized user where supported and must remain distinguishable. |
| ANALYSIS-021 | Must + Should + May | AI may suggest scenarios, but selection remains human; recommendation basis should be understandable. |
| PROP-018, FLOW-018 | May + Must | Limited post-submission non-material changes may be permitted; if permitted, they must be attributable/auditable and cannot alter decision meaning, snapshot, or execution instructions. **AGENT DRAFT question:** permit, defer, or exclude this narrow mutation path? |
| FLOW-022 | May + Must | An organization may configure policy authorization; it must be deliberately enabled and remain bound to exact version/snapshot and non-AI controls. |
| FLOW-027 | May + Must | Delegation may exist only where policy permits; explicit, appropriately time-bounded, scoped, auditable configuration and maker-checker remain mandatory. |
| FLOW-028 | May + Must | Withdrawal may be allowed only under policy and before operational irreversibility; preserve the original approval/history. |
| AI-002, AI-005, AI-006, AI-007, AI-009, AI-010, AI-011, AI-012, AI-014, AI-015, AI-016, AI-027, AI-029 | Must + May (and Should where listed above) | May describes bounded assistance/interpretation options or permitted advisory behavior within required safe AI capability, not autonomous decision authority. Optional example modalities are not all separate implementation commitments. |
| EXEC-022, HIST-021 | Must + May | AI-assisted monitoring and AI historical retrieval are optional extensions, not conditions for manual monitoring/history or the separately required bounded contextual AI capability. |
| NOTIF-010 | May + Not Required | Email may be supported where needed for pilot adoption/action; SMS, WhatsApp, Slack, Teams, and broad third-party notification integrations are not required and cannot gate core workflow. |
| NOTIF-022 | May + Must | Limited preferences may be offered for non-critical events; users must not suppress critical governance/security notifications where policy requires them. |
| EXPORT-023 | May + Should + Must | Re-export of the same valid version may be permitted operationally; each consequential export remains attributable and creates no new proposal version/authority. |
| DATA-021 | Must + Should + Not Required | At least one validated-pilot connector is Should; selected integration directions/capabilities are bounded, and broad coverage/universal bidirectional sync is not required. |

The audit review specifically treats optional AI monitoring/retrieval, external email/preferences, and the collaboration/workflow options as conditional capabilities. Their prerequisites do not ratify a pilot selection; the existing decision register remains authoritative for any scope choice.

**Draft May count:** 15 grouped entries / 30 requirement-ID references. Repeated IDs across sections are intentional because one row can contain several source classes; these are not 30 new dispositions. Other explicit May clauses may be absent; completeness is unverified.

### Not Required — explicit source boundaries

The following **12 listed requirement rows** state explicit minimum-scope boundaries. These are not approved future backlog items, and do not relax any adjacent mandatory/manual path. The count is not validated as exhaustive across the source set.

| Requirement ID | Source normative class | Explicit boundary |
| --- | --- | --- |
| ORG-010 | Must + Not Required | Enterprise SSO is not required initially unless validated as a target-customer contractual requirement. |
| DATA-004 | Must + Not Required | Full cost accounting, enterprise-wide overhead allocation, and reconstructing accounting values from incomplete data are not required. |
| DATA-021 | Must + Should + Not Required | At least one selected validated-pilot connector is Should; universal bidirectional synchronization is not required. |
| ANALYSIS-023 | Must + Not Required | Automatic psychological/charm-price or advanced price-ending optimization is not required. |
| COLLAB-003 | Should + Must + Not Required | Thread replies are expected when follow-up is needed; unrestricted organization-wide chat is not required. |
| COLLAB-020 | Not Required + Must | Unrestricted messaging, organization chat, meetings, general document editing, external social collaboration, and full project management are not required. |
| NOTIF-010 | May + Not Required + Must | Email is optional; listed external channels/broad integrations are not required and must not become core-workflow dependencies. |
| EXEC-016 | Should + Not Required | Monitoring periods/review dates are expected where relevant; continuous automated monitoring is not required. |
| EXEC-025 | Must + May + Not Required | Completion depends on the Initiative's obligations; not every Initiative must require an extended monitoring period. |
| HIST-028 | Not Required + Must | A broad external pricing-knowledge database or automatically generated market-intelligence repository is not required; own pricing history remains the focus. |
| EXPORT-021 | Should + Must Not | An external implementation reference should be recordable where available; one must not be required where the organization does not use one. |
| EXPORT-028 | Must + Not Required | Bounded selected integration is required, but broad connector coverage, universal bidirectional sync, and autonomous stack-wide execution are not required; manual/import/export/handoff must remain usable. |

**Coverage and validation limit:** the generated crosswalk and owner inventory each reconcile the exact benchmark ID set against all four domain matrices (379 rows, 379 unique IDs), and record source-text/modal evidence deterministically. The hand-curated summaries above remain partial and are not a complete semantic interpretation. Example language, choice-framed modals, conditional clauses, and source disagreements remain visible for owner review. These artifacts establish row coverage and extraction reproducibility, not owner acceptance, final normative interpretation, any D-01–08 choice, pilot scope, row disposition, delivery commitment, or ratification. Human owner disposition and ratification remain outstanding.

## Known decision candidates

The audit already identifies the following rows as requiring explicit selection or deferral. **All are still pending.** The audit's priority and gap classifications are evidence, not the product owner's choice. This decision-candidate list is deliberately narrower than the source-class inventory; it does not stand in for every expected behaviour or optional permission.

| Requirement IDs | Source classification / AGENT DRAFT candidate | CT-01 record needed |
| --- | --- | --- |
| DATA-021 | Bounded external integration is required; at least one connector for validated pilot requirements is **Should**. Additional connectors and universal bidirectional synchronisation are not automatic MVP scope. | **AGENT DRAFT question:** D-07 must name the validated pilot need and selected connector, or explicitly disposition the expected connector behaviour with rationale. Preserve canonical record validation, provenance, permission, safe-failure, and manual/import fallback requirements. |
| FLOW-025, FLOW-026 | Approval deadlines and bounded overdue escalation are **Should** / expected behaviour. | **AGENT DRAFT question:** D-08 must say whether each is delivered or explicitly deferred, with a reason. Deferral cannot change approval authority or create arbitrary automation. |
| COLLAB-003, COLLAB-010, COLLAB-012 | Threaded discussion, evidence relevance, and discussion/issue resolution are identified as **Should** behaviours in the collaboration audit. | **AGENT DRAFT question:** D-08 must disposition each separately. Keep threads in their initiating pricing context; associate evidence with the work it informs; preserve original discussion, responses, resolver, timestamp, and historical availability where applicable. |
| PROP-018, FLOW-018 | Limited non-material post-submission changes are **May**; the audit treats these as optional deferral candidates. | **AGENT DRAFT question:** D-08 must state whether permitted, deferred, or excluded. If permitted, keep changes attributable and auditable and never treat material pricing/decision/execution changes as non-material. |
| FLOW-027 | Authorised approval delegation is **May** / optional. | **AGENT DRAFT question:** D-08 must state whether permitted, deferred, or excluded. If permitted, require explicit, scope-aware, appropriately time-bounded, auditable delegation that preserves maker-checker. |
| FLOW-028 | Withdrawal before irreversible execution is **May** / optional. | **AGENT DRAFT question:** D-08 must state whether permitted, deferred, or excluded. If permitted, specify the point of irreversibility and preserve historical authority and execution evidence. |
| BUILD-019, ANALYSIS-020, AI-001/005 | The audit records bounded assistive AI and contextual interpretation as required by the replacement PRD; an earlier CEO AI deferral conflicts with this target. Optional AI examples remain separate. | **AGENT DRAFT question:** D-01 must ratify the full-PRD target or an explicit narrower pilot deviation. Do not relabel mandatory AI as optional or let AI decide, authorise, or execute. |

This partial candidate list is not a set of settled decisions and is not a substitute for the exhaustive linked row inventory. The product owner and delivery lead still need to interpret ambiguous/source-conflicting rows, decide any expected Should deferral, and select any optional/excluded scope. Do not infer a disposition from P0–P3 priority, a missing implementation, an audit recommendation, or another row's decision.

## Ratification ledger

The empty cells are deliberately unresolved. Fill them only from an authorised decision record; preserve previous entries when a decision is superseded.

| Requirement IDs | D-ID | Disposition (deliver / defer / include / exclude / not required) | Decider + date + ratification reference | Rationale and affected facets | Contract/version or compatibility impact | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DATA-021 | D-07 / D-08 | — | — | — | — | Open |
| FLOW-025 | D-08 | — | — | — | — | Open |
| FLOW-026 | D-08 | — | — | — | — | Open |
| COLLAB-003 | D-08 | — | — | — | — | Open |
| COLLAB-010 | D-08 | — | — | — | — | Open |
| COLLAB-012 | D-08 | — | — | — | — | Open |
| PROP-018, FLOW-018 | D-08 | — | — | — | — | Open |
| FLOW-027 | D-08 | — | — | — | — | Open |
| FLOW-028 | D-08 | — | — | — | — | Open |
| BUILD-019, ANALYSIS-020, AI-001/005 | D-01 | — | — | — | — | Open |

## Authority and closeout

CT-01 may prepare this inventory and carry unresolved choices forward; it cannot ratify them. Before marking any row decided, attach the accountable decider's authoritative reference and required rationale/impact record in [DECISIONS.md](DECISIONS.md). If a decision changes state, authority, data, or compatibility contracts, carry it into CT-02 before dependent runtime work. An unresolved row remains a blocker for its dependent implementation/release facet.

The dated benchmark, source PRD, requirement matrices, and earlier AI/CEO guidance are preserved as historical evidence. This draft does not edit or replace them.
