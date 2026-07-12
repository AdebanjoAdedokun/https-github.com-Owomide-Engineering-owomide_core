from __future__ import annotations

import unittest
from datetime import UTC, datetime
from uuid import uuid4

from owomide_data_pipeline.events import import_committed_event
from owomide_data_pipeline.outbox import OutboxProcessor
from owomide_data_pipeline.repository import OutboxEventRecord


class FakeRepository:
    def __init__(self, events: tuple[OutboxEventRecord, ...]) -> None:
        self.events = events
        self.published = []
        self.failed = []

    def claim_outbox_events(self, _limit: int, _lease_seconds: int):
        events, self.events = self.events, ()
        return events

    def mark_outbox_published(self, event_id):
        self.published.append(event_id)

    def mark_outbox_failed(self, event_id, error, retry_seconds):
        self.failed.append((event_id, error, retry_seconds))


class FakePublisher:
    def __init__(self, failure: Exception | None = None) -> None:
        self.failure = failure
        self.events = []
        self.closed = False

    def publish(self, event):
        if self.failure:
            raise self.failure
        self.events.append(event)

    def close(self):
        self.closed = True


class OutboxTest(unittest.TestCase):
    def event(self, attempts: int = 1) -> OutboxEventRecord:
        return OutboxEventRecord(
            id=uuid4(),
            org_id="org-a",
            event_type="import.committed",
            partition_key="batch-a",
            payload=b"payload",
            metadata={"correlation_id": "batch-a"},
            occurred_at=datetime.now(UTC),
            attempts=attempts,
        )

    def test_marks_published_only_after_the_publisher_succeeds(self) -> None:
        event = self.event()
        repository = FakeRepository((event,))
        publisher = FakePublisher()
        processor = OutboxProcessor(
            repository=repository,
            publisher=publisher,
            batch_size=10,
            lease_seconds=30,
            retry_base_seconds=5,
        )

        self.assertTrue(processor.process_once())
        self.assertEqual(repository.published, [event.id])
        self.assertEqual(repository.failed, [])
        self.assertEqual(publisher.events, [event])

    def test_failed_publish_uses_bounded_exponential_retry(self) -> None:
        event = self.event(attempts=4)
        repository = FakeRepository((event,))
        processor = OutboxProcessor(
            repository=repository,
            publisher=FakePublisher(RuntimeError("kafka unavailable")),
            batch_size=10,
            lease_seconds=30,
            retry_base_seconds=5,
        )

        self.assertTrue(processor.process_once())
        self.assertEqual(repository.published, [])
        self.assertEqual(repository.failed, [(event.id, "kafka unavailable", 40)])

    def test_import_event_id_is_stable_for_logical_deduplication(self) -> None:
        batch_id = uuid4()
        now = datetime.now(UTC)
        kwargs = {
            "org_id": "org-a",
            "batch_id": batch_id,
            "file_url": "s3://imports/a.csv",
            "template_id": None,
            "actor_id": "user-a",
            "ok": 1,
            "warned": 0,
            "excluded": 0,
            "errored": 0,
            "occurred_at": now,
        }

        first = import_committed_event(**kwargs)
        second = import_committed_event(**kwargs)
        self.assertEqual(first.id, second.id)
        self.assertEqual(first.partition_key, str(batch_id))


if __name__ == "__main__":
    unittest.main()
