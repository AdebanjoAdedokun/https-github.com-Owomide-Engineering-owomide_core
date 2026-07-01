import unittest

from owomide_bus.envelope import deserialize, serialize
from owomide_bus.types import Event, EventMetadata


class EnvelopeTest(unittest.TestCase):
    def test_round_trip_with_metadata(self):
        event = Event(
            id="evt_001",
            type="proposal.submitted",
            occurred_at="2026-06-29T12:00:00Z",
            partition_key="prop_abc",
            payload=b"\x0a\x0eprop_abc\x12\x08act_xyz",
            metadata=EventMetadata(
                trace_id="trace-123",
                span_id="span-456",
                correlation_id="corr-789",
            ),
        )

        data = serialize(event)
        result = deserialize(data)

        self.assertEqual(result.id, event.id)
        self.assertEqual(result.type, event.type)
        self.assertEqual(result.occurred_at, event.occurred_at)
        self.assertEqual(result.partition_key, event.partition_key)
        self.assertEqual(result.payload, event.payload)
        self.assertIsNotNone(result.metadata)
        assert result.metadata is not None
        self.assertEqual(result.metadata.trace_id, "trace-123")
        self.assertEqual(result.metadata.span_id, "span-456")
        self.assertEqual(result.metadata.correlation_id, "corr-789")

    def test_round_trip_without_metadata(self):
        event = Event(
            id="evt_002",
            type="import.committed",
            occurred_at="2026-06-29T13:00:00Z",
            partition_key="batch_xyz",
            payload=b"\x01\x02\x03",
        )

        data = serialize(event)
        result = deserialize(data)

        self.assertEqual(result.id, event.id)
        self.assertEqual(result.type, event.type)
        self.assertEqual(result.payload, event.payload)
        self.assertIsNone(result.metadata)

    def test_empty_payload(self):
        event = Event(
            id="evt_003",
            type="test.empty",
            occurred_at="2026-06-29T14:00:00Z",
            partition_key="key_1",
            payload=b"",
        )

        data = serialize(event)
        result = deserialize(data)

        self.assertEqual(result.id, "evt_003")
        self.assertEqual(result.payload, b"")

    def test_binary_payload_integrity(self):
        payload = bytes(range(256))
        event = Event(
            id="evt_004",
            type="test.binary",
            occurred_at="2026-06-29T15:00:00Z",
            partition_key="key_2",
            payload=payload,
        )

        data = serialize(event)
        result = deserialize(data)

        self.assertEqual(result.payload, payload)


if __name__ == "__main__":
    unittest.main()
