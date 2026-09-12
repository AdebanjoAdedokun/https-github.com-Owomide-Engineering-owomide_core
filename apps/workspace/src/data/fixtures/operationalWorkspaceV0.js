import {
  FIXTURE_COUNTS,
  FIXTURE_PROVENANCE,
  FIXTURE_REPRICING_LINES,
  FIXTURE_VERSION,
} from "./repricingPreviewV0.js";
import {
  FIXTURE_ACTOR_IDS,
  FIXTURE_AUDIT_EVENTS,
  FIXTURE_JOURNEY_ACTORS,
  FIXTURE_PROPOSAL_ID,
} from "./proposalJourneyV0.js";
import { MARGIN_POLICY_SCOPE_PRIORITIES, PRICING_ENGINE_VERSION } from "../pricingEngine.js";

/**
 * Additive fixture surfaces for the rest of the launch workspace.
 *
 * All authoritative counts and source identifiers below come from synthetic
 * fixture `0.0.0-design.1`. Detail that fixture v0 does not currently carry is
 * explicitly marked `specificationOnly`; it must not be mistaken for a live
 * contract or a customer-derived record.
 */

export const FIXTURE_ORGANISATION_ID = "bae92486-dbed-53f2-b27a-104f75a71be7";
export const FIXTURE_BASELINE_IMPORT_ID = "71345dfe-ce8f-57e0-9549-76774f919cf9";
export const FIXTURE_MAPPING_IMPORT_ID = "6e39103a-9d95-5d82-ae84-da005ccdd42c";
export const FIXTURE_SAMPLE_IMPORT_ID = "8e92ec6a-fb50-5e9b-8cd7-b624423f3aa8";
export const FIXTURE_SAMPLE_IMPORT_OPERATION_ID = "ce84573e-186f-5bce-a141-ef2ddfae836e";
export const FIXTURE_PARTIAL_IMPORT_ID = "FX-003";
export const FIXTURE_CHANGE_SET_ID = "2beecc58-6ac9-5edb-bc59-7fc80b31cbd0";

const PANTRY = Object.freeze({
  id: "c886c96d-18d7-51b6-8290-c3f1962b8ede",
  code: "PANTRY",
  name: "Pantry & staples",
});
const BEVERAGES = Object.freeze({
  id: "c579fc8c-474f-54c3-a5a6-142694e76544",
  code: "BEVERAGES",
  name: "Beverages",
});

const CATEGORIES_BY_ID = Object.freeze({
  [PANTRY.id]: PANTRY,
  [BEVERAGES.id]: BEVERAGES,
});

const CHANNELS = Object.freeze({
  "968b2614-ffcc-514d-8b42-3d1500f3b28c": Object.freeze({ id: "968b2614-ffcc-514d-8b42-3d1500f3b28c", code: "WHOLESALE", name: "Wholesale accounts" }),
  "a888c061-f02d-5dc4-b21b-7075367ca4ac": Object.freeze({ id: "a888c061-f02d-5dc4-b21b-7075367ca4ac", code: "RETAIL_WEB", name: "Retail web" }),
  "4eb5c830-f8ff-5638-8f4d-9d114bb753b2": Object.freeze({ id: "4eb5c830-f8ff-5638-8f4d-9d114bb753b2", code: "KEY_ACCOUNTS", name: "Key accounts" }),
  "ef646702-a7c2-5a1b-bd32-9f478a9819b9": Object.freeze({ id: "ef646702-a7c2-5a1b-bd32-9f478a9819b9", code: "MARKETPLACE", name: "Marketplace" }),
});

const LOCATIONS = Object.freeze({
  "d80eaca3-aed1-5fd7-bc61-299f92c57db5": Object.freeze({ id: "d80eaca3-aed1-5fd7-bc61-299f92c57db5", code: "LAGOS_DC", name: "Lagos distribution centre", timezone: "Africa/Lagos" }),
  "8ac88886-b971-55e8-bc09-00d5fc4d0fac": Object.freeze({ id: "8ac88886-b971-55e8-bc09-00d5fc4d0fac", code: "ABUJA_HUB", name: "Abuja fulfilment hub", timezone: "Africa/Lagos" }),
  "dd7903e1-7ab5-5cbf-83fb-e047b222801a": Object.freeze({ id: "dd7903e1-7ab5-5cbf-83fb-e047b222801a", code: "IBADAN_XD", name: "Ibadan cross-dock", timezone: "Africa/Lagos" }),
});

