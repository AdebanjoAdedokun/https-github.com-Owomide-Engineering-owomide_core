import { ConnectError, Code } from "@connectrpc/connect";

export const RuleType = {
  PctIncrease:      "pct_increase",
  PctDecrease:      "pct_decrease",
  AbsoluteIncrease: "absolute_increase",
  AbsoluteDecrease: "absolute_decrease",
} as const;

export type RuleType = (typeof RuleType)[keyof typeof RuleType];

export type RepricingRule =
  | { type: typeof RuleType.PctIncrease;      value: number }
  | { type: typeof RuleType.PctDecrease;      value: number }
  | { type: typeof RuleType.AbsoluteIncrease; amount_minor: bigint; currency: string }
  | { type: typeof RuleType.AbsoluteDecrease; amount_minor: bigint; currency: string };

const VALID_TYPES = new Set(Object.values(RuleType));
const CURRENCY_RE = /^[A-Z]{3}$/;

export function parseRepricingRule(raw: string): RepricingRule {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConnectError("rule_json must be valid JSON", Code.InvalidArgument);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConnectError("rule_json must be a JSON object", Code.InvalidArgument);
  }
  const obj = parsed as Record<string, unknown>;

  const rawType = obj["type"];
  if (!VALID_TYPES.has(rawType as RuleType)) {
    throw new ConnectError(
      `rule_json: unknown type "${String(rawType)}" — must be one of ${[...VALID_TYPES].join(", ")}`,
      Code.InvalidArgument,
    );
  }
  const type = rawType as RuleType;

  if (type === RuleType.PctIncrease || type === RuleType.PctDecrease) {
    const value = obj["value"];
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
      throw new ConnectError("rule_json: value must be a positive finite number", Code.InvalidArgument);
    }
    if (type === RuleType.PctDecrease && value > 100) {
      throw new ConnectError("rule_json: pct_decrease value must be ≤ 100", Code.InvalidArgument);
    }
    return { type, value };
  }

  // absolute_increase | absolute_decrease
  const rawAmount = obj["amount_minor"];
  const currency = obj["currency"];
  if (typeof currency !== "string" || !CURRENCY_RE.test(currency)) {
    throw new ConnectError("rule_json: currency must be a 3-letter uppercase ISO code", Code.InvalidArgument);
  }
  let amountMinor: bigint;
  try {
    amountMinor = BigInt(rawAmount as string | number);
  } catch {
    throw new ConnectError("rule_json: amount_minor must be an integer", Code.InvalidArgument);
  }
  if (amountMinor <= 0n) {
    throw new ConnectError("rule_json: amount_minor must be a positive integer", Code.InvalidArgument);
  }
  return { type, amount_minor: amountMinor, currency };
}

export function applyRule(rule: RepricingRule, currentMinor: bigint, currency: string): bigint {
  if ((rule.type === RuleType.AbsoluteIncrease || rule.type === RuleType.AbsoluteDecrease) && rule.currency !== currency) {
    throw new ConnectError(
      `currency mismatch: rule currency ${rule.currency} does not match SKU price currency ${currency}`,
      Code.InvalidArgument,
    );
  }

  let result: bigint;
  if (rule.type === RuleType.PctIncrease) {
    result = currentMinor + BigInt(Math.round(Number(currentMinor) * rule.value / 100));
  } else if (rule.type === RuleType.PctDecrease) {
    result = currentMinor - BigInt(Math.round(Number(currentMinor) * rule.value / 100));
  } else if (rule.type === RuleType.AbsoluteIncrease) {
    result = currentMinor + rule.amount_minor;
  } else {
    result = currentMinor - rule.amount_minor;
  }

  if (result <= 0n) {
    throw new ConnectError("rule would result in non-positive price", Code.FailedPrecondition);
  }
  return result;
}
