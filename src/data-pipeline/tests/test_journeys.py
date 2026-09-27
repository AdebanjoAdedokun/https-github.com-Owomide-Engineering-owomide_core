"""Journeys J1 and J2 and the Margin Exposure View, end to end on the engine.

The unit tests always run. The conformance tests read the 5,000-SKU pilot test catalogue
(``OWOMIDE_TEST_CATALOGUE``) and compare every line with answers computed independently by the
calculation test pack's reference calculator, to four decimal places.
"""

from __future__ import annotations

import json
import os
import unittest
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from pathlib import Path
from typing import Any

from owomide_data_pipeline.intelligence.build import (
    BLOCKED,
    CLEAR,
    NEEDS_ESCALATION,
    WARNING,
    Action,
    BuildLine,
    BuildRequest,
    Member,
    build,
    summarise,
)
from owomide_data_pipeline.intelligence.exposure import exposure
from owomide_data_pipeline.intelligence.pricing import (
    Economics,
    Guardrail,
    Rounding,
    Unavailable,
    exact,
)
from owomide_data_pipeline.intelligence.readiness import Settings, current_members, load_csv

VAT = Fraction(15, 2)
MIN15 = Guardrail("min_gross_margin_pct", Fraction(15), "Blocking", "min-margin-15")
MAX12 = Guardrail("max_increase_pct", Fraction(12), "Blocking", "max-increase-12")


def q(value: object, dp: int) -> str:
    """Half-up to ``dp`` places, as the reference calculator shows values."""
    if not isinstance(value, Fraction):
        raise AssertionError(f"expected an exact value, got {value!r}")
    d = Decimal(value.numerator) / Decimal(value.denominator)
    return format(d.quantize(Decimal(1).scaleb(-dp), rounding=ROUND_HALF_UP), "f")


def proposed(line: BuildLine) -> Economics:
    if line.result.proposed is None:
        raise AssertionError("the line has no proposed price")
    return line.result.proposed


def member(sku: str, price: str, cost: str | None, **extra: str) -> Member:
    return Member(
        sku_code=sku,
        current_price=exact(price),
        tax_inclusive=True,
        tax_rate_pct=VAT,
        cost=exact(cost) if cost is not None else Unavailable("no_applicable_cost_record"),
        **extra,
    )


class BuildTest(unittest.TestCase):
    def test_prd_anchor_line(self) -> None:
        # PRD section 2.6: 1,075.00 incl. VAT, landed cost 900.00, target 18%, nearest 10.
        (line,) = build(
            [member("BEV-00001", "1075.00", "900.00")],
            BuildRequest(
                Action("target_margin", Fraction(18)),
                (MIN15, MAX12),
                Rounding(Fraction(10), "nearest"),
            ),
        )
        assert line.result.proposed is not None
        self.assertEqual(line.result.proposed.operational_price, Fraction(1180))
        self.assertEqual(q(line.result.change_pct, 4), "9.7674")
        self.assertEqual(line.status, CLEAR)

    def test_status_follows_the_guardrail_treatment(self) -> None:
        escalate = Guardrail("min_gross_margin_pct", Fraction(15), "Approval Escalation")
        warn = Guardrail("max_decrease_pct", Fraction(10), "Warning")
        lines = build(
            [
                member("A", "1075.00", "900.00"),  # 10% off: margin falls below 15%, 10% cut ok
                member("B", "1075.00", "500.00"),  # comfortable margin
                member("C", "1075.00", None),  # no cost: cannot be evaluated
            ],
            BuildRequest(Action("discount_pct", Fraction(10)), (escalate, warn)),
        )
        self.assertEqual([x.status for x in lines], [NEEDS_ESCALATION, CLEAR, BLOCKED])
        lines = build(
            [member("B", "1075.00", "500.00")],
            BuildRequest(Action("discount_pct", Fraction(20)), (escalate, warn)),
        )
        self.assertEqual(lines[0].status, WARNING)
        self.assertEqual(summarise(lines), {BLOCKED: 0, NEEDS_ESCALATION: 0, WARNING: 1, CLEAR: 0})

    def test_exceptions_apply_to_every_context_of_a_product(self) -> None:
        lines = build(
            [
                member("HERO", "100.00", "10.00", location="IKJ", channel="store"),
                member("HERO", "100.00", "10.00", channel="online"),
                member("OTHER", "100.00", "10.00", channel="online"),
            ],
            BuildRequest(
                Action("discount_pct", Fraction(25)),
                exceptions={"HERO": Action("discount_pct", Fraction(30))},
            ),
        )
        self.assertEqual(
            [proposed(x).operational_price for x in lines],
            [Fraction(70), Fraction(70), Fraction(75)],
        )

    def test_refuses_a_scope_that_lists_a_member_twice(self) -> None:
        with self.assertRaises(ValueError):
            build(
                [member("A", "10.00", "5.00"), member("A", "11.00", "5.00")],
                BuildRequest(Action("pct_increase", Fraction(1))),
            )

    def test_exposure_lists_breaches_by_gap_and_never_counts_unknowns_as_within(self) -> None:
        view = exposure(
            [
                member("A", "1075.00", "900.00"),  # 10.0%: gap 5 points
                member("B", "1075.00", "880.00"),  # 12.0%: gap 3 points
                member("C", "1075.00", "500.00"),  # 50%: within
                member("D", "1075.00", None),
            ],
            MIN15,
        )
        self.assertEqual([i.member.sku_code for i in view.breaches], ["A", "B"])
        self.assertEqual(view.breaches[0].gap, Fraction(5))
        self.assertEqual(
            [(i.member.sku_code, i.reason) for i in view.unable],
            [("D", "no_applicable_cost_record")],
        )
        self.assertEqual(view.within, 1)