const IMPORTED_AT = "2026-08-01T09:30:00+01:00";
const CURRENT_PRICE_EFFECTIVE_AT = "2026-08-01T00:00:00+01:00";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function splitVariant(variant) {
  const [family = variant, pack = ""] = variant.split(", ");
  return { family, pack };
}

function catalogRecordFromLine(line) {
  const category = CATEGORIES_BY_ID[line.category?.id]
    ?? line.category
    ?? (line.sku.startsWith("KLD-BEVE") ? BEVERAGES : PANTRY);
  const variant = splitVariant(line.product.variant);
  return {
    kind: "catalog-sku-summary",
    ref: { kind: "resource", id: line.id, version: line.provenance.catalogVersion },
    id: line.id,
    canonicalSkuId: line.id,
    merchantSku: line.sku,
    merchantSkuScope: { organisationId: FIXTURE_ORGANISATION_ID, label: "Merchant SKU" },
    product: {
      name: line.product.name,
      variant: line.product.variant,
      family: variant.family,
      pack: variant.pack,
    },
    category,
    channel: CHANNELS[line.scope.channel.id],
    location: LOCATIONS[line.scope.location.id],
    currentCost: line.currentCost,
    costState: line.costState,
    currentPrice: line.currentPrice,
    priceState: line.currentPrice ? "current" : "missing",
    marginBasisPoints: line.currentMarginBasisPoints,
    status: line.classification === "excluded" ? "supplier-hold" : "active",
    effectiveAt: line.currentPrice ? CURRENT_PRICE_EFFECTIVE_AT : null,
    source: {
      ...line.provenance,
      isSynthetic: true,
    },
    priceRecords: line.currentPrice ? [{
      state: "current",
      amount: line.currentPrice,
      effectiveAt: CURRENT_PRICE_EFFECTIVE_AT,
      supersededAt: null,
    }] : [{ state: "missing", amount: null, effectiveAt: null, reason: "No approved current price for this context." }],
    dataLabel: "Sample data",
    provenance: FIXTURE_PROVENANCE,
  };
}

const boundedCatalog = FIXTURE_REPRICING_LINES.map(catalogRecordFromLine);

if (!boundedCatalog.some((item) => item.id === "c295e2c9-3fda-5d45-9128-7ff517f724ce")) boundedCatalog.push({
  kind: "catalog-sku-summary",
  ref: { kind: "resource", id: "c295e2c9-3fda-5d45-9128-7ff517f724ce", version: "1017" },
  id: "c295e2c9-3fda-5d45-9128-7ff517f724ce",
  canonicalSkuId: "c295e2c9-3fda-5d45-9128-7ff517f724ce",
  merchantSku: "KLD-PANT-0018",
  merchantSkuScope: { organisationId: FIXTURE_ORGANISATION_ID, label: "Merchant SKU" },
  product: { name: "Brown beans", variant: "Value, 5 kg", family: "Value", pack: "5 kg" },
  category: PANTRY,
  channel: CHANNELS["a888c061-f02d-5dc4-b21b-7075367ca4ac"],
  location: LOCATIONS["8ac88886-b971-55e8-bc09-00d5fc4d0fac"],
  currentCost: { amountMinor: "112850", currency: "NGN" },
  costState: "current",
  currentPrice: null,
  priceState: "missing",
  marginBasisPoints: null,
  status: "active",
  effectiveAt: null,
  source: { type: "import", importId: FIXTURE_BASELINE_IMPORT_ID, fileName: "owomide-fixture-catalog-baseline.csv", importedAt: IMPORTED_AT, rowNumber: 19, isSynthetic: true },
  priceRecords: [{ state: "missing", amount: null, effectiveAt: null, reason: "No approved current price for this context." }],
  dataLabel: "Sample data",
  provenance: FIXTURE_PROVENANCE,
});

