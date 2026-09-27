"""Conformance tests: the pricing engine against the calculation test pack.

tests/fixtures/pricing/cases.json is the pack from Owomide-pilot core-handoff/calc-test-pack
(61 cases, 30 hand-checked values). Record-resolution cases (group "Choosing records") belong to
Catalog and are checked there, not here.
"""

from __future__ import annotations

import json
import unittest
from fractions import Fraction
from pathlib import Path

from owomide_data_pipeline.intelligence.pricing import (
    Guardrail,
    InvalidPricingRequestError,
    PricingLine,
    Rounding,
    Unavailable,
    evaluate_guardrail,
    evaluate_line,
    exact,
    tax_exclusive,
)

CASES = json.loads(
    (Path(__file__).parent / "fixtures" / "pricing" / "cases.json").read_text(encoding="utf-8")
)["cases"]
ENGINE_GROUPS = {
    "Tax basis",
    "Margin and markup",
    "Targets",
    "Adjustments",
    "Rounding",
    "Price change",
    "Guardrails",
}


def _frac(text: str) -> Fraction:
    if "/" in text:
        num, den = text.split("/")
        return exact(num) / exact(den)
    return exact(text)


def _opt(value: str | None) -> Fraction | None:
    return None if value is None else exact(value)


def _guardrails(raw: list[dict]) -> tuple[Guardrail, ...]:
    return tuple(
        Guardrail(kind=g["kind"], threshold=exact(g["threshold"]), treatment=g["treatment"])
        for g in raw
    )


def _line(inputs: dict) -> PricingLine:
    action = inputs.get("action")
    rounding = inputs.get("rounding")
    cost = inputs.get("cost")
    current = inputs.get("current")
    return PricingLine(
        current_price=(
            Unavailable("current_price_unavailable") if current is None else exact(current)
        ),
        tax_inclusive=inputs.get("inclusive", False),
        tax_rate_pct=_opt(inputs.get("rate")),
        cost=Unavailable("no_applicable_cost_record") if cost is None else exact(cost),
        action=action["type"] if action else None,
        action_value=exact(action["value"]) if action else None,
        rounding=Rounding(exact(rounding["increment"]), rounding.get("mode", "nearest"))
        if rounding
        else None,
        guardrails=_guardrails(inputs.get("guardrails", [])),
        negative_target_permitted=inputs.get("negative_target_permitted", False),
    )


class PricingEngineConformanceTest(unittest.TestCase):
    def assert_value(self, case_id: str, name: str, got: object, want: dict) -> None:
        if "unavailable" in want:
            self.assertIsInstance(got, Unavailable, f"{case_id} {name}: expected unavailable")
            self.assertEqual(got.reason, want["unavailable"], f"{case_id} {name}")
        else:
            self.assertNotIsInstance(got, Unavailable, f"{case_id} {name}: got {got}")
            self.assertEqual(got, _frac(want["exact"]), f"{case_id} {name}")

    def assert_economics(self, case_id: str, prefix: str, got: object, want: dict) -> None:
        for key, attr in (
            ("operational_price", "operational_price"),
            ("calculation_price_excl_tax", "calculation_price_excl_tax"),
            ("gross_profit", "gross_profit"),
            ("gross_margin_pct", "gross_margin_pct"),
            ("markup_pct", "markup_pct"),
        ):
            if key in want:
                self.assert_value(case_id, f"{prefix}.{key}", getattr(got, attr), want[key])

    def test_every_engine_case(self) -> None:
        checked = 0
        for case in CASES:
            if case["group"] not in ENGINE_GROUPS:
                continue
            with self.subTest(case=case["id"]):
                inputs, want = case["inputs"], case["expected"]
                result = evaluate_line(_line(inputs))
                self.assert_economics(case["id"], "current", result.current, want["current"])
                if "proposed" in want:
                    p = want["proposed"]
                    self.assert_value(
                        case["id"],
                        "unrounded",
                        result.unrounded_operational_price,
                        p["unrounded_operational_price"],
                    )
                    self.assert_economics(case["id"], "proposed", result.proposed, p)
                    self.assert_value(case["id"], "change_abs", result.change_abs, p["change_abs"])
                    self.assert_value(case["id"], "change_pct", result.change_pct, p["change_pct"])
                    if "target_met_exactly" in p:
                        self.assertEqual(result.target_met_exactly, p["target_met_exactly"])
                for got, g in zip(result.guardrails, want.get("guardrails", []), strict=True):
                    self.assertEqual(got.state, g["state"], f"{case['id']} {g['kind']}")
                    if "reason" in g:
                        self.assertEqual(got.reason, g["reason"], case["id"])
                    if "actual" in g:
                        self.assert_value(case["id"], "guardrail.actual", got.actual, g["actual"])
                    if "gap_pp" in g:
                        self.assert_value(case["id"], "guardrail.gap", got.gap, g["gap_pp"])
                checked += 1
        self.assertEqual(checked, 50)

    def test_margin_exposure_listing(self) -> None:
        case = next(c for c in CASES if c["id"] == "CALC-H01")
        rule = Guardrail(kind="min_gross_margin_pct", threshold=exact("15"))
        for item, want in zip(case["inputs"]["items"], case["expected"]["items"], strict=True):
            excl = tax_exclusive(
                exact(item["price"]), item["tax_inclusive"], _opt(item["tax_rate"])
            )
            cost = (
                Unavailable("no_applicable_cost_record")
                if item["cost"] is None
                else exact(item["cost"])
            )
            got = evaluate_guardrail(rule, price_excl=excl, cost=cost, current=excl, proposed=excl)
            self.assertEqual(got.state, want["state"], item["sku"])
            self.assertEqual(got.state != "Within Guardrail", want["listed"], item["sku"])

    def test_floats_are_refused(self) -> None:
        with self.assertRaises(InvalidPricingRequestError):
            exact(10.5)  # type: ignore[arg-type]

    def test_unknown_action_is_refused(self) -> None:
        with self.assertRaises(InvalidPricingRequestError):
            PricingLine(
                current_price=exact("1"),
                tax_inclusive=False,
                tax_rate_pct=None,
                cost=exact("1"),
                action="double_it",
                action_value=exact("1"),
            )


if __name__ == "__main__":
    unittest.main()
