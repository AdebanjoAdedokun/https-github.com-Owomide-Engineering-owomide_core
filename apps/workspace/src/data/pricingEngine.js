/**
 * Deterministic, transport-neutral pricing primitives for the fixture adapter.
 *
 * The functions in this module deliberately use integer minor units and
 * BigInt intermediates. They mirror the documented Intelligence boundary but
 * make no claim that browser fixture evaluation is authoritative production
 * evaluation.
 */

export const PRICING_ENGINE_VERSION = "fixture-pricing-intelligence/1.0.0";
export const PRICE_ROUNDING = "integer-minor-unit-half-up";

export const MARGIN_POLICY_SCOPE_PRIORITIES = Object.freeze({
  sku: 300,
  channel: 200,
  category: 100,
  organisation: 0,
});

export const REPRICING_REMEDIATION_ACTIONS = Object.freeze([
  "apply-floor",
  "exclude",
  "refresh-cost",
  "repair-dimension",
]);

/** @param {unknown} value @param {string} label */
function integer(value, label) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer.`);
  return value;
}

/** @param {unknown} value @param {string} label */
function minor(value, label) {
  if (!value || typeof value !== "object") throw new TypeError(`${label} must be money.`);
  if (typeof value.amountMinor !== "string" || !/^\d+$/.test(value.amountMinor)) {
    throw new TypeError(`${label}.amountMinor must be a non-negative decimal integer string.`);
  }
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) {
    throw new TypeError(`${label}.currency must be an ISO 4217 code.`);
  }
  return { amount: BigInt(value.amountMinor), currency: value.currency };
}

/** @param {bigint} numerator @param {bigint} denominator */
function ceilUnsigned(numerator, denominator) {
  if (numerator < 0n || denominator <= 0n) throw new RangeError("Ceiling division requires a non-negative numerator and positive denominator.");
  return (numerator + denominator - 1n) / denominator;
}

/** @param {bigint} numerator @param {bigint} denominator */
function halfUpUnsigned(numerator, denominator) {
  if (numerator < 0n || denominator <= 0n) throw new RangeError("Half-up division requires a non-negative numerator and positive denominator.");
  return (numerator + (denominator / 2n)) / denominator;
}

/**
 * Apply a percentage or absolute adjustment to a non-negative current price.
 * Percentage results round to the nearest minor unit, with exact halves up.
 * Absolute adjustments are already expressed in exact minor units.
 *
 * @param {{amountMinor: string, currency: string}} currentPrice
 * @param {{type: "percentage-change", changeBasisPoints: number, currency?: string, rounding?: string} | {type: "absolute-change", absoluteChange: {amountMinor: string, currency: string}, currency?: string, rounding?: string}} rule
 */
export function applyPriceAdjustment(currentPrice, rule) {
  const current = minor(currentPrice, "currentPrice");
  if (!rule || typeof rule !== "object") throw new TypeError("rule is required.");
  if (rule.currency && rule.currency !== current.currency) throw new RangeError("PRICE_RULE_CURRENCY_MISMATCH");
  if (rule.rounding && rule.rounding !== PRICE_ROUNDING) throw new RangeError("PRICE_ROUNDING_UNSUPPORTED");

  let proposed;
  if (rule.type === "percentage-change") {
    const basisPoints = integer(rule.changeBasisPoints, "rule.changeBasisPoints");
    const factor = 10_000 + basisPoints;
    if (factor < 0) throw new RangeError("Percentage adjustment cannot produce a negative price.");
    proposed = halfUpUnsigned(current.amount * BigInt(factor), 10_000n);
  } else if (rule.type === "absolute-change") {
    const adjustment = minor(rule.absoluteChange, "rule.absoluteChange");
    if (adjustment.currency !== current.currency) throw new RangeError("PRICE_RULE_CURRENCY_MISMATCH");
    proposed = current.amount + adjustment.amount;
  } else {
    throw new RangeError("PRICE_RULE_TYPE_UNSUPPORTED");
  }

  return {
    proposedPrice: { amountMinor: proposed.toString(), currency: current.currency },
    absoluteDelta: { amountMinor: (proposed - current.amount).toString(), currency: current.currency },
    rounding: rule.type === "percentage-change" ? PRICE_ROUNDING : "exact-minor-unit-addition",
  };
}

/**
 * Gross margin in integer basis points, truncated toward zero. Floor pass/fail
 * never relies on this display value; it compares price to the exact ceiling
 * floor returned by calculatePercentageMarginFloorPrice.
 *
 * @param {{amountMinor: string, currency: string}} price
 * @param {{amountMinor: string, currency: string}} cost
 */
export function calculateMarginBasisPoints(price, cost) {
  const priceMinor = minor(price, "price");
  const costMinor = minor(cost, "cost");
  if (priceMinor.currency !== costMinor.currency) throw new RangeError("MONEY_CURRENCY_MISMATCH");
  if (priceMinor.amount === 0n) throw new RangeError("MARGIN_PRICE_MUST_BE_POSITIVE");
  return Number(((priceMinor.amount - costMinor.amount) * 10_000n) / priceMinor.amount);
}

/**
 * Calculate `ceil(cost × 10000 ÷ (10000 − floor basis points))`.
 * This ceiling makes the returned price the first minor unit that passes.
 *
 * @param {{amountMinor: string, currency: string}} cost
 * @param {number} floorBasisPoints
 */
export function calculatePercentageMarginFloorPrice(cost, floorBasisPoints) {
  const costMinor = minor(cost, "cost");
  const floor = integer(floorBasisPoints, "floorBasisPoints");
  if (floor < 0 || floor >= 10_000) throw new RangeError("Margin floor must be between 0 and 9,999 basis points.");
  const amount = ceilUnsigned(costMinor.amount * 10_000n, BigInt(10_000 - floor));
  return { amountMinor: amount.toString(), currency: costMinor.currency };
}

/** @param {Record<string, unknown>} conditions */
function conditionCount(conditions = {}) {
  return Object.values(conditions).filter((value) => value !== null && value !== undefined).length;
}

/** @param {Record<string, unknown>} conditions @param {Record<string, unknown>} facts */
function conditionsMatch(conditions = {}, facts = {}) {
  return Object.entries(conditions).every(([key, expected]) => expected == null || facts[key] === expected);
}

/** @param {Record<string, any>} rule */
function publicRule(rule) {
  return {
    id: rule.id,
    code: rule.code ?? null,
    version: rule.version,
    name: rule.name,
    scope: rule.scope,
    priority: rule.priority,
    conditionCount: conditionCount(rule.conditions),
    floorType: rule.floor?.type ?? null,
    floorBasisPoints: rule.floor?.basisPoints ?? null,
    currency: rule.floor?.currency ?? null,
  };
}

/**
 * Resolve all matching rules in documented precedence order: explicit
 * priority descending, condition count descending, then stable rule ID.
 *
 * @param {Array<Record<string, any>>} rules
 * @param {Record<string, unknown>} facts
 */
export function resolveMarginPolicy(rules, facts) {
  if (!Array.isArray(rules)) throw new TypeError("rules must be an array.");
  const ids = new Set();
  for (const rule of rules) {
    if (!rule || typeof rule.id !== "string" || !rule.id) throw new TypeError("Every margin policy requires a stable id.");
    if (ids.has(rule.id)) throw new RangeError("MARGIN_RULE_ID_DUPLICATE");
    ids.add(rule.id);
    integer(rule.priority, `rule ${rule.id} priority`);
  }
  const matches = rules
    .filter((rule) => conditionsMatch(rule.conditions, facts))
    .sort((left, right) => (
      right.priority - left.priority
      || conditionCount(right.conditions) - conditionCount(left.conditions)
      || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    ));
  return {
    status: matches.length ? "matched" : "no-match",
    appliedRule: matches.length ? publicRule(matches[0]) : null,
    matchingChain: matches.map(publicRule),
  };
}

/** @param {unknown} value */
function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * A deterministic fixture trace, intentionally labelled FNV rather than
 * impersonating the production service's SHA-256 evaluation hash.
 * @param {unknown} value
 */
export function fixtureEvaluationHash(value) {
  const input = `${PRICING_ENGINE_VERSION}:${stableSerialize(value)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fixture-fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

/** @param {ReturnType<typeof resolveMarginPolicy>} resolution @param {string} explanation @param {string} status */
function evaluationEvidence(resolution, explanation, status = resolution.status) {
  const evidence = {
    status,
    appliedRule: resolution.appliedRule,
    matchingChain: resolution.matchingChain,
    explanation,
    engineVersion: PRICING_ENGINE_VERSION,
  };
  return { ...evidence, evaluationHash: fixtureEvaluationHash(evidence) };
}

/** @param {string} kind @param {string} code @param {string} message @param {string[]} allowedRemediations */
function issue(kind, code, message, allowedRemediations) {
  return { kind, code, message, persistent: true, allowedRemediations };
}

/**
 * Evaluate one selected, priced line against its resolved margin policy.
 * Missing/stale costs and unsupported dimensions fail closed as explicit
 * blocker kinds; currency mismatch is a blocking dimension issue.
 *
 * @param {{proposedPrice: {amountMinor: string, currency: string}, currentCost: {amountMinor: string, currency: string} | null, costState?: "current" | "stale" | "missing", dimensionsValid?: boolean, rules: Array<Record<string, any>>, facts: Record<string, unknown>}} input
 */
export function evaluateMarginPolicy(input) {
  const resolution = resolveMarginPolicy(input.rules, input.facts);
  const applied = input.rules.find((rule) => rule.id === resolution.appliedRule?.id) ?? null;
  const base = {
    floorBasisPoints: applied?.floor?.basisPoints ?? null,
    floorPrice: null,
    scope: applied?.scope ?? null,
    sourceId: applied?.id ?? null,
    result: "blocked",
    violation: null,
  };

  if (input.dimensionsValid === false) {
    const blocker = issue("dimension", "DIMENSION_UNSUPPORTED", "Required pricing dimensions are incomplete or unsupported.", ["repair-dimension", "exclude"]);
    return { ...base, classification: "blocked", issue: blocker, proposedMarginBasisPoints: null, allowedRemediations: blocker.allowedRemediations, evaluation: evaluationEvidence(resolution, "Margin evaluation stopped because required dimensions are incomplete.", "error") };
  }
  if (!input.currentCost || input.costState === "missing") {
    const blocker = issue("stale-cost", "COST_MISSING", "A current cost is required before margin can be evaluated.", ["refresh-cost", "exclude"]);
    return { ...base, classification: "blocked", issue: blocker, proposedMarginBasisPoints: null, allowedRemediations: blocker.allowedRemediations, evaluation: evaluationEvidence(resolution, "The matching policy was resolved, but no current cost was available.", "error") };
  }
  if (input.costState === "stale") {
    const blocker = issue("stale-cost", "COST_STALE", "Refresh the stale cost before relying on this margin result.", ["refresh-cost", "exclude"]);
    return { ...base, classification: "blocked", issue: blocker, proposedMarginBasisPoints: null, allowedRemediations: blocker.allowedRemediations, evaluation: evaluationEvidence(resolution, "The matching policy was resolved, but the recorded cost is stale.", "error") };
  }
  if (!applied) {
    const blocker = issue("dimension", "MARGIN_RULE_NO_MATCH", "No margin policy matches this line's pricing dimensions.", ["repair-dimension", "exclude"]);
    return { ...base, classification: "blocked", issue: blocker, proposedMarginBasisPoints: null, allowedRemediations: blocker.allowedRemediations, evaluation: evaluationEvidence(resolution, "No supplied margin policy matched the line.", "no-match") };
  }
  if (applied.floor?.type !== "percentage-margin") throw new RangeError("MARGIN_FLOOR_TYPE_UNSUPPORTED");
  if (input.proposedPrice.currency !== applied.floor.currency || input.currentCost.currency !== applied.floor.currency) {
    const blocker = issue("dimension", "POLICY_CURRENCY_MISMATCH", "Price, cost and margin policy currencies must match.", ["repair-dimension", "exclude"]);
    return { ...base, classification: "blocked", issue: blocker, proposedMarginBasisPoints: null, allowedRemediations: blocker.allowedRemediations, evaluation: evaluationEvidence(resolution, `Applied ${applied.name}, but its ${applied.floor.currency} currency does not match the line.`, "error") };
  }

  const floorPrice = calculatePercentageMarginFloorPrice(input.currentCost, applied.floor.basisPoints);
  const proposedMarginBasisPoints = calculateMarginBasisPoints(input.proposedPrice, input.currentCost);
  const passes = BigInt(input.proposedPrice.amountMinor) >= BigInt(floorPrice.amountMinor);
  const explanation = `Applied ${applied.name} (${applied.scope}) before ${Math.max(0, resolution.matchingChain.length - 1)} lower-precedence match${resolution.matchingChain.length === 2 ? "" : "es"}.`;
  const blocker = passes ? null : issue("margin", "MARGIN_BELOW_FLOOR", "Proposed margin remains below the applicable floor.", ["apply-floor", "exclude"]);
  return {
    ...base,
    floorPrice,
    result: passes ? "clear" : "blocked",
    violation: blocker ? { code: blocker.code, message: blocker.message, persistent: true, remediation: "apply-floor", allowedRemediations: blocker.allowedRemediations } : null,
    classification: passes ? "eligible" : "blocked",
    issue: blocker,
    proposedMarginBasisPoints,
    allowedRemediations: blocker?.allowedRemediations ?? ["exclude"],
    evaluation: evaluationEvidence(resolution, explanation),
  };
}

/**
 * Build policy evidence for a line that is intentionally outside evaluation.
 * It still records the matching chain so users can understand what would have
 * applied without falsely claiming a margin decision.
 *
 * @param {{rules: Array<Record<string, any>>, facts: Record<string, unknown>, reason: string}} input
 */
export function explainUnevaluatedPolicy(input) {
  const resolution = resolveMarginPolicy(input.rules, input.facts);
  return {
    floorBasisPoints: resolution.appliedRule?.floorBasisPoints ?? null,
    floorPrice: null,
    scope: resolution.appliedRule?.scope ?? null,
    sourceId: resolution.appliedRule?.id ?? null,
    result: "not-applicable",
    violation: null,
    evaluation: evaluationEvidence(resolution, input.reason, "not-required"),
  };
}
