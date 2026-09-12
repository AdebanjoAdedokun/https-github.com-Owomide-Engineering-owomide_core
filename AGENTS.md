# Working on Owómidé

- Read the root/service `CLAUDE.md` for stack and service boundaries, plus `docs/product/mvp-2026-09/README.md` for the accepted product target. Older lifecycle descriptions are implementation history, not replacement-PRD authority.
- Start from one assigned GitHub work item and its prerequisites. Draft a plan before non-trivial changes. A work package may need smaller child tasks; do not silently deliver an unreviewable multi-domain rewrite.
- Use one branch/worktree and one bounded PR per executable task. Never overwrite another agent's or the user's dirty changes. Do not merge, deploy or operate real customer prices without explicit authority.
- Contracts before dependent implementation: evolve existing protobuf/events and transport-neutral workspace repositories. Do not bypass Gateway, service ownership, tenant isolation or canonical data boundaries.
- Keep Initiative, Proposal controlled version, concurrency revision, decision status, validity, workflow and execution status distinct. Submission freezes the same controlled version. Material replacement never inherits authority.
- Preserve source record/basis/context and all scope members. Missing/ambiguous values are not zero; transport success is not business completion.
- Frontend evidence must be labelled sample/fixture until the live adapter and service gates are verified. Do not remove `LIVE_ADAPTER_NOT_RELEASED` or return fixtures on live errors.
- Read the issue's requirement IDs, non-goals, BDD checks and decision gates. Do not invent permission grants, connectors, AI authority or deferred scope. Ask when a required product decision is unresolved.
- Test positive and denied/error/stale/retry paths. UI changes need browser evidence at relevant widths, including open controls, scrolling and keyboard focus—not only jsdom assertions. Backend changes need service/migration/integration evidence appropriate to their scope.
- Update the delivery ledger's evidence facets honestly: frontend demonstration, backend source and connected acceptance are separate. Closing one issue never establishes all 379 requirements are complete.