@unittest.skipUnless(
    os.environ.get("OWOMIDE_TEST_CATALOGUE"),
    "set OWOMIDE_TEST_CATALOGUE to the core-handoff/test-catalogue directory",
)
class JourneyConformanceTest(unittest.TestCase):
    root: Path
    products: list[dict[str, str]]
    prices: list[tuple[str, list[dict[str, str]]]]
    opening: tuple[str, list[dict[str, str]]]
    update: tuple[str, list[dict[str, str]]]

    @classmethod
    def setUpClass(cls) -> None:
        cls.root = Path(os.environ["OWOMIDE_TEST_CATALOGUE"])
        data = cls.root / "data"
        cls.products = load_csv(data / "products.csv")
        cls.prices = [("prices.csv", load_csv(data / "prices.csv"))]
        cls.opening = ("costs.csv", load_csv(data / "costs.csv"))
        name = "costs_supplier_update_2026-10-12.csv"
        cls.update = (name, load_csv(data / name))

    def expected(self, name: str) -> dict[str, Any]:
        return json.loads((self.root / "expected" / f"{name}.json").read_text())

    def settings(self, at: str) -> Settings:
        return Settings(
            currency="NGN",
            default_tax_inclusive=True,
            default_tax_rate_pct=VAT,
            cost_basis="landed",
            at=datetime.fromisoformat(at),
        )

    def members_after_update(self) -> list[Member]:
        members, _ = current_members(
            self.products,
            self.prices,
            [self.opening, self.update],
            self.settings("2026-10-13T00:00:00+01:00"),
        )
        return members

    def test_exposure_before_and_after_the_supplier_update(self) -> None:
        before, _ = current_members(
            self.products, self.prices, [self.opening], self.settings("2026-10-01T00:00:00+01:00")
        )
        view = exposure(before, MIN15)
        self.assertEqual(len(view.breaches), 0)
        self.assertEqual(
            sorted((i.member.sku_code, i.reason) for i in view.unable),
            sorted(
                (e["sku_code"], e["reason"]) for e in self.expected("baseline_exposure")["items"]
            ),
        )

        after = exposure(self.members_after_update(), MIN15)
        expected = self.expected("exposure_after_update")
        got = {i.member.sku_code: (q(i.actual, 4), q(i.gap, 4)) for i in after.breaches}
        want = {
            e["sku_code"]: (e["current_margin_pct"], e["gap_pp"])
            for e in expected["items"]
            if e["state"] == "Breach"
        }
        self.assertEqual(got, want)
        self.assertEqual(len(after.unable), expected["unable_to_evaluate_count"])
        # The PRD anchor: 10.0% margin, 5 points below the floor, the largest gap is listed first.
        self.assertEqual(got["BEV-00001"], ("10.0000", "5.0000"))

    def test_journey_j1_build_matches_line_by_line(self) -> None:
        expected = self.expected("j1_build")
        breaches = {
            i.member.sku_code for i in exposure(self.members_after_update(), MIN15).breaches
        }
        scope = [m for m in self.members_after_update() if m.sku_code in breaches]
        lines = build(
            scope,
            BuildRequest(
                Action("target_margin", Fraction(18)),
                (MIN15, MAX12),
                Rounding(Fraction(10), "nearest"),
            ),
        )
        self.assertEqual(len(lines), expected["exposed"])
        by_sku = {x.member.sku_code: x for x in lines}
        for want in expected["lines"]:
            with self.subTest(sku=want["sku_code"]):
                line = by_sku[want["sku_code"]]
                result = line.result
                assert result.proposed is not None
                self.assertEqual(
                    q(result.unrounded_operational_price, 4), want["proposed_unrounded"]
                )
                self.assertEqual(
                    q(result.proposed.operational_price, 2),
                    want["proposed_price_incl_vat"],
                )
                self.assertEqual(q(result.change_pct, 4), want["change_pct"])
                self.assertEqual(
                    q(result.proposed.gross_margin_pct, 4),
                    want["proposed_margin_pct"],
                )
                states = {r.guardrail.guardrail_id: r.state for r in result.guardrails}
                self.assertEqual(states["min-margin-15"], want["min_margin_15"])
                self.assertEqual(states["max-increase-12"], want["max_increase_12"])

        blocked = sorted(x.member.sku_code for x in lines if x.status == BLOCKED)
        self.assertEqual(blocked, sorted(expected["blocked_by_12pct_cap"]))
        passing = [x for x in lines if x.status == CLEAR]
        self.assertEqual(len(passing), 34)
        # The approver holds three premium lines; version 2 carries the other 31.
        version_2 = sorted(
            x.member.sku_code for x in passing if x.member.sku_code not in expected["held_premium"]
        )
        self.assertEqual(version_2, sorted(expected["version_2_scope"]))

    def test_journey_j2_markdown_matches_line_by_line(self) -> None:
        expected = self.expected("j2_build")
        org_wide = {m.sku_code: m for m in self.members_after_update()}
        rows = load_csv(self.root / "data" / "prices_small_appliances_by_location.csv")
        members = [
            Member(
                sku_code=r["sku_code"],
                current_price=exact(r["price"]),
                tax_inclusive=r["tax_inclusive"] == "true",
                tax_rate_pct=exact(r["tax_rate_pct"]),
                # No store-specific cost: the organisation-wide cost applies (convention C-6).
                cost=org_wide[r["sku_code"]].cost,
                location=r["location"],
                channel=r["channel"],
            )
            for r in rows
        ]
        guardrails = (
            Guardrail("min_gross_margin_pct", Fraction(15), "Approval Escalation", "min-15"),
            Guardrail("max_decrease_pct", Fraction(30), "Blocking", "max-decrease-30"),
        )
        hero = expected["hero_sku"]
        lines = build(
            members,
            BuildRequest(
                Action("discount_pct", Fraction(25)),
                guardrails,
                exceptions={hero: Action("discount_pct", Fraction(30))},
            ),
        )
        self.assertEqual(len(lines), 120)
        got = {
            x.member.key: (
                q(proposed(x).operational_price, 2),
                q(proposed(x).gross_margin_pct, 4),
                [r.state for r in x.result.guardrails],
            )
            for x in lines
        }
        want = {
            (e["sku_code"], e["location"], e["channel"]): (
                e["promo_price_incl_vat"],
                e["promo_margin_pct"],
                [e["min_margin_15_escalation"], e["max_decrease_30"]],
            )
            for e in expected["lines"]
        }
        self.assertEqual(got, want)
        self.assertEqual(summarise(lines)[NEEDS_ESCALATION], expected["escalated_combinations"])

        # The same hero at 35% would breach the 30% maximum decrease.
        hero_member = next(m for m in members if m.sku_code == hero)
        (at_35,) = build(
            [hero_member], BuildRequest(Action("discount_pct", Fraction(35)), guardrails)
        )
        states = {r.guardrail.guardrail_id: r.state for r in at_35.result.guardrails}
        self.assertEqual(states["max-decrease-30"], expected["hero_at_35pct_max_decrease_30"])


if __name__ == "__main__":
    unittest.main()
