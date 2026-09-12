# Workspace journey gaps and pilot boundary

Updated 8 September 2026 against the local `polish/workspace-premium-desk` worktree, including its uncommitted polish. This is an implementation assessment, not evidence that another team's unmerged work is absent. The CEO's September role clarification supersedes the earlier role-name baseline where they differ.

## 12 September 2026 addendum: returned pricing revision loop

The sample now connects a returned Proposal to a real prepared-rule revision and back to a replacement draft. This is an **in-memory fixture journey**, not a released backend endpoint, arbitrary scope editor or company-onboarding implementation. The production dependencies and source-backed gaps below remain open pending their own integration evidence.

- `proposals.startRevision({proposalRef,idempotencyKey})` requires the exact current returned-draft reference, current ownership and resolved read/edit/preparation/create permissions. It forks that Proposal's retained scope, rule and effective-time inputs; missing source evidence fails closed. Retrying or reopening the same returned version resumes its working copy without replacing the reviewed Proposal or branching another copy.
- The revision context preserves the return reason, reviewer and reviewed version while opening the returned `ruleRef`. Only the prepared +3.50%, +4.25% and +NGN 25.00 outcomes are supported. Saving an adjustment and generating its exact new Preview remain separate steps; unsupported values do not generate claimed pricing evidence. Source/scope blockers must be corrected before creation; margin exceptions still need independent authority.
- Creating from the revision Preview replaces the draft under the **same Proposal ID with a higher version**. Original author, submission owner, handoff history and return provenance remain attached. `revisionHistory` records source/replacement Proposal and Preview references and the revising actor. Earlier Proposal versions and their exact pricing snapshots remain retained and read-only, including when the replacement is reviewed, returned and revised again. Starting a revision alone does not overwrite those records.
- Replacement pricing clears prior exception, submission, approval and publication authority. Its new blocker evaluation determines readiness, followed by fresh submission and independent review; the original maker, revising actor and actual submitter cannot gain self-approval through replacement. Stale, wrong-owner or subsequently locked work cannot be overwritten by an older revision.
- Saved adjustments and revision Previews receive `relatedProposalRef` only when Proposal-read access permits navigation within that exact revision lineage. After replacement, “Open replacement” follows its current version without changing `revisionOrigin` or broadening Preview actions. Unrelated Previews do not inherit the link. Restricted readers receive redacted return text across current/historical Proposal, Preview, adjustment and revision-history projections; a navigation reference does not grant economics access. Contributor deep links remain denied.

The queue now counts visible **work items**, not a sum of supposedly unique lines. Import mapping issues/source rows and Preview/Proposal line scopes have explicit units; distinct stages retain their own actions and counts, with an overlap note rather than invented deduplication. Proposal next-step actions are visible on the main canvas, with people/permissions and version evidence available on demand. Shared styled dropdowns cover manager selection and repricing filters with keyboard navigation, explicit selection and focus recovery.

Implementation evidence: `src/data/fixtureWorkspaceRepositories.js` (`startRevision`, `createFromPreview`, `attachRelatedRevisionProposal`), `src/data/contracts.js`, `src/data/fixtureEconomicsVisibility.js`, `src/RoleWorkspace.jsx`, `src/WorkflowGuidance.jsx`, `src/OperationalWorkspace.jsx`, `src/WorkspaceApp.jsx` and `src/WorkspaceSelect.jsx`. Acceptance scenarios are in `tests/workspace-journey-acceptance-bdd.test.jsx`, `tests/data/revision-loop.contract.test.mjs`, `tests/workspace-queue-bdd.test.jsx`, `tests/workspace-manager-picker-bdd.test.jsx`, `tests/workspace-bdd.test.jsx` and `tests/workspace-proposal-access-bdd.test.jsx`. They specify fixture behavior, not production service or tenant-security acceptance.

## What this pass changes

