from __future__ import annotations

import sys
from pathlib import Path

_proto_gen = str(Path(__file__).resolve().parent.parent.parent.parent / "proto" / "gen" / "py")
if _proto_gen not in sys.path:
    sys.path.insert(0, _proto_gen)

from events.envelope_pb2 import EventEnvelope, EventMetadata as EventMetadataPb  # type: ignore[import-untyped]

from owomide_bus.types import Event, EventMetadata


def serialize(event: Event) -> bytes:
    metadata_pb = None
    if event.metadata:
        metadata_pb = EventMetadataPb(
            trace_id=event.metadata.trace_id,
            span_id=event.metadata.span_id,
            correlation_id=event.metadata.correlation_id,
        )

    envelope = EventEnvelope(
        id=event.id,
        type=event.type,
        occurred_at=event.occurred_at,
        partition_key=event.partition_key,
        payload=event.payload,
        metadata=metadata_pb,
    )
    return envelope.SerializeToString()


def deserialize(data: bytes) -> Event:
    envelope = EventEnvelope()
    envelope.ParseFromString(data)

    metadata: EventMetadata | None = None
    if envelope.HasField("metadata"):
        metadata = EventMetadata(
            trace_id=envelope.metadata.trace_id or "",
            span_id=envelope.metadata.span_id or "",
            correlation_id=envelope.metadata.correlation_id or "",
        )

    return Event(
        id=envelope.id,
        type=envelope.type,
        occurred_at=envelope.occurred_at,
        partition_key=envelope.partition_key,
        payload=bytes(envelope.payload),
        metadata=metadata,
    )
