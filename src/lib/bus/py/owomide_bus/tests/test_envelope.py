from owomide_bus.envelope import serialize, deserialize
from owomide_bus.types import Event, EventMetadata


def test_round_trip_with_metadata():
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

    assert result.id == event.id
    assert result.type == event.type
    assert result.occurred_at == event.occurred_at
    assert result.partition_key == event.partition_key
    assert result.payload == event.payload
    assert result.metadata is not None
    assert result.metadata.trace_id == "trace-123"
    assert result.metadata.span_id == "span-456"
    assert result.metadata.correlation_id == "corr-789"


def test_round_trip_without_metadata():
    event = Event(
        id="evt_002",
        type="import.committed",
        occurred_at="2026-06-29T13:00:00Z",
        partition_key="batch_xyz",
        payload=b"\x01\x02\x03",
    )

    data = serialize(event)
    result = deserialize(data)

    assert result.id == event.id
    assert result.type == event.type
    assert result.payload == event.payload
    assert result.metadata is None


def test_empty_payload():
    event = Event(
        id="evt_003",
        type="test.empty",
        occurred_at="2026-06-29T14:00:00Z",
        partition_key="key_1",
        payload=b"",
    )

    data = serialize(event)
    result = deserialize(data)

    assert result.id == "evt_003"
    assert result.payload == b""


def test_binary_payload_integrity():
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

    assert result.payload == payload
