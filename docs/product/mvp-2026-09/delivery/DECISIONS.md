# Product and contract decision register

The report was accepted by the product owner. The decisions below still require explicit recorded dispositions where they affect contracts or permissions. An agent may draft alternatives/evidence; it must not assume administrative or pricing authority.

| ID | Decision | Recommended draft position | Ratification / affected work |
| --- | --- | --- | --- |
| D-01 | Full PRD or narrower pilot; timing of AI | Full PRD remains the target. Keep the manual journey usable; any non-AI pilot must be labelled as an explicit deviation, not full MVP completion. | Open: product owner/CEO; CT-01, FE-11, BE-09, IN-04. |
| D-02 | Workspace Admin packaging | Administrative grants distinct from pricing approval. New PRD includes Admin; earlier CEO note removed it. Decide named role versus supported grant packaging. | Open: CEO + lead engineer; CT-02, FE-01/08, BE-01/05. |
| D-03 | Contributor participation | Preserve request-only, deny-by-default access as the baseline. Permit additional scoped collaboration only by deliberate grants; do not expose all Proposals. | Open: CEO + lead engineer; FE-01/07, BE-01/06. |
| D-04 | First pilot entity/context/cost basis | Validate real representative product/SKU/service examples, dimensions, currency/time and cost basis. No arbitrary universal-accounting assumptions. | Open: pilot owner + data lead; FE-02/04, BE-02/03, IN-03. |
| D-05 | Bounded workflow and authority profile | Separate Review, required approval order/scopes/limits and actual-submitter checks. Policy authorisation disabled by default; exact qualification/configuration must be agreed. | Open: CEO + lead engineer; FE-08, BE-05. |
| D-06 | Implementation source of truth | Manual implementation is valid; agree acceptable confirmation/evidence and material variance treatment. Internal Catalog success/export alone is not external implementation. | Open: operations/pilot owner + lead engineer; FE-09, BE-07. |
| D-07 | Selected external connector | Choose from validated pilot need. Retain manual/import fallback; do not invent a portfolio of integrations. | Open: pilot owner + integration lead; IN-03. |
| D-08 | Expected/optional dispositions | Read Must/Should/May per row. Explicitly decide expected Should deferrals and optional PROP-018/FLOW-018/027/028. Excluded arbitrary automation is not a future authorised backlog. | Open: product owner; CT-01 and final IN-04 requirement disposition. |

For each decision, append: date, accountable decider, accepted option, rationale, affected requirement IDs, contract version, compatibility/migration implications and superseded decision. Never erase the older decision record. Do not treat issue creation, a default form value or a green fixture test as ratification.

Non-negotiable PRD invariants do not await a preference choice: tenant/field protection; actual-submitter separation; same-version submission; material replacement without inherited authority; deterministic financial logic; all-applicable Guardrail evidence; no AI decision/execution authority; authorised/actual/observed separation; no false aggregate completion.
