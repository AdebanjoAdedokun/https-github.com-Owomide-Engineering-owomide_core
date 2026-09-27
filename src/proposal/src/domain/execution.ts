// Execution hand-off and implementation status — pure, no I/O.
//
// Decision D-06 as proposed (not yet ratified); PRD EXPORT-003, EXPORT-009,
// EXEC-007 and EXEC-010. The execution file goes to store staff: it never carries cost, margin
// or any value derived from cost. Execution status is derived from the current implementation
// record for each authorised line and is never stored on its own.

export type ImplementationOutcome = "implemented" | "failed" | "implemented_different";

export type ExecutionStatus =
  | "not_started"
  | "partially_implemented"
  | "implemented"
  | "implementation_exception";

/** One authorised line from the frozen decision snapshot of the approved version. */
export interface AuthorisedLine {
  skuId: string;
  skuCode: string;
  productName: string;
  category: string;
  channelId: string;
  channelCode: string;
  locationId: string | null;
  locationCode: string | null;
  currency: string;
  currentPriceMinor: bigint;
  authorisedPriceMinor: bigint;
  taxInclusive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string;
}

/** The latest implementation record for one line (proposal.implementation_line_current). */
export interface ImplementationRecord {
  skuId: string;
  channelId: string;
  locationId: string | null;
  outcome: ImplementationOutcome;
  authorisedPriceMinor: bigint;
  implementedPriceMinor: bigint | null;
}

export interface ExecutionSummary {
  status: ExecutionStatus;
  total: number;
  implemented: number;
  failed: number;
  notRecorded: number;
  /** Lines implemented at a different price from the one authorised (EXEC-007). */
  variances: Array<{ key: string; authorisedMinor: bigint; implementedMinor: bigint; differenceMinor: bigint }>;
  /** Lines that are not yet implemented: failed or not recorded. Never hidden by the status. */
  outstanding: string[];
}

export function lineKey(line: { skuId: string; channelId: string; locationId: string | null }): string {
  return `${line.skuId}|${line.channelId}|${line.locationId ?? ""}`;
}

/**
 * Derives execution status from the authorised lines and their current records.
 * `exception` is the Executor's explicit statement that implementation cannot continue.
 */
export function summariseExecution(
  authorised: readonly AuthorisedLine[],
  records: readonly ImplementationRecord[],
  exception = false,
): ExecutionSummary {
  const byKey = new Map(records.map((r) => [lineKey(r), r] as const));
  const known = new Set(authorised.map(lineKey));
  for (const key of byKey.keys()) {
    if (!known.has(key)) {
      throw new Error(`implementation record ${key} does not match any authorised line`);
    }
  }

  let implemented = 0;
  let failed = 0;
  let notRecorded = 0;
  const variances: ExecutionSummary["variances"] = [];
  const outstanding: string[] = [];

  for (const line of authorised) {
    const key = lineKey(line);
    const record = byKey.get(key);
    if (!record) {
      notRecorded += 1;
      outstanding.push(key);
      continue;
    }
    if (record.outcome === "failed") {
      failed += 1;
      outstanding.push(key);
      continue;
    }
    implemented += 1;
    if (record.outcome === "implemented_different" && record.implementedPriceMinor !== null) {
      variances.push({
        key,
        authorisedMinor: line.authorisedPriceMinor,
        implementedMinor: record.implementedPriceMinor,
        differenceMinor: record.implementedPriceMinor - line.authorisedPriceMinor,
      });
    }
  }

  let status: ExecutionStatus;
  if (exception && implemented < authorised.length) status = "implementation_exception";
  else if (implemented === 0 && failed === 0) status = "not_started";
  else if (implemented === authorised.length) status = "implemented";
  else status = "partially_implemented";

  return { status, total: authorised.length, implemented, failed, notRecorded, variances, outstanding };
}

/** Validates one implementation request against its authorised line before it is stored. */
export function validateImplementation(
  line: AuthorisedLine,
  input: { outcome: ImplementationOutcome; implementedPriceMinor?: bigint; reference?: string; failureReason?: string; actualEffectiveAt?: string },
): { ok: true } | { ok: false; code: string; message: string } {
  if (input.outcome === "failed") {
    if (!input.failureReason?.trim()) return { ok: false, code: "FAILURE_REASON_REQUIRED", message: "Say why this line could not be implemented." };
    return { ok: true };
  }
  if (!input.reference?.trim()) return { ok: false, code: "REFERENCE_REQUIRED", message: "Add the POS or system reference for this change." };
  if (!input.actualEffectiveAt) return { ok: false, code: "EFFECTIVE_TIME_REQUIRED", message: "Add when the price actually took effect." };
  if (input.outcome === "implemented_different") {
    if (input.implementedPriceMinor === undefined || input.implementedPriceMinor < 0n) {
      return { ok: false, code: "IMPLEMENTED_PRICE_REQUIRED", message: "Add the price that was actually implemented." };
    }
    if (input.implementedPriceMinor === line.authorisedPriceMinor) {
      return { ok: false, code: "NO_VARIANCE", message: "The price matches the approved price; record it as implemented." };
    }
  }
  return { ok: true };
}

// ------------------------------------------------------------------ execution CSV (EXPORT-003)

export const EXECUTION_CSV_COLUMNS = [
  "initiative_id",
  "proposal_id",
  "version",
  "sku_code",
  "product_name",
  "category",
  "location",
  "channel",
  "current_price",
  "authorised_price",
  "currency",
  "tax_inclusive",
  "effective_from",
  "effective_to",
  "notes",
] as const;

const MINOR_DIGITS: Record<string, number> = { NGN: 2, KES: 2, ZAR: 2, GHS: 2, EGP: 2, USD: 2 };

export function formatMinor(amount: bigint, currency: string): string {
  const digits = MINOR_DIGITS[currency];
  if (digits === undefined) throw new Error(`unsupported currency for export: ${currency}`);
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const scale = 10n ** BigInt(digits);
  const whole = abs / scale;
  const frac = (abs % scale).toString().padStart(digits, "0");
  return `${negative ? "-" : ""}${whole}${digits > 0 ? `.${frac}` : ""}`;
}

/** RFC 4180 quoting, plus neutralising spreadsheet formulas in text cells. */
function cell(value: string, text: boolean): string {
  let v = value;
  if (text && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildExecutionCsv(
  meta: { initiativeId: string; proposalId: string; version: number },
  lines: readonly AuthorisedLine[],
): string {
  const rows = [EXECUTION_CSV_COLUMNS.join(",")];
  for (const l of lines) {
    rows.push(
      [
        cell(meta.initiativeId, true),
        cell(meta.proposalId, true),
        String(meta.version),
        cell(l.skuCode, true),
        cell(l.productName, true),
        cell(l.category, true),
        cell(l.locationCode ?? "", true),
        cell(l.channelCode, true),
        formatMinor(l.currentPriceMinor, l.currency),
        formatMinor(l.authorisedPriceMinor, l.currency),
        l.currency,
        l.taxInclusive ? "true" : "false",
        l.effectiveFrom,
        l.effectiveTo ?? "",
        cell(l.notes, true),
      ].join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}
