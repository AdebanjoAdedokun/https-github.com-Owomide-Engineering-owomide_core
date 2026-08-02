from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, replace

from owomide_data_pipeline.intelligence.currencies import currency_code

ENGINE_VERSION = "margin-rules-v1"
MAX_RULES = 500
MAX_ITEMS = 1_000
MAX_FACTS = 100
MAX_PREDICATE_DEPTH = 8
MAX_PREDICATE_NODES = 128

_I64_MAX = 2**63 - 1
_FACT_NAME = re.compile(r"^[a-z][a-z0-9_.-]{0,99}$")
_BUILT_IN_FACTS = frozenset(
    {
        "sku_id",
        "channel_id",
        "category_id",
        "currency",
        "proposed_amount_minor",
        "cost_amount_minor",
    }
)
_SINGLE_VALUE_OPERATORS = frozenset(
    {
        "equals",
        "not_equals",
        "less_than",
        "less_than_or_equals",
        "greater_than",
        "greater_than_or_equals",
    }
)
_ORDERED_OPERATORS = frozenset(
    {
        "less_than",
        "less_than_or_equals",
        "greater_than",
        "greater_than_or_equals",
    }
)
_SET_OPERATORS = frozenset({"in", "not_in"})
_PRESENCE_OPERATORS = frozenset({"exists", "not_exists"})
_FLOOR_TYPES = frozenset({"pct_margin", "pct_markup", "absolute_minimum"})

type RuleScalar = str | int | bool


class InvalidRuleRequestError(ValueError):
    """Raised when an evaluator request is structurally unsafe or ambiguous."""


@dataclass(frozen=True, slots=True)
class RuleCondition:
    fact: str
    operator: str
    values: tuple[RuleScalar, ...] = ()


@dataclass(frozen=True, slots=True)
class RuleConditionGroup:
    operator: str
    predicates: tuple[RulePredicate, ...]


type RulePredicate = RuleCondition | RuleConditionGroup


@dataclass(frozen=True, slots=True)
class MarginRule:
    rule_id: str
    rule_version: int
    priority: int
    currency: str
    floor_type: str
    floor_value: int
    when: RulePredicate | None = None


@dataclass(frozen=True, slots=True)
class MarginItem:
    item_id: str
    sku_id: str
    channel_id: str | None
    category_id: str | None
    proposed_amount_minor: int
    proposed_currency: str
    cost_amount_minor: int | None
    cost_currency: str | None
    facts: tuple[tuple[str, RuleScalar], ...] = ()


@dataclass(frozen=True, slots=True)
class MarginEvaluation:
    item_id: str
    status: str
    proposed_amount_minor: int
    currency: str
    applied_rule_id: str | None = None
    applied_rule_version: int | None = None
    floor_amount_minor: int | None = None
    gap_amount_minor: int | None = None
    violated: bool = False
    matched_rule_ids: tuple[str, ...] = ()
    error_code: str | None = None
    error_message: str | None = None
    evaluation_hash: str = ""


def _is_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _validate_scalar(value: object, field: str) -> None:
    if isinstance(value, str):
        if len(value) > 500:
            raise InvalidRuleRequestError(f"{field} string values must not exceed 500 characters")
        return
    if isinstance(value, bool):
        return
    if _is_integer(value) and -(2**63) <= value <= _I64_MAX:
        return
    raise InvalidRuleRequestError(f"{field} must be a string, boolean, or signed 64-bit integer")


def _same_scalar_type(left: RuleScalar, right: RuleScalar) -> bool:
    if _is_integer(left) and _is_integer(right):
        return True
    return type(left) is type(right)


def _predicate_shape(predicate: RulePredicate, *, depth: int = 1) -> tuple[int, int]:
    if depth > MAX_PREDICATE_DEPTH:
        raise InvalidRuleRequestError(
            f"Rule predicates must not exceed {MAX_PREDICATE_DEPTH} levels"
        )
    if isinstance(predicate, RuleCondition):
        if not _FACT_NAME.fullmatch(predicate.fact):
            raise InvalidRuleRequestError(f'Invalid rule fact name "{predicate.fact}"')
        if predicate.operator in _SINGLE_VALUE_OPERATORS:
            if len(predicate.values) != 1:
                raise InvalidRuleRequestError(
                    f"{predicate.operator} conditions require exactly one value"
                )
        elif predicate.operator in _SET_OPERATORS:
            if not 1 <= len(predicate.values) <= 100:
                raise InvalidRuleRequestError(
                    f"{predicate.operator} conditions require between 1 and 100 values"
                )
        elif predicate.operator in _PRESENCE_OPERATORS:
            if predicate.values:
                raise InvalidRuleRequestError(
                    f"{predicate.operator} conditions must not contain values"
                )
        else:
            raise InvalidRuleRequestError(f'Unknown condition operator "{predicate.operator}"')
        for value in predicate.values:
            _validate_scalar(value, f"condition {predicate.fact}")
        if predicate.operator in _ORDERED_OPERATORS and not _is_integer(predicate.values[0]):
            raise InvalidRuleRequestError(
                f"{predicate.operator} conditions require an integer value"
            )
        return 1, 1

    if predicate.operator not in {"all", "any"}:
        raise InvalidRuleRequestError(f'Unknown condition group operator "{predicate.operator}"')
    if not predicate.predicates:
        raise InvalidRuleRequestError("Condition groups must contain at least one predicate")
    nodes = 1
    conditions = 0
    for child in predicate.predicates:
        child_nodes, child_conditions = _predicate_shape(child, depth=depth + 1)
        nodes += child_nodes
        conditions += child_conditions
    if nodes > MAX_PREDICATE_NODES:
        raise InvalidRuleRequestError(
            f"A rule must not contain more than {MAX_PREDICATE_NODES} predicate nodes"
        )
    return nodes, conditions


