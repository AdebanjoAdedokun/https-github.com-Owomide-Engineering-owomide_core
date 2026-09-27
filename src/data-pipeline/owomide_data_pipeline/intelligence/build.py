"""Proposal build: one pricing action applied to every member of a scope (PRD BUILD-001 to 010).

A build takes the scope members (a product in one context, with its Current Price, tax basis and
applicable unit cost), one action for all of them, optional entity-level exceptions, optional
commercial rounding and the guardrails in force, and returns one evaluated line per member plus
a status that says what the line needs before it can be submitted:

- ``blocked``: a Blocking guardrail is breached, or any guardrail cannot be evaluated;
- ``needs_escalation``: an Approval Escalation guardrail is breached;
- ``warning``: a Warning guardrail is breached;
- ``clear``: every guardrail is within its limit.

All arithmetic is the pricing engine's (``pricing.evaluate_line``); this module only orchestrates.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from fractions import Fraction

from owomide_data_pipeline.intelligence.pricing import (
    BREACH,
    UNABLE,
    Guardrail,
    LineResult,
    PricingLine,
    Rounding,
    Value,
    evaluate_line,
)

BLOCKED = "blocked"
NEEDS_ESCALATION = "needs_escalation"
WARNING = "warning"
CLEAR = "clear"


@dataclass(frozen=True, slots=True)
class Member:
    """One product in one context. ``cost`` may be ``Unavailable`` with its reason."""

    sku_code: str
    current_price: Value
    tax_inclusive: bool | None
    tax_rate_pct: Fraction | None
    cost: Value
    location: str = ""
    channel: str = ""

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.sku_code, self.location, self.channel)


@dataclass(frozen=True, slots=True)
class Action:
    kind: str
    value: Fraction


@dataclass(frozen=True, slots=True)
class BuildRequest:
    action: Action
    guardrails: tuple[Guardrail, ...] = ()
    rounding: Rounding | None = None
    # Entity-level exceptions: a different action for named products (every context of them).
    exceptions: Mapping[str, Action] | None = None


@dataclass(frozen=True, slots=True)
class BuildLine:
    member: Member
    action: Action
    result: LineResult
    status: str


def line_status(result: LineResult) -> str:
    states = [(r.guardrail.treatment, r.state) for r in result.guardrails]
    if any(state == UNABLE for _, state in states) or ("Blocking", BREACH) in states:
        return BLOCKED
    if ("Approval Escalation", BREACH) in states:
        return NEEDS_ESCALATION
    if ("Warning", BREACH) in states:
        return WARNING
    return CLEAR


def build(members: Iterable[Member], request: BuildRequest) -> list[BuildLine]:
    """Evaluates every member. Duplicate members (same product and context) are refused."""
    seen: set[tuple[str, str, str]] = set()
    lines: list[BuildLine] = []
    exceptions = request.exceptions or {}
    for member in members:
        if member.key in seen:
            raise ValueError(f"member {member.key} appears twice in the scope")
        seen.add(member.key)
        action = exceptions.get(member.sku_code, request.action)
        result = evaluate_line(
            PricingLine(
                current_price=member.current_price,
                tax_inclusive=member.tax_inclusive,
                tax_rate_pct=member.tax_rate_pct,
                cost=member.cost,
                action=action.kind,
                action_value=action.value,
                rounding=request.rounding,
                guardrails=request.guardrails,
            )
        )
        lines.append(BuildLine(member, action, result, line_status(result)))
    return lines


def summarise(lines: Sequence[BuildLine]) -> dict[str, int]:
    """Count of lines by status, with every status present."""
    counts = Counter(line.status for line in lines)
    return {status: counts.get(status, 0) for status in (BLOCKED, NEEDS_ESCALATION, WARNING, CLEAR)}