if (!boundedCatalog.some((item) => item.id === "3a1de8ca-ac6d-5094-9ef1-3a6cc5e0c989")) boundedCatalog.push({
  kind: "catalog-sku-summary",
  ref: { kind: "resource", id: "3a1de8ca-ac6d-5094-9ef1-3a6cc5e0c989", version: "1053" },
  id: "3a1de8ca-ac6d-5094-9ef1-3a6cc5e0c989",
  canonicalSkuId: "3a1de8ca-ac6d-5094-9ef1-3a6cc5e0c989",
  merchantSku: "KLD-PANT-0054",
  merchantSkuScope: { organisationId: FIXTURE_ORGANISATION_ID, label: "Merchant SKU" },
  product: { name: "Maize meal", variant: "Value, 5 kg", family: "Value", pack: "5 kg" },
  category: PANTRY,
  channel: CHANNELS["a888c061-f02d-5dc4-b21b-7075367ca4ac"],
  location: LOCATIONS["8ac88886-b971-55e8-bc09-00d5fc4d0fac"],
  currentCost: { amountMinor: "71850", currency: "NGN" },
  costState: "current",
  currentPrice: { amountMinor: "100650", currency: "NGN" },
  priceState: "current",
  marginBasisPoints: 2861,
  status: "supplier-hold",
  effectiveAt: CURRENT_PRICE_EFFECTIVE_AT,
  source: { type: "import", importId: FIXTURE_BASELINE_IMPORT_ID, fileName: "owomide-fixture-catalog-baseline.csv", importedAt: IMPORTED_AT, rowNumber: 55, isSynthetic: true },
  priceRecords: [{ state: "current", amount: { amountMinor: "100650", currency: "NGN" }, effectiveAt: CURRENT_PRICE_EFFECTIVE_AT, supersededAt: null }],
  dataLabel: "Sample data",
  provenance: FIXTURE_PROVENANCE,
});

const firstCatalog = boundedCatalog.find((item) => item.id === "e8005ff3-180d-52fa-bbcd-b70bd125f520");
firstCatalog.priceRecords = [
  { state: "superseded", amount: { amountMinor: "55527", currency: "NGN" }, effectiveAt: "2026-05-01T00:00:00+01:00", supersededAt: "2026-08-01T00:00:00+01:00" },
  { state: "current", amount: { amountMinor: "58450", currency: "NGN" }, effectiveAt: CURRENT_PRICE_EFFECTIVE_AT, supersededAt: null },
  { state: "future-effective", amount: { amountMinor: "59619", currency: "NGN" }, effectiveAt: "2026-09-01T00:00:00+01:00", supersededAt: null },
];

export const FIXTURE_CATALOG_SAMPLE = deepFreeze(boundedCatalog);
export const FIXTURE_CATALOG_TOTAL = 1248;

export const FIXTURE_IMPORT_COUNTS = deepFreeze({
  baseline: { input: 1248, valid: 1248, warning: 0, invalid: 0, excluded: 0, attempted: 1248, committed: 1248, rejected: 0, remaining: 0 },
  partial: { input: 80, valid: 72, warning: 3, invalid: 5, excluded: 3, attempted: 72, committed: 68, rejected: 4, remaining: 5 },
});