- Work queue Import and Repricing entry controls use resolved `effectiveCapabilities`, never role labels.
- Work rows honour `work.open.enabled` and its exact `targetRef.id` / `targetRef.version`. Missing, unsupported or denied destinations remain visible with an explanation but cannot navigate. There is no fallback to another item or `FX-004` in the UI.
- The fixture queue now identifies the actual canonical Preview as the repricing action target. Its item identity remains the change-set; these are different records with different versions.
- Scope says that its prepared sample population is fixed. Naming the scope works; arbitrary population selection is not claimed.
- Company access, analyst submission policy, draft-title editing, manager handoff, isolated Contributor requests, manager triage and return-for-changes now have sample-backed screens and repository seams. They are not live permission or membership controls.
- Request lists use returned opaque cursors with Previous/Next controls. A failed page retains the current rows; changing actor resets pagination and discards a late response from the previous actor.

Evidence: `src/OperationalWorkspace.jsx` (`QueueScreen`, `workQueueDestination`, `ScopeScreen`); `src/data/fixtureOperationalRepositories.js` (`FixtureWorkQueueRepository.list`). Covered by `tests/workspace-queue-bdd.test.jsx` and `tests/data/operationalWorkspace.contract.test.mjs`.

Role-journey evidence: `src/RoleWorkspace.jsx` (`RoleWorkspace`, `ProposalHandoff`); `src/workspaceAccess.js`; `src/workspaceRouting.js`; `src/data/fixtureCompanyRequests.js`; `src/data/fixtureWorkspaceRepositories.js`. Focused UI coverage is in `tests/workspace-role-bdd.test.jsx`; repository invariants are in `tests/data/companyRoles.contract.test.mjs`. These tests prove fixture behavior, not released gateway/service enforcement.

The current work-item contract supports import mapping, repricing preview and proposal overview. A future queue that opens other import stages, approval/release operations or contributor requests needs an explicit versioned destination contract; it must not infer that destination from a title or reason string.

## Supported sample journey versus company readiness

The sample supports login → queue → import/profile/map/validate/review/commit/result → Catalog → prepared repricing scope/rule/preview → Proposal → independent approval or return for changes → separate publication/reconciliation → audit. It also supports a separate Contributor request journey and sample company submission policy. It is not yet a live multi-company onboarding product.

`src/data/workspaceRepositories.js` rejects live mode with `LIVE_ADAPTER_NOT_RELEASED`. The deployment of static files does not enable live identities, tenant permissions, data persistence or publication. The displayed sample identity switch is design evidence, not production RBAC or a substitute for multi-user testing.

## CEO role clarification: implementation implications

### Pricing Analyst: draft preparation and submission are separate

Implemented in the fixture: `proposal:create`, `proposal:draft:edit`, `proposal:submit`, `proposal:handoff` and `proposal:handoff:receive` are distinct capabilities. Company policy removes the analyst's effective submit capability when disabled. An eligible manager can become the submission owner without changing the author. Both author and submitter remain excluded from deciding that protected work.

The implemented sample journey is:

1. Analyst creates a draft and can edit its title against the exact current version. Price or scope changes still require a new Preview; arbitrary draft-price editing is not claimed.
2. Server-resolved company policy determines whether the analyst may submit it.
3. When submission is not allowed, a clear handoff sends the draft to an eligible Pricing Manager without submitting or approving it.
4. That authorised member reviews and submits the exact version; original authorship is retained.
5. Approval still enforces the applicable different-actor rule. Handoff is not approval and must not erase the protected maker identity.

Implemented UI: `Company access` shows sample assignments and a versioned analyst-submit setting; only the explicit `company.policy.update` action enables saving. `ProposalHandoff` requires an explicit eligible manager selection and confirmation of the Proposal version. A title edit/handoff refreshes the exact returned version; failed commands preserve the draft. Account Owner control of the setting is an explicit fixture example, not a verified production legacy-role mapping.

Remaining production dependencies: durable company policy/revision, membership assignment/shared access, eligible recipient lookup, distinct author/submitter identity, conflict handling, idempotent handoff, audit and actual notifications. The frontend consumes `allowedActions`; sample changes do not alter real permissions.

Evidence: `src/data/fixtures/proposalJourneyV0.js` (`FIXTURE_EVIDENCE_SESSIONS`); `src/data/fixtureWorkspaceRepositories.js` (`proposalAllowedActions`, `FixtureProposalRepository.submit`).

