# ADR-015: One deterministic pricing engine and its contract

## Status

Proposed. This is the pricing slice of CT-02 (issue #52), drafted 27 September 2026. The product
owner accepted the calculation conventions C-1 to C-6 on 27 September 2026, and they are recorded in
`docs/product/mvp-2026-09/delivery/DECISIONS.md`. The service ownership, field shapes and migration
steps below need lead engineer review before any runtime code changes.

## Context

The PRD requires one set of calculation definitions, used identically in the Builder preview,
analysis, Scenarios, Proposal preparation and guardrail evaluation (ANALYSIS-002). Today pricing
economics are computed in three places:

| Where | What it computes | Gap against the PRD |
|---|---|---|
| `src/proposal/src/domain/diff.ts` | Price change and percentage | Returns 0% on a zero Current Price; the result is `int32` hundredths of a percent (`proposal.proto` field 8) in a `NOT NULL` column |
| `src/margin/internal/domain/floor_calculator.go` | Margin, markup and absolute floors | Duplicates the engine's `_compute_floor`; no tax basis |
| `src/data-pipeline/owomide_data_pipeline/intelligence/rules.py` | Rule matching and floor evaluation, versioned and hashed | Reports one `applied_rule_id`; every applicable guardrail must be evaluated and kept |

In addition:
- **Guardrail types.** Rules support only `pct_margin`, `pct_markup` and `absolute_minimum`. Release 1
  needs a maximum price change guardrail.
- **Treatment.** Violations carry `BLOCK` or `WARN`, but rules do not store a treatment, and Approval
  Escalation does not exist (GOV-025).
- **Unavailable values.** Nothing can express "cannot be calculated, because …". The PRD requires this
  wherever an input is missing, ambiguous or incompatible (DATA-003, DATA-004, DATA-022,
  ANALYSIS-003 to 007, ANALYSIS-014).

## Decision

### 1. One engine owns every deterministic pricing calculation

The intelligence engine is the single implementation. It is already versioned (`engine_version`) and
hashes every evaluation (`evaluation_hash`). It computes:

- the tax-exclusive calculation price
- gross profit, gross margin and markup
- target-margin and target-markup prices
- adjustments and rounding
- price change against Current Price
- guardrail evaluation

Ownership of the other services:

| Service | Owns | Does not |
|---|---|---|
| Margin | Guardrail definitions, their versions, permissions and persistence | Compute economics; it calls the engine |
| Proposal | Storing the engine's results on the controlled version | Compute economics; it calls the engine |
| Workspace | Displaying results | Recalculate anything |
| Catalog | Record resolution (section 5) | |

`floor_calculator.go` and `diff.ts` are retired once their callers use the engine.

### 2. Values

- **Stored amounts.** Money stays `owomide.common.v1.Money` (int64 minor units).
- **Percentages and rates.** Carried as exact decimal strings in a new `owomide.common.v1.Decimal`,
  never as rounded integers (C-1).
- **Comparisons happen inside the engine,** on exact values. Consumers never recompute or re-compare.

```proto
message Decimal {            // common/v1: exact decimal as a string, e.g. "18.181818181818"
  string value = 1;
}

message Unavailable {        // common/v1: why a value cannot be calculated
  UnavailableReason reason = 1;
  string detail = 2;         // human-readable, safe to show to the user
}

enum UnavailableReason {
  UNAVAILABLE_REASON_UNSPECIFIED = 0;
  NO_APPLICABLE_PRICE_RECORD = 1;
  CURRENT_PRICE_UNRESOLVED_OVERLAP = 2;
  NO_APPLICABLE_COST_RECORD = 3;
  COST_BASIS_REQUIRES_SELECTION = 4;
  COST_CURRENCY_INCOMPATIBLE = 5;
  COST_UNIT_INCOMPATIBLE = 6;
  TAX_BASIS_UNKNOWN = 7;
  TAX_RATE_MISSING = 8;
  PRICE_NOT_POSITIVE = 9;
  COST_NOT_POSITIVE = 10;
  ZERO_BASELINE = 11;
  TARGET_MARGIN_AT_OR_ABOVE_100 = 12;
  TARGET_MARKUP_BELOW_MINUS_100 = 13;
  NEGATIVE_TARGET_NOT_PERMITTED = 14;
  NEGATIVE_ADJUSTMENT = 15;
  PERCENTAGE_REDUCTION_OVER_100 = 16;
  NEGATIVE_PRICE = 17;
}

message DecimalResult { oneof result { Decimal value = 1; Unavailable unavailable = 2; } }
message MoneyResult   { oneof result { Money value = 1;   Unavailable unavailable = 2; } }
```

### 3. Tax basis travels with every price (DATA-022)

```proto
message TaxBasis {
  bool tax_inclusive = 1;
  optional Decimal tax_rate_pct = 2;
  TaxBasisSource source = 3;   // EXPLICIT or ORGANISATION_DEFAULT, so an applied default stays visible
}
```

- Calculations use the tax-exclusive price.
- Commercial rounding applies to the shelf (operational) price (C-3).
- Targets are worked before tax, then converted to the shelf basis (C-4).

### 4. Guardrails: every applicable one, each with its own result (ANALYSIS-014, GOV-023, GOV-025)

```proto
enum GuardrailType {
  GUARDRAIL_TYPE_UNSPECIFIED = 0;
  MIN_GROSS_MARGIN_PCT = 1;
  MIN_MARKUP_PCT = 2;
  MAX_INCREASE_PCT = 3;
  MAX_DECREASE_PCT = 4;
  ABSOLUTE_MINIMUM_PRICE = 5;
}
enum GuardrailTreatment { GUARDRAIL_TREATMENT_UNSPECIFIED = 0; WARNING = 1; APPROVAL_ESCALATION = 2; BLOCKING = 3; }
enum GuardrailState { GUARDRAIL_STATE_UNSPECIFIED = 0; WITHIN = 1; BREACH = 2; UNABLE_TO_EVALUATE = 3; }

message GuardrailResult {
  string guardrail_id = 1;
  int32 guardrail_version = 2;
  GuardrailType type = 3;
  GuardrailTreatment treatment = 4;
  Decimal threshold = 5;
  GuardrailState state = 6;
  optional Decimal actual = 7;        // the measured value, when evaluable
  optional Decimal gap = 8;           // on Breach
  optional Unavailable unavailable = 9;
}
```

- **Limits are inclusive, and are judged on the final rounded price (C-5).**
- **Unable to Evaluate is never Within.**
- **No single "applied rule".** A line carries `repeated GuardrailResult`, one per applicable
  guardrail.

### 5. Record resolution belongs to Catalog (DATA-003, DATA-004)

Catalog answers two questions:
- "the Current Price for this entity, context and time"
- "the Applicable Unit Cost for this context and configured basis"

Each answer is either the exact source record or an `Unavailable` reason. Catalog never picks the
newest or an arbitrary record. A cost with no dimensions applies everywhere unless a more specific one
exists (C-6). The engine receives resolved records by reference, so every result traces back to them.

### 6. One line in, one complete result out

```proto
message PricingLineInput {
  string line_id = 1;
  MoneyResult current_price = 2;       // operational amount, with source record id
  TaxBasis current_tax_basis = 3;
  MoneyResult applicable_unit_cost = 4;
  string current_price_record_id = 5;
  string cost_record_id = 6;
  PricingAction action = 7;            // set_price, pct/abs increase/decrease, discount, target margin/markup
  optional Rounding rounding = 8;      // increment + NEAREST / UP / DOWN; default: minor unit, half-up (C-2)
  repeated GuardrailDefinition guardrails = 9;
  bool negative_target_permitted = 10;
}

message PricingLineResult {
  string line_id = 1;
  DecimalResult unrounded_operational_price = 2;
  MoneyResult proposed_price = 3;
  DecimalResult calculation_price_excl_tax = 4;
  MoneyResult gross_profit = 5;
  DecimalResult gross_margin_pct = 6;
  DecimalResult markup_pct = 7;
  MoneyResult change_abs = 8;
  DecimalResult change_pct = 9;        // ZERO_BASELINE when Current Price is 0
  optional bool target_met_exactly = 10;
  repeated GuardrailResult guardrails = 11;
  string engine_version = 12;
  string evaluation_hash = 13;
}
```

### 7. The calculation test pack is the conformance suite

The 61 cases, with exact expected values, are checked into `src/data-pipeline/tests/fixtures/pricing/`
as `cases.json`. CI runs them against the engine. The same fixture is available to Proposal and
Workspace tests. A change to any convention means regenerating the pack and reviewing every changed
expectation.

## Migration (additive first, nothing destructive)

1. Add the new common messages and engine RPC alongside the existing ones. Generate code. No
   behaviour change.
2. Implement the engine against the conformance suite until all 61 cases pass.
3. Margin:
   - Add `guardrail_type` and `treatment` columns to `margin.margin_rule`, with a data migration that
     maps existing `floor_type` rows: `pct_margin` to `MIN_GROSS_MARGIN_PCT`, `pct_markup` to
     `MIN_MARKUP_PCT`, `absolute_minimum` to `ABSOLUTE_MINIMUM_PRICE`.
   - Existing rules default to `BLOCKING`, which matches today's `BLOCK` severity.
4. Proposal:
   - Add nullable `change_pct` (numeric, full precision) and `change_pct_unavailable_reason` columns.
   - Write both from the engine.
   - Mark `diff_pct` deprecated and stop reading it. Drop it only after a release with no readers.
   - In proto, reserve field 8 and add a new `DecimalResult` field.
5. Workspace: display `Unavailable` reasons as plain words ("Not available: no cost on file"), never
   as 0 or a blank.
6. Retire `diff.ts` and `floor_calculator.go` once nothing calls them.

## Consequences

- One definition of every number, matching the PRD, and each result is traceable through its engine
  version and hash.
- Adds cross-service calls for previews. Batch the calls: the engine already evaluates batches.
- A small number of existing tests change expectation. For example, `diff.test.ts` "returns diffPct =
  0 when current price is zero" becomes an `Unavailable(ZERO_BASELINE)` expectation. That change is
  the point.

## Open questions for the lead engineer

1. **Engine language and host.** Keep the engine in the data-pipeline intelligence module (Python,
   already versioned and hashed), or move it into Margin (Go)? This draft assumes the former, because
   it already evaluates rule predicates and batches.
2. **Decimal representation.** Decimal strings or scaled int64? Strings avoid overflow and rounding
   ambiguity, but cost some parsing.
3. **Preview path.** Does the Builder preview call the engine synchronously through Gateway, or
   through Proposal?
