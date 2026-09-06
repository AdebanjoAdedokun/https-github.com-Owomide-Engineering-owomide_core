/** @import {AllowedAction, DataProvenance, PopulationCounts, ProposalHandoff, RepricingLine, ResourceRef, WorkspaceSession} from "../contracts.js" */

import {
  MARGIN_POLICY_SCOPE_PRIORITIES,
  applyPriceAdjustment,
  calculateMarginBasisPoints,
  evaluateMarginPolicy,
  explainUnevaluatedPolicy,
} from "../pricingEngine.js";

export const FIXTURE_ID = "owomide-synthetic-design-v0";
export const FIXTURE_VERSION = "0.0.0-design.1";
export const FIXTURE_SCENARIO_ID = "FX-004";
export const FIXTURE_VERSIONED_REPRICING_ID = "df79d27f-e87d-58ba-9167-87ced18c72b5";

/** @type {ResourceRef} */
export const FIXTURE_PREVIEW_REF = Object.freeze({
  kind: "fixture-scenario",
  id: FIXTURE_SCENARIO_ID,
  version: FIXTURE_VERSION,
});

/** @type {DataProvenance} */
export const FIXTURE_PROVENANCE = Object.freeze({
  truthClass: "DEMO_ONLY",
  adapter: "fixture-memory",
  fixtureId: FIXTURE_ID,
  fixtureVersion: FIXTURE_VERSION,
  contractCompatibilityClaimed: false,
});

/** @type {WorkspaceSession} */
export const FIXTURE_SESSION = Object.freeze({
  ref: Object.freeze({
    kind: "fixture-scenario",
    id: "e8d32c42-52e3-50bb-a7d9-03abad606dde",
    version: FIXTURE_VERSION,
  }),
  actor: Object.freeze({
    id: "e8d32c42-52e3-50bb-a7d9-03abad606dde",
    displayName: "Teni · Sample Operator",
  }),
  organisation: Object.freeze({
    id: "bae92486-dbed-53f2-b27a-104f75a71be7",
    name: "Owómidé Fixture Distribution · Sample",
    timezone: "Africa/Lagos",
    baseCurrency: "NGN",
  }),
  // Bounded role baseline from ROLE_PERMISSION_MODEL.md. These are fixture
  // context labels, never a client-side authorization calculation.
  roleCodes: Object.freeze(["pricing_analyst", "import_admin"]),
  effectiveCapabilities: Object.freeze([
    "catalog:read",
    "import:prepare",
    "repricing:prepare",
    "proposal:create",
    "proposal:submit",
    "rules:read",
  ]),
  capabilityVersion: `fixture:${FIXTURE_VERSION}`,
  dataLabel: "Sample data",
  provenance: FIXTURE_PROVENANCE,
});

/** @type {PopulationCounts} */
export const FIXTURE_COUNTS = Object.freeze({
  requested: 1248,
  matched: 1248,
  priced: 1239,
  selected: 1227,
  eligible: 1210,
  blocked: 17,
  excluded: 12,
  unpriced: 9,
  total: 1248,
});

export const FIXTURE_PREVIEW_BLOCKERS = Object.freeze({
  total: 17,
  margin: 12,
  staleCost: 3,
  dimension: 2,
});

/**
 * The fixture only permits generation for checked-in aggregate outcomes. This
 * prevents the bounded thirteen-line diagnostic sample from masquerading as a
 * recalculation of the complete 1,248-line population.
 */