### Pricing Contributor: isolated pricing-request intake

Implemented sample routes: `#/requests`, `#/requests/new`, `#/requests/:id?version=…`. The new `requests` repository is separate from Proposal comments. Contributor navigation and route checks exclude Proposal, Catalog, comment and audit destinations, and the repository independently rejects protected reads.

Implemented journey: Pricing requests → New request → typed product/SKU reference, optional context, required issue/reason and optional evidence text → submitted receipt → own-request status. Manager triage has status and an **internal** note. Contributor responses deliberately omit triage notes and protected downstream metadata; the Contributor sees status only. The UI also refuses to render an internal note/editor without the effective triage capability, including when a denied action object is supplied.

Do not assume Contributor may read the cost-rich Catalog DTO. Use a field-safe product lookup contract, or a typed SKU/reference until that lookup is available. Attachments require scoped access, limits, retention and scanning rules before real upload is offered.

Remaining production dependencies: organisation/author-scoped persistence, server-enforced safe DTOs, safe evidence storage if files are introduced, triage ownership/status and negative cross-company tests. Linking a request to downstream pricing work is not implemented; it must not expand Contributor access. The request is not a disguised Proposal comment.

Evidence: `src/RoleWorkspace.jsx` (`NewRequest`, `RequestDetail`, `RequestList`); `src/workspaceRouting.js`; `src/workspaceAccess.js`; `src/data/fixtureCompanyRequests.js` (`requestDetail`, `findReadable`); `src/data/fixtureWorkspaceRepositories.js` (`listComments` requires `proposal:read`).

### Approval roles and accepted names

Commercial Approver and Executive Approver should reuse the decision component and approve/reject action contract. Backend assignment, review stage, thresholds and capabilities determine their authority; new labels must not grant new access in the browser.

Account Owner, Pricing Manager, Finance Approver, Executor, Viewer and Auditor are accepted product labels. Confirm the backend's legacy-code mappings before changing them. The small existing presenter mapping is not a complete permission specification.

The sample now exposes `proposal.reject` and `proposals.decide`, returning a submitted Proposal to a new draft/blocked version with a required reason. The UI preserves the reviewer, reviewed version and timestamp; it does not invent a `rejected` terminal state. Commercial and Executive are explicit fixture assignment scenarios using the same decision path, not a claim that staged/threshold routing is released.

Production verification gap: the CEO describes an existing reject action, but the checked-out gateway/service contract previously exposed submit/approve/publish without it. Verify and integrate the authoritative branch/contract; the new fixture method is not evidence that the backend now supports it.

Evidence: `src/workspacePresenter.js` (`ROLE_LABELS`); monorepo `src/proposal/src/domain/state-machine.ts` (`ProposalEvent`, `ProposalState`); `src/gateway/src/routes/proposals.ts`.

AI Assistant is deferred until its data dependency is ready. Do not add active AI navigation to imply availability. Workspace Admin is removed. Vendor Manager and Forward Deployed Engineer access are not in this period's build.

## Minimum journey before real companies enter

The older vertical slice excluded full organisation administration. An assisted pilot can remain narrower than self-service SaaS onboarding, but must still complete these real steps:

| Step | Required user outcome | Current gap |
| --- | --- | --- |
| Provision company | Account Owner receives access to the correct company | No organisation provisioning/invitation surface or workspace contract |
| Accept access | Resolve user, membership, tenant and session; handle expired invitation/no membership | Current login opens a fictional session; gateway login issues a token to configured development credentials |
| Establish responsibility | Authorised members assigned preparation, review and execution; analyst-submit policy set | Company policy and sample assignments now have UI/fixture contracts; real membership/invitation assignment and authoritative policy are still missing |
| Establish data | Import first source, validate SKU identity, map dimensions and reconcile accepted/rejected rows | Present import is a bounded fixture, not arbitrary company data |
| Establish policy | Approved floors and precedence apply to exact catalog dimensions | Rule directory is read-only evidence; live policy setup remains a dependency |
| Establish release | Configure destination and eligible Executor; verify reconciliation | No live destination setup/readiness contract |
| Verify first decision | Separate humans prepare, review and release; inspect durable outcome | Fixture actor switching is not multi-user authentication testing |

