from __future__ import annotations

import unittest

from owomide_data_pipeline.intelligence.rules import (
    InvalidRuleRequestError,
    MarginItem,
    MarginRule,
    MarginRuleEngine,
    RuleCondition,
    RuleConditionGroup,
)


def item(
    *,
    item_id: str = "line-1",
    sku_id: str = "sku-1",
    channel_id: str | None = "retail",
    proposed: int = 90_000,
    currency: str = "NGN",
    cost: int | None = 80_000,
    cost_currency: str | None = "NGN",
    facts: tuple[tuple[str, str | int | bool], ...] = (),
) -> MarginItem:
    return MarginItem(
        item_id=item_id,
        sku_id=sku_id,
        channel_id=channel_id,
        category_id="category-1",
        proposed_amount_minor=proposed,
        proposed_currency=currency,
        cost_amount_minor=cost,
        cost_currency=cost_currency,
        facts=facts,
    )


def rule(
    rule_id: str,
    *,
    floor_type: str = "absolute_minimum",
    floor_value: int = 100_000,
    priority: int = 0,
    currency: str = "NGN",
    when=None,
) -> MarginRule:
    return MarginRule(
        rule_id=rule_id,
        rule_version=1,
        priority=priority,
        currency=currency,
        floor_type=floor_type,
        floor_value=floor_value,
        when=when,
    )


class MarginRuleEngineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = MarginRuleEngine()

    def test_resolves_priority_then_specificity_then_stable_rule_id(self) -> None:
        sku_match = RuleCondition("sku_id", "equals", ("sku-1",))
        candidates = (
            rule("z-org", floor_value=120_000),
            rule("b-sku", priority=100, floor_value=95_000, when=sku_match),
            rule("a-sku", priority=100, floor_value=100_000, when=sku_match),
        )

        result = self.engine.evaluate(candidates, (item(),))[0]

        self.assertEqual(result.applied_rule_id, "a-sku")
        self.assertEqual(result.floor_amount_minor, 100_000)
        self.assertEqual(result.matched_rule_ids, ("a-sku", "b-sku", "z-org"))
        self.assertTrue(result.violated)
        self.assertEqual(result.gap_amount_minor, 10_000)

    def test_hash_and_result_do_not_depend_on_input_rule_order(self) -> None:
        rules = (
            rule("org", floor_value=80_000),
            rule(
                "sku",
                floor_value=100_000,
                priority=10,
                when=RuleCondition("sku_id", "equals", ("sku-1",)),
            ),
        )

        first = self.engine.evaluate(rules, (item(),))[0]
        second = self.engine.evaluate(tuple(reversed(rules)), (item(),))[0]

        self.assertEqual(first, second)
        self.assertRegex(first.evaluation_hash, r"^[0-9a-f]{64}$")

    def test_nested_typed_conditions_support_all_and_any(self) -> None:
        predicate = RuleConditionGroup(
            "all",
            (
                RuleCondition("category_id", "equals", ("category-1",)),
                RuleConditionGroup(
                    "any",
                    (
                        RuleCondition("customer.tier", "in", ("gold", "platinum")),
                        RuleCondition("volume", "greater_than_or_equals", (500,)),
                    ),
                ),
                RuleCondition("promotion", "not_exists"),
            ),
        )
        target = rule("tiered", when=predicate)

        matched = self.engine.evaluate(
            (target,),
            (item(facts=(("customer.tier", "gold"), ("volume", 10))),),
        )[0]
        unmatched = self.engine.evaluate(
            (target,),
            (
                item(
                    item_id="line-2",
                    facts=(("customer.tier", "standard"), ("volume", 10)),
                ),
            ),
        )[0]

        self.assertEqual(matched.status, "matched")
        self.assertEqual(unmatched.status, "no_match")

    def test_computes_margin_and_markup_with_ceiling_integer_math(self) -> None:
        margin = self.engine.evaluate(
            (rule("margin", floor_type="pct_margin", floor_value=2_000),),
            (item(proposed=99_999),),
        )[0]
        markup = self.engine.evaluate(
            (rule("markup", floor_type="pct_markup", floor_value=2_500),),
            (item(item_id="line-2", proposed=100_000),),
        )[0]

        self.assertEqual(margin.floor_amount_minor, 100_000)
        self.assertEqual(margin.gap_amount_minor, 1)
        self.assertEqual(markup.floor_amount_minor, 100_000)
        self.assertFalse(markup.violated)
        self.assertEqual(markup.gap_amount_minor, 0)

    def test_returns_item_errors_for_missing_cost_currency_mismatch_and_overflow(self) -> None:
        percentage = rule("margin", floor_type="pct_margin", floor_value=2_000)
        missing = self.engine.evaluate(
            (percentage,),
            (item(cost=None, cost_currency=None),),
        )[0]
        mismatch = self.engine.evaluate(
            (percentage,),
            (item(item_id="line-2", cost_currency="USD"),),
        )[0]
        overflow = self.engine.evaluate(
            (rule("markup", floor_type="pct_markup", floor_value=10_000),),
            (
                item(
                    item_id="line-3",
                    cost=2**63 - 1,
                    proposed=2**63 - 1,
                ),
            ),
        )[0]

        self.assertEqual(missing.error_code, "COST_REQUIRED")
        self.assertEqual(mismatch.error_code, "COST_CURRENCY_MISMATCH")
        self.assertEqual(overflow.error_code, "FLOOR_OVERFLOW")
        self.assertEqual({missing.status, mismatch.status, overflow.status}, {"error"})

    def test_rejects_ambiguous_or_unsafe_requests(self) -> None:
        invalid_cases = (
            ((rule("duplicate"), rule("duplicate")), (item(),)),
            (
                (
                    rule(
                        "bad-condition",
                        when=RuleCondition("sku_id", "equals", ()),
                    ),
                ),
                (item(),),
            ),
            (
                (rule("bad-margin", floor_type="pct_margin", floor_value=10_000),),
                (item(),),
            ),
            (
                (rule("valid"),),
                (item(facts=(("currency", "USD"),)),),
            ),
            ((rule("valid"),), (item(channel_id=" "),)),
            ((rule("valid"),), (item(), item())),
        )

        for rules, items in invalid_cases:
            with self.subTest(rules=rules, items=items), self.assertRaises(
                InvalidRuleRequestError
            ):
                self.engine.evaluate(rules, items)

    def test_boolean_values_are_not_treated_as_integers(self) -> None:
        equals = rule(
            "typed",
            when=RuleCondition("eligible", "equals", (1,)),
        )
        not_in = rule(
            "typed-not-in",
            when=RuleCondition("eligible", "not_in", (1, 2)),
        )

        result = self.engine.evaluate(
            (equals, not_in),
            (item(facts=(("eligible", True),)),),
        )[0]

        self.assertEqual(result.status, "no_match")


if __name__ == "__main__":
    unittest.main()
