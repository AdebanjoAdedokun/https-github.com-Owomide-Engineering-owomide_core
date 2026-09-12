# Returned-Proposal journey acceptance

Scope: the local workspace's prepared sample journey, from a reviewer's return decision through a real pricing adjustment and a replacement draft. This is an independent acceptance check of the implementation, not a claim that the backend is production-ready.

## Acceptance matrix

| Journey / risk | Required behaviour | Evidence responsibility |
| --- | --- | --- |
| Return for changes | Preserve the review reason, reviewer and the exact reviewed Proposal reference. Return to the submission owner, not automatically to another actor. | Existing handoff journey plus new connected acceptance tests. |
| Actual pricing revision | A revision action opens the exact prepared adjustment. Changing a title alone must not be presented as changed pricing evidence. | New route-backed keyboard and replacement journey tests. |
| Supported calculation | Save a supported adjustment as a new rule version, generate its exact Preview, and show changed minor-unit amounts. Unsupported values cannot pretend to have a complete-population result. | New acceptance tests; existing pricing-engine and prepared-rule contracts. |
| Incomplete operational evidence | Stale-cost and unsupported-dimension blockers remain visible and prevent creating the governed replacement until resolved. A new rule does not inherit a prior operational reconciliation. | Existing remediation BDD; new replacement journey asserts this boundary. |
| Replacement draft | Preserve Proposal identity, authorship, submission ownership and return lineage while binding a greater Proposal version to the new Preview. | Revision repository tests and new connected acceptance test. |
| Return to the replacement | Reopening the generated Preview, repaired source Preview or saved adjustment offers **Open replacement** and navigates to the current Proposal version, not the stale reviewed origin or initial replacement version. | Connected navigation regression, including a subsequent title-only version update. |
| Independent review | New economics do not inherit prior approval, bounded exception, submission or publication authority. Margin blockers need a fresh decision; submission is not publication. | New replacement journey plus existing permission and publication contracts. |
| Draft-only Analyst | Preparing revised evidence does not grant submission. The Analyst can hand off to an eligible Pricing Manager; author and submitter remain distinct. | New connected acceptance test and existing manager-picker/handoff tests. |
| Unauthorized actor | Viewer, assigned reviewer and unassigned manager cannot start someone else's revision. Contributor cannot read protected Proposal evidence through a deep link. | New connected acceptance tests and revision repository denials. |
| Old evidence | Explicit historical reads retain the old source Preview and are read-only. An ordinary stale-reference margin request fails closed rather than returning current economics under an old version. | New connected acceptance test and existing version contracts. |
| Version conflict / save error | Keep the user's input and safe error in context. Do not navigate, generate, or create a replacement after a failed operation. | New connected acceptance error tests. |
| Keyboard / focus | Revision starts with keyboard activation; confirmation receives focus. Cancellation restores focus without mutating the Proposal. | New keyboard case plus existing confirmation and manager-picker tests. |
| Desktop / mobile | The next action and retained reason remain readable; responsive cards/panels can reach every control and final evidence row. No clipping, trapped scrolling or overlap. | Root's real-browser pass; jsdom cannot prove geometry or actual scrolling. |

## What the checks do not establish

- Only three prepared calculation outcomes currently have full sample-population evidence: +3.50%, +4.25% and +NGN 25.00. The fixed sample scope is not a general-purpose production selector.
- The fixture's role selection demonstrates permission outcomes; it is not authentication or tenant isolation. Every write, snapshot read, field redaction, version check and maker/checker boundary needs server enforcement.
- A real revision service needs durable, immutable Preview/Proposal/exception evidence; a transactional replacement operation; idempotent retries; optimistic concurrency; and persistent submission/return lineage.
- Live import validation, evidence attachments, pricing inputs, calculation completeness, notifications, tenant onboarding and publication connectors remain separate backend deliverables.
- Automated DOM tests do not certify visual quality, mobile layout, WCAG conformance, screen-reader usability or browser scroll reachability. These need the browser evidence recorded by the main implementation pass.

## Regression files

- `tests/workspace-journey-acceptance-bdd.test.jsx`: independent connected-flow, role and safe-error checks.
- `tests/workspace-handoff-journey-bdd.test.jsx`: existing role handoff, submission, return and title-edit/resubmit journey. This test alone never proved an actual pricing correction.
- Existing repricing, proposal, role, version and publication contract suites remain in place; the new journey does not replace them.

## Independent validation result

All **9 connected acceptance cases passed** on 12 September 2026 with:

```sh
pnpm exec vitest run tests/workspace-journey-acceptance-bdd.test.jsx --reporter=verbose
```

The main connected case starts from a repository-prepared returned Proposal, uses the real workspace UI to start revision by keyboard, saves +4.25%, generates the exact Preview, creates its replacement, hands the draft to a manager with focused confirmation, and submits it for fresh independent review. It verifies the changed Cassava price of ₦1,681.03, same Proposal identity with a higher version, original authorship, exact return lineage, cleared prior authority, and unchanged original Preview lines.

The navigation regression reopens the intermediate generated Preview, repaired source Preview and saved adjustment after replacement and a subsequent title edit. All three context links open the latest replacement version. The origin remains unchanged; the intermediate Preview retains its own exact lines and ref, and its ordinary Proposal creation/read actions stay disabled. Its separately authorized related-Proposal link does not imply that the intermediate Preview became the governed source.

Operational line repairs and the second independent exception decision use real fixture repository operations inside this acceptance case; their individual controls are covered by the existing remediation/review BDD suites. This is not a claim that every action in that sequence was manually clicked in a browser.

The independent pass caught two integration defects that were fixed by their source owners before the final green run:

1. Cached prior-Proposal state incorrectly overrode the replacement Preview's enabled creation action, displaying **Open Proposal** where the user needed **Create Proposal**.
2. Reopening the original Preview after replacement produced an invalid action-denial code and broke the read contract. Its creation action now fails closed with a stable denial while the original evidence remains readable.

The real-browser desktop/mobile evidence and passing complete-suite/build result are recorded in `JOURNEY_FIXES_2026-09-12.md`. No deployment, backend persistence, or production onboarding readiness is certified here.