export const FIXTURE_PREPARED_REPRICING_OUTCOMES = Object.freeze({
  "percentage-change:350": Object.freeze({
    label: "+3.50%",
    rule: Object.freeze({ type: "percentage-change", changeBasisPoints: 350, absoluteChange: null, currency: "NGN", rounding: "integer-minor-unit-half-up" }),
    counts: FIXTURE_COUNTS,
  }),
  "percentage-change:425": Object.freeze({
    label: "+4.25%",
    rule: Object.freeze({ type: "percentage-change", changeBasisPoints: 425, absoluteChange: null, currency: "NGN", rounding: "integer-minor-unit-half-up" }),
    counts: Object.freeze({ requested: 1248, matched: 1248, priced: 1239, selected: 1227, eligible: 1215, blocked: 12, excluded: 12, unpriced: 9, total: 1248 }),
  }),
  "absolute-change:2500": Object.freeze({
    label: "+NGN 25.00",
    rule: Object.freeze({ type: "absolute-change", changeBasisPoints: null, absoluteChange: Object.freeze({ amountMinor: "2500", currency: "NGN" }), currency: "NGN", rounding: "integer-minor-unit-half-up" }),
    counts: Object.freeze({ requested: 1248, matched: 1248, priced: 1239, selected: 1227, eligible: 1210, blocked: 17, excluded: 12, unpriced: 9, total: 1248 }),
  }),
});

/** @param {{type: string, changeBasisPoints?: number | null, absoluteChange?: {amountMinor?: string} | null}} rule */
export function preparedFixtureRepricingOutcome(rule) {
  const key = rule?.type === "percentage-change"
    ? `percentage-change:${rule.changeBasisPoints}`
    : rule?.type === "absolute-change"
      ? `absolute-change:${rule.absoluteChange?.amountMinor ?? ""}`
      : "";
  return FIXTURE_PREPARED_REPRICING_OUTCOMES[key] ?? null;
}

/** @type {AllowedAction[]} */
export const FIXTURE_PREVIEW_ACTIONS = Object.freeze([
  Object.freeze({
    code: "repricing.preview.read",
    enabled: true,
    reason: null,
    requiredVersion: FIXTURE_VERSION,
    confirmation: null,
    decision: null,
  }),
  Object.freeze({
    code: "proposal.create",
    enabled: true,
    reason: null,
    requiredVersion: FIXTURE_VERSION,
    confirmation: Object.freeze({
      title: "Create blocked Proposal",
      body: "Carry all 1,227 selected lines into governance with all 17 issues preserved.",
      confirmLabel: "Create blocked Proposal",
      consequenceCode: "PROPOSAL_CREATED_BLOCKED",
    }),
    decision: null,
  }),
  Object.freeze({
    code: "proposal.read",
    enabled: true,
    reason: null,
    requiredVersion: "3",
    confirmation: null,
    decision: null,
    targetRef: null,
  }),
  Object.freeze({
    code: "repricing.preview.export",
    enabled: false,
    reason: Object.freeze({
      code: "CAPABILITY_UNAVAILABLE",
      message: "Export is not available in the design fixture or current backend boundary.",
    }),
    requiredVersion: FIXTURE_VERSION,
    confirmation: null,
    decision: null,
  }),
]);

const PANTRY_CATEGORY_ID = "c886c96d-18d7-51b6-8290-c3f1962b8ede";
const BEVERAGE_CATEGORY_ID = "c579fc8c-474f-54c3-a5a6-142694e76544";
const IMPORT_ID = "71345dfe-ce8f-57e0-9549-76774f919cf9";
const IMPORTED_AT = "2026-08-01T09:30:00+01:00";
const EFFECTIVE_AT = "2026-08-15T00:00:00+01:00";

const CATEGORIES = Object.freeze({
  pantry: Object.freeze({ id: PANTRY_CATEGORY_ID, name: "Pantry & staples" }),
  beverages: Object.freeze({ id: BEVERAGE_CATEGORY_ID, name: "Beverages" }),
  household: Object.freeze({ id: "48ad4694-1a38-5438-9413-67360c8d5f05", name: "Household care" }),
});

const CHANNELS = Object.freeze({
  wholesale: Object.freeze({ id: "968b2614-ffcc-514d-8b42-3d1500f3b28c", name: "Wholesale accounts" }),
  retailWeb: Object.freeze({ id: "a888c061-f02d-5dc4-b21b-7075367ca4ac", name: "Retail web" }),
  keyAccounts: Object.freeze({ id: "4eb5c830-f8ff-5638-8f4d-9d114bb753b2", name: "Key accounts" }),
  marketplace: Object.freeze({ id: "ef646702-a7c2-5a1b-bd32-9f478a9819b9", name: "Marketplace" }),
});

