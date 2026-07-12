from __future__ import annotations

import asyncio
import logging
from datetime import UTC
from typing import Protocol

from owomide_bus import BusConfig, Event, EventMetadata, KafkaConfig, create_bus

from owomide_data_pipeline.repository import ImportRepository, OutboxEventRecord


class EventPublisher(Protocol):
    def publish(self, event: OutboxEventRecord) -> None: ...

    def close(self) -> None: ...


class KafkaEventPublisher:
    def __init__(self, *, brokers: tuple[str, ...], client_id: str) -> None:
        self._loop = asyncio.new_event_loop()
        self._bus = create_bus(
            BusConfig(
                provider="kafka",
                kafka=KafkaConfig(brokers=list(brokers), client_id=client_id),
            )
        )

    def publish(self, event: OutboxEventRecord) -> None:
        metadata = EventMetadata(
            trace_id=event.metadata.get("trace_id", ""),
            span_id=event.metadata.get("span_id", ""),
            correlation_id=event.metadata.get("correlation_id", ""),
        )
        self._loop.run_until_complete(
            self._bus.publisher.publish(
                event.event_type,
                Event(
                    id=str(event.id),
                    type=event.event_type,
                    occurred_at=event.occurred_at.astimezone(UTC).isoformat(),
                    partition_key=event.partition_key,
                    payload=event.payload,
                    metadata=metadata,
                ),
            )
        )

    def close(self) -> None:
        self._loop.run_until_complete(self._bus.publisher.close())
        self._loop.run_until_complete(self._bus.subscriber.close())
        self._loop.close()


class OutboxProcessor:
    def __init__(
        self,
        *,
        repository: ImportRepository,
        publisher: EventPublisher,
        batch_size: int,
        lease_seconds: int,
        retry_base_seconds: int,
    ) -> None:
        self._repository = repository
        self._publisher = publisher
        self._batch_size = batch_size
        self._lease_seconds = lease_seconds
        self._retry_base_seconds = retry_base_seconds

    def process_once(self) -> bool:
        events = self._repository.claim_outbox_events(self._batch_size, self._lease_seconds)
        for event in events:
            try:
                self._publisher.publish(event)
                self._repository.mark_outbox_published(event.id)
            except Exception as exc:
                retry_seconds = min(
                    self._retry_base_seconds * (2 ** max(event.attempts - 1, 0)),
                    3_600,
                )
                self._repository.mark_outbox_failed(event.id, str(exc), retry_seconds)
                logging.exception("Outbox event %s could not be published", event.id)
        return bool(events)

    def close(self) -> None:
        self._publisher.close()
