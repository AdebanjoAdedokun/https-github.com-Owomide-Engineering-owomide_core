// Frozen version snapshot — pure, no I/O (PRD PROP-011, PROP-012, PROP-017; decision D-05).
//
// On submission a Proposal version's lines are frozen into one JSON document and fingerprinted.
// The approver decides on exactly that document, the hand-off is built from it, and the stored
// hash lets anyone prove later that nothing changed. The JSON is canonical: object keys sorted,
// lines in a fixed order, money as integer minor units or decimal strings, never floats.

import { createHash } from "node:crypto";

export const SNAPSHOT_SCHEMA_VERSION = 1;

export type Json = null | boolean | string | number | Json[] | { [key: string]: Json };

export class SnapshotError extends Error {}

/** Deterministic JSON: sorted keys, no whitespace. Rejects values JSON cannot carry exactly. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "bigint":
      return JSON.stringify(value.toString());
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new SnapshotError(
          `snapshot numbers must be safe integers; use a decimal string for ${value}`
        );
      }
      return String(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      if (Object.getPrototypeOf(value) !== Object.prototype) {
        throw new SnapshotError("snapshot objects must be plain objects");
      }
      const entries = Object.entries(value as Record<string, unknown>).filter(
        ([, v]) => v !== undefined
      );
      entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
    }
    default:
      throw new SnapshotError(`snapshot cannot contain a ${typeof value}`);
  }
}

export function snapshotHash(snapshot: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(snapshot), "utf8").digest("hex")}`;
}

export interface SnapshotLine {
  skuId: string;
  channelId: string;
  locationId: string | null;
  /** Everything the approver saw for the line: prices, economics, guardrail results. */
  line: Record<string, unknown>;
}

export interface VersionSnapshotInput {
  initiativeId: string;
  proposalId: string;
  versionNumber: number;
  engineVersion: string;
  guardrails: readonly Record<string, unknown>[];
  lines: readonly SnapshotLine[];
}

export interface VersionSnapshot {
  snapshot: Record<string, unknown>;
  hash: string;
}

/** Builds the frozen document. Two lines for the same product and context are refused. */
export function buildVersionSnapshot(input: VersionSnapshotInput): VersionSnapshot {
  if (input.lines.length === 0) throw new SnapshotError("a version needs at least one line");
  const keyOf = (l: SnapshotLine) => [l.skuId, l.channelId, l.locationId ?? ""] as const;
  const lines = [...input.lines].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i]! < kb[i]!) return -1;
      if (ka[i]! > kb[i]!) return 1;
    }
    return 0;
  });
  for (let i = 1; i < lines.length; i += 1) {
    if (keyOf(lines[i]!).join("\u0000") === keyOf(lines[i - 1]!).join("\u0000")) {
      throw new SnapshotError(`line ${keyOf(lines[i]!).join("/")} appears twice`);
    }
  }
  const snapshot = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    initiative_id: input.initiativeId,
    proposal_id: input.proposalId,
    version_number: input.versionNumber,
    engine_version: input.engineVersion,
    guardrails: input.guardrails,
    line_count: lines.length,
    // The identity keys come last so a line's own fields can never overwrite them.
    lines: lines.map((l) => ({
      ...l.line,
      sku_id: l.skuId,
      channel_id: l.channelId,
      location_id: l.locationId,
    })),
  };
  // Validate and fingerprint in one pass; parsing the canonical form yields plain JSON.
  const canonical = canonicalJson(snapshot);
  return {
    snapshot: JSON.parse(canonical) as Record<string, unknown>,
    hash: `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`,
  };
}
