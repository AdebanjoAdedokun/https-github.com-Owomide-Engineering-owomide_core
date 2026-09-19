# RBAC — Roles & Permissions

Prose companion to `roles.csv` and `role_permissions.csv` in this directory, the same relationship `ARCHITECTURE.md` has to the Excalidraw canvas: the CSVs are the row-level detail, this file is the model and the reasoning a CSV row can't carry (scope tiers, constraints, what's decided vs. open). If they disagree, resolve here first, then update the CSVs to match.

Referenced from `ARCHITECTURE.md` §8 (Cross-cutting concerns → Auth) and `CLAUDE.md`.

---

## 1 · Model status

`roles.csv` and `role_permissions.csv` are finished: 11 system roles × 55 permissions, every cell a flat Allow/Deny (the "Conditional" column that used to sit between them — per-org toggles, per-user flags — was eliminated; see §6). This is the single source of truth, not a target reconciled against an as-built model.

This file still tracks per-role reasoning (persona mapping, what's a rename vs. new capability) and the F0.10 enforcement architecture built on top of the CSVs.

---

## 2 · Role status — this round

| Target role | Status | Maps to (as-built) | Notes |
|---|---|---|---|
| Account Owner | **Active** — confirmed super admin | `org_admin` | Renames and supersedes `org_admin` as the single top-of-org role, keeping its full existing scope (proposal create/approve/publish, margin_rule CRUD, user/role/org settings, audit, restore). CSV rename only, no permission-row changes needed. |
| Pricing Manager | **Active** | `pricing_analyst` (as-built) | As-built `pricing_analyst` already has full create/edit/submit rights — this is a rename, not new capability. |
| Pricing Analyst (draft tier) | **Active** | — (new) | Draft-only tier: create/edit, submit is a flat Deny in `role_permissions.csv`. The original design (open decision D3) gated submit behind a per-org toggle; that was scrapped — an org that wants a specific analyst to submit assigns them Pricing Manager as a second role (rule R4) instead. No toggle, no F3.10; this is now just a CSV row enforced by F0.10 like any other permission. |
| Pricing Contributor | **Active — building this period** | — (new) | Comments/attaches evidence/raises structured price-change requests; no proposal read, no cost/margin visibility, no drafts, no approval power. Internal staff only (sales, ops), confirmed low-complexity. Needs a new object since it writes without proposal-read access — tracked as BUILD_PLAN F3.9. |
| Finance Approver | **Active** | `approver` + `margin_admin` (merged) | Owns the profitability domain: margin/cost guardrails + approval within them. Reuses the existing approve endpoint (F3.5) and the existing Margin engine (F4.1/F4.2) — rename/merge only. |
| Commercial Approver | **Active** | — (new role, existing mechanism) | Same approve/reject verbs as Finance Approver, checking a different thing: market-positioning policy (MAP, parity, channel, regional rules) instead of margin. **Needs no new engine to function** — it reuses the existing generic approve endpoint (F3.5); the person holding this role reviews manually, the same way any human approver would, without the system auto-flagging violations. The *automated* detection engine (parallel to Margin's) is real future work but does not block this role from working today — see the "later" row in `BUILD_PLAN.md` Phase 4. |
| Executive Approver | **Active** | — (new role, existing mechanism) | Final tier for large or strategic items, and the tie-breaker when Finance and Commercial disagree. Same reasoning as Commercial Approver: reuses the existing approve endpoint (F3.5); which proposals get routed to them is a human decision ("this one's big, loop in the exec") rather than a system-enforced magnitude threshold. Approve/reject only — never publishes; that stays with Executor. |
| Vendor Manager | **Not built as a separate role** | `approver` (absorbs it) | Clarified: no external vendor ever touches the system — an internal Pricing Contributor/Manager types the third-party seller's price into a proposal on their behalf. Per-org decision: route vendor-scoped proposals to the regular Approver pool instead of a distinct Vendor Manager role/queue. Whether this matters at all depends on whether any pilot org actually runs vendor-priced proposals — open question below. |
| Executor | **Active** | `publisher` | Same capability as the built `publisher` role (F3.6 publish step) — rename/alignment only. Confirmed: has no approval power at any level — it only marks something *already approved* as implemented, and manages post-approval scheduling. Never decides anything. |
| Viewer | **Active** | `viewer` | Unchanged. |
| Auditor | **Active** | `governance_auditor` | Unchanged. |
| AI Assistant | **Active — sequenced after Data Pipeline Intelligence ships** | — (new) | Invoked-only, inherits the invoking user's scope, hard-denied submit/approve/implement, every draft attributed and logged. Confirmed human-facing. Deliberately built *after* Phase 7's margin rule engine (F7.4, data engineer's track) ships, since that's the surface it attaches to — not blocked, just sequenced. |
| Workspace Admin | **Removed** | — | Dropped from the model entirely, not deferred. |
| Forward Deployed Engineer (was Pilot Operator) | **Scrapped** | — | Not happening now, and not planned for later either. Dropped from the model entirely — same treatment as Workspace Admin. |

**Legend:** Active = build this round (some sequenced after a dependency, noted per row). Not built as a separate role = absorbed into an existing role. Removed / Scrapped = dropped from the model, not revisited.

---

## 3 · What "building this period" actually means

One role needs real new engineering beyond RBAC enforcement itself (tracked in `BUILD_PLAN.md`):

- **Pricing Contributor** → F3.9, a new price-change-request object.

Pricing Analyst's draft-only tier needed no separate feature in the end — it dissolved into F0.10 (§6) once submit became a flat CSV row instead of a toggle.

Everything else Active this round — Account Owner, Pricing Manager, Finance/Commercial/Executive Approver, Executor, Viewer, Auditor — needs **no new feature ID**. They're either straight renames of existing roles, or (Commercial/Executive Approver) new labels on the *same* existing approve endpoint (F3.5), differentiated only by who's assigned and what shows in the audit trail, not by any new system capability.

AI Assistant is Active but intentionally sequenced after the data engineer's Phase 7 Intelligence work ships.

---

## 4 · Open questions

- **Does any pilot org actually run vendor-scoped proposals right now?** If not, there's nothing to route differently and Vendor Manager stays purely theoretical for now. Needs an answer from whoever owns pilot relationships, not an engineering decision.

---

## 5 · Feature tracking

Net-new engineering work identified here is tracked with feature IDs in `BUILD_PLAN.md`: F3.9 (Pricing Contributor) is in this period's build queue. F0.10 (§6, shipped) wires the RBAC enforcement scaffold generally — it absorbed the old F3.10. The automated Commercial guardrail engine is noted in Phase 4 as future, unscheduled work — not required for Commercial Approver to function today.

---

## 6 · F0.10 — the enforcement architecture (shipped)

Two directions were tried and rejected before landing here — worth recording so they don't get re-proposed:

1. **A compiled library**, generated from the CSV into TS/Go/Python source at build time. Rejected — this repo has no precedent for compiling a data file into source outside of `.proto` (which uses `buf`, not a bespoke generator), and it added machinery for no benefit once the check is reframed as a normal service call.
2. **Per-org physical copies** of the 11 system roles, seeded at onboarding. Rejected — system roles are identical for every org today, so duplicating 605 rows per org bought nothing, and it worked against the cleanest v2 story (see below).

**What's built:**

- **`src/rbac`** is a new, ordinary backend service — the sole owner of role/permission data. `rbac.role` (global rows for the 11 system roles, `org_id IS NULL`; v2 custom roles will be the only org-scoped rows) and `rbac.role_permission` (sparse — one row per *granted* permission, absence means Deny) are real Postgres tables, seeded once via migration. The 55-entry permission catalog itself (`src/rbac/src/permissions.ts`) is a hand-maintained file, not a table — small and rare to change.
- **`CheckPermission(roles, permission) -> allowed`** is the entire public contract. Every other service calls it live, synchronously — the same cost model as Proposal calling `Margin.validateBatch`. No caching layer, no compiled artifact.
- **The permission codes themselves are a generated proto enum** (`Permission` in `rbac.proto`), not strings — one shared definition, generated to TS/Go/Python via the existing `make proto` pipeline, imported everywhere a permission is referenced. Only `src/rbac` converts an enum value to the text stored in the database.
- **Rolled out to**: Proposal (full handler coverage — `requireApproverRole`'s stale `"approver"` check is gone, replaced by real per-handler gates; `publishProposal` went from fully ungated to `execution.mark_implemented`), Governance (previously had *no* service-to-service auth at all — its `restore` RPC, which executes immediately and synchronously against Catalog, was reachable by anyone; now gated on `platform.restore` plus a proper `gateway_svc` credential check), Margin (`UpsertRule`/`DeactivateRule` gated on `margin_guardrail.manage`, previously ungated despite the permission existing).
- **Gateway bug closed**: `proposals.ts`, `change-sets.ts`, `override-requests.ts` and `governance.ts` all silently dropped `x-user-roles` and never signed a service credential — every real HTTP call into Proposal or Governance would have 401'd, and no downstream RBAC check could ever have seen a caller's roles. Fixed to match the already-correct `margin.ts`/`catalog.ts` pattern.
- **Deferred to v2**: `DuplicateRole(source_role_id, org_id, new_name)` — the entry point for custom roles, backing a "Duplicate & Customize" UI action (copy an existing role's current grants into a new org-owned row, then edit it). Tracked in `FUTURE.md`. No `ListRoles`/`ListPermissions` read API yet either — nothing browses the catalog until an admin UI exists.