Provide expired/already-used invite, removed membership, session expiry, organisation switch, no data, missing approver, missing Executor, missing policy, missing destination and permission-loss recovery. Preserve unsent work where safe. A browser-local checklist must not claim server-verified onboarding completion.

## Additional frontend journey limits

- Scope displays all prepared categories/channels/locations; only the name can be edited. Real dimension/SKU selection needs a scope input contract and authoritative complete-population counts.
- Adjustment demonstrates specific prepared outcomes, not arbitrary company repricing. Calculations, floors, rounding and retained policy evidence must remain repository-derived.
- Viewer and Contributor now have explicit evidence identities and Contributor isolation tests. Sensitive cost/margin fields must still be omitted by the authoritative API, not merely hidden with CSS; verify the production field-projection contract separately from the fixture evidence.
- Work queue results must ultimately be server-scoped by actionable ownership/assignment, not merely broad read capability. The existing directory is a small fixture.

## Backend handoff / release evidence required

1. **Session:** `/auth/me` or equivalent with authenticated actor, active organisation, memberships, capability version, expiry and safe fields. Current gateway `routes/auth.ts` is configured dev-user login.
2. **Permission enforcement:** tenant isolation, same policy at gateway and service, field-safe DTOs and action-specific denials. Verify propagated role/service credentials: current Proposal gateway helper forwards org/user headers while the downstream service authorizes gateway identity.
3. **Analyst handoff and Contributor intake:** integrate and persist the fixture-shaped contracts described above; no frontend-only authority mechanism.
4. **Approval/rejection:** integrate the authoritative reject implementation and map the accepted roles; retain maker-checker and separate publication. Fixture approve/return behavior is implemented but is not a service release.
5. **Data and financial integrity:** arbitrary import/scoping, complete counts, policy snapshots, optimistic version checks, idempotent high-impact actions and durable per-line reconciliation.
6. **Pilot proof:** separate authenticated users in at least two companies; cross-tenant and field-redaction negative tests; actual first import-to-publication reconstruction from audit evidence.

The existing `src/data/liveBackendGate.js` lists the historical issue gates. Verify their present status against backend ownership; their existence in a list is not proof that each is still open or has been closed.

## Implemented fixture BDD and remaining release proof

`tests/workspace-role-bdd.test.jsx` covers safe Contributor receipts against the actual fixture repository, exact-version navigation, text-only create/retry idempotency, capability-denied controls, manager-only internal triage, policy/session refresh, explicit confirmed handoff, title-only editing and returned-review provenance. It also covers opaque cursor pagination, failed-page retention and actor-change cancellation. `tests/data/companyRoles.contract.test.mjs` exercises repository invariants independently.

The following remain required against the released backend and independent authenticated company sessions, even where a fixture counterpart already passes:

- Given analyst submission is disabled, when an analyst saves a draft, then the draft is retained and submission is denied without a state transition.
- Given authorised handoff to a manager, when that manager submits, then the exact current version is submitted and original authorship remains intact.
- Given a stale handoff or permission change, when submit is attempted, then the draft survives and refreshed authority/review is required.
- Given Contributor without Proposal read, when Proposal/comment/audit deep links or search are attempted, then no protected Proposal metadata is returned or rendered.
- Given a submitted pricing request, when the Contributor opens its receipt, then only the request's permitted fields/status appear and no Proposal is implicitly created.
- Given an authorised triager, when a request is linked to pricing work, then Contributor access does not expand.
- Given a Viewer, when Catalog/Proposal records load, then sensitive cost/margin fields are absent from the DTO and do not become numeric zero.
- Given Commercial or Executive review, when action metadata resolves, then one decision component respects the supplied stage, assignment and limits.
- Given incomplete setup, when the company lacks an approver, policy or release destination, then readiness remains incomplete and names the next responsible action.
- Given two independent company sessions, when a record URL/attachment reference crosses the organisation boundary, then no information leaks and no mutation occurs.