const LOCATIONS = Object.freeze({
  lagos: Object.freeze({ id: "d80eaca3-aed1-5fd7-bc61-299f92c57db5", name: "Lagos distribution centre" }),
  abuja: Object.freeze({ id: "8ac88886-b971-55e8-bc09-00d5fc4d0fac", name: "Abuja fulfilment hub" }),
  ibadan: Object.freeze({ id: "dd7903e1-7ab5-5cbf-83fb-e047b222801a", name: "Ibadan cross-dock" }),
});

const STALE_COST_SKU_ID = "a1eb8c8e-1553-50d4-b8e3-93b02c222201";

/**
 * A bounded rule set shaped like the backend evaluator contract. Priorities
 * are the documented Margin mapping: SKU 300, channel 200, category 100 and
 * organisation 0. The browser fixture evaluates these rules only to produce
 * deterministic Sample-data evidence.
 */
export const FIXTURE_MARGIN_POLICIES = Object.freeze([
  Object.freeze({
    id: "2b8139c4-f22f-5574-8b09-8491f0cdc36f",
    code: "GROUNDNUT_OIL",
    version: "7",
    name: "Groundnut oil SKU floor",
    scope: "sku",
    priority: MARGIN_POLICY_SCOPE_PRIORITIES.sku,
    conditions: Object.freeze({ skuId: STALE_COST_SKU_ID }),
    floor: Object.freeze({ type: "percentage-margin", basisPoints: 1500, currency: "NGN" }),
  }),
  Object.freeze({
    id: BEVERAGE_CATEGORY_ID,
    code: "KEY_ACCOUNT_BEVERAGES",
    version: "4",
    name: "Key-account beverages floor",
    scope: "channel",
    priority: MARGIN_POLICY_SCOPE_PRIORITIES.channel,
    conditions: Object.freeze({ channelId: CHANNELS.keyAccounts.id, categoryId: BEVERAGE_CATEGORY_ID }),
    floor: Object.freeze({ type: "percentage-margin", basisPoints: 1600, currency: "NGN" }),
  }),
  Object.freeze({
    id: PANTRY_CATEGORY_ID,
    code: "PANTRY",
    version: "12",
    name: "Pantry & staples floor",
    scope: "category",
    priority: MARGIN_POLICY_SCOPE_PRIORITIES.category,
    conditions: Object.freeze({ categoryId: PANTRY_CATEGORY_ID }),
    floor: Object.freeze({ type: "percentage-margin", basisPoints: 1400, currency: "NGN" }),
  }),
  Object.freeze({
    id: CATEGORIES.household.id,
    code: "HOUSEHOLD",
    version: "6",
    name: "Household care floor",
    scope: "category",
    priority: MARGIN_POLICY_SCOPE_PRIORITIES.category,
    conditions: Object.freeze({ categoryId: CATEGORIES.household.id }),
    floor: Object.freeze({ type: "percentage-margin", basisPoints: 1800, currency: "NGN" }),
  }),
  Object.freeze({
    id: "084f8a1e-ef78-57aa-b09b-32ed7bdc0314",
    code: "ORGANISATION_MINIMUM",
    version: "9",
    name: "Organisation minimum margin",
    scope: "organisation",
    priority: MARGIN_POLICY_SCOPE_PRIORITIES.organisation,
    conditions: Object.freeze({}),
    floor: Object.freeze({ type: "percentage-margin", basisPoints: 1200, currency: "NGN" }),
  }),
]);

/** @param {string} amountMinor */
const ngn = (amountMinor) => Object.freeze({ amountMinor, currency: "NGN" });

