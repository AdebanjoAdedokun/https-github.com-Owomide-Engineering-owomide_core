# RBAC — Roles & Permissions

Prose companion to `roles.csv` and `role_permissions.csv` in this directory, the same relationship `ARCHITECTURE.md` has to the Excalidraw canvas: the CSVs are the row-level detail, this file is the model and the reasoning a CSV row can't carry (scope tiers, constraints, what's decided vs. open). If they disagree, resolve here first, then update the CSVs to match.

Referenced from `ARCHITECTURE.md` §8 (Cross-cutting concerns → Auth) and `CLAUDE.md`.

---

## 1 · Two generations of the model

- **`roles.csv` / `role_permissions.csv`** — the **as-built** model. 10 roles, already wired into feature IDs across `BUILD_PLAN.md` (e.g. F3.5 approve role check, F4.6/F4.7 override actor check, F6.4 restore). Treat as current source of truth for anything already shipped or in flight.
- **"Owómidé Roles and Permissions Model"** — the **target** model for this build round, arrived via persona mapping. Supersedes the as-built model where the two conflict, once a role below is marked Active. Not yet reflected in `role_permissions.csv` (row-level CRUD permissions still need to be written for the Active roles below).

This file tracks the reconciliation between the two.

---

## 2 · Role status — this round

| Target role | Status | Maps to (as-built) | Notes |
|---|---|---|---|
| Account Owner | **Active** — confirmed super admin | `org_admin` | Renames and supersedes `org_admin` as the single top-of-org role, keeping its full existing scope (proposal create/approve/publish, margin_rule CRUD, user/role/org settings, audit, restore). CSV rename only, no permission-row changes needed. |
| Pricing Manager | **Active** | `pricing_analyst` (as-built) | As-built `pricing_analyst` already has full create/edit/submit rights — this is a rename, not new capability. |
| Pricing Analyst (draft tier) | **Active — building this period** | — (new) | Draft-only tier: create/edit, but submit is denied unless the org opts in via a per-org toggle (open decision D3 in the source spec). Tracked as BUILD_PLAN F3.10. |
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

Two roles need real new engineering (tracked in `BUILD_PLAN.md`):

- **Pricing Contributor** → F3.9, a new price-change-request object.
- **Pricing Analyst (draft tier)** → F3.10, a per-org submit toggle on top of the existing submit endpoint.

Everything else Active this round — Account Owner, Pricing Manager, Finance/Commercial/Executive Approver, Executor, Viewer, Auditor — needs **no new feature ID**. They're either straight renames of existing roles, or (Commercial/Executive Approver) new labels on the *same* existing approve endpoint (F3.5), differentiated only by who's assigned and what shows in the audit trail, not by any new system capability.

AI Assistant is Active but intentionally sequenced after the data engineer's Phase 7 Intelligence work ships.

---

## 4 · Open questions

- **Does any pilot org actually run vendor-scoped proposals right now?** If not, there's nothing to route differently and Vendor Manager stays purely theoretical for now. Needs an answer from whoever owns pilot relationships, not an engineering decision.

---

## 5 · Feature tracking

Net-new engineering work identified here is tracked with feature IDs in `BUILD_PLAN.md`: F3.9 (Pricing Contributor) and F3.10 (Pricing Analyst draft tier) are in this period's build queue. F0.10 wires the RBAC enforcement scaffold generally. The automated Commercial guardrail engine is noted in Phase 4 as future, unscheduled work — not required for Commercial Approver to function today.
