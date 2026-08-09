from __future__ import annotations

import grpc
from services.intelligence.v1 import intelligence_pb2, intelligence_pb2_grpc

from owomide_data_pipeline.auth import AuthenticationError, ServiceAuthenticator
from owomide_data_pipeline.intelligence.rules import (
    ENGINE_VERSION,
    InvalidRuleRequestError,
    MarginItem,
    MarginRule,
    MarginRuleEngine,
    RuleCondition,
    RuleConditionGroup,
    RulePredicate,
    RuleScalar,
)

_FLOOR_TYPES = {
    intelligence_pb2.MARGIN_FLOOR_TYPE_PCT_MARGIN: "pct_margin",
    intelligence_pb2.MARGIN_FLOOR_TYPE_PCT_MARKUP: "pct_markup",
    intelligence_pb2.MARGIN_FLOOR_TYPE_ABSOLUTE_MINIMUM: "absolute_minimum",
}
_CONDITION_OPERATORS = {
    intelligence_pb2.CONDITION_OPERATOR_EQUALS: "equals",
    intelligence_pb2.CONDITION_OPERATOR_NOT_EQUALS: "not_equals",
    intelligence_pb2.CONDITION_OPERATOR_LESS_THAN: "less_than",
    intelligence_pb2.CONDITION_OPERATOR_LESS_THAN_OR_EQUALS: "less_than_or_equals",
    intelligence_pb2.CONDITION_OPERATOR_GREATER_THAN: "greater_than",
    intelligence_pb2.CONDITION_OPERATOR_GREATER_THAN_OR_EQUALS: "greater_than_or_equals",
    intelligence_pb2.CONDITION_OPERATOR_IN: "in",
    intelligence_pb2.CONDITION_OPERATOR_NOT_IN: "not_in",
    intelligence_pb2.CONDITION_OPERATOR_EXISTS: "exists",
    intelligence_pb2.CONDITION_OPERATOR_NOT_EXISTS: "not_exists",
}
_GROUP_OPERATORS = {
    intelligence_pb2.CONDITION_GROUP_OPERATOR_ALL: "all",
    intelligence_pb2.CONDITION_GROUP_OPERATOR_ANY: "any",
}
_STATUSES = {
    "matched": intelligence_pb2.MARGIN_EVALUATION_STATUS_MATCHED,
    "no_match": intelligence_pb2.MARGIN_EVALUATION_STATUS_NO_MATCH,
    "error": intelligence_pb2.MARGIN_EVALUATION_STATUS_ERROR,
}


def _rule_value(message: intelligence_pb2.RuleValue) -> RuleScalar:
    kind = message.WhichOneof("kind")
    if kind == "string_value":
        return message.string_value
    if kind == "integer_value":
        return message.integer_value
    if kind == "boolean_value":
        return message.boolean_value
    raise InvalidRuleRequestError("Rule values must contain a typed value")


def _predicate(message: intelligence_pb2.RulePredicate) -> RulePredicate:
    expression = message.WhichOneof("expression")
    if expression == "condition":
        operator = _CONDITION_OPERATORS.get(message.condition.operator)
        if operator is None:
            raise InvalidRuleRequestError("A rule condition has an invalid operator")
        return RuleCondition(
            fact=message.condition.fact,
            operator=operator,
            values=tuple(_rule_value(value) for value in message.condition.values),
        )
    if expression == "group":
        operator = _GROUP_OPERATORS.get(message.group.operator)
        if operator is None:
            raise InvalidRuleRequestError("A rule condition group has an invalid operator")
        return RuleConditionGroup(
            operator=operator,
            predicates=tuple(_predicate(child) for child in message.group.predicates),
        )
    raise InvalidRuleRequestError("Rule predicates must contain a condition or group")


def _rule(message: intelligence_pb2.MarginRuleDefinition) -> MarginRule:
    floor_type = _FLOOR_TYPES.get(message.floor_type)
    if floor_type is None:
        raise InvalidRuleRequestError("A margin rule has an invalid floor type")
    return MarginRule(
        rule_id=message.rule_id,
        rule_version=message.rule_version,
        priority=message.priority,
        currency=message.currency,
        floor_type=floor_type,
        floor_value=message.floor_value,
        when=_predicate(message.when) if message.HasField("when") else None,
    )


def _item(message: intelligence_pb2.MarginEvaluationItem) -> MarginItem:
    if not message.HasField("proposed_price"):
        raise InvalidRuleRequestError(f'item "{message.item_id}" requires proposed_price')
    has_cost = message.HasField("cost")
    return MarginItem(
        item_id=message.item_id,
        sku_id=message.sku_id,
        channel_id=message.channel_id if message.HasField("channel_id") else None,
        category_id=message.category_id if message.HasField("category_id") else None,
        proposed_amount_minor=message.proposed_price.amount,
        proposed_currency=message.proposed_price.currency,
        cost_amount_minor=message.cost.amount if has_cost else None,
        cost_currency=message.cost.currency if has_cost else None,
        facts=tuple((name, _rule_value(value)) for name, value in message.facts.items()),
    )


class IntelligenceService(intelligence_pb2_grpc.IntelligenceServiceServicer):
    def __init__(
        self,
        *,
        authenticator: ServiceAuthenticator,
        engine: MarginRuleEngine | None = None,
    ) -> None:
        self._authenticator = authenticator
        self._engine = engine or MarginRuleEngine()

    def _authorize_margin(self, context: grpc.ServicerContext) -> None:
        try:
            request_context = self._authenticator.authenticate(context.invocation_metadata())
        except AuthenticationError:
            context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid internal service credential")
        if request_context.service_id != "margin_svc":
            context.abort(grpc.StatusCode.PERMISSION_DENIED, "Caller is not authorized")

    def EvaluateMarginBatch(self, request, context):
        self._authorize_margin(context)
        try:
            results = self._engine.evaluate(
                tuple(_rule(rule) for rule in request.rules),
                tuple(_item(item) for item in request.items),
            )
        except InvalidRuleRequestError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))

        response = intelligence_pb2.EvaluateMarginBatchResponse(engine_version=ENGINE_VERSION)
        for result in results:
            item = response.results.add(
                item_id=result.item_id,
                status=_STATUSES[result.status],
                proposed_price={
                    "amount": result.proposed_amount_minor,
                    "currency": result.currency,
                },
                violated=result.violated,
                matched_rule_ids=result.matched_rule_ids,
                evaluation_hash=result.evaluation_hash,
            )
            if result.applied_rule_id is not None:
                item.applied_rule_id = result.applied_rule_id
            if result.applied_rule_version is not None:
                item.applied_rule_version = result.applied_rule_version
            if result.floor_amount_minor is not None:
                item.floor.amount = result.floor_amount_minor
                item.floor.currency = result.currency
            if result.gap_amount_minor is not None:
                item.gap.amount = result.gap_amount_minor
                item.gap.currency = result.currency
            if result.error_code is not None:
                item.error_code = result.error_code
            if result.error_message is not None:
                item.error_message = result.error_message
        return response
