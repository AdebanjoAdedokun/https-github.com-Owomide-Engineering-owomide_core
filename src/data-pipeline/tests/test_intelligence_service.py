from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta

import grpc
import jwt
from services.intelligence.v1 import intelligence_pb2

from owomide_data_pipeline.auth import ServiceAuthenticator
from owomide_data_pipeline.intelligence.service import IntelligenceService

MARGIN_SECRET = "data-pipeline-margin-test-secret-at-least-32-chars"
GATEWAY_SECRET = "data-pipeline-gateway-test-secret-at-least-32-chars"


class RpcAbort(Exception):
    def __init__(self, code: grpc.StatusCode, details: str) -> None:
        super().__init__(details)
        self.code = code


class FakeContext:
    def __init__(self, subject: str = "margin_svc") -> None:
        now = datetime.now(UTC)
        secret = MARGIN_SECRET if subject == "margin_svc" else GATEWAY_SECRET
        token = jwt.encode(
            {
                "iss": "owomide-internal",
                "sub": subject,
                "aud": "data-pipeline",
                "iat": now,
                "exp": now + timedelta(minutes=2),
            },
            secret,
            algorithm="HS256",
        )
        self._metadata = (
            ("authorization", f"Bearer {token}"),
            ("x-org-id", "org-a"),
            ("x-user-id", "margin_svc"),
        )

    def invocation_metadata(self):
        return self._metadata

    def abort(self, code: grpc.StatusCode, details: str):
        raise RpcAbort(code, details)


def service() -> IntelligenceService:
    return IntelligenceService(
        authenticator=ServiceAuthenticator(
            issuer="owomide-internal",
            audience="data-pipeline",
            secrets={"margin_svc": MARGIN_SECRET, "gateway_svc": GATEWAY_SECRET},
            allowed_services=frozenset({"margin_svc", "gateway_svc"}),
        )
    )


def request() -> intelligence_pb2.EvaluateMarginBatchRequest:
    return intelligence_pb2.EvaluateMarginBatchRequest(
        rules=[
            intelligence_pb2.MarginRuleDefinition(
                rule_id="rule-1",
                rule_version=3,
                priority=100,
                currency="NGN",
                floor_type=intelligence_pb2.MARGIN_FLOOR_TYPE_PCT_MARGIN,
                floor_value=2_000,
                when=intelligence_pb2.RulePredicate(
                    condition=intelligence_pb2.RuleCondition(
                        fact="sku_id",
                        operator=intelligence_pb2.CONDITION_OPERATOR_EQUALS,
                        values=[intelligence_pb2.RuleValue(string_value="sku-1")],
                    )
                ),
            )
        ],
        items=[
            intelligence_pb2.MarginEvaluationItem(
                item_id="line-1",
                sku_id="sku-1",
                proposed_price={"amount": 90_000, "currency": "NGN"},
                cost={"amount": 80_000, "currency": "NGN"},
            )
        ],
    )


class IntelligenceServiceTest(unittest.TestCase):
    def test_margin_service_receives_explainable_evaluation(self) -> None:
        response = service().EvaluateMarginBatch(request(), FakeContext())

        self.assertEqual(response.engine_version, "margin-rules-v1")
        self.assertEqual(len(response.results), 1)
        result = response.results[0]
        self.assertEqual(result.status, intelligence_pb2.MARGIN_EVALUATION_STATUS_MATCHED)
        self.assertEqual(result.applied_rule_id, "rule-1")
        self.assertEqual(result.applied_rule_version, 3)
        self.assertEqual(result.floor.amount, 100_000)
        self.assertEqual(result.gap.amount, 10_000)
        self.assertTrue(result.violated)
        self.assertRegex(result.evaluation_hash, r"^[0-9a-f]{64}$")

    def test_gateway_cannot_call_internal_evaluator(self) -> None:
        with self.assertRaises(RpcAbort) as denied:
            service().EvaluateMarginBatch(request(), FakeContext("gateway_svc"))

        self.assertEqual(denied.exception.code, grpc.StatusCode.PERMISSION_DENIED)

    def test_invalid_rule_is_invalid_argument(self) -> None:
        invalid = request()
        invalid.rules[0].floor_value = 10_000

        with self.assertRaises(RpcAbort) as error:
            service().EvaluateMarginBatch(invalid, FakeContext())

        self.assertEqual(error.exception.code, grpc.StatusCode.INVALID_ARGUMENT)


if __name__ == "__main__":
    unittest.main()
