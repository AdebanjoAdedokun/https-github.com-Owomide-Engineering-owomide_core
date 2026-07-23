import { ConnectError, Code } from "@connectrpc/connect";

export interface ScopeDsl {
  channel_id: string;
  product_id?: string;
  category?: string;
  customer_segment_id?: string;
  query?: string;
}

const ALLOWED_KEYS = new Set([
  "channel_id", "product_id", "category", "customer_segment_id", "query",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseScopeDsl(raw: string): ScopeDsl {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConnectError("scope_json must be valid JSON", Code.InvalidArgument);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConnectError("scope_json must be a JSON object", Code.InvalidArgument);
  }
  const obj = parsed as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ConnectError(`scope_json: unknown field "${key}"`, Code.InvalidArgument);
    }
  }
  if (typeof obj["channel_id"] !== "string" || !UUID_RE.test(obj["channel_id"])) {
    throw new ConnectError(
      "scope_json: channel_id is required and must be a valid UUID",
      Code.InvalidArgument,
    );
  }
  for (const field of ["product_id", "customer_segment_id"] as const) {
    if (obj[field] !== undefined) {
      if (typeof obj[field] !== "string" || !UUID_RE.test(obj[field] as string)) {
        throw new ConnectError(`scope_json: ${field} must be a valid UUID`, Code.InvalidArgument);
      }
    }
  }
  for (const field of ["category", "query"] as const) {
    if (obj[field] !== undefined && typeof obj[field] !== "string") {
      throw new ConnectError(`scope_json: ${field} must be a string`, Code.InvalidArgument);
    }
  }
  return obj as unknown as ScopeDsl;
}
