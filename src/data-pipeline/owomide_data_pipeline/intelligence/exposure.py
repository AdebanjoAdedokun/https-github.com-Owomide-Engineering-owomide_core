"""Margin Exposure View: which products breach a guardrail at their Current Price (ANALYSIS-014).

Every member is evaluated against the guardrail at its Current Price, with no action. The view
lists breaches (with the measured value and the gap to the limit, largest gap first) and members
that cannot be evaluated (with the reason), and counts the rest as within the guardrail. A member
that cannot be evaluated is never counted as within.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from fractions import Fraction

from owomide_data_pipeline.intelligence.build import Member
from owomide_data_pipeline.intelligence.pricing import (
    BREACH,
    UNABLE,
    Guardrail,
    PricingLine,
    evaluate_line,
)


@dataclass(frozen=True, slots=True)
class ExposureItem:
    member: Member
    state: str  # BREACH or UNABLE
    actual: Fraction | None = None
    gap: Fraction | None = None
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class Exposure:
    guardrail: Guardrail
    breaches: tuple[ExposureItem, ...]
    unable: tuple[ExposureItem, ...]
    within: int


def exposure(members: Iterable[Member], guardrail: Guardrail) -> Exposure:
    breaches: list[ExposureItem] = []
    unable: list[ExposureItem] = []
    within = 0
    for member in members:
        (result,) = evaluate_line(
            PricingLine(
                current_price=member.current_price,
                tax_inclusive=member.tax_inclusive,
                tax_rate_pct=member.tax_rate_pct,
                cost=member.cost,
                guardrails=(guardrail,),
            )
        ).guardrails
        if result.state == BREACH:
            breaches.append(ExposureItem(member, BREACH, result.actual, result.gap))
        elif result.state == UNABLE:
            unable.append(ExposureItem(member, UNABLE, reason=result.reason))
        else:
            within += 1
    breaches.sort(key=lambda item: (-(item.gap or 0), item.member.key))
    unable.sort(key=lambda item: item.member.key)
    return Exposure(guardrail, tuple(breaches), tuple(unable), within)
