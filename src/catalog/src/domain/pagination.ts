import { ConnectError, Code } from "@connectrpc/connect";

export interface Cursor {
  key: string;
  id: string;
}

export function pageSize(value: number): number {
  if (!Number.isInteger(value) || value < 0)
    throw new ConnectError("page_size is invalid", Code.InvalidArgument);
  return value === 0 ? 50 : Math.min(value, 200);
}

export function encodeCursor(cursor: Cursor | undefined): string {
  return cursor ? Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url") : "";
}

export function decodeCursor(token: string): Cursor | undefined {
  if (!token) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid cursor");
    const record = parsed as Record<string, unknown>;
    if (typeof record["key"] !== "string" || typeof record["id"] !== "string") {
      throw new Error("invalid cursor");
    }
    return { key: record["key"], id: record["id"] };
  } catch {
    throw new ConnectError("page_token is invalid", Code.InvalidArgument);
  }
}