/**
 * @param {Object} input
 * @param {string} input.id
 * @param {string} input.sku
 * @param {string} input.name
 * @param {string} input.variant
 * @param {{id: string, name: string}} input.channel
 * @param {{id: string, name: string}} input.location
 * @param {{id: string, name: string} | null} input.category
 * @param {string | null} input.cost
 * @param {"current" | "stale" | "missing"} [input.costState]
 * @param {string | null} input.current
 * @param {string | null} input.proposed
 * @param {string | null} input.delta
 * @param {number | null} input.currentMargin
 * @param {number | null} input.proposedMargin
 * @param {number | null} input.floor
 * @param {string | null} input.floorPrice
 * @param {"eligible" | "blocked" | "excluded" | "unpriced"} input.classification
 * @param {boolean} [input.selected]
 * @param {boolean} [input.dimensionsValid]
 * @param {{code: string, reason: string} | null} [input.exclusion]
 * @param {{refreshedCost?: {amountMinor: string, currency: string}, repairedFacts?: Record<string, unknown>} | null} [input.remediationInputs]
 * @param {number} input.rowNumber
 * @param {string} input.version
 * @returns {RepricingLine}
 */
function line(input) {
  const currentCost = input.cost == null ? null : ngn(input.cost);
  const currentPrice = input.current == null ? null : ngn(input.current);
  const proposedPrice = input.proposed == null ? null : ngn(input.proposed);
  const absoluteDelta = input.delta == null ? null : ngn(input.delta);
  const selected = input.selected ?? ["eligible", "blocked"].includes(input.classification);
  const facts = Object.freeze({
    skuId: input.id,
    channelId: input.channel.id,
    categoryId: input.category?.id ?? null,
    currency: proposedPrice?.currency ?? currentPrice?.currency ?? currentCost?.currency ?? null,
  });
  let outcome;
  if (input.classification === "excluded") {
    const policy = explainUnevaluatedPolicy({ rules: FIXTURE_MARGIN_POLICIES, facts, reason: "This line was explicitly excluded before margin evaluation." });
    const issue = Object.freeze({ kind: "excluded", code: input.exclusion?.code ?? "EXPLICITLY_EXCLUDED", message: input.exclusion?.reason ?? "Excluded from this repricing scope.", persistent: false, allowedRemediations: Object.freeze([]) });
    outcome = { policy, issue, allowedRemediations: [], proposedMarginBasisPoints: input.proposedMargin };
  } else if (input.classification === "unpriced") {
    const policy = explainUnevaluatedPolicy({ rules: FIXTURE_MARGIN_POLICIES, facts, reason: "No current price exists, so no proposed price or margin decision was produced." });
    const issue = Object.freeze({ kind: "unpriced", code: "CURRENT_PRICE_MISSING", message: "No approved current price exists for this context.", persistent: true, allowedRemediations: Object.freeze([]) });
    outcome = { policy, issue, allowedRemediations: [], proposedMarginBasisPoints: null };
  } else {
    outcome = evaluateMarginPolicy({
      proposedPrice,
      currentCost,
      costState: input.costState ?? (currentCost ? "current" : "missing"),
      dimensionsValid: input.dimensionsValid ?? true,
      rules: FIXTURE_MARGIN_POLICIES,
      facts,
    });
    if (outcome.classification !== input.classification) {
      throw new TypeError(`Fixture line ${input.sku} classification disagrees with deterministic policy evaluation.`);
    }
    if (input.floor != null && outcome.floorBasisPoints !== input.floor) {
      throw new TypeError(`Fixture line ${input.sku} floor basis points drifted from canonical evidence.`);
    }
    if (input.floorPrice != null && outcome.floorPrice?.amountMinor !== input.floorPrice) {
      throw new TypeError(`Fixture line ${input.sku} floor price drifted from canonical evidence.`);
    }
    if (input.proposedMargin != null && outcome.proposedMarginBasisPoints !== input.proposedMargin) {
      throw new TypeError(`Fixture line ${input.sku} proposed margin drifted from canonical evidence.`);
    }
  }
  return Object.freeze({
    id: input.id,
    canonicalSkuId: input.id,
    merchantSku: input.sku,
    merchantSkuScope: Object.freeze({
      organisationId: FIXTURE_SESSION.organisation.id,
      label: "Merchant SKU",
    }),
    // Kept during the prototype migration so the already-approved Preview can
    // consume the richer identifier model without a flag-day component edit.
    sku: input.sku,
    product: Object.freeze({ name: input.name, variant: input.variant }),
    category: input.category,
    scope: Object.freeze({ channel: input.channel, location: input.location }),
    facts,
    currentCost,
    costState: input.costState ?? (currentCost ? "current" : "missing"),
    currentPrice,
    proposedPrice,
    absoluteDelta,
    currentMarginBasisPoints: input.currentMargin,
    proposedMarginBasisPoints: outcome.proposedMarginBasisPoints,
    classification: input.classification,
    selected,
    effectiveAt: EFFECTIVE_AT,
    issue: outcome.issue,
    allowedRemediations: Object.freeze([...outcome.allowedRemediations]),
    exclusion: input.exclusion ?? null,
    remediationInputs: input.remediationInputs ?? null,
    remediationEvidence: null,
    policy: Object.freeze(outcome.policy ?? {
      floorBasisPoints: outcome.floorBasisPoints,
      floorPrice: outcome.floorPrice,
      scope: outcome.scope,
      sourceId: outcome.sourceId,
      result: outcome.result,
      violation: outcome.violation,
      evaluation: outcome.evaluation,
    }),
    provenance: Object.freeze({
      type: "import",
      importId: IMPORT_ID,
      fileName: "owomide-fixture-catalog-baseline.csv",
      importedAt: IMPORTED_AT,
      rowNumber: input.rowNumber,
      catalogVersion: input.version,
    }),
  });
}