def _condition_matches(condition: RuleCondition, facts: dict[str, RuleScalar]) -> bool:
    exists = condition.fact in facts
    if condition.operator == "exists":
        return exists
    if condition.operator == "not_exists":
        return not exists
    if not exists:
        return False

    actual = facts[condition.fact]
    if condition.operator == "equals":
        expected = condition.values[0]
        return _same_scalar_type(actual, expected) and actual == expected
    if condition.operator == "not_equals":
        expected = condition.values[0]
        return _same_scalar_type(actual, expected) and actual != expected
    if condition.operator in _SET_OPERATORS:
        compatible = tuple(
            expected for expected in condition.values if _same_scalar_type(actual, expected)
        )
        if not compatible:
            return False
        contained = any(actual == expected for expected in compatible)
        return contained if condition.operator == "in" else not contained
    if not _is_integer(actual):
        return False

    expected = condition.values[0]
    if condition.operator == "less_than":
        return actual < expected
    if condition.operator == "less_than_or_equals":
        return actual <= expected
    if condition.operator == "greater_than":
        return actual > expected
    if condition.operator == "greater_than_or_equals":
        return actual >= expected
    raise AssertionError(f"unvalidated condition operator {condition.operator}")


def _predicate_matches(predicate: RulePredicate, facts: dict[str, RuleScalar]) -> bool:
    if isinstance(predicate, RuleCondition):
        return _condition_matches(predicate, facts)
    matches = (_predicate_matches(child, facts) for child in predicate.predicates)
    return all(matches) if predicate.operator == "all" else any(matches)


def _ceil_div(numerator: int, denominator: int) -> int:
    return (numerator + denominator - 1) // denominator


def _compute_floor(rule: MarginRule, item: MarginItem) -> tuple[int | None, str | None, str | None]:
    if item.proposed_currency != rule.currency:
        return (
            None,
            "CURRENCY_MISMATCH",
            f"rule expects {rule.currency}, proposed price is {item.proposed_currency}",
        )
    if rule.floor_type == "absolute_minimum":
        return rule.floor_value, None, None
    if item.cost_amount_minor is None or item.cost_currency is None:
        return None, "COST_REQUIRED", "a cost is required to evaluate this margin rule"
    if item.cost_currency != rule.currency:
        return (
            None,
            "COST_CURRENCY_MISMATCH",
            f"rule expects {rule.currency}, cost is {item.cost_currency}",
        )

    cost = item.cost_amount_minor
    if rule.floor_type == "pct_margin":
        floor = _ceil_div(cost * 10_000, 10_000 - rule.floor_value)
    else:
        floor = cost + _ceil_div(cost * rule.floor_value, 10_000)
    if floor > _I64_MAX:
        return None, "FLOOR_OVERFLOW", "computed floor exceeds the signed 64-bit money range"
    return floor, None, None


def _scalar_json(value: RuleScalar) -> dict[str, object]:
    if isinstance(value, bool):
        return {"type": "boolean", "value": value}
    if _is_integer(value):
        return {"type": "integer", "value": str(value)}
    return {"type": "string", "value": value}


def _predicate_json(predicate: RulePredicate | None) -> object:
    if predicate is None:
        return None
    if isinstance(predicate, RuleCondition):
        return {
            "fact": predicate.fact,
            "operator": predicate.operator,
            "values": [_scalar_json(value) for value in predicate.values],
        }
    return {
        "operator": predicate.operator,
        "predicates": [_predicate_json(child) for child in predicate.predicates],
    }


