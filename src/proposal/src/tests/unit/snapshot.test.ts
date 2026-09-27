import { describe, expect, it } from "vitest";
import {
  buildVersionSnapshot,
  canonicalJson,
  SnapshotError,
  snapshotHash,
} from "../../domain/snapshot.js";

const base = {
  initiativeId: "i-1",
  proposalId: "p-1",
  versionNumber: 2,
  engineVersion: "pricing-v1",
  guardrails: [{ kind: "min_gross_margin_pct", threshold: "15", treatment: "Blocking" }],
};

describe("canonical JSON", () => {
  it("sorts keys at every level and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: true, y: null }], c: undefined } })).toBe(
      '{"a":{"d":[2,{"y":null,"z":true}]},"b":1}'
    );
  });

  it("refuses floats and other inexact values", () => {
    expect(() => canonicalJson({ price: 1075.5 })).toThrow(SnapshotError);
    expect(() => canonicalJson({ big: Number.MAX_SAFE_INTEGER + 1 })).toThrow(SnapshotError);
    expect(() => canonicalJson({ when: new Date(0) })).toThrow(SnapshotError);
    expect(canonicalJson({ minor: 118000n })).toBe('{"minor":"118000"}');
  });
});

describe("version snapshot", () => {
  const lineA = {
    skuId: "BEV-00013",
    channelId: "default",
    locationId: null,
    line: { proposed_price_minor: 488000, proposed_margin_pct: "18.0085" },
  };
  const lineB = {
    skuId: "BEV-00001",
    channelId: "default",
    locationId: null,
    line: { proposed_price_minor: 118000, proposed_margin_pct: "18.0085" },
  };

  it("gives the same fingerprint whatever order the lines arrive in", () => {
    const one = buildVersionSnapshot({ ...base, lines: [lineA, lineB] });
    const two = buildVersionSnapshot({ ...base, lines: [lineB, lineA] });
    expect(one.hash).toBe(two.hash);
    expect(one.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(one.snapshot.line_count).toBe(2);
    expect((one.snapshot.lines as { sku_id: string }[]).map((l) => l.sku_id)).toEqual([
      "BEV-00001",
      "BEV-00013",
    ]);
    expect(snapshotHash(one.snapshot)).toBe(one.hash);
  });

  it("changes the fingerprint when any value changes", () => {
    const one = buildVersionSnapshot({ ...base, lines: [lineA, lineB] });
    const edited = buildVersionSnapshot({
      ...base,
      lines: [lineA, { ...lineB, line: { ...lineB.line, proposed_price_minor: 118010 } }],
    });
    expect(edited.hash).not.toBe(one.hash);
  });

  it("keeps line identity even if a line carries clashing fields", () => {
    const out = buildVersionSnapshot({
      ...base,
      lines: [{ ...lineA, line: { ...lineA.line, sku_id: "SPOOF" } }],
    });
    expect((out.snapshot.lines as { sku_id: string }[])[0]!.sku_id).toBe("BEV-00013");
  });

  it("refuses an empty version and duplicate lines", () => {
    expect(() => buildVersionSnapshot({ ...base, lines: [] })).toThrow(SnapshotError);
    expect(() => buildVersionSnapshot({ ...base, lines: [lineA, lineA] })).toThrow(/twice/);
  });
});
