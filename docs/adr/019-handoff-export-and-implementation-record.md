# ADR-019: Execution hand-off and the implementation record for Release 1

## Status

Proposed. This is the execution slice of CT-02 (issue #52), drafted 27 September 2026 for BE-07
(Release 1 parts) and FE-09. It follows decision D-06, and depends on ADR-016 (Catalog records) and
ADR-018 (frozen versions). It needs lead engineer review before any runtime code changes.

## Context

- **Direct publication.** `PublishProposal` writes approved prices straight into Catalog. The audit
  found that it discards per-row Catalog results, so a partial failure is recorded as complete.
- **No hand-off.** There is no execution export, no handoff summary and no record of what was
  actually implemented.
- **What the MVP requires.** It does not publish automatically. Manual implementation outside
  Owómidé is valid when it is recorded (section 3.11).

Release 1 needs:
- CSV execution export and handoff summary for the approved, current version only (EXPORT-002,
  EXPORT-003, EXPORT-010, EXPORT-018)
- per-line implementation recording, including partial outcomes (EXEC-006, EXEC-007, EXEC-010)
- Current Price updated only for implemented lines

Downloading must never count as implementation (EXPORT-009).

## Decision

### 1. Execution export (Proposal service)

`ExportExecutionFile(proposal_version_id)` is allowed only when all of these hold:
- the caller holds the Executor role (resolved per request, ADR-017)
- the version is `approved`
- no later version supersedes it
- its Initiative is `ready_for_execution` or later

Anything else is refused with a reason, such as `version_not_approved`, `version_superseded` or
`not_executor` (BDD 25, 29).

**The CSV** has one row per Priceable Entity and context. Columns (EXPORT-003):
- `initiative_id`, `proposal_id`, `version`
- `sku_code`, `product_name`, `category`, `location`, `channel`
- `current_price` (from the snapshot), `authorised_price`, `currency`, `tax_inclusive`
- `effective_from`, `effective_to` (from the version; the export date is never used as the
  effective date)
- `notes`

**Costs, margins and gaps are never in the execution file.** It goes to store staff.

**Every export is appended to `proposal.export_event`,** recording who exported which version and
when, for what purpose, and a file hash. Nothing else changes: no status, no Current Price (BDD 30).

**The handoff summary** is the same content as a printable page: version, approver, effective date,
counts, and any lines with notes. It is the second item in the Release 1 cut order.

### 2. Implementation record, per line

`proposal.implementation_line`:

| Column | Notes |
|---|---|
| `id`, `org_id`, `proposal_version_id`, `line_ref` | One per snapshot line |
| `outcome` | `implemented`, `failed`, or `implemented_different` |
| `implemented_price_minor` | Required for `implemented_different`; equals the authorised price for `implemented` |
| `actual_effective_at` | |
| `reference` | POS batch or change number. Required from Release 1 (D-06). |
| `failure_reason` | Required for `failed` |
| `recorded_by`, `recorded_at` | |
| `request_id` | Idempotency key |

Rules:
- **Append-only.** Correcting a line (for example, a failed line fixed later) adds a new row, and the
  latest row per line is current.
- **Executors only.** Only an Executor may record. Recording is refused for any version that is not
  the approved, current version (BDD 29).
- **Idempotent.** Repeating a request with the same `request_id` returns the original result. A
  timeout followed by a retry never creates a second row (BDD 28).

### 3. Execution status is derived, never stored loose

Execution status is derived from the current implementation lines (EXEC-010):

| Status | When |
|---|---|
| Not Started | No lines recorded |
| Partially Implemented | Some lines implemented, some failed or not recorded. The response lists which. |
| Implemented | Every line `implemented` or `implemented_different` |
| Implementation Exception | Any line failed and the Executor marks the work as unable to continue |

- **Variance.** `implemented_different` lines are reported as execution variance: authorised
  against implemented, with the difference (EXEC-007). The authorised value in the snapshot never
  changes.
- **Lifecycle.** The Initiative moves to `implemented` when the status is Implemented. It moves to
  `completed` when the Pricing Manager closes it (Release 1 has no monitoring step).
- **Separate from the decision.** Execution status never changes the Proposal version's `approved`
  status.

### 4. Current Price follows what was actually implemented

For each `implemented` or `implemented_different` line, the Proposal service calls Catalog's write
path. One `write_operation` per recording request (ADR-016 section 7):
- **Creates** the new price record:
  - `source_type = 'proposal'`
  - `source_ref` = the Proposal version id
  - `derived_from_record_id` = the snapshot's Current Price record
  - the implemented value and `actual_effective_at`
- **End-dates** the previous record at `actual_effective_at`.

Catalog's per-row results are stored against each implementation line:
- A line whose Catalog write is rejected shows `catalog_update_failed` with the reason.
- The overall status never hides it (BDD 27).
- The write is retried with the same operation id.

`failed` lines change no price.

### 5. Direct publication is off for Release 1

`PublishProposal` and `ScheduleRollout` are disabled by configuration for pilot organisations. They
stay in the code for a possible later scope that defines governed automatic publication. They are not
deleted in this change.

## Verification

| Check | Scenario |
|---|---|
| Export gating | BDD 25, 29, 30: export refused for v1, for non-Executors and for unapproved versions; download changes nothing |
| Partial Catalog result | BDD 27: two lines, one updated and one rejected; per-line outcome stored and no aggregate "complete" |
| Unknown and retry | BDD 28: timeout, then retry with the same `request_id`; exactly one row per line |
| Variance | BDD 31: one line implemented 1 naira off shows variance, and the authorised value is unchanged |
| Journey | J1 steps 8 to 10 in `core-handoff/acceptance-scripts.md`: 31 exported, 28 implemented and 3 failed (Partially Implemented), then 3 fixed (Implemented, then Completed); Current Price changes for implemented lines only |

## Migration

This is additive: new tables and RPCs, and a configuration flag disabling publication. Existing
`published` staging proposals keep their history, and are shown as "published (pre-Release 1)".

## Open questions for the lead engineer

1. Should the handoff summary be generated server-side as PDF or HTML, or printed from the workspace?
2. Should the Catalog write for implemented lines be synchronous, or through the outbox with per-line
   callbacks?
