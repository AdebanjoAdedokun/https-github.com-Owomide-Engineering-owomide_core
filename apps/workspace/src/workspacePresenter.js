const ROLE_LABELS = Object.freeze({
  pricing_analyst: "Pricing Analyst",
  import_admin: "Import admin",
  approver: "Finance Approver",
  publisher: "Executor",
  org_admin: "Organisation administrator",
  account_owner: "Account Owner",
  pricing_manager: "Pricing Manager",
  pricing_contributor: "Pricing Contributor",
  finance_approver: "Finance Approver",
  commercial_approver: "Commercial Approver",
  executive_approver: "Executive Approver",
  executor: "Executor",
  viewer: "Viewer",
  governance_auditor: "Auditor",
});

const MONEY_FORMATTERS = new Map();
const MONEY_FRACTION_FORMATTERS = new Map();

function moneyFormatter(currency, locale) {
  const key = `${locale}:${currency}`;
  if (!MONEY_FORMATTERS.has(key)) {
    MONEY_FORMATTERS.set(key, new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }));
  }
  return MONEY_FORMATTERS.get(key);
}

export function formatMoney(money, locale = "en-NG") {
  const minor = exactMinorUnits(money?.amountMinor);
  if (minor == null || !money?.currency) return "Unavailable";
  try {
    const absolute = minor < 0n ? -minor : minor;
    const whole = absolute / 100n;
    // Only the bounded 0–99 remainder becomes a Number. Intl groups the
    // arbitrary-size integer directly, without a lossy major-unit conversion.
    if (!MONEY_FRACTION_FORMATTERS.has(locale)) MONEY_FRACTION_FORMATTERS.set(locale, new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: 2, maximumFractionDigits: 0 }));
    const fraction = MONEY_FRACTION_FORMATTERS.get(locale).format(Number(absolute % 100n));
    const signedWhole = minor < 0n ? (whole === 0n ? -0 : -whole) : whole;
    return moneyFormatter(money.currency, locale).formatToParts(signedWhole)
      .map((part) => part.type === "fraction" ? fraction : part.type === "literal" ? part.value.replace(/\s/g, "") : part.value).join("");
  } catch {
    return "Unavailable";
  }
}

export function formatSignedMoney(money, locale = "en-NG") {
  const minor = exactMinorUnits(money?.amountMinor);
  if (minor == null) return "Unavailable";
  const rendered = formatMoney({ ...money, amountMinor: minor < 0n ? -minor : minor }, locale);
  return rendered === "Unavailable" ? rendered : `${minor >= 0n ? "+" : "−"}${rendered}`;
}

function exactMinorUnits(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? BigInt(value) : null;
  if (typeof value !== "string" || !/^[+-]?\d+$/.test(value)) return null;
  return BigInt(value);
}

export function formatBasisPoints(basisPoints) {
  if (basisPoints == null) return "Unavailable";
  return `${(basisPoints / 100).toFixed(2)}%`;
}

/**
 * One truthful label for every place a persisted repricing Rule is shown.
 * Percentage and absolute NGN changes must never share a percentage-shaped
 * fallback because that would misrepresent an absolute Rule as +0.00%.
 */
export function repricingRuleLabel(rule, locale = "en-NG") {
  if (rule?.type === "percentage-change" && Number.isSafeInteger(rule.changeBasisPoints)) {
    return `+${formatBasisPoints(rule.changeBasisPoints)}`;
  }
  if (rule?.type === "absolute-change" && rule.absoluteChange?.amountMinor != null) {
    return formatSignedMoney(rule.absoluteChange, locale);
  }
  return "Rule unavailable";
}

