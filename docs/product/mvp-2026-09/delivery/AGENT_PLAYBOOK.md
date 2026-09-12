# Agent execution contract

## Dispatch

1. Read this hub, assigned issue, its exact requirement bodies/pages and linked code evidence. Read root/service guidance and inspect current Git/remote state.
2. Check **dependencies and decisions**, not only a priority label. `ready-for-plan` permits planning, not implementation under unresolved contracts. A work package is not automatically a one-PR task.
3. State a bounded plan, editable files/services and tests. If the package cannot be reviewed in one bounded change, create/propose child tasks with inherited requirement facets and dependencies before coding. Never mark the parent complete while children/gates remain.
4. Claim work visibly using the team's issue/assignee process. Do not assign other people or start another agent's overlapping work without coordination. Use one worktree/branch per executable task; preserve dirty user work.
5. Contracts before producers/consumers. Prefer the existing `apps/workspace/src/data/contracts.js` and repository factory plus backend protobuf/event contracts. Do not invent a second policy engine inside React.

## Scope boundaries

- Frontend packages demonstrate the correct stateful journey in explicitly labelled sample mode. They must not be counted as backend or integration completion.
- Backend packages persist and enforce contracts, not just define proto methods. Include migrations, active membership/permissions, source context, idempotency, partial/unknown outcomes and historical evidence where relevant.
- Integration packages connect reviewed adapters and prove actual success/denial/retry through Gateway. No fixture fallback on a live request failure. Keep the live gate until its explicit release criteria pass.
- “Blocked”, “approved”, “valid”, “reviewed”, “implemented”, “read” and “completed” are distinct states. Do not compress them to simplify CSS or API handling.
- No production price operation, role grant, connector credential change, deployment or automatic merge is implied by an implementation issue. Obtain the required authority for those operations.
- Must/Should/May/exclusions come from each PRD body. Examples are not mandatory individual features. Optional AI examples cannot become hidden prerequisites; required AI cannot be quietly relabelled delivered by a stub.

## Evidence and Definition of Done

Each PR references its stable package ID, GitHub issue and requirements. Include:

- [ ] Reviewed contract/examples; producer and consumer ownership identified.
- [ ] Positive, denied, missing/ambiguous, stale/version and relevant replay/partial/failure tests.
- [ ] Persistence/restart/migration/rollback evidence where storage changes; no destructive defaults.
- [ ] Unit/service/integration commands with runtime, results and limitations; apply the existing repository DoD for the actual scope.
- [ ] UI desktop/tablet/mobile and keyboard/focus/open-control/scroll screenshots or browser evidence for affected screens; existing fixture BDD alone is insufficient.
- [ ] Copy and action hierarchy reviewed: one clear primary task; contextual details instead of repeated provenance; sensible unequal column widths and contained content.
- [ ] Live/sample boundary and sensitive-data projection verified; no secrets in code, logs, images or docs.
- [ ] Requirement evidence facets updated, including explicit unresolved or deferred rows.
- [ ] Independent review and CI result; only then request merge. Do not self-certify missing infrastructure tests as passed.

## Handoff comment template

```text
Package / child task:
PR / commit:
Requirements and facet completed (frontend / backend / integration):
Changed contracts and files:
Behaviour now supported:
Tests executed (commands, runtime, counts):
Browser / service evidence:
Denied / stale / partial / retry coverage:
Known limitations and still-blocked requirements:
Decisions made (recorded decider/link):
Next dependency unblocked:
```

Report acceptance rows are proposed tests, not historical passing tests. Update delivery evidence rather than rewriting the dated audit to erase the original gap.

## Suggested GitHub Project views, once authorised

Use fields `Track`, `Priority`, `Readiness`, `Milestone`, `Package ID`, `Evidence facet` and `Blocked by`. Views: Decisions/contracts; Frontend alignment; Backend foundations; Connected pilot; Ready to plan; Blocked. Keep issue dependency links authoritative even if a board is unavailable. Do not let moving a card override a contract or release gate.
