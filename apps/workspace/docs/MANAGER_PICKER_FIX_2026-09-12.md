# Manager picker — 12 September 2026

## Defect and change

The Pricing Manager field in Proposal → Draft actions used a native `select`. Its expanded menu was rendered by the operating system, so styling the closed field did not style the popup shown in the report.

Replaced this field with `WorkspaceSelect`, a controlled select-only combobox. The menu uses the workspace typeface, neutral surface, restrained green highlight, selected checkmark, and shared focus treatment. The handoff field is capped at 400px rather than stretching across the entire card; it shrinks to the available phone width. Controls have a 44px minimum height; longer names wrap.

The popup is portalled outside clipping containers, anchored with an 8px gap, bounded to the viewport, and can open above the field. Long lists scroll internally. The popup follows scrolling/resizing and closes when its field leaves the viewport. No new dependency was added. Other native selects are not replaced by this scoped fix.

## Behaviour and authority

- Arrow keys, Home/End, and typeahead explore the list; Enter/Space or an option click selects.
- Escape, Tab, or clicking elsewhere closes without committing the highlighted value. Tab moves forward normally; closing with Escape retains field focus.
- The accessible label, active descendant, committed selection, and expanded/disabled states are explicit.
- No eligible manager, title editing, confirmation, and pending handoff disable the field.
- Selection does not transfer ownership. Review and separate Confirm remain required. Candidate eligibility, exact-version payloads, idempotency, and repository permissions are unchanged.

## Verification

Real browser checks used the existing local fixture journey and did **not** confirm a handoff:

| Viewport | Field / menu width | Finding |
| --- | --- | --- |
| 1366 × 900 | 400px | Aligned left edges, 8px gap, correct font and selected marker |
| 390 × 844 | 332px | No horizontal page overflow; menu remains within viewport |
| 320 × 568 | 262px | No horizontal page overflow; opens above when space below is insufficient |

Browser keyboard checks verified Escape preserves the value/focus, ArrowDown + Enter selects, reopening marks that selection, and Tab dismisses and moves to Review handoff. Captures are in `manager-picker-2026-09-12/`.

Independent QA added 15 BDD scenarios and migrated three native-select test interactions without removing business assertions. Geometry fixtures in jsdom test logic only; they are not visual proof. The browser checks above cover rendered placement. A dedicated screen-reader session and physical-device testing were not performed.

Validation: **138 data tests + 168 BDD tests + 8 hosting tests = 314 passing**. Vite production build passes (4603 transformed modules).

These changes are local. Nothing was committed, pushed, or deployed during this fix.