/**
 * The checked-in fixture contains all 1,248 lines. This lightweight browser
 * adapter intentionally carries thirteen bounded evidence rows: the original
 * six design rows plus every non-margin blocker and one excluded/unpriced
 * example. It never represents the complete 1,248-line population.
 *
 * @type {RepricingLine[]}
 */
export const FIXTURE_REPRICING_LINES = Object.freeze([
  line({
    id: "480f12f1-c0fa-528e-b3d0-27e340e93046",
    sku: "KLD-PANT-0032",
    name: "Cassava flour",
    variant: "Select, 1 kg",
    category: CATEGORIES.pantry,
    channel: CHANNELS.marketplace,
    location: LOCATIONS.ibadan,
    cost: "151550",
    current: "161250",
    proposed: "166894",
    delta: "5644",
    currentMargin: 601,
    proposedMargin: 919,
    floor: 1400,
    floorPrice: "176221",
    floorScope: "global",
    floorSourceId: PANTRY_CATEGORY_ID,
    classification: "blocked",
    rowNumber: 33,
    version: "1031",
  }),
  line({
    id: "3576e827-02d1-5898-ac6d-93790e8066f7",
    sku: "KLD-PANT-0099",
    name: "Seasoning mix",
    variant: "Classic, 5 kg",
    category: CATEGORIES.pantry,
    channel: CHANNELS.keyAccounts,
    location: LOCATIONS.abuja,
    cost: "45100",
    current: "48000",
    proposed: "49680",
    delta: "1680",
    currentMargin: 604,
    proposedMargin: 921,
    floor: 1400,
    floorPrice: "52442",
    floorScope: "global",
    floorSourceId: PANTRY_CATEGORY_ID,
    classification: "blocked",
    rowNumber: 100,
    version: "1098",
  }),
  line({
    id: "7ea3fa4b-51f3-5263-b335-5dfa0c58522a",
    sku: "KLD-BEVE-0166",
    name: "Malt drink",
    variant: "Family, 330 ml",
    category: CATEGORIES.beverages,
    channel: CHANNELS.keyAccounts,
    location: LOCATIONS.abuja,
    cost: "74350",
    current: "80850",
    proposed: "83680",
    delta: "2830",
    currentMargin: 803,
    proposedMargin: 1114,
    floor: 1600,
    floorPrice: "88512",
    floorScope: "channel",
    floorSourceId: BEVERAGE_CATEGORY_ID,
    classification: "blocked",
    rowNumber: 167,
    version: "1165",
  }),
  line({
    id: "e8005ff3-180d-52fa-bbcd-b70bd125f520",
    sku: "KLD-PANT-0001",
    name: "Long-grain rice",
    variant: "Classic, 500 g",
    category: CATEGORIES.pantry,
    channel: CHANNELS.wholesale,
    location: LOCATIONS.lagos,
    cost: "45000",
    current: "58450",
    proposed: "60496",
    delta: "2046",
    currentMargin: 2301,
    proposedMargin: 2561,
    floor: 1400,
    floorPrice: "52326",
    floorScope: "global",
    floorSourceId: PANTRY_CATEGORY_ID,
    classification: "eligible",
    rowNumber: 2,
    version: "1000",
  }),
  line({
    id: "4a5b5536-78ed-53c2-8146-bcb455a60f72",
    sku: "KLD-PANT-0002",
    name: "Long-grain rice",
    variant: "Classic, 1 kg",
    category: CATEGORIES.pantry,
    channel: CHANNELS.retailWeb,
    location: LOCATIONS.ibadan,
    cost: "54750",
    current: "71450",
    proposed: "73951",
    delta: "2501",
    currentMargin: 2337,
    proposedMargin: 2596,
    floor: 1400,
    floorPrice: "63663",
    floorScope: "global",
    floorSourceId: PANTRY_CATEGORY_ID,
    classification: "eligible",
    rowNumber: 3,
    version: "1001",
  }),
  line({
    id: "42b1d647-9e4a-5e96-ad66-dd71da50365a",
    sku: "KLD-PANT-0003",
    name: "Long-grain rice",
    variant: "Classic, 5 kg",
    category: CATEGORIES.pantry,
    channel: CHANNELS.keyAccounts,
    location: LOCATIONS.abuja,
    cost: "64450",
    current: "84550",
    proposed: "87509",
    delta: "2959",
    currentMargin: 2377,
    proposedMargin: 2635,
    floor: 1400,
    floorPrice: "74942",
    floorScope: "global",
    floorSourceId: PANTRY_CATEGORY_ID,
    classification: "eligible",
    rowNumber: 4,
    version: "1002",
  }),
  line({
    id: STALE_COST_SKU_ID,
    sku: "KLD-PANT-0118",
    name: "Groundnut oil",
    variant: "Classic, 1 L",
    category: CATEGORIES.pantry,
    channel: CHANNELS.retailWeb,
    location: LOCATIONS.lagos,
    cost: "78000",
    costState: "stale",
    current: "100000",
    proposed: "103500",
    delta: "3500",
    currentMargin: 2200,
    proposedMargin: null,
    floor: null,
    floorPrice: null,
    classification: "blocked",
    remediationInputs: { refreshedCost: ngn("76000") },
    rowNumber: 119,
    version: "1117",
  }),
  line({
    id: "2d125eb0-1785-5eaf-9626-07c9370b2202",
    sku: "KLD-PANT-0127",
    name: "Palm oil",
    variant: "Family, 2 L",
    category: CATEGORIES.pantry,
    channel: CHANNELS.wholesale,
    location: LOCATIONS.ibadan,
    cost: "120000",
    costState: "stale",
    current: "145000",
    proposed: "150075",
    delta: "5075",
    currentMargin: 1724,
    proposedMargin: null,
    floor: null,
    floorPrice: null,
    classification: "blocked",
    remediationInputs: { refreshedCost: ngn("118000") },
    rowNumber: 128,
    version: "1126",
  }),
  line({
    id: "ccdc8aa9-4334-594f-981b-c0289f0d2203",
    sku: "KLD-PANT-0142",
    name: "Millet flour",
    variant: "Select, 5 kg",
    category: CATEGORIES.pantry,
    channel: CHANNELS.marketplace,
    location: LOCATIONS.abuja,
    cost: "90000",
    costState: "stale",
    current: "110000",
    proposed: "113850",
    delta: "3850",
    currentMargin: 1818,
    proposedMargin: null,
    floor: null,
    floorPrice: null,
    classification: "blocked",
    remediationInputs: { refreshedCost: ngn("88000") },
    rowNumber: 143,
    version: "1141",
  }),
  line({
    id: "69234810-8db9-5cb7-8fa1-75b58b772204",
    sku: "KLD-HOME-0204",
    name: "Laundry detergent",
    variant: "Fresh, 2 kg",
    category: null,
    channel: CHANNELS.marketplace,
    location: LOCATIONS.lagos,
    cost: "125000",
    current: "160000",
    proposed: "165600",
    delta: "5600",
    currentMargin: 2187,
    proposedMargin: null,
    floor: null,
    floorPrice: null,
    classification: "blocked",
    dimensionsValid: false,
    remediationInputs: { repairedFacts: { categoryId: CATEGORIES.household.id } },
    rowNumber: 205,
    version: "1203",
  }),
  line({
    id: "3b0619c1-8ed9-56ec-a8dc-21e3a3752205",
    sku: "KLD-PANT-0220",
    name: "Breakfast cereal",
    variant: "Family, 750 g",
    category: null,
    channel: CHANNELS.retailWeb,
    location: LOCATIONS.abuja,
    cost: "90000",
    current: "125000",
    proposed: "129375",
    delta: "4375",
    currentMargin: 2800,
    proposedMargin: null,
    floor: null,
    floorPrice: null,
    classification: "blocked",
    dimensionsValid: false,
    remediationInputs: { repairedFacts: { categoryId: PANTRY_CATEGORY_ID } },
    rowNumber: 221,
    version: "1219",
  }),
  line({
    id: "3a1de8ca-ac6d-5094-9ef1-3a6cc5e0c989",
    sku: "KLD-PANT-0054",
    name: "Maize meal",
    variant: "Value, 5 kg",
    category: CATEGORIES.pantry,
    channel: CHANNELS.retailWeb,
    location: LOCATIONS.abuja,
    cost: "71850",
    current: "100650",
    proposed: "104173",
    delta: "3523",
    currentMargin: 2861,
    proposedMargin: 3102,
    floor: 1400,
    floorPrice: "83547",
    classification: "excluded",
    selected: false,
    exclusion: { code: "EXPLICITLY_EXCLUDED", reason: "Supplier hold excludes this SKU from the August release." },
    rowNumber: 55,
    version: "1053",
  }),
  line({
    id: "c295e2c9-3fda-5d45-9128-7ff517f724ce",
    sku: "KLD-PANT-0018",
    name: "Brown beans",
    variant: "Value, 5 kg",
    category: CATEGORIES.pantry,
    channel: CHANNELS.retailWeb,
    location: LOCATIONS.abuja,
    cost: "112850",
    current: null,
    proposed: null,
    delta: null,
    currentMargin: null,
    proposedMargin: null,
    floor: 1400,
    floorPrice: null,
    classification: "unpriced",
    selected: false,
    rowNumber: 19,
    version: "1017",
  }),
]);

