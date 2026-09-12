# Journey fixes and verification · 12 September 2026

This pass implements the findings in `JOURNEY_CONFIDENCE_AUDIT_2026-09-12.md`. It changes the local workspace's prepared sample journey. Nothing was committed, pushed or deployed; production onboarding remains gated.

## Delivered

- **Returned pricing revision:** the current owner can start or resume a pricing revision, change a supported adjustment, generate its exact Preview and create a replacement draft under the same Proposal identity. Original authorship, return reason and reviewed evidence survive. The replacement requires fresh exception authority, submission and independent review. Title-only editing remains a separate operation.
- **Safe history and navigation:** repeated revision cycles retain governed source snapshots. Rule and Preview context links resolve the current authorized replacement, including after a subsequent draft-title version. Old/intermediate evidence does not inherit new mutation permissions. Stale commands fail closed.
- **Clearer queue:** counts describe work items, mapping issues and lines explicitly. The misleading sum of overlapping line counts is gone. Stage, responsible actor and next task remain visible.
- **Visible Proposal next step:** source/scope corrections and margin exceptions have distinct actions on the main view. Pending work names who acts next. People/permissions, calculation provenance and version details remain available without dominating the default view.
- **Consistent controls:** repricing filters and request triage now use the same styled, keyboard-accessible select as the manager picker. New action buttons have explicit icon gaps, minimum heights and responsive wrapping. Repricing uses one compact selection summary instead of repeating large counters above the same tabs.

## Automated acceptance

`pnpm --filter @owomide/workspace test:all` passed **352 checks**: 155 data/contract, 189 BDD and 8 hosting tests. `pnpm --filter @owomide/workspace build` passed. `git diff --check` passed.

The independent QA subagent's nine connected acceptance cases exercise a +4.25% replacement, fresh review, Analyst-to-Manager handoff, restricted roles, errors and exact-version navigation. Setup, operational line repairs and the second exception decision in that connected test use real fixture repository operations; individual controls have their own BDD coverage. See `JOURNEY_ACCEPTANCE_2026-09-12.md` for the matrix and limits.

The pass caught and fixed two integration defects beyond the visual findings: cached Proposal state hid replacement creation, and a historical Preview emitted an invalid denial code. Additional regression checks prevent stale revision-context links and loss of generated evidence during a second revision cycle.

## Browser evidence

Fresh local-browser checks used actual UI controls and native scrolling, not injected application state. Screenshots are in `journey-fixes-2026-09-12/`.

| Surface | Viewport and check | Evidence |
| --- | --- | --- |
| Work queue | 1440×900, 1024×768, 390×844; readable wrapping, explicit units, no document-width overflow at the two narrower widths | `queue-desktop.png`, `queue-tablet.png`, `queue-mobile.png` |
| Proposal | 1440×900 and 390×844; next action visible, sensible spacing, full-width mobile actions, optional details collapsed | `proposal-desktop.png`, `proposal-mobile.png` |
| Pricing revision | Actual Teni → Chika exception review → Teni submission → Chika return → Teni +4.25% save and generated Preview; retained feedback visible | `revision-desktop.png`, `revision-mobile.png` |
| Repricing filters | 1440×900; styled open menu with spaced options and retained surrounding table alignment | `repricing-filter-desktop.png` |
| Repricing mobile | 390×844; compact summary, scrollable tab rail and price cards without document-width overflow | `repricing-mobile.png` |
| Desktop inspector | 1440×900; native scrolling reaches final source/scope evidence. Page scroll remains 145px while inspector scroll moves 0→375px (545px client height, 920px content) | `inspector-desktop-end.png` |
| Mobile inspector | 390×844; deliberate single document flow reaches the final record and scope. It is not a nested desktop scroll pane | `inspector-mobile-end.png` |

These are the changed routes/states checked in this pass, not a claim that every page, every content length, every viewport or every assistive technology has been certified. The broader prior inspector-scroll checks remain documented separately. First-time-user task testing is still needed to establish comprehension; a green BDD suite cannot establish that by itself.

## Still required before onboarding

The workspace still uses the in-memory fixture adapter and only has complete evidence for the prepared +3.50%, +4.25% and +NGN 25.00 adjustments and fixed scope. Real sessions, company provisioning/invites, durable tenant permissions, arbitrary import/scoping, authoritative pricing calculations, persistent history, notifications and destination/reconciliation services are not delivered by this pass.

The detailed backend contracts and release gates are in `BACKEND_ONBOARDING_READINESS.md`, with a new revision-specific handoff addendum. `FRONTEND_JOURNEY_GAPS.md` tracks the remaining product limits. Contributor-to-pricing-work linkage and arbitrary company policy/setup still need explicit contracts; no protected Proposal access is implied for Contributors.
