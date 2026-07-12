from __future__ import annotations

import unittest
from concurrent.futures import ThreadPoolExecutor

import grpc
import jwt
from services.catalog.v1 import catalog_pb2, catalog_pb2_grpc

from owomide_data_pipeline.catalog import CatalogClient

SECRET = "catalog-client-test-secret-that-is-long-enough"
SKU_ID = "00000000-0000-0000-0000-000000000101"


class FakeCatalogService(catalog_pb2_grpc.CatalogServiceServicer):
    metadata: tuple[tuple[str, str], ...] = ()

    def _capture(self, context) -> None:
        self.metadata = tuple((item.key, item.value) for item in context.invocation_metadata())

    def ListChannels(self, request, context):
        self._capture(context)
        if not request.pagination.page_token:
            return catalog_pb2.ListChannelsResponse(
                channels=[
                    catalog_pb2.Channel(
                        id="00000000-0000-0000-0000-000000000201",
                        code="retail",
                        default_currency="NGN",
                    )
                ],
                pagination={"next_page_token": "next", "total_count": 2},
            )
        return catalog_pb2.ListChannelsResponse(
            channels=[
                catalog_pb2.Channel(
                    id="00000000-0000-0000-0000-000000000202",
                    code="online",
                    default_currency="USD",
                )
            ],
            pagination={"total_count": 2},
        )

    def ListLocations(self, _request, context):
        self._capture(context)
        return catalog_pb2.ListLocationsResponse(
            locations=[catalog_pb2.Location(id="00000000-0000-0000-0000-000000000301")]
        )

    def ListCustomerSegments(self, _request, context):
        self._capture(context)
        return catalog_pb2.ListCustomerSegmentsResponse(
            customer_segments=[
                catalog_pb2.CustomerSegment(id="00000000-0000-0000-0000-000000000401")
            ]
        )

    def BatchGetSkus(self, request, context):
        self._capture(context)
        return catalog_pb2.BatchGetSkusResponse(
            skus=[catalog_pb2.Sku(id=SKU_ID)] if SKU_ID in request.ids else []
        )

    def BatchGetCosts(self, request, context):
        self._capture(context)
        return catalog_pb2.BatchGetCostsResponse(
            costs=[
                catalog_pb2.CostRecord(
                    sku_id=SKU_ID,
                    cost={"amount": 800, "currency": "NGN"},
                )
            ]
            if SKU_ID in request.sku_ids
            else []
        )


class CatalogClientTest(unittest.TestCase):
    def test_loads_paginated_tenant_snapshot_with_service_identity(self) -> None:
        service = FakeCatalogService()
        server = grpc.server(ThreadPoolExecutor(max_workers=2))
        catalog_pb2_grpc.add_CatalogServiceServicer_to_server(service, server)
        port = server.add_insecure_port("127.0.0.1:0")
        server.start()
        client = CatalogClient(
            target=f"127.0.0.1:{port}",
            issuer="owomide-internal",
            secret=SECRET,
            timeout_seconds=2,
        )
        try:
            snapshot = client.load_snapshot("org-a", [SKU_ID])
        finally:
            client.close()
            server.stop(0).wait()

        self.assertEqual(set(snapshot.channels_by_code), {"RETAIL", "ONLINE"})
        self.assertIn(SKU_ID, snapshot.sku_ids)
        self.assertEqual(snapshot.costs[(SKU_ID, None)].amount, 800)
        metadata = dict(service.metadata)
        self.assertEqual(metadata["x-org-id"], "org-a")
        claims = jwt.decode(
            metadata["authorization"].removeprefix("Bearer "),
            SECRET,
            algorithms=["HS256"],
            audience="catalog",
            issuer="owomide-internal",
        )
        self.assertEqual(claims["sub"], "data_pipeline_svc")


if __name__ == "__main__":
    unittest.main()