/**
 * Recalculate the bounded RPR-03 design rows from a persisted rule without
 * changing their source cost, current price, policy floor or provenance.
 * Aggregate population counts remain the checked-in fixture evidence; this
 * helper is deliberately scoped to the six visible rows and never claims a
 * live or authoritative recalculation.
 *
 * @param {{type: "percentage-change" | "absolute-change", changeBasisPoints: number | null, absoluteChange: {amountMinor: string, currency: string} | null, currency: string, rounding: string}} rule
 * @param {string} effectiveAt
 * @returns {RepricingLine[]}
 */
export function materialiseFixtureRepricingLines(rule, effectiveAt) {
  return FIXTURE_REPRICING_LINES.map((source) => {
    if (!source.currentPrice) return { ...source, effectiveAt };
    const adjusted = applyPriceAdjustment(source.currentPrice, rule);
    if (source.classification === "excluded") {
      return {
        ...source,
        ...adjusted,
        effectiveAt,
        policy: explainUnevaluatedPolicy({
          rules: FIXTURE_MARGIN_POLICIES,
          facts: source.facts,
          reason: "This line was explicitly excluded before margin evaluation.",
        }),
      };
    }
    const outcome = evaluateMarginPolicy({
      proposedPrice: adjusted.proposedPrice,
      currentCost: source.currentCost,
      costState: source.costState,
      dimensionsValid: source.issue?.code !== "DIMENSION_UNSUPPORTED",
      rules: FIXTURE_MARGIN_POLICIES,
      facts: source.facts,
    });
    return {
      ...source,
      ...adjusted,
      proposedMarginBasisPoints: outcome.proposedMarginBasisPoints,
      classification: outcome.classification,
      issue: outcome.issue,
      allowedRemediations: outcome.allowedRemediations,
      effectiveAt,
      policy: {
        floorBasisPoints: outcome.floorBasisPoints,
        floorPrice: outcome.floorPrice,
        scope: outcome.scope,
        sourceId: outcome.sourceId,
        result: outcome.result,
        violation: outcome.violation,
        evaluation: outcome.evaluation,
      },
    };
  });
}