export function presentRepricingLine(line, locale = "en-NG") {
  const floorBasisPoints = line.policy?.floorBasisPoints;
  const proposedMarginBasisPoints = line.proposedMarginBasisPoints;
  const marginGapBasisPoints = Number.isFinite(floorBasisPoints) && Number.isFinite(proposedMarginBasisPoints)
    ? floorBasisPoints - proposedMarginBasisPoints
    : null;
  const classification = line.classification ?? "blocked";
  const status = classification === "blocked" ? "review"
    : classification === "excluded" ? "excluded"
      : classification === "unpriced" ? "unpriced"
        : "eligible";
  const appliedPolicy = line.policy?.evaluation?.appliedRule ?? null;
  return {
    id: line.id,
    sku: line.sku,
    product: line.product?.name ?? "Unresolved product",
    variant: line.product?.variant ?? "Variant unavailable",
    scope: [line.scope?.channel?.name, line.scope?.location?.name].filter(Boolean).join(" · ") || "Scope unresolved",
    channelId: line.scope?.channel?.id ?? null,
    channel: line.scope?.channel?.name ?? "Unresolved channel",
    locationId: line.scope?.location?.id ?? null,
    location: line.scope?.location?.name ?? "Unresolved location",
    category: line.category?.name ?? "Category unavailable",
    cost: formatMoney(line.currentCost, locale),
    current: formatMoney(line.currentPrice, locale),
    proposed: formatMoney(line.proposedPrice, locale),
    delta: formatSignedMoney(line.absoluteDelta, locale),
    margin: formatBasisPoints(line.currentMarginBasisPoints),
    proposedMargin: formatBasisPoints(line.proposedMarginBasisPoints),
    floor: formatBasisPoints(floorBasisPoints),
    floorPrice: formatMoney(line.policy?.floorPrice, locale),
    marginGapBasisPoints,
    classification,
    status,
    issueKind: line.issue?.kind ?? null,
    issueCode: line.issue?.code ?? null,
    issueMessage: line.issue?.message ?? null,
    issuePersistent: Boolean(line.issue?.persistent),
    allowedRemediations: line.allowedRemediations ?? line.issue?.allowedRemediations ?? [],
    costState: line.costState ?? "current",
    exclusion: line.exclusion ?? null,
    remediationInputs: line.remediationInputs ?? null,
    remediationEvidence: line.remediationEvidence ?? null,
    policyResult: line.policy?.result ?? "not-applicable",
    policyEvaluationStatus: line.policy?.evaluation?.status ?? "not-required",
    policyExplanation: line.policy?.evaluation?.explanation ?? line.policy?.violation?.message ?? "No margin policy evaluation was required.",
    appliedPolicy,
    policyChain: line.policy?.evaluation?.matchingChain ?? [],
    policyEngineVersion: line.policy?.evaluation?.engineVersion ?? null,
    policyEvaluationHash: line.policy?.evaluation?.evaluationHash ?? null,
    sourceRow: line.provenance?.rowNumber == null ? "Unavailable" : String(line.provenance.rowNumber),
    catalogVersion: line.provenance?.catalogVersion ?? "Unavailable",
  };
}

export function presentRoleCodes(roleCodes = []) {
  return roleCodes.map((code) => ROLE_LABELS[code] ?? code.replaceAll("_", " "));
}

export function shortActorName(displayName = "") {
  return displayName.split(" · ")[0] || "Resolved user";
}

export function initials(value = "") {
  const words = value.replace(/ · .*/, "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "--";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words.at(-1)[0]}`.toUpperCase();
}

export function shortOrganisationName(value = "") {
  return value.replace(/ · Sample$/, "").replace(/^Owómidé Fixture Distribution$/, "Owómidé Fixture Co.");
}

function formatTimestamp(value, timezone, includeTimezone) {
  if (!value || Number.isNaN(new Date(value).getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
    ...(includeTimezone ? { timeZoneName: "short" } : {}),
  }).format(new Date(value));
}

export function formatEffectiveAt(value, timezone = "Africa/Lagos") {
  return formatTimestamp(value, timezone, true) ?? "Effective time unavailable";
}

export function formatRecordedAt(value, timezone = "Africa/Lagos") {
  return formatTimestamp(value, timezone, false) ?? "Recorded time unavailable";
}

export function formatRelativeTime(value, now = Date.now(), locale = "en-GB") {
  const timestamp = new Date(value).getTime();
  const reference = new Date(now).getTime();
  if (!value || Number.isNaN(timestamp) || Number.isNaN(reference)) return "Time unavailable";
  const deltaSeconds = Math.round((timestamp - reference) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  if (absoluteSeconds < 45) return "just now";
  const units = absoluteSeconds < 2_700
    ? ["minute", 60]
    : absoluteSeconds < 64_800
      ? ["hour", 3_600]
      : absoluteSeconds < 2_246_400
        ? ["day", 86_400]
        : absoluteSeconds < 28_512_000
          ? ["month", 2_592_000]
          : ["year", 31_536_000];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(deltaSeconds / units[1]), units[0]);
}
