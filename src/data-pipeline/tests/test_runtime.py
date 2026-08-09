from __future__ import annotations

import json
import socket
import unittest
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError
from urllib.request import urlopen

import grpc
import jwt
from services.data_pipeline.v1 import data_pipeline_pb2, data_pipeline_pb2_grpc
from services.intelligence.v1 import intelligence_pb2, intelligence_pb2_grpc

from owomide_data_pipeline.config import Config
from owomide_data_pipeline.server import Runtime, start_server

SECRET = "data-pipeline-test-secret-that-is-at-least-32-chars"
MARGIN_SECRET = "data-pipeline-margin-test-secret-at-least-32-chars"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class RuntimeTest(unittest.TestCase):
    runtime: Runtime
    config: Config

    @classmethod
    def setUpClass(cls) -> None:
        base = Config.from_env(
            {
                "DATA_PIPELINE_SERVICE_SECRETS_JSON": (
                    f'{{"gateway_svc":"{SECRET}","margin_svc":"{MARGIN_SECRET}"}}'
                ),
            }
        )
        cls.config = replace(
            base,
            database_url="postgresql://invalid:invalid@127.0.0.1:1/invalid",
            grpc_host="127.0.0.1",
            grpc_port=free_port(),
            health_host="127.0.0.1",
            health_port=free_port(),
        )
        cls.runtime = start_server(cls.config)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.runtime.stop(grace_seconds=0)

    def test_liveness_is_independent_from_database_readiness(self) -> None:
        with urlopen(f"http://127.0.0.1:{self.config.health_port}/health") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.load(response), {"status": "ok"})

        with self.assertRaises(HTTPError) as error:
            urlopen(f"http://127.0.0.1:{self.config.health_port}/readyz")
        self.assertEqual(error.exception.code, 503)

    def test_rpc_rejects_missing_service_credential(self) -> None:
        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            with self.assertRaises(grpc.RpcError) as error:
                stub.GetImportBatch(data_pipeline_pb2.GetImportBatchRequest(batch_id="batch"))
        self.assertEqual(error.exception.code(), grpc.StatusCode.UNAUTHENTICATED)

    def test_authenticated_rpc_reaches_commit_handler(self) -> None:
        now = datetime.now(UTC)
        encoded = jwt.encode(
            {
                "iss": "owomide-internal",
                "sub": "gateway_svc",
                "aud": "data-pipeline",
                "iat": now,
                "exp": now + timedelta(minutes=2),
            },
            SECRET,
            algorithm="HS256",
        )
        metadata = (
            ("authorization", f"Bearer {encoded}"),
            ("x-org-id", "org-a"),
            ("x-user-id", "user-a"),
        )
        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            stub = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            with self.assertRaises(grpc.RpcError) as error:
                stub.CommitBatch(
                    data_pipeline_pb2.CommitBatchRequest(batch_id="not-a-uuid"),
                    metadata=metadata,
                )
        self.assertEqual(error.exception.code(), grpc.StatusCode.INVALID_ARGUMENT)

    def test_margin_service_can_call_intelligence_but_not_import_apis(self) -> None:
        now = datetime.now(UTC)
        encoded = jwt.encode(
            {
                "iss": "owomide-internal",
                "sub": "margin_svc",
                "aud": "data-pipeline",
                "iat": now,
                "exp": now + timedelta(minutes=2),
            },
            MARGIN_SECRET,
            algorithm="HS256",
        )
        metadata = (
            ("authorization", f"Bearer {encoded}"),
            ("x-org-id", "org-a"),
            ("x-user-id", "margin_svc"),
        )
        with grpc.insecure_channel(f"127.0.0.1:{self.config.grpc_port}") as channel:
            intelligence = intelligence_pb2_grpc.IntelligenceServiceStub(channel)
            evaluated = intelligence.EvaluateMarginBatch(
                intelligence_pb2.EvaluateMarginBatchRequest(
                    rules=[
                        intelligence_pb2.MarginRuleDefinition(
                            rule_id="rule-1",
                            rule_version=1,
                            currency="NGN",
                            floor_type=intelligence_pb2.MARGIN_FLOOR_TYPE_ABSOLUTE_MINIMUM,
                            floor_value=100,
                        )
                    ],
                    items=[
                        intelligence_pb2.MarginEvaluationItem(
                            item_id="line-1",
                            sku_id="sku-1",
                            proposed_price={"amount": 90, "currency": "NGN"},
                        )
                    ],
                ),
                metadata=metadata,
            )
            self.assertTrue(evaluated.results[0].violated)

            imports = data_pipeline_pb2_grpc.DataPipelineServiceStub(channel)
            with self.assertRaises(grpc.RpcError) as denied:
                imports.GetImportBatch(
                    data_pipeline_pb2.GetImportBatchRequest(batch_id="batch"),
                    metadata=metadata,
                )
        self.assertEqual(denied.exception.code(), grpc.StatusCode.PERMISSION_DENIED)


if __name__ == "__main__":
    unittest.main()