/** @type {ProposalHandoff} */
export const FIXTURE_PROPOSAL_HANDOFF = Object.freeze({
  kind: "proposal-handoff",
  ref: Object.freeze({
    kind: "resource",
    id: "767fb699-bfb5-56eb-a296-3a0a70c9430a",
    // FX-010 carries the canonical governed Proposal from blocked v3 through
    // approved v9. Creation hands off the first screen-ready blocked version.
    version: "3",
  }),
  title: "August cost recovery",
  state: "blocked",
  sourcePreviewRef: FIXTURE_PREVIEW_REF,
  createdAt: null,
  effectiveAt: EFFECTIVE_AT,
  author: FIXTURE_SESSION.actor,
  counts: Object.freeze({ selected: 1227, eligible: 1210, blocked: 17 }),
  allowedActions: Object.freeze([
    Object.freeze({
      code: "proposal.read",
      enabled: true,
      reason: null,
      requiredVersion: "3",
      confirmation: null,
      decision: null,
    }),
    Object.freeze({
      code: "override.request",
      enabled: true,
      reason: null,
      requiredVersion: "3",
      confirmation: Object.freeze({
        title: "Request an exception",
        body: "The request remains blocked until a different authorised actor decides it.",
        confirmLabel: "Create exception request",
        consequenceCode: "DIFFERENT_ACTOR_REVIEW_REQUIRED",
      }),
      decision: null,
    }),
    Object.freeze({
      code: "proposal.submit",
      enabled: false,
      reason: Object.freeze({
        code: "WRONG_STATE",
        message: "Resolve or authorise all 17 blockers before submission.",
      }),
      requiredVersion: "3",
      confirmation: null,
      decision: null,
    }),
    Object.freeze({
      code: "proposal.approve",
      enabled: false,
      reason: Object.freeze({
        code: "WRONG_ACTOR",
        message: "The Proposal author cannot approve this protected decision.",
      }),
      requiredVersion: "3",
      confirmation: null,
      decision: null,
    }),
    Object.freeze({
      code: "proposal.publish",
      enabled: false,
      reason: Object.freeze({
        code: "WRONG_STATE",
        message: "Only an approved current Proposal can be published.",
      }),
      requiredVersion: "3",
      confirmation: null,
      decision: null,
    }),
  ]),
  provenance: FIXTURE_PROVENANCE,
});
