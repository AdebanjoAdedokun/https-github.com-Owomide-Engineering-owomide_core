from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from importlib import import_module
from uuid import UUID, uuid5

from google.protobuf.timestamp_pb2 import Timestamp

import_events_pb2 = import_module("events.import.v1_pb2")


EVENT_NAMESPACE = UUID("e2297a86-3ae2-4e77-a2d7-705ae71d4f7a")


@dataclass(frozen=True, slots=True)
class PendingEvent:
    id: UUID
    event_type: str
    aggregate_type: str
    aggregate_id: str
    partition_key: str
    payload: bytes
    metadata: dict[str, str]
    occurred_at: datetime


def import_committed_event(
    *,
    org_id: str,
    batch_id: UUID,
    file_url: str,
    template_id: UUID | None,
    actor_id: str,
    ok: int,
    warned: int,
    excluded: int,
    errored: int,
    occurred_at: datetime,
) -> PendingEvent:
    normalized_time = occurred_at.astimezone(UTC)
    created_at = Timestamp()
    created_at.FromDatetime(normalized_time)
    message = import_events_pb2.ImportCommitted(
        org_id=org_id,
        batch_id=str(batch_id),
        file_url=file_url,
        row_counts=import_events_pb2.RowCounts(
            ok=ok,
            warned=warned,
            excluded=excluded,
            errored=errored,
        ),
        template_id=str(template_id) if template_id else "",
        actor_id=actor_id,
        created_at=created_at,
    )
    return PendingEvent(
        id=uuid5(EVENT_NAMESPACE, f"import.committed:{org_id}:{batch_id}"),
        event_type="import.committed",
        aggregate_type="import_batch",
        aggregate_id=str(batch_id),
        partition_key=str(batch_id),
        payload=message.SerializeToString(),
        metadata={"correlation_id": str(batch_id)},
        occurred_at=normalized_time,
    )
