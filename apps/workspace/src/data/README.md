# Workspace data boundary

This folder is the single integration seam for the launch workspace, RPR-03,
and the governed Proposal journey. It uses
Owómidé synthetic fixture `0.0.0-design.1` and makes no live-backend claim.

```js
import {
  FIXTURE_PREVIEW_REF,
  createWorkspaceRepositories,
  findAllowedAction,
} from "./data/index.js";

const repositories = createWorkspaceRepositories({ mode: "fixture" });
const session = await repositories.identity.getSession();
const work = await repositories.workQueue.list();
const catalog = await repositories.catalog.list({ limit: 8 });
const sku = await repositories.catalog.getDetail({
  skuId: catalog.items[0].canonicalSkuId,
});
const imports = await repositories.imports.list();
const importDraft = await repositories.imports.create({
  intent: "mixed-catalog-update",
  idempotencyKey: crypto.randomUUID(),
});
const scope = await repositories.repricing.getScope();
const rule = await repositories.repricing.getRule({ ref: scope.ref });
const preview = await repositories.repricing.getPreview({
  ref: FIXTURE_PREVIEW_REF,
  classification: "all",
  limit: 13,
});

// Build filter controls from response IDs and names. Facet counts describe
// only the bounded thirteen-line diagnostic sample.
const channelOptions = preview.facets.channels;
const locationOptions = preview.facets.locations;
const resultContext = preview.filterResult;

// New Proposals cannot be created while stale-cost or dimension blockers
// remain. Each remediation persists a new Preview version; old Preview and
// Proposal evidence remains readable and unchanged.
let currentPreview = preview;
for (const line of preview.lines.filter((item) => ["stale-cost", "dimension"].includes(item.issue?.kind))) {
  const action = line.issue.kind === "stale-cost" ? "refresh-cost" : "repair-dimension";
  const result = await repositories.repricing.remediateLine({
    previewRef: currentPreview.ref,
    lineId: line.id,
    action,
    idempotencyKey: crypto.randomUUID(),
  });
  currentPreview = result.data;
}

const createAction = findAllowedAction(currentPreview.allowedActions, "proposal.create");
if (createAction?.enabled) {
  const result = await repositories.proposals.createFromPreview({
    sourcePreviewRef: currentPreview.ref,
    idempotencyKey: crypto.randomUUID(),
    title: preview.title,
  });
}

// The next slice stays on the same transport-neutral seam.
const proposal = await repositories.proposals.getDetail();
const proposalQueue = await repositories.proposals.list();
const request = await repositories.proposals.requestOverride({
  proposalRef: proposal.ref,
  idempotencyKey: crypto.randomUUID(),
});
```

The additive public seams are:

- `identity.getSession()`, `identity.signIn()`, `identity.signOut()`;
- `workQueue.list()`;
- `catalog.list()`, `catalog.getDetail({ skuId })`;
- `imports.list()`, `imports.getJourney()`, `imports.create()`, `imports.upload()`,
  `imports.profile()`, `imports.saveMapping()`, `imports.validate()`,
  `imports.acknowledgeReview()`, `imports.commit()`,
  `imports.getCommitOperation()` and `imports.reconcileCommit()`;
- `repricing.getScope()`, `repricing.createScope()`,
  `repricing.updateScope()`, `repricing.getRule()`, `repricing.saveRule()`,
  `repricing.generatePreview()`, `repricing.getPreview()` and
  `repricing.remediateLine()`;
- `proposals.list()`, `proposals.getMarginEvidence()`,
  `proposals.listComments()`, `proposals.addComment()` plus the governed
  Proposal mutations;
- `rules.list()`, `rules.getDetail({ ruleId })`;
- `audit.list()`, `audit.getEntityHistory()` plus the protected complete
  `audit.getProposalHistory()` reconstruction.

Catalog routes bind the canonical SKU UUID (`canonicalSkuId`). `merchantSku`
is the organisation-scoped external identifier and is always labelled
**Merchant SKU**. The compatibility `sku` alias remains only on the existing
RPR-03 line DTO while the approved screen migrates.

## Connection rule

Components receive a `WorkspaceRepositories` object. They never import fixture
JSON, infer permission from `session.roleCodes`, or call `fetch` directly.
Buttons read the resource's `allowedActions`; failures are handled through
`RepositoryError.envelope`.