export const FIXTURE_IMPORT_BATCHES = deepFreeze([
  {
    kind: "import-batch-summary",
    ref: { kind: "resource", id: FIXTURE_MAPPING_IMPORT_ID, version: "4" },
    title: "Supplier cost mapping",
    sourceFile: { name: "owomide-fixture-supplier-costs-messy.csv", format: "CSV", isSynthetic: true },
    owner: FIXTURE_JOURNEY_ACTORS.teni,
    stage: "map",
    state: "needs-attention",
    counts: { input: 80, valid: 72, warning: 3, invalid: 5, excluded: 3, attempted: 0, committed: 0, rejected: 0, remaining: 80 },
    blocker: { code: "UNMAPPED_REQUIRED_FIELD", message: "Effective time still needs a trusted mapping." },
    createdAt: "2026-08-10T09:04:00Z",
    updatedAt: "2026-08-10T09:20:00Z",
    dataLabel: "Sample data",
    provenance: FIXTURE_PROVENANCE,
  },
  {
    kind: "import-batch-summary",
    ref: { kind: "fixture-scenario", id: FIXTURE_PARTIAL_IMPORT_ID, version: FIXTURE_VERSION },
    title: "Partial supplier cost update",
    sourceFile: { name: "owomide-fixture-supplier-costs-messy.csv", format: "CSV", isSynthetic: true },
    owner: FIXTURE_JOURNEY_ACTORS.teni,
    stage: "result",
    state: "partial-success",
    counts: FIXTURE_IMPORT_COUNTS.partial,
    blocker: { code: "REJECTED_ROWS_REMAIN", message: "Four attempted rows were rejected and five input rows remain unresolved." },
    createdAt: "2026-08-09T14:10:00Z",
    updatedAt: "2026-08-09T14:42:00Z",
    dataLabel: "Sample data",
    provenance: FIXTURE_PROVENANCE,
  },
  {
    kind: "import-batch-summary",
    ref: { kind: "resource", id: FIXTURE_BASELINE_IMPORT_ID, version: "6" },
    title: "Catalog baseline",
    sourceFile: { name: "owomide-fixture-catalog-baseline.csv", format: "CSV", isSynthetic: true },
    owner: FIXTURE_JOURNEY_ACTORS.teni,
    stage: "result",
    state: "committed",
    counts: FIXTURE_IMPORT_COUNTS.baseline,
    blocker: null,
    createdAt: "2026-08-01T09:22:00+01:00",
    updatedAt: IMPORTED_AT,
    dataLabel: "Sample data",
    provenance: FIXTURE_PROVENANCE,
  },
]);

const STAGE_ORDER = ["upload", "profile", "map", "validate", "review", "commit", "result"];

function stagesFor(active, state) {
  const activeIndex = STAGE_ORDER.indexOf(active);
  return STAGE_ORDER.map((id, index) => ({
    id,
    label: id === "map" ? "Map" : id.charAt(0).toUpperCase() + id.slice(1),
    status: state === "committed" || (state === "partial-success" && id === "result")
      ? "complete"
      : index < activeIndex
        ? "complete"
        : index === activeIndex
          ? "current"
          : "upcoming",
  }));
}

const mappingRows = [
  { source: "Stock Ref", examples: ["KLD-PANT-0032", "KLD-BEVE-0166"], target: "merchantSku", targetLabel: "Merchant SKU", required: true, confidenceBasisPoints: 9800, state: "mapped", candidates: ["merchantSku"] },
  { source: "Item", examples: ["Cassava flour", "Malt drink"], target: "product.name", targetLabel: "Product name", required: true, confidenceBasisPoints: 9600, state: "mapped", candidates: ["product.name"] },
  { source: "Depot", examples: ["IBADAN_XD", "ABUJA_HUB"], target: "location.code", targetLabel: "Location", required: true, confidenceBasisPoints: 8700, state: "mapped", candidates: ["location.code"] },
  { source: "Trade Cost", examples: ["151550", "74350"], target: null, targetLabel: null, required: true, confidenceBasisPoints: 5400, state: "ambiguous", candidates: ["cost.amountMinor", "price.amountMinor"] },
  { source: "Curr.", examples: ["NGN"], target: "currency", targetLabel: "Currency", required: true, confidenceBasisPoints: 10000, state: "mapped", candidates: ["currency"] },
  { source: "Price?", examples: ["161250", "80850"], target: null, targetLabel: null, required: false, confidenceBasisPoints: 5100, state: "ambiguous", candidates: ["price.amountMinor", "recommendedPrice.amountMinor"] },
  { source: "Notes", examples: ["supplier update"], target: "notes", targetLabel: "Notes", required: false, confidenceBasisPoints: 8200, state: "mapped", candidates: ["notes"] },
];

