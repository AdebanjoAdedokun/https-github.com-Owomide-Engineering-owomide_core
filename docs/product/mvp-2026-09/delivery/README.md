# Delivery index

[GitHub delivery tracker](https://github.com/Owomide-Engineering/owomide_core/issues/50)

26 work items across 4 milestones. CT-01/02 are planning tasks; the remaining items are bounded domain work packages that may need smaller child tasks before coding. **Only planning is initially ready.** No live feature is marked complete.

Read [decisions](DECISIONS.md), the [CT-01 PRD disposition draft](PRD_DISPOSITIONS.md), [agent execution rules](AGENT_PLAYBOOK.md), [requirement ownership](requirements-ownership.json), the [machine-readable plan](plan.json), and the [unratified CT-02 contract draft](CT-02-contract-draft.md).

## M0 — MVP 0 — Product decisions and contracts

Ratify decision records and canonical data/state/authority contracts. Ready-for-plan is not implementation approval. No invented due date.

| Package | Priority | Initial readiness | Dependencies |
| --- | --- | --- | --- |
| [CT-01: Ratify product decisions and PRD dispositions](issues/CT-01.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/51) | P0 | ready-for-plan | None for drafting |
| [CT-02: Ratify canonical contracts and migration boundaries](issues/CT-02.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/52) | P0 | ready-for-plan | CT-01 |

## M1 — MVP 1 — Frontend journey alignment

A complete stateful, explicitly sample-backed Initiative-to-outcome journey with desktop/mobile/role/failure evidence. Not live integration.

| Package | Priority | Initial readiness | Dependencies |
| --- | --- | --- | --- |
| [FE-01: Align sample entry, setup and scoped access journeys](issues/FE-01.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/53) | P1 | blocked | CT-02 |
| [FE-02: Align entity, contextual record and import flows](issues/FE-02.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/54) | P1 | blocked | CT-02 |
| [FE-03: Add the persistent sample Initiative home and lifecycle](issues/FE-03.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/55) | P1 | blocked | FE-01, FE-02 |
| [FE-04: Build the structured pricing and analysis experience](issues/FE-04.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/56) | P1 | blocked | FE-02, FE-03 |
| [FE-05: Add named Scenarios and comparison without forced detours](issues/FE-05.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/57) | P1 | blocked | FE-04 |
| [FE-06: Correct controlled Proposal versions, states and revision UI](issues/FE-06.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/58) | P0 | blocked | FE-03, FE-04 |
| [FE-07: Add contextual collaboration, Evidence and separate Review](issues/FE-07.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/59) | P1 | blocked | FE-03, FE-06 |
| [FE-08: Align bounded approval, authority and policy configuration](issues/FE-08.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/60) | P0 | blocked | FE-06, FE-07 |
| [FE-09: Complete sample handoff, implementation and monitoring flow](issues/FE-09.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/61) | P1 | blocked | FE-08 |
| [FE-10: Unify history, personal work and notification surfaces](issues/FE-10.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/62) | P1 | blocked | FE-03, FE-07, FE-09 |
| [FE-11: Align contextual AI interaction and honest unavailable states](issues/FE-11.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/63) | P1 | blocked | FE-04, FE-07, FE-10 |

## M2 — MVP 2 — Backend product foundations

Persist and enforce agreed contracts, permissions, calculations, controlled decisions, actual outcomes and history. Can proceed by domain once contracts are accepted.

| Package | Priority | Initial readiness | Dependencies |
| --- | --- | --- | --- |
| [BE-01: Implement authoritative membership and permission boundaries](issues/BE-01.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/64) | P0 | blocked | CT-02 |
| [BE-02: Resolve contextual economic records and complete import scope](issues/BE-02.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/65) | P0 | blocked | CT-02, BE-01 |
| [BE-03: Correct deterministic pricing and all-Guardrail evaluation](issues/BE-03.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/66) | P0 | blocked | CT-02, BE-02 |
| [BE-04: Persist Initiatives, Builder definitions and Scenarios](issues/BE-04.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/67) | P1 | blocked | CT-02, BE-01, BE-03 |
| [BE-05: Persist controlled Proposals and bounded decision workflows](issues/BE-05.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/68) | P0 | blocked | CT-02, BE-01, BE-03, BE-04 |
| [BE-06: Persist collaboration and complete historical read models](issues/BE-06.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/69) | P1 | blocked | BE-01, BE-04, BE-05 |
| [BE-07: Make execution, exports and partial outcomes truthful](issues/BE-07.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/70) | P0 | blocked | BE-01, BE-02, BE-05 |
| [BE-08: Implement durable notifications and canonical work projections](issues/BE-08.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/71) | P1 | blocked | BE-01, BE-04, BE-05, BE-06, BE-07 |
| [BE-09: Implement grounded contextual AI with explicit human application](issues/BE-09.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/72) | P1 | blocked | BE-01, BE-03, BE-04, BE-05, BE-06 |

## M3 — MVP 3 — Connected pilot and release proof

Reviewed live adapters, selected pilot integration and multi-user release evidence. No fixture fallback; all mandatory dispositions and release gates reconciled.

| Package | Priority | Initial readiness | Dependencies |
| --- | --- | --- | --- |
| [IN-01: Connect entry, data and Initiative-building adapters](issues/IN-01.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/73) | P1 | blocked | FE-01, FE-02, FE-03, FE-04, FE-05, BE-01, BE-02, BE-03, BE-04 |
| [IN-02: Connect decisions, execution, history, attention and AI](issues/IN-02.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/74) | P1 | blocked | IN-01, FE-06, FE-07, FE-08, FE-09, FE-10, FE-11, BE-05, BE-06, BE-07, BE-08, BE-09 |
| [IN-03: Deliver one validated pilot external integration](issues/IN-03.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/75) | P1 | blocked | CT-01, BE-02, BE-07, IN-01 |
| [IN-04: Prove the connected pilot and reconcile all requirement facets](issues/IN-04.md) · [GitHub](https://github.com/Owomide-Engineering/owomide_core/issues/76) | P0 | blocked | IN-01, IN-02, IN-03 |

## Completion rules

Every one of 379 requirements has frontend/backend/integration evidence owners plus final disposition in IN-04. This is ownership coverage, not a percentage complete. An issue can be implemented in one or more reviewed child PRs; it closes only when its own facet criteria and required evidence are met. Full-stack release requires explicit decisions and actual connected proof.

No GitHub Project board is assumed: issues/milestones carry the plan even when Projects permission is unavailable. See `github.json` for actual publication status.
