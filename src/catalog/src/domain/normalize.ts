import { ConnectError, Code } from "@connectrpc/connect";

export function normalizeKey(value: string, field: string): string {
  const normalized = value.normalize("NFKC").trim().toUpperCase();
  if (!normalized) throw new ConnectError(`${field} is required`, Code.InvalidArgument);
  if (normalized.length > 300) throw new ConnectError(`${field} is too long`, Code.InvalidArgument);
  return normalized;
}

export function normalizeNamespace(value: string | undefined): string {
  return value ? normalizeKey(value, "identifier.namespace") : "";
}

export function normalizeCurrency(value: string): string {
  const currency = normalizeKey(value, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ConnectError("currency must be a three-letter ISO 4217 code", Code.InvalidArgument);
  }
  return currency;
}

export function normalizeCountry(value: string): string {
  const country = normalizeKey(value, "country");
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new ConnectError("country must be a two-letter ISO 3166-1 code", Code.InvalidArgument);
  }
  return country;
}

export function parseAttributes(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ConnectError("attributes_json must be valid JSON", Code.InvalidArgument);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new ConnectError("attributes_json must contain a JSON object", Code.InvalidArgument);
  }
  return parsed as Record<string, unknown>;
}