const partialIssues = [
  { rowId: "9decd355-13f6-5bab-8a46-6b77a33b09fd", rowNumber: 12, severity: "error", field: "effectiveAt", code: "MISSING_REQUIRED_VALUE", message: "Effective time is required.", specificationOnly: true },
  { rowId: "17b5c1b4-9f7b-554c-9340-7cbaf2d2a211", rowNumber: 19, severity: "error", field: "currency", code: "UNSUPPORTED_CURRENCY_VALUE", message: "Currency cannot be matched to the supported NGN context.", specificationOnly: true },
  { rowId: "12f2a798-1915-5770-8ee7-6cdfc51aa00e", rowNumber: 28, severity: "error", field: "cost.amountMinor", code: "INVALID_MINOR_UNITS", message: "Cost must be supplied as integer minor units.", specificationOnly: true },
  { rowId: "42ba4390-5a49-565f-abcc-2e90d17915ca", rowNumber: 41, severity: "error", field: "location.code", code: "LOCATION_NOT_FOUND", message: "Location code is not part of the reviewed organisation scope.", specificationOnly: true },
  { rowId: "d55db9e1-ecdc-5800-b02c-9a5a273a2f3b", rowNumber: 64, severity: "error", field: "merchantSku", code: "MERCHANT_SKU_AMBIGUOUS", message: "Merchant SKU does not resolve uniquely inside this organisation.", specificationOnly: true },
];

function importJourney(batch) {
  const isBaseline = batch.ref.id === FIXTURE_BASELINE_IMPORT_ID;
  const isPartial = batch.ref.id === FIXTURE_PARTIAL_IMPORT_ID;
  const counts = isBaseline ? FIXTURE_IMPORT_COUNTS.baseline : FIXTURE_IMPORT_COUNTS.partial;
  return {
    kind: "import-journey",
    ref: batch.ref,
    title: batch.title,
    owner: batch.owner,
    stage: batch.stage,
    state: batch.state,
    stages: stagesFor(batch.stage, batch.state),
    sourceFile: batch.sourceFile,
    uploadPolicy: {
      acceptedFormats: ["CSV", "XLSX"],
      maxRows: null,
      maxColumns: null,
      maxFileBytes: null,
      releaseStatus: "contract-unavailable",
      privacyNotice: "Use authorised source data only. This preview contains synthetic sample data.",
    },
    profile: {
      rows: isBaseline ? 1248 : 80,
      columns: isBaseline ? 14 : 7,
      sheets: isBaseline ? 1 : 1,
      selectedSheet: isBaseline ? "Catalog" : null,
      sourceHeaders: isBaseline
        ? ["Merchant SKU", "Product", "Category", "Channel", "Location", "Cost", "Price", "Currency", "Effective at", "Status", "Pack", "Family", "Supplier", "Notes"]
        : ["Stock Ref", "Item", "Depot", "Trade Cost", "Curr.", "Price?", "Notes"],
      specificationOnly: false,
    },
    mapping: {
      rows: isBaseline ? mappingRows.map((row) => ({ ...row, state: "mapped", confidenceBasisPoints: Math.max(row.confidenceBasisPoints, 9800), target: row.target ?? row.candidates[0], targetLabel: row.targetLabel ?? row.candidates[0] })) : mappingRows,
      requiredMapped: isBaseline ? 9 : 8,
      requiredTotal: 9,
      ambiguityCount: isBaseline ? 0 : 2,
      unmappedRequired: isBaseline ? [] : ["effectiveAt"],
      transformationCount: isBaseline ? 0 : 3,
      savedTemplate: isBaseline ? null : { id: "7fbb3eb4-26c4-5080-b65e-27012d4b73ef", name: "Supplier cost update · sample", savedBy: FIXTURE_ACTOR_IDS.teni, version: "3" },
      reviewContext: { effectiveAt: "2026-08-15T00:00:00+01:00", currency: "NGN", source: "Import intent" },
      checkpoint: isBaseline ? null : { serverDraftVersion: "4", mappedFields: 11, transformations: 3, corrections: 8, excludedRows: 2, warningAcknowledgements: 1 },
    },
    validation: {
      counts,
      issues: isBaseline ? [] : partialIssues,
      issueDetailStatus: isBaseline ? "complete" : "specification-only",
      excludedRowIds: isPartial ? ["6778bf91-af39-5bff-8dec-4e0663e6eb35", "5d392537-110d-5602-9450-82c4705c6947", "81a49385-a0ba-5e90-868d-939b46237efd"] : [],
    },
    review: {
      counts,
      consequence: isBaseline ? "Record the reviewed bootstrap result inside this Sample data journey." : "Start a bounded Sample data attempt for 72 reviewed rows and preserve every unresolved input row.",
      acknowledgementRequired: !isBaseline && counts.warning > 0,
      operationKind: "canonical-import-commit",
    },
    commit: {
      state: batch.stage === "result" ? "reconciled" : "not-started",
      status: batch.stage === "result" ? batch.state : "not-started",
      operationRef: null,
      batchRef: batch.ref,
      catalogWriteAuthoritative: false,
      persistenceScope: "fixture-memory-only",
    },
    result: {
      operationId: isBaseline ? FIXTURE_BASELINE_IMPORT_ID : FIXTURE_PARTIAL_IMPORT_ID,
      state: batch.state,
      counts,
      persistent: true,
      persistenceScope: "fixture-memory-only",
      catalogWriteAuthoritative: false,
      duplicateCommitPrevented: true,
      retryUsesOriginalImportId: true,
      rejectedRowsExport: isPartial ? "contract-unavailable" : "not-applicable",
      resultingCatalogRef: isBaseline ? { kind: "resource", id: FIXTURE_BASELINE_IMPORT_ID, version: "6" } : null,
    },
    dataLabel: "Sample data",
    provenance: FIXTURE_PROVENANCE,
  };
}

