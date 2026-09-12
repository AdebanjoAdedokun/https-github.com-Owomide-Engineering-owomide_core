# MVP delivery hub

**Accepted product benchmark · September 2026**

This is the shared reference for product decisions, implementation prioritisation and agent work. The owner accepted the thorough PRD benchmark; acceptance of the findings does not silently settle the open role/AI/pilot choices or mean that the features are implemented.

## Start here

1. [Executive benchmark](audit/MVP_PRD_BENCHMARK.md): what exists, conflicts and remains missing.
2. [All 379 requirement assessments](audit/REQUIREMENTS_MATRIX.md), with [full wording and evidence in JSON](audit/REQUIREMENTS_MATRIX.json).
3. [Delivery board and work-package index](delivery/README.md): priorities, dependencies, dispatch rules and GitHub links.
4. [Decision register](delivery/DECISIONS.md): unresolved choices that agents must not invent.
5. [Agent execution contract](delivery/AGENT_PLAYBOOK.md): how to claim, implement, verify and hand off one task.
6. [Development sequence and 40 future BDD scenarios](audit/DEVELOPMENT_BACKLOG.md).
7. [Current visual journey review](audit/UI_FLOW_AUDIT.md) and [repository baseline](audit/REPOSITORY_BASELINE.md).
8. [Original company PRD](source/prototype-prd.pdf), [foundation/lifecycle text](source/foundation-and-scope.txt) and [source hash](source/manifest.json).
9. [Published checkpoint and verification](delivery/CHECKPOINT.md): what was pushed, tested and left outstanding.

## Current truth

- The checkpoint preserves local frontend improvements, fixtures, tests and historical polish evidence.
- The reviewed frontend is still a sample-backed demonstration. Live mode remains deliberately unavailable.
- The accepted target is Initiative → context → Builder/analysis → optional Scenario selection → controlled Proposal → organisational decision → implementation → monitoring/history.
- Direct Builder → Proposal is valid. Scenario support must exist, but a user does not need to manufacture a Scenario for every decision.
- Backend foundations are real source work, but connecting the existing UI alone will not close model, permission, calculation or execution gaps.
- Fresh checkpoint verification: **358 tests passed** (marketing 6 + workspace 352) and both frontend builds passed. The audit's selected backend suites passed 98 tests. These are not full deployed integration proof.

## How work is organised

| Location | Purpose |
| --- | --- |
| `audit/` | Dated accepted evidence. Preserve the findings; record later implementation evidence in delivery rather than retroactively claiming the baseline was complete. |
| `source/` | Exact supplied PRD bytes/hash and foundational text, kept in this private company repository. |
| `delivery/plan.json` | Stable work-package IDs, owners-by-track, dependencies, editable boundaries and BDD acceptance. |
| `delivery/requirements-ownership.json` | Every numbered requirement mapped to frontend/backend/integration evidence owners. Optional/excluded rows require disposition, not invented feature work. |
| `delivery/issues/` | Portable agent-readable work-package briefs, suitable for GitHub Issues. |
| `delivery/github.json` | Published issue/milestone URLs and IDs; never treat an issue being opened as implementation completion. |
| `delivery/AGENT_PLAYBOOK.md` | Claim/branch/test/review discipline and evidence templates. |

GitHub Issues and milestones track delivery. A Project board is optional coordination UI; its absence does not remove dependencies or release gates. Only authorised users should grant any missing Projects permission.

The older `BUILD_PLAN.md`, `ARCHITECTURE.md`, root/service `CLAUDE.md` and app-local polish reports remain useful implementation history. Where their product semantics differ, use this accepted PRD target and resolve the contract migration explicitly. Preserve their engineering safety conventions and service ownership.
