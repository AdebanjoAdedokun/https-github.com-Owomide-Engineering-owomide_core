import { describe, expect, it } from "vitest";
import {
  type AuthorisedLine,
  type ImplementationRecord,
  EXECUTION_CSV_COLUMNS,
  buildExecutionCsv,
  formatMinor,
  lineKey,
  summariseExecution,
  validateImplementation,
} from "../../domain/execution.js";

function line(n: number, overrides: Partial<AuthorisedLine> = {}): AuthorisedLine {
  return {
    skuId: `sku-${n}`,
    skuCode: `BEV-${String(n).padStart(5, "0")}`,
    productName: `Orange Juice ${n}`,
    category: "Beverages",
    channelId: "chan-default",
    channelCode: "default",
    locationId: null,
    locationCode: null,
    currency: "NGN",
    currentPriceMinor: 107500n,
    authorisedPriceMinor: 118000n,
    taxInclusive: true,
    effectiveFrom: "2026-10-20T00:00:00+01:00",
    effectiveTo: null,
    notes: "",
    ...overrides,
  };
}

const done = (l: AuthorisedLine, outcome: ImplementationRecord["outcome"] = "implemented", price?: bigint): ImplementationRecord => ({
  skuId: l.skuId,
  channelId: l.channelId,
  locationId: l.locationId,
  outcome,
  authorisedPriceMinor: l.authorisedPriceMinor,
  implementedPriceMinor: outcome === "failed" ? null : (price ?? l.authorisedPriceMinor),
});

// Journey J1 hand-off: version 2 has 31 lines.
const v2 = Array.from({ length: 31 }, (_, i) => line(i + 1));

describe("summariseExecution", () => {
  it("is Not Started before anything is recorded", () => {
    const s = summariseExecution(v2, []);
    expect(s.status).toBe("not_started");
    expect(s.notRecorded).toBe(31);
  });

  it("J1: 28 implemented and 3 failed is Partially Implemented, naming the 3", () => {
    const records = v2.map((l, i) => done(l, i >= 28 ? "failed" : "implemented"));
    const s = summariseExecution(v2, records);
    expect(s.status).toBe("partially_implemented");
    expect(s.implemented).toBe(28);
    expect(s.failed).toBe(3);
    expect(s.outstanding).toEqual(v2.slice(28).map(lineKey));
  });

  it("J1: once the 3 are fixed the work is Implemented", () => {
    expect(summariseExecution(v2, v2.map((l) => done(l))).status).toBe("implemented");
  });

  it("a line recorded at a different price counts as implemented and shows variance", () => {
    const records = v2.map((l, i) => (i === 0 ? done(l, "implemented_different", 117900n) : done(l)));
    const s = summariseExecution(v2, records);
    expect(s.status).toBe("implemented");
    expect(s.variances).toEqual([
      { key: lineKey(v2[0]!), authorisedMinor: 118000n, implementedMinor: 117900n, differenceMinor: -100n },
    ]);
  });

  it("does not let an Implementation Exception hide unfinished lines", () => {
    const records = v2.map((l, i) => done(l, i === 0 ? "failed" : "implemented"));
    const s = summariseExecution(v2, records, true);
    expect(s.status).toBe("implementation_exception");
    expect(s.outstanding).toHaveLength(1);
  });

  it("refuses a record that is not an authorised line", () => {
    expect(() => summariseExecution(v2, [done(line(999))])).toThrow(/does not match any authorised line/);
  });

  it("keeps store locations apart", () => {
    const ikeja = line(1, { locationId: "loc-ikj", locationCode: "IKJ" });
    const lekki = line(1, { locationId: "loc-lkk", locationCode: "LKK" });
    const s = summariseExecution([ikeja, lekki], [done(ikeja)]);
    expect(s.status).toBe("partially_implemented");
    expect(s.outstanding).toEqual([lineKey(lekki)]);
  });
});

describe("validateImplementation", () => {
  const l = line(1);
  it("needs a reason for a failed line", () => {
    expect(validateImplementation(l, { outcome: "failed" })).toMatchObject({ ok: false, code: "FAILURE_REASON_REQUIRED" });
    expect(validateImplementation(l, { outcome: "failed", failureReason: "POS offline" })).toEqual({ ok: true });
  });
  it("needs a POS reference and effective time for an implemented line (D-06)", () => {
    expect(validateImplementation(l, { outcome: "implemented" })).toMatchObject({ code: "REFERENCE_REQUIRED" });
    expect(validateImplementation(l, { outcome: "implemented", reference: "POS-7781" })).toMatchObject({
      code: "EFFECTIVE_TIME_REQUIRED",
    });
    expect(
      validateImplementation(l, { outcome: "implemented", reference: "POS-7781", actualEffectiveAt: "2026-10-20T08:00:00+01:00" }),
    ).toEqual({ ok: true });
  });
  it("needs a genuinely different price to record variance", () => {
    const base = { reference: "POS-7781", actualEffectiveAt: "2026-10-20T08:00:00+01:00" };
    expect(validateImplementation(l, { outcome: "implemented_different", ...base })).toMatchObject({
      code: "IMPLEMENTED_PRICE_REQUIRED",
    });
    expect(validateImplementation(l, { outcome: "implemented_different", implementedPriceMinor: 118000n, ...base })).toMatchObject({
      code: "NO_VARIANCE",
    });
  });
});

describe("buildExecutionCsv", () => {
  const meta = { initiativeId: "init-1", proposalId: "prop-1", version: 2 };

  it("writes one row per line with the approved price and dates, and no cost data", () => {
    const csv = buildExecutionCsv(meta, v2);
    const rows = csv.trimEnd().split("\r\n");
    expect(rows[0]).toBe(EXECUTION_CSV_COLUMNS.join(","));
    expect(rows).toHaveLength(32);
    expect(rows[1]).toBe(
      "init-1,prop-1,2,BEV-00001,Orange Juice 1,Beverages,,default,1075.00,1180.00,NGN,true,2026-10-20T00:00:00+01:00,,",
    );
    expect(csv.toLowerCase()).not.toMatch(/cost|margin|markup|gross/);
  });

  it("quotes commas and quotes, and neutralises spreadsheet formulas", () => {
    const csv = buildExecutionCsv(meta, [line(1, { productName: 'Juice, "Premium" 1L', notes: "=HYPERLINK(\"x\")" })]);
    const row = csv.split("\r\n")[1]!;
    expect(row).toContain('"Juice, ""Premium"" 1L"');
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it("formats minor units exactly", () => {
    expect(formatMinor(1049999n, "NGN")).toBe("10499.99");
    expect(formatMinor(5n, "KES")).toBe("0.05");
    expect(() => formatMinor(1n, "XXX")).toThrow(/unsupported currency/);
  });
});