export const FIXTURE_IMPORT_JOURNEYS = deepFreeze(Object.fromEntries(
  FIXTURE_IMPORT_BATCHES.map((batch) => [batch.ref.id, importJourney(batch)]),
));

export const FIXTURE_REPRICING_SCOPE = deepFreeze({
  kind: "repricing-scope",
  ref: { kind: "resource", id: FIXTURE_CHANGE_SET_ID, version: "2" },
  title: "August cost recovery",
  state: "complete",
  completeness: { known: true, complete: true, historicalLimitApplied: false },
  counts: FIXTURE_COUNTS,
  selection: { mode: "all-matched-except-explicit-exclusions", selected: 1227, includesBlocked: true },
  dimensions: {
    channels: Object.values(CHANNELS),
    locations: Object.values(LOCATIONS),
    categoryCount: 8,
  },
  filters: { status: "active", currency: "NGN", query: "", channelIds: [], locationIds: [], categoryIds: [] },
  dataLabel: "Sample data",
  provenance: FIXTURE_PROVENANCE,
});

export const FIXTURE_REPRICING_RULE = deepFreeze({
  kind: "repricing-rule",
  ref: { kind: "resource", id: FIXTURE_CHANGE_SET_ID, version: "3" },
  scopeRef: FIXTURE_REPRICING_SCOPE.ref,
  state: "valid",
  rule: { type: "percentage-change", changeBasisPoints: 350, absoluteChange: null, currency: "NGN", rounding: "integer-minor-unit-half-up" },
  supportedTypes: ["percentage-change", "absolute-change"],
  explanation: "Increase every selected current NGN price by 3.50%, rounded to the nearest minor unit.",
  effectiveAt: "2026-08-15T00:00:00+01:00",
  dataLabel: "Sample data",
  provenance: FIXTURE_PROVENANCE,
});

export const FIXTURE_RULES = deepFreeze([
  { id: "c886c96d-18d7-51b6-8290-c3f1962b8ede", code: "PANTRY", version: "12", name: "Pantry & staples floor", scope: "category", marginFloorBasisPoints: 1400, status: "active" },
  { id: "c579fc8c-474f-54c3-a5a6-142694e76544", code: "KEY_ACCOUNT_BEVERAGES", version: "4", name: "Key-account beverages floor", scope: "channel", marginFloorBasisPoints: 1600, status: "active" },
  { id: "48ad4694-1a38-5438-9413-67360c8d5f05", code: "HOUSEHOLD", version: "6", name: "Household care floor", scope: "category", marginFloorBasisPoints: 1800, status: "active" },
  { id: "2b8139c4-f22f-5574-8b09-8491f0cdc36f", code: "GROUNDNUT_OIL", version: "7", name: "Groundnut oil SKU floor", scope: "sku", marginFloorBasisPoints: 1500, status: "active" },
  { id: "e5cddde9-80ce-502a-a042-299cf1b36515", code: "OFFICE_SCHOOL", name: "Office & school", scope: "global", marginFloorBasisPoints: 1500, status: "active" },
  { id: "8a532386-13bc-5cfe-a1a2-d13ecde81814", code: "FAMILY", name: "Baby & family", scope: "channel", marginFloorBasisPoints: 2100, status: "active" },
  { id: "4cec1615-3bca-5011-96be-8a64f2a72ada", code: "APPLIANCES", name: "Small appliances", scope: "category", marginFloorBasisPoints: 1300, status: "active" },
  { id: "084f8a1e-ef78-57aa-b09b-32ed7bdc0314", code: "ORGANISATION_MINIMUM", version: "9", name: "Organisation minimum margin", scope: "global", marginFloorBasisPoints: 1200, status: "active" },
].map((rule) => ({
  kind: "pricing-rule-summary",
  ref: { kind: "resource", id: rule.id, version: rule.version ?? FIXTURE_VERSION },
  ...rule,
  effect: { type: "minimum-margin", basisPoints: rule.marginFloorBasisPoints },
  resolution: {
    priority: MARGIN_POLICY_SCOPE_PRIORITIES[rule.scope === "global" ? "organisation" : rule.scope],
    precedence: "priority-descending, condition-count-descending, stable-id-ascending",
    engineVersion: PRICING_ENGINE_VERSION,
  },
  editability: "read-only-launch-context",
  dataLabel: "Sample data",
  provenance: FIXTURE_PROVENANCE,
})));

