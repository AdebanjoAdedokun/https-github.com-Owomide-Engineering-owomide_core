# ADR-018: Pricing Initiative, frozen Proposal versions and decisions for Release 1

## Status

Proposed. This is the Initiative and decision slice of CT-02 (issue #52), drafted 27 September 2026
for BE-04 and BE-05 (Release 1 parts) and FE-03, FE-06 and FE-08. It assumes the CEO's proposed
options for D-05 and D-08. None is ratified: `DECISIONS.md` holds no ratification record for them
yet, and if a ratified choice differs, this ADR changes with it. It is input to the team's CT-02
draft (`docs/product/mvp-2026-09/delivery/CT-02-contract-draft.md`); where the two differ, the draft
and its review govern. It needs lead engineer review before any runtime code changes.

## Context

`src/proposal/migrations/0002_proposal_foundation.up.sql` has:

| Table | What it holds |
|---|---|
| `proposal.proposal` | One row per proposal: `state` in (`draft`, `submitted`, `blocked`, `approved`, `published`) and a single `actor_id` |
| `proposal.proposal_line` | Editable lines |
| `proposal.proposal_transition` | An append-only transition log. This is good and is kept. |
| change sets, comments, override requests, scheduled rollouts | Related work items |

`proposal.proto` offers Create, Update, Submit, Approve and Publish. It has no Reject and no Request
Changes. There is no Pricing Initiative anywhere.

The team's audit (12 September) found three problems:
- The Proposal version changes on submit and approve instead of freezing.
- Approval compares the approver with the creator, not the actual submitter.
- Lines stay stale after scope or rule changes.

The PRD requires:

| Requirement | What it says |
|---|---|
| INIT-001 to 004 | A Pricing Initiative as the container for the work |
| PROP-011 | An immutable decision snapshot per submitted version |
| PROP-012 | Statuses: Draft, Awaiting Approval, Changes Requested, Rejected, Approved (Authorised Within Policy in Release 3) |
| PROP-017 | Material change creates a new version without inherited authority |
| FLOW-013 | The actual submitter never approves |
| Canonical lifecycle | Initiated → In Development → (In Review) → Awaiting Approval → Ready for Execution → Implemented → (Monitoring) → Completed |

Initiative lifecycle and Proposal status stay separate.

## Decision

### 1. Pricing Initiative (new, in the Proposal service)

`proposal.initiative`:

| Column | Notes |
|---|---|
| `id`, `org_id` | |
| `type` | Release 1 supports four types, proposed: `cost_driven_repricing`, `margin_protection`, `price_increase`, `markdown_clearance`. The product owner confirms which four. |
| `objective` | Text, plus an optional target, e.g. "gross margin 18%" |
| `priority` | `low`, `normal` or `high` |
| `owner_user_id` | |
| `lifecycle_state` | Canonical states only. Release 1 uses `initiated`, `in_development`, `awaiting_approval`, `ready_for_execution`, `implemented`, `completed`, and `cancelled` (on-hold in Release 2). |
| `created_from` | E.g. `margin_exposure_view` |
| `created_at`, `updated_at` | |

Related tables:
- **`proposal.initiative_scope_member`:** (`initiative_id`, `sku_id`, `context`, `added_at`,
  `removed_at`, `removal_reason`). Removal is recorded, never deleted.
- **`proposal.initiative_assumption`:** a labelled assumption, with author and time (INIT-013).
- **`proposal.initiative_transition`:** append-only, like `proposal_transition`.

**Overlap warning (INIT-004, J1 step 2).** Before creation, the service returns any requested SKU
already in another active initiative. Creation continues only with an explicit acknowledgement,
which is recorded.

### 2. Proposals belong to an Initiative and have versions

- `proposal.proposal` gains `initiative_id` (required for new rows). A Proposal without an Initiative
  is refused.
- New `proposal.proposal_version`:

| Column | Notes |
|---|---|
| `id`, `org_id`, `proposal_id`, `version_number` | Version numbers are unique per Proposal |
| `status` | `draft`, `awaiting_approval`, `changes_requested`, `rejected` or `approved` (PROP-012) |
| `revision` | A concurrency counter, separate from the version number |
| `submitted_by`, `submitted_at` | |
| `snapshot` | jsonb, written once at submission |
| `snapshot_hash` | |
| `superseded_by_version_id` | |

**The snapshot** holds, per line, everything the decision was made on:
- the Current Price record id, amount and tax basis
- the Applicable Unit Cost record id, amount and basis
- the pricing action, the unrounded and final price, and the economics
- every `GuardrailResult` with its guardrail version
- the engine version and evaluation hash (ADR-015)

Plus the rationale and the assumptions.

**Freezing.** A database trigger refuses any update to `snapshot`, `submitted_by` or `version_number`
once `submitted_at` is set. Only `status` and `superseded_by_version_id` may change afterwards.

**Draft lines.** These live in `proposal_version_line`. They are editable only while the version is
`draft`. Any change to scope, action or rule marks the draft's analysis stale until it is recalculated
(BDD 12).

### 3. Decisions are separate records bound to one version

`proposal.decision`:

| Column | Notes |
|---|---|
| `id`, `org_id`, `proposal_version_id` | |
| `outcome` | `approved`, `rejected` or `changes_requested` |
| `decided_by`, `decided_at` | |
| `reason` | Required for `rejected` and `changes_requested` |

Rules, enforced in the service **and** by a database trigger:

| Rule | Requirement |
|---|---|
| `decided_by` must differ from the version's `submitted_by` | FLOW-013. Roles held are irrelevant. |
| Decisions are only accepted for a version in `awaiting_approval` | |
| The decider must hold an active Finance Approver role for the organisation, resolved per request (ADR-017) | Release 1: one approval step |
| Submission is refused, with a reason, if no active member other than the submitter holds approval authority | J1 step 5 |
| A version cannot be submitted while any `GuardrailResult` in it is a Blocking Breach; the refusal gives reason `blocking_guardrail_breach` | GOV-025 |

Outcomes:
- **`changes_requested`:** the version status becomes Changes Requested, and the Initiative returns
  to `in_development`.
- **`rejected`:** the Initiative returns to `in_development` or is cancelled by the owner.
- **`approved`:** the Initiative moves to `ready_for_execution`.

### 4. Revising creates the next version

Revising after Changes Requested or Rejected:
- creates version n+1 as a new draft, copied from the snapshot
- links it with `superseded_by_version_id`
- keeps version n and its decisions readable and unchanged
- carries no approval over (PROP-017, BDD 22)

Post-submission edits are never "non-material" in the pilot (D-08).

### 5. API

New RPCs on `ProposalService`:

| RPC | Purpose |
|---|---|
| `CreateInitiative` | Also returns overlap warnings |
| `GetInitiative`, `ListInitiatives` | Paged |
| `UpdateInitiativeScope` | |
| `AddAssumption` | |
| `CancelInitiative` | |
| `SubmitProposalVersion` | Freezes the version |
| `DecideProposalVersion` | One typed command: `outcome`, `reason` and `expected_revision` |
| `ReviseProposal` | Creates the next version |

Two existing RPCs are retired for new work: `ApproveProposal` (replaced by `DecideProposalVersion`)
and `PublishProposal` (replaced by the hand-off in ADR-019).

## Verification

| Check | Scenario |
|---|---|
| Frozen version | BDD 19: v1 is submitted and decided, and v1 stays byte-identical, checked by `snapshot_hash` |
| Actual submitter | BDD 20: A creates, B submits, B also holds the approver role, B is refused, C approves |
| Distinct outcomes | BDD 21 |
| New version, no inherited authority | BDD 22 |
| Initiative survives reload | BDD 17 |
| Journey | J1 steps 2 to 7 in `core-handoff/acceptance-scripts.md` (40 exposed, 6 removed, v1 with 34 lines, changes requested, v2 with 31, approved) |

## Migration

This is additive. Existing `proposal` rows are staging-only. Each gets a generated Initiative of type
`other` and a version 1 whose snapshot is built from its current lines, marked
`source: migration`. The old `state` column is kept read-only until the workspace moves to versions,
then dropped in a later release.

## Open questions

1. **For the product owner:** which four Initiative types for Release 1? Proposed:
   - cost-driven repricing
   - margin protection
   - price increase
   - markdown or clearance
2. **For the lead engineer:** keep Initiative in the Proposal service, or give it its own service
   later? This draft keeps it in Proposal for Release 1, to avoid a new deployment.