def _evaluation_hash(
    item: MarginItem,
    rules: tuple[MarginRule, ...],
    evaluation: MarginEvaluation,
) -> str:
    payload = {
        "engine_version": ENGINE_VERSION,
        "item": {
            "category_id": item.category_id,
            "channel_id": item.channel_id,
            "cost_amount_minor": (
                str(item.cost_amount_minor) if item.cost_amount_minor is not None else None
            ),
            "cost_currency": item.cost_currency,
            "facts": {key: _scalar_json(value) for key, value in sorted(item.facts)},
            "item_id": item.item_id,
            "proposed_amount_minor": str(item.proposed_amount_minor),
            "proposed_currency": item.proposed_currency,
            "sku_id": item.sku_id,
        },
        "outcome": {
            "applied_rule_id": evaluation.applied_rule_id,
            "applied_rule_version": evaluation.applied_rule_version,
            "error_code": evaluation.error_code,
            "floor_amount_minor": (
                str(evaluation.floor_amount_minor)
                if evaluation.floor_amount_minor is not None
                else None
            ),
            "matched_rule_ids": list(evaluation.matched_rule_ids),
            "status": evaluation.status,
            "violated": evaluation.violated,
        },
        "rules": [
            {
                "currency": rule.currency,
                "floor_type": rule.floor_type,
                "floor_value": str(rule.floor_value),
                "priority": rule.priority,
                "rule_id": rule.rule_id,
                "rule_version": rule.rule_version,
                "when": _predicate_json(rule.when),
            }
            for rule in sorted(rules, key=lambda candidate: candidate.rule_id)
        ],
    }
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class MarginRuleEngine:
    def evaluate(
        self,
        rules: tuple[MarginRule, ...],
        items: tuple[MarginItem, ...],
    ) -> tuple[MarginEvaluation, ...]:
        if len(rules) > MAX_RULES:
            raise InvalidRuleRequestError(f"A request must not contain more than {MAX_RULES} rules")
        if not 1 <= len(items) <= MAX_ITEMS:
            raise InvalidRuleRequestError(
                f"A request must contain between 1 and {MAX_ITEMS} evaluation items"
            )

        seen_rules: set[str] = set()
        specificity: dict[str, int] = {}
        normalized_rules: list[MarginRule] = []
        for rule in rules:
            rule_id = rule.rule_id.strip()
            if not rule_id or len(rule_id) > 200:
                raise InvalidRuleRequestError("rule_id must be between 1 and 200 characters")
            if rule_id in seen_rules:
                raise InvalidRuleRequestError(f'Duplicate rule_id "{rule_id}"')
            seen_rules.add(rule_id)
            if rule.rule_version <= 0:
                raise InvalidRuleRequestError(f'rule "{rule_id}" must have a positive version')
            if not -1_000_000 <= rule.priority <= 1_000_000:
                raise InvalidRuleRequestError(
                    f'rule "{rule_id}" priority must be between -1000000 and 1000000'
                )
            try:
                currency = currency_code(rule.currency, f'rule "{rule_id}" currency')
            except ValueError as exc:
                raise InvalidRuleRequestError(str(exc)) from exc
            if rule.floor_type not in _FLOOR_TYPES:
                raise InvalidRuleRequestError(
                    f'rule "{rule_id}" has an unsupported floor type'
                )
            if rule.floor_value <= 0:
                raise InvalidRuleRequestError(f'rule "{rule_id}" floor_value must be positive')
            if rule.floor_type == "pct_margin" and rule.floor_value >= 10_000:
                raise InvalidRuleRequestError(
                    f'rule "{rule_id}" percentage margin must be below 10000 basis points'
                )
            _, condition_count = (
                _predicate_shape(rule.when) if rule.when is not None else (0, 0)
            )
            specificity[rule_id] = condition_count
            normalized_rules.append(replace(rule, rule_id=rule_id, currency=currency))

        ordered_rules = tuple(
            sorted(
                normalized_rules,
                key=lambda rule: (-rule.priority, -specificity[rule.rule_id], rule.rule_id),
            )
        )

        seen_items: set[str] = set()
        normalized_items: list[MarginItem] = []
        for item in items:
            item_id = item.item_id.strip()
            if not item_id or len(item_id) > 200:
                raise InvalidRuleRequestError("item_id must be between 1 and 200 characters")
            if item_id in seen_items:
                raise InvalidRuleRequestError(f'Duplicate item_id "{item_id}"')
            seen_items.add(item_id)
            if not item.sku_id.strip() or len(item.sku_id) > 200:
                raise InvalidRuleRequestError(f'item "{item_id}" has an invalid sku_id')
            for field_name, identifier in (
                ("channel_id", item.channel_id),
                ("category_id", item.category_id),
            ):
                if identifier is not None and (
                    not identifier.strip() or len(identifier.strip()) > 200
                ):
                    raise InvalidRuleRequestError(
                        f'item "{item_id}" has an invalid {field_name}'
                    )
            if item.proposed_amount_minor < 0:
                raise InvalidRuleRequestError(
                    f'item "{item_id}" proposed amount must not be negative'
                )
            if item.cost_amount_minor is not None and item.cost_amount_minor < 0:
                raise InvalidRuleRequestError(f'item "{item_id}" cost must not be negative')
            try:
                proposed_currency = currency_code(
                    item.proposed_currency, f'item "{item_id}" proposed currency'
                )
                cost_currency = (
                    currency_code(item.cost_currency, f'item "{item_id}" cost currency')
                    if item.cost_currency is not None
                    else None
                )
            except ValueError as exc:
                raise InvalidRuleRequestError(str(exc)) from exc
            if (item.cost_amount_minor is None) != (cost_currency is None):
                raise InvalidRuleRequestError(
                    f'item "{item_id}" cost amount and currency must be provided together'
                )
            if len(item.facts) > MAX_FACTS:
                raise InvalidRuleRequestError(
                    f'item "{item_id}" must not contain more than {MAX_FACTS} custom facts'
                )
            fact_names: set[str] = set()
            normalized_facts: list[tuple[str, RuleScalar]] = []
            for raw_name, value in item.facts:
                name = raw_name.strip()
                if not _FACT_NAME.fullmatch(name):
                    raise InvalidRuleRequestError(f'item "{item_id}" has invalid fact "{name}"')
                if name in _BUILT_IN_FACTS:
                    raise InvalidRuleRequestError(
                        f'item "{item_id}" cannot override built-in fact "{name}"'
                    )
                if name in fact_names:
                    raise InvalidRuleRequestError(
                        f'item "{item_id}" repeats custom fact "{name}"'
                    )
                _validate_scalar(value, f'item "{item_id}" fact "{name}"')
                fact_names.add(name)
                normalized_facts.append((name, value))
            normalized_items.append(
                replace(
                    item,
                    item_id=item_id,
                    sku_id=item.sku_id.strip(),
                    channel_id=item.channel_id.strip() if item.channel_id is not None else None,
                    category_id=item.category_id.strip() if item.category_id is not None else None,
                    proposed_currency=proposed_currency,
                    cost_currency=cost_currency,
                    facts=tuple(sorted(normalized_facts)),
                )
            )

        return tuple(self._evaluate_item(ordered_rules, item) for item in normalized_items)

    @staticmethod
    def _evaluate_item(
        rules: tuple[MarginRule, ...], item: MarginItem
    ) -> MarginEvaluation:
        facts: dict[str, RuleScalar] = dict(item.facts)
        facts.update(
            {
                "sku_id": item.sku_id,
                "currency": item.proposed_currency,
                "proposed_amount_minor": item.proposed_amount_minor,
            }
        )
        if item.channel_id is not None:
            facts["channel_id"] = item.channel_id
        if item.category_id is not None:
            facts["category_id"] = item.category_id
        if item.cost_amount_minor is not None:
            facts["cost_amount_minor"] = item.cost_amount_minor

        matched = tuple(
            rule for rule in rules if rule.when is None or _predicate_matches(rule.when, facts)
        )
        if not matched:
            result = MarginEvaluation(
                item_id=item.item_id,
                status="no_match",
                proposed_amount_minor=item.proposed_amount_minor,
                currency=item.proposed_currency,
            )
            return replace(result, evaluation_hash=_evaluation_hash(item, rules, result))

        applied = matched[0]
        floor, error_code, error_message = _compute_floor(applied, item)
        matched_ids = tuple(rule.rule_id for rule in matched)
        if error_code is not None:
            result = MarginEvaluation(
                item_id=item.item_id,
                status="error",
                proposed_amount_minor=item.proposed_amount_minor,
                currency=item.proposed_currency,
                applied_rule_id=applied.rule_id,
                applied_rule_version=applied.rule_version,
                matched_rule_ids=matched_ids,
                error_code=error_code,
                error_message=error_message,
            )
            return replace(result, evaluation_hash=_evaluation_hash(item, rules, result))

        assert floor is not None
        violated = item.proposed_amount_minor < floor
        result = MarginEvaluation(
            item_id=item.item_id,
            status="matched",
            proposed_amount_minor=item.proposed_amount_minor,
            currency=item.proposed_currency,
            applied_rule_id=applied.rule_id,
            applied_rule_version=applied.rule_version,
            floor_amount_minor=floor,
            gap_amount_minor=floor - item.proposed_amount_minor if violated else 0,
            violated=violated,
            matched_rule_ids=matched_ids,
        )
        return replace(result, evaluation_hash=_evaluation_hash(item, rules, result))