export const FIXTURE_PROPOSAL_DIRECTORY = deepFreeze([
  {
    ref: { kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "3" },
    title: "August cost recovery",
    state: "blocked",
    readiness: "blocked",
    owner: FIXTURE_JOURNEY_ACTORS.teni,
    assignedApprover: FIXTURE_JOURNEY_ACTORS.chika,
    assignedPublisher: FIXTURE_JOURNEY_ACTORS.farida,
    counts: { lines: 1227, blocked: 17 },
    updatedAt: "2026-08-10T08:48:00Z",
  },
  {
    ref: { kind: "fixture-scenario", id: "63dea380-6a40-51aa-987a-3f75cd0a23fc", version: "13" },
    title: "Current-version approval review",
    state: "submitted",
    readiness: "stale-review-required",
    owner: FIXTURE_JOURNEY_ACTORS.teni,
    assignedApprover: FIXTURE_JOURNEY_ACTORS.chika,
    assignedPublisher: FIXTURE_JOURNEY_ACTORS.farida,
    counts: { lines: null, blocked: null },
    updatedAt: "2026-08-10T09:08:00Z",
  },
]);

export const FIXTURE_WORK_QUEUE_BASE = deepFreeze([
  {
    id: "work-import-mapping-fx009",
    ref: { kind: "resource", id: FIXTURE_MAPPING_IMPORT_ID, version: "4" },
    type: "import",
    title: "Finish supplier cost mapping",
    reason: "1 required field and 2 ambiguous columns need review.",
    status: "needs-attention",
    priority: "high",
    nextActor: "Import administrator",
    counts: { attention: 3, total: 80 },
    updatedAt: "2026-08-10T09:20:00Z",
  },
  {
    id: "work-repricing-fx004",
    ref: { kind: "resource", id: FIXTURE_CHANGE_SET_ID, version: "3" },
    type: "repricing",
    title: "Review August cost recovery",
    reason: "17 of 1,248 selected lines remain blocked.",
    status: "blocked",
    priority: "high",
    nextActor: "Pricing analyst",
    counts: { attention: 17, total: 1248 },
    updatedAt: "2026-08-10T08:36:00Z",
  },
  {
    id: "work-proposal-fx010",
    ref: { kind: "resource", id: FIXTURE_PROPOSAL_ID, version: "3" },
    type: "proposal",
    title: "Resolve Proposal blockers",
    reason: "17 blockers need resolution or independent authority.",
    status: "blocked",
    priority: "medium",
    nextActor: "Pricing analyst",
    counts: { attention: 17, total: 1227 },
    updatedAt: "2026-08-10T08:48:00Z",
  },
]);

export const FIXTURE_OPERATIONAL_AUDIT_EVENTS = FIXTURE_AUDIT_EVENTS;
export { CATEGORIES_BY_ID as FIXTURE_CATEGORIES_BY_ID, CHANNELS as FIXTURE_CHANNELS, LOCATIONS as FIXTURE_LOCATIONS };
