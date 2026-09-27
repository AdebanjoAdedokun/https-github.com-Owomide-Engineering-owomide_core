"""Deterministic pricing calculations and guardrail evaluation.

One implementation of the MVP PRD calculation definitions (DATA-022, ANALYSIS-003 to 007,
ANALYSIS-014, ANALYSIS-023, GOV-025), shared by previews, analysis, Proposal preparation and
guardrail evaluation. It follows calculation conventions C-1 to C-6, proposed in ADR-015
(docs/adr/015-pricing-engine-contract.md) and not yet ratified.

Values are exact fractions in major currency units. Nothing is rounded except where a rounding
step is named. A value that cannot be calculated is an Unavailable with a reason, never zero.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

ENGINE_VERSION = "pricing-v1"

_HUNDRED = Fraction(100)
_HALF = Fraction(1, 2)

ACTIONS = frozenset(
    {
        "set_price",
        "pct_increase",
        "pct_decrease",
        "abs_increase",
        "abs_decrease",
        "discount_pct",
        "discount_abs",
        "target_margin",
        "target_markup",
    }
)
GUARDRAIL_TYPES = frozenset(
    {"min_gross_margin_pct", "min_markup_pct", "max_increase_pct", "max_decrease_pct"}
)
TREATMENTS = frozenset({"Warning", "Approval Escalation", "Blocking"})
ROUNDING_MODES = frozenset({"nearest", "up", "down"})

WITHIN = "Within Guardrail"
BREACH = "Breach"
UNABLE = "Unable to Evaluate"


@dataclass(frozen=True, slots=True)
class Unavailable:
    """A value the product must show as unavailable, with a stable reason code."""

    reason: str

    def __bool__(self) -> bool:
        return False


type Value = Fraction | Unavailable


class InvalidPricingRequestError(ValueError):
    """Raised when a request is malformed rather than merely missing information."""


def is_unavailable(value: object) -> bool:
    return isinstance(value, Unavailable)


def exact(value: str | int | Fraction) -> Fraction:
    """Exact fraction from a decimal string or integer. Floats are refused."""
    if isinstance(value, float):
        raise InvalidPricingRequestError("amounts and rates must be decimal strings, not floats")
    if isinstance(value, str):
        try:
            return Fraction(Decimal(value))
        except ArithmeticError as exc:
            raise InvalidPricingRequestError(f"not a decimal number: {value!r}") from exc
    return Fraction(value)


# ------------------------------------------------------------------ tax basis (DATA-022)


def tax_exclusive(amount: Value, tax_inclusive: bool | None, rate_pct: Fraction | None) -> Value:
    """Calculation price. Tax-exclusive = tax-inclusive / (1 + rate)."""
    if isinstance(amount, Unavailable):
        return amount
    if tax_inclusive is None:
        return Unavailable("tax_basis_unknown")
    if not tax_inclusive:
        return amount
    if rate_pct is None:
        return Unavailable("tax_rate_missing")
    return amount / (1 + rate_pct / _HUNDRED)


def tax_inclusive(excl: Value, rate_pct: Fraction | None) -> Value:
    if isinstance(excl, Unavailable):
        return excl
    if rate_pct is None:
        return Unavailable("tax_rate_missing")
    return excl * (1 + rate_pct / _HUNDRED)


# ------------------------------------------------------------------ economics (ANALYSIS-003 to 005)


def gross_profit(price: Value, cost: Value) -> Value:
    if isinstance(price, Unavailable):
        return price
    if isinstance(cost, Unavailable):
        return cost
    return price - cost


def gross_margin_pct(price: Value, cost: Value) -> Value:
    if isinstance(price, Unavailable):
        return price
    if isinstance(cost, Unavailable):
        return cost
    if price <= 0:
        return Unavailable("price_not_positive")
    return (price - cost) / price * _HUNDRED


def markup_pct(price: Value, cost: Value) -> Value:
    if isinstance(price, Unavailable):
        return price
    if isinstance(cost, Unavailable):
        return cost
    if cost <= 0:
        return Unavailable("cost_not_positive")
    return (price - cost) / cost * _HUNDRED


def target_margin_price(cost: Value, target_pct: Fraction, negative_permitted: bool) -> Value:
    """Tax-exclusive price = cost / (1 - target / 100), unrounded."""
    if isinstance(cost, Unavailable):
        return cost
    if cost <= 0:
        return Unavailable("cost_not_positive")
    if target_pct >= _HUNDRED:
        return Unavailable("target_margin_at_or_above_100")
    if target_pct < 0 and not negative_permitted:
        return Unavailable("negative_target_not_permitted")
    return cost / (1 - target_pct / _HUNDRED)


def target_markup_price(cost: Value, target_pct: Fraction, negative_permitted: bool) -> Value:
    """Tax-exclusive price = cost * (1 + target / 100), unrounded."""
    if isinstance(cost, Unavailable):
        return cost
    if cost <= 0:
        return Unavailable("cost_not_positive")
    if target_pct < -_HUNDRED:
        return Unavailable("target_markup_below_minus_100")
    if target_pct < 0 and not negative_permitted:
        return Unavailable("negative_target_not_permitted")
    return cost * (1 + target_pct / _HUNDRED)


# ------------------------------------------------------------------ adjustments (ANALYSIS-006)


def adjust(baseline: Value, action: str, value: Fraction) -> Value:
    if action == "set_price":
        return value if value >= 0 else Unavailable("negative_price")
    if isinstance(baseline, Unavailable):
        return baseline
    if value < 0:
        return Unavailable("negative_adjustment_use_opposite_action")
    if action in ("pct_decrease", "discount_pct") and value > _HUNDRED:
        return Unavailable("percentage_reduction_over_100")
    if action == "pct_increase":
        result = baseline * (1 + value / _HUNDRED)
    elif action in ("pct_decrease", "discount_pct"):
        result = baseline * (1 - value / _HUNDRED)
    elif action == "abs_increase":
        result = baseline + value
    elif action in ("abs_decrease", "discount_abs"):
        result = baseline - value
    else:
        raise InvalidPricingRequestError(f"unsupported adjustment action: {action}")
    return result if result >= 0 else Unavailable("negative_price")


def price_change(current: Value, proposed: Value) -> tuple[Value, Value]:
    """(absolute change, percentage change) against Current Price."""
    if isinstance(current, Unavailable):
        missing = Unavailable("current_price_unavailable")
        return missing, missing
    if isinstance(proposed, Unavailable):
        return proposed, proposed
    pct: Value = (
        Unavailable("zero_baseline") if current == 0 else (proposed - current) / current * _HUNDRED
    )
    return proposed - current, pct


# ------------------------------------------------------------------ rounding (ANALYSIS-023)


def round_to_increment(value: Value, increment: Fraction, mode: str) -> Value:
    """Commercial rounding. 'nearest' rounds a midpoint up (prices are never negative)."""
    if isinstance(value, Unavailable):
        return value
    if increment <= 0:
        raise InvalidPricingRequestError("rounding increment must be positive")
    steps = value / increment
    if mode == "up":
        n = -((-steps.numerator) // steps.denominator)
    elif mode == "down":
        n = steps.numerator // steps.denominator
    elif mode == "nearest":
        shifted = steps + _HALF
        n = shifted.numerator // shifted.denominator
    else:
        raise InvalidPricingRequestError(f"unsupported rounding mode: {mode}")
    return n * increment


def round_to_minor_unit(value: Value, minor_digits: int = 2) -> Value:
    """Half-up to the currency minor unit. Used only when a value becomes a proposed price."""
    if isinstance(value, Unavailable):
        return value
    scaled = Decimal(value.numerator) / Decimal(value.denominator) * (Decimal(10) ** minor_digits)
    return Fraction(int(scaled.quantize(Decimal(1), rounding=ROUND_HALF_UP)), 10**minor_digits)


# ------------------------------------------------------------------ guardrails (ANALYSIS-014)


@dataclass(frozen=True, slots=True)
class Guardrail:
    kind: str
    threshold: Fraction
    treatment: str = "Blocking"
    guardrail_id: str = ""
    version: int = 1

    def __post_init__(self) -> None:
        if self.kind not in GUARDRAIL_TYPES:
            raise InvalidPricingRequestError(f"unsupported guardrail type: {self.kind}")
        if self.treatment not in TREATMENTS:
            raise InvalidPricingRequestError(f"unsupported guardrail treatment: {self.treatment}")


@dataclass(frozen=True, slots=True)
class GuardrailResult:
    guardrail: Guardrail
    state: str
    actual: Fraction | None = None
    gap: Fraction | None = None
    reason: str | None = None


def evaluate_guardrail(
    guardrail: Guardrail,
    *,
    price_excl: Value,
    cost: Value,
    current: Value,
    proposed: Value,
) -> GuardrailResult:
    """One guardrail, one result. Limits are inclusive: exactly on the limit is Within (C-5)."""
    limit = guardrail.threshold
    if guardrail.kind in ("min_gross_margin_pct", "min_markup_pct"):
        fn = gross_margin_pct if guardrail.kind == "min_gross_margin_pct" else markup_pct
        measured = fn(price_excl, cost)
        if isinstance(measured, Unavailable):
            return GuardrailResult(guardrail, UNABLE, reason=measured.reason)
        if measured >= limit:
            return GuardrailResult(guardrail, WITHIN, actual=measured)
        return GuardrailResult(guardrail, BREACH, actual=measured, gap=limit - measured)
    _, pct = price_change(current, proposed)
    if isinstance(pct, Unavailable):
        return GuardrailResult(guardrail, UNABLE, reason=pct.reason)
    movement = pct if guardrail.kind == "max_increase_pct" else -pct
    if movement <= limit:
        return GuardrailResult(guardrail, WITHIN, actual=pct)
    return GuardrailResult(guardrail, BREACH, actual=pct, gap=movement - limit)


# ------------------------------------------------------------------ one Proposal line


@dataclass(frozen=True, slots=True)
class Rounding:
    increment: Fraction
    mode: str = "nearest"

    def __post_init__(self) -> None:
        if self.mode not in ROUNDING_MODES:
            raise InvalidPricingRequestError(f"unsupported rounding mode: {self.mode}")


@dataclass(frozen=True, slots=True)
class PricingLine:
    """Inputs for one line. Prices are the operational (shelf) amounts as recorded."""

    current_price: Value
    tax_inclusive: bool | None
    tax_rate_pct: Fraction | None
    cost: Value
    action: str | None = None
    action_value: Fraction | None = None
    rounding: Rounding | None = None
    guardrails: tuple[Guardrail, ...] = ()
    negative_target_permitted: bool = False
    minor_digits: int = 2

    def __post_init__(self) -> None:
        if self.action is not None and self.action not in ACTIONS:
            raise InvalidPricingRequestError(f"unsupported pricing action: {self.action}")
        if self.action is not None and self.action_value is None:
            raise InvalidPricingRequestError("a pricing action needs a value")


@dataclass(frozen=True, slots=True)
class Economics:
    operational_price: Value
    calculation_price_excl_tax: Value
    gross_profit: Value
    gross_margin_pct: Value
    markup_pct: Value


@dataclass(frozen=True, slots=True)
class LineResult:
    current: Economics
    unrounded_operational_price: Value | None = None
    proposed: Economics | None = None
    change_abs: Value | None = None
    change_pct: Value | None = None
    target_met_exactly: bool | None = None
    guardrails: tuple[GuardrailResult, ...] = field(default_factory=tuple)
    engine_version: str = ENGINE_VERSION


def _economics(operational: Value, line: PricingLine) -> Economics:
    excl = tax_exclusive(operational, line.tax_inclusive, line.tax_rate_pct)
    return Economics(
        operational_price=operational,
        calculation_price_excl_tax=excl,
        gross_profit=gross_profit(excl, line.cost),
        gross_margin_pct=gross_margin_pct(excl, line.cost),
        markup_pct=markup_pct(excl, line.cost),
    )


def evaluate_line(line: PricingLine) -> LineResult:
    """Current Price to guarded proposed price, in the PRD's order.

    1. Calculation price = tax-exclusive Current Price (DATA-022).
    2. Adjustments apply to the Current Price as recorded; target margin and markup give a
       tax-exclusive price that is converted to the operational basis (C-4).
    3. The named commercial rounding, otherwise the currency minor unit, half-up (C-2, C-3).
    4. Economics, change and every guardrail use the final price (C-5).
    """
    current = _economics(line.current_price, line)
    if line.action is None:
        results = tuple(
            evaluate_guardrail(
                g,
                price_excl=current.calculation_price_excl_tax,
                cost=line.cost,
                current=line.current_price,
                proposed=line.current_price,
            )
            for g in line.guardrails
        )
        return LineResult(current=current, guardrails=results)

    assert line.action_value is not None
    if line.action in ("target_margin", "target_markup"):
        derive = target_margin_price if line.action == "target_margin" else target_markup_price
        excl_target = derive(line.cost, line.action_value, line.negative_target_permitted)
        unrounded = (
            tax_inclusive(excl_target, line.tax_rate_pct)
            if line.tax_inclusive and not isinstance(excl_target, Unavailable)
            else excl_target
        )
    else:
        unrounded = adjust(line.current_price, line.action, line.action_value)

    if line.rounding is not None:
        final = round_to_increment(unrounded, line.rounding.increment, line.rounding.mode)
    else:
        final = round_to_minor_unit(unrounded, line.minor_digits)

    proposed = _economics(final, line)
    change_abs, change_pct = price_change(line.current_price, final)
    target_met: bool | None = None
    if line.action in ("target_margin", "target_markup") and not isinstance(final, Unavailable):
        achieved = (
            proposed.gross_margin_pct if line.action == "target_margin" else proposed.markup_pct
        )
        target_met = not isinstance(achieved, Unavailable) and achieved == line.action_value
    results = tuple(
        evaluate_guardrail(
            g,
            price_excl=proposed.calculation_price_excl_tax,
            cost=line.cost,
            current=line.current_price,
            proposed=final,
        )
        for g in line.guardrails
    )
    return LineResult(
        current=current,
        unrounded_operational_price=unrounded,
        proposed=proposed,
        change_abs=change_abs,
        change_pct=change_pct,
        target_met_exactly=target_met,
        guardrails=results,
    )
