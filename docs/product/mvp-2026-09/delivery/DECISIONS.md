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

## CT-01 drafting status

**No decision in this register has been ratified by this work.** The accepted benchmark/report is not a ratification of the choices below. The original eight register rows and their recommendations above are retained as the historical draft baseline; the following questions make the required owner decisions explicit without selecting an answer.

| ID | Decision the accountable owner must record | Options / evidence to resolve (not a recommendation or default) | Minimum affected requirement IDs to trace |
| --- | --- | --- | --- |
| D-01 | Is the release target the full replacement-PRD MVP, including bounded contextual AI, or an explicitly narrower non-AI pilot? If narrower, what is the deviation and release label? | Full PRD target versus a documented, time/scope-bounded pilot deviation. In either case preserve supported manual work, AI safety invariants, and do not call a non-AI pilot full-PRD completion. The earlier CEO AI deferral remains historical evidence to reconcile, not the current answer. | AI-001, AI-005, BUILD-019, BUILD-020; FE-11, BE-09, IN-04 |
| D-02 | How is Workspace Admin represented, and which administrative actions are included? | Decide a named role, supported grants, or another explicitly bounded packaging. Administrative authority must remain separate from proposal review, pricing approval, and execution authority. | ORG-005, ORG-008, ORG-009; FE-01/08, BE-01/05 |
| D-03 | What, if any, additional Contributor collaboration grants are in the pilot? | Request-only and deny-by-default is the draft baseline. Name any extra resource/action/scope grants and their data visibility; do not infer access to all Proposals from participation. | GOV-007, COLLAB-014; FE-01/07, BE-01/06 |
| D-04 | Which representative pilot entity and pricing context are in scope, and what source, basis, unit, currency, dimensions, and effective-time evidence establish usable costs and prices? | Pilot owner and data lead must identify actual examples and resolve context with the available records. Missing or ambiguous values remain unresolved; do not choose a universal accounting basis or treat missing values as zero. | DATA-003/004/005/013/014; FE-02/04, BE-02/03, IN-03 |
| D-05 | Which bounded workflow profile applies to the pilot, including Review, ordered approvals, actor/resource/scope/limits, actual submitter, and any policy authorisation qualification? | Record the concrete profile and sequence. Policy Authorisation remains disabled unless an authorised, non-AI configuration and exact qualification are agreed; it is distinct from exception approval. | FLOW-009/013/022/023, GOV-019/027/028; FE-08, BE-05 |
| D-06 | What evidence confirms external implementation, who may record it, and how are partial, unknown, or materially variant outcomes treated? | Manual external implementation is valid. Identify acceptable evidence and confirmation responsibility for the pilot. Internal Catalog success or export alone is not proof of external implementation. | EXEC-005/006/010/011/014/030; FE-09, BE-07 |
| D-07 | Which single external business/productivity connector, if any, is selected for the validated pilot need? | Name the system and validated need, data direction, supported records, permission/failure boundary, and fallback. The PRD says at least one validated-pilot connector should be supported; additional connectors and universal bidirectional sync are not implied. Do not select a vendor without pilot evidence. | DATA-021; IN-03 |
| D-08 | Which expected Should behaviours are delivered for MVP and which are explicitly deferred, and which May capabilities are selected, deferred, or excluded? | Use the row-level inventory in [PRD dispositions](PRD_DISPOSITIONS.md). Record a reason and confirm no deferral weakens Must/Must Not, core workflow, governance, history, or mandatory safety constraints. Explicit exclusions are boundaries, not an authorised future backlog. | The exact row IDs in PRD_DISPOSITIONS.md; final reconciliation belongs to IN-04. |

### Required ratification record

For each D-01–08, the accountable decider must add a dated record containing all of:

- decision ID and status (`open`, `ratified`, or `superseded`);
- accountable decider and an authoritative ratification reference;
- accepted option, rationale, and explicit rejected/deferred alternatives where material;
- affected requirement IDs and any Must/Should/May/Not Required disposition;
- contract version and compatibility/migration implications, or an explicit statement that none apply;
- superseded decision ID and transition, if any.

Keep each earlier record in place and append a superseding record rather than rewriting history. A draft, issue state, default form value, or passing fixture test is not ratification. Do not fill the ratification fields on behalf of an authorised human.

Non-negotiable PRD invariants do not await a preference choice: tenant/field protection; actual-submitter separation; same-version submission; material replacement without inherited authority; deterministic financial logic; all-applicable Guardrail evidence; no AI decision/execution authority; authorised/actual/observed separation; no false aggregate completion.