Live mode remains fail-closed until the checked-in workspace gate is complete:
BE-001 through BE-013, plus BE-015 through BE-018. BE-014 is intentionally not
part of this approved MVP connection gate. After those issues and the OpenAPI
release gate pass, add generated live implementations of the same repository
contracts behind `createWorkspaceRepositories({ mode: "live" })`. The app
composition root can then select the implementation; feature components and
view models do not change.

Every operational list has an explicit cursor contract. The bounded Catalog
sample declares 1,248 exact authoritative records but never claims its eight
rendered fixture records exhaust that population. Small fixture directories
(Work queue, Imports, Proposals, Rules and current Audit scope) declare
`complete-page` only because their checked-in fixture collections are complete.

Import responses preserve Upload → Profile → Map → Validate → Review → Commit
→ Result in one recoverable exact-version journey object. The fixture methods
record each mutation behind the same repository seam used by a future live
adapter. Commit first returns an `unknown-outcome` operation without invented
result counts; reconciliation then returns the exact 72 attempted / 68 fixture
committed / 4 rejected / 5 remaining result. Every mutation stays labelled
`Sample data` and `authoritative: false`. Row-level explanations absent from
fixture v0 remain individually `specificationOnly`; retry/export stay disabled
with `CAPABILITY_UNAVAILABLE` until their backend contracts release.

Scope and Rule writes are likewise prepared fixture operations. Only the
checked-in Scope criteria and +3.50%, +4.25%, or NGN 25.00 Rule outcomes may be
persisted. A generated Preview carries the exact returned `scopeRef` and
`ruleRef`; unsupported values fail closed before any aggregate or price is
shown.

The current adapter carries thirteen diagnostic rows from the full 1,248-line
fixture: the original six canonical examples, all three stale-cost blockers,
both unsupported-dimension blockers, one excluded line and one unpriced line.
Its page contract therefore states `coverage: "bounded-sample"` and
`exhaustive: false`, while the population totals remain the exact FX-004
expected counts. `filterResult.authoritativePopulation.filteredCount` remains
`null`: client-side filters may report sample matches but never invent a
filtered count for the complete population.

Pricing calculations use integer minor units. Percentage prices round half-up;
percentage-margin floor prices use ceiling arithmetic, so the returned floor
is the first compliant minor unit. Policy resolution orders matching rules by
priority descending, condition count descending, then stable rule ID. Every
line records the applied rule/version/scope, complete matching chain,
explanation, engine version and fixture-only evaluation trace.

The four versioned remediations are `apply-floor`, `exclude`, `refresh-cost`
and `repair-dimension`. They require the exact current Preview ref and an
idempotency key, update the aggregate and blocker ledgers, and return a new
Preview version. A stale ref cannot mutate the successor. New Proposal
creation remains disabled until all stale-cost and dimension blockers are
cleared; only margin blockers may cross into governance for a bounded
exception. Excluded and unpriced lines remain outside the selected population.

The fixture Proposal seam uses the canonical FX-010 lineage: Proposal
`767fb699…` v3→v9, Override `7ca1b72c…` v1→v2, and Publish `3b93717c…`
v1→v4. Proposal `state` stays backend-shaped (`draft`, `blocked`, `submitted`,
`approved`); screen readiness is separate (`ready_to_submit`,
`awaiting_approval`, and `approved_to_publish`). Approval and publication are
distinct mutations. An unknown publication outcome can only be reconciled,
never retried, and the eventual safe retry carries only the four unresolved
rows with the original idempotency key.

Margin and Comments are exact-version Proposal reads. Margin evidence retains
the locked Preview ref and line population; comments are cursor-paged,
human-attributed, idempotent and cannot leak across Proposal versions. A
runtime-generated Preview receives a distinct deterministic Proposal ID and
never borrows the canonical FX-010 audit history.

Canonical seeded FX-010 predates the new creation gate but remains explicit:
its existing audit sequence records three costs refreshed, two dimension
contexts reconciled, and only then the twelve-line margin override applied.
The margin exception never silently clears operational blockers.

`identity.selectDesignEvidenceActor()` is an explicitly fixture-only evidence
harness for BDD and visual proof. It must not appear as product persona
switching, and a live identity adapter must not implement it.
