from __future__ import annotations

from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

import grpc
import jwt
from common.v1 import common_pb2
from services.catalog.v1 import catalog_pb2, catalog_pb2_grpc


@dataclass(frozen=True, slots=True)
class ChannelReference:
    id: str
    code: str
    default_currency: str


@dataclass(frozen=True, slots=True)
class CostReference:
    sku_id: str
    location_id: str | None
    amount: int
    currency: str


@dataclass(frozen=True, slots=True)
class CatalogSnapshot:
    channels_by_id: dict[str, ChannelReference]
    channels_by_code: dict[str, ChannelReference]
    location_ids: frozenset[str]
    segment_ids: frozenset[str]
    sku_ids: frozenset[str]
    costs: dict[tuple[str, str | None], CostReference]

    @classmethod
    def empty(cls) -> CatalogSnapshot:
        return cls({}, {}, frozenset(), frozenset(), frozenset(), {})


class CatalogLoader(Protocol):
    def load_snapshot(self, org_id: str, sku_ids: Iterable[str]) -> CatalogSnapshot: ...


class CatalogWriter(Protocol):
    def upsert_canonical(
        self,
        *,
        org_id: str,
        batch_id: str,
        actor_id: str,
        chunk_index: int,
        rows: Iterable[catalog_pb2.CanonicalWriteRow],
    ) -> catalog_pb2.UpsertCanonicalResponse: ...


def _chunks(values: Iterable[str], size: int = 500) -> Iterator[list[str]]:
    chunk: list[str] = []
    for value in values:
        chunk.append(value)
        if len(chunk) == size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


class CatalogClient:
    def __init__(
        self,
        *,
        target: str,
        issuer: str,
        secret: str,
        timeout_seconds: float,
    ) -> None:
        self._issuer = issuer
        self._secret = secret
        self._timeout_seconds = timeout_seconds
        self._channel = grpc.insecure_channel(target)
        self._stub = catalog_pb2_grpc.CatalogServiceStub(self._channel)

    def close(self) -> None:
        self._channel.close()

    def _metadata(self, org_id: str) -> tuple[tuple[str, str], ...]:
        now = datetime.now(UTC)
        token = jwt.encode(
            {
                "iss": self._issuer,
                "sub": "data_pipeline_svc",
                "aud": "catalog",
                "iat": now,
                "exp": now + timedelta(minutes=2),
            },
            self._secret,
            algorithm="HS256",
        )
        return (("authorization", f"Bearer {token}"), ("x-org-id", org_id))

    def load_snapshot(self, org_id: str, sku_ids: Iterable[str]) -> CatalogSnapshot:
        metadata = self._metadata(org_id)
        channels = self._list_channels(metadata)
        locations = self._list_locations(metadata)
        segments = self._list_segments(metadata)
        requested_skus = sorted(set(sku_ids))
        found_skus: set[str] = set()
        costs: dict[tuple[str, str | None], CostReference] = {}
        for chunk in _chunks(requested_skus):
            sku_response = self._stub.BatchGetSkus(
                catalog_pb2.BatchGetSkusRequest(ids=chunk),
                metadata=metadata,
                timeout=self._timeout_seconds,
            )
            found_skus.update(sku.id for sku in sku_response.skus)
            cost_response = self._stub.BatchGetCosts(
                catalog_pb2.BatchGetCostsRequest(sku_ids=chunk),
                metadata=metadata,
                timeout=self._timeout_seconds,
            )
            for cost in cost_response.costs:
                key = (cost.sku_id, cost.location_id if cost.HasField("location_id") else None)
                candidate = CostReference(
                    sku_id=cost.sku_id,
                    location_id=key[1],
                    amount=cost.cost.amount,
                    currency=cost.cost.currency.upper(),
                )
                current = costs.get(key)
                if current is None or candidate.amount > current.amount:
                    costs[key] = candidate
        return CatalogSnapshot(
            channels_by_id={channel.id: channel for channel in channels},
            channels_by_code={channel.code.upper(): channel for channel in channels},
            location_ids=frozenset(location.id for location in locations),
            segment_ids=frozenset(segment.id for segment in segments),
            sku_ids=frozenset(found_skus),
            costs=costs,
        )

    def upsert_canonical(
        self,
        *,
        org_id: str,
        batch_id: str,
        actor_id: str,
        chunk_index: int,
        rows: Iterable[catalog_pb2.CanonicalWriteRow],
    ) -> catalog_pb2.UpsertCanonicalResponse:
        request = catalog_pb2.UpsertCanonicalRequest(
            idempotency_key=f"import:{batch_id}:chunk:{chunk_index}",
            source=catalog_pb2.SourceContext(
                source_type=catalog_pb2.SOURCE_TYPE_IMPORT,
                source_ref=batch_id,
                actor_id=actor_id,
            ),
            rows=list(rows),
        )
        if not request.rows or len(request.rows) > 500:
            raise ValueError("Catalog writes must contain between 1 and 500 rows")
        return self._stub.UpsertCanonical(
            request,
            metadata=self._metadata(org_id),
            timeout=self._timeout_seconds,
        )

    def _list_channels(self, metadata: tuple[tuple[str, str], ...]) -> list[ChannelReference]:
        result: list[ChannelReference] = []
        token = ""
        while True:
            response = self._stub.ListChannels(
                catalog_pb2.ListChannelsRequest(
                    pagination=common_pb2.Pagination(page_size=200, page_token=token)
                ),
                metadata=metadata,
                timeout=self._timeout_seconds,
            )
            result.extend(
                ChannelReference(channel.id, channel.code, channel.default_currency.upper())
                for channel in response.channels
            )
            token = response.pagination.next_page_token
            if not token:
                return result

    def _list_locations(self, metadata: tuple[tuple[str, str], ...]):
        result = []
        token = ""
        while True:
            response = self._stub.ListLocations(
                catalog_pb2.ListLocationsRequest(
                    pagination=common_pb2.Pagination(page_size=200, page_token=token)
                ),
                metadata=metadata,
                timeout=self._timeout_seconds,
            )
            result.extend(response.locations)
            token = response.pagination.next_page_token
            if not token:
                return result

    def _list_segments(self, metadata: tuple[tuple[str, str], ...]):
        result = []
        token = ""
        while True:
            response = self._stub.ListCustomerSegments(
                catalog_pb2.ListCustomerSegmentsRequest(
                    pagination=common_pb2.Pagination(page_size=200, page_token=token)
                ),
                metadata=metadata,
                timeout=self._timeout_seconds,
            )
            result.extend(response.customer_segments)
            token = response.pagination.next_page_token
            if not token:
                return result
