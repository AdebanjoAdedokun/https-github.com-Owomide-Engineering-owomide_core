import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py"))

from owomide_bus.envelope import serialize, deserialize
from owomide_bus.types import Event, EventMetadata

EVENT = Event(
    id="interop_001",
    type="proposal.submitted",
    occurred_at="2026-06-29T12:00:00Z",
    partition_key="prop_interop",
    payload=bytes([10, 14, 112, 114, 111, 112, 95, 105, 110, 116, 101, 114, 111, 112]),
    metadata=EventMetadata(
        trace_id="trace-interop",
        span_id="span-interop",
        correlation_id="corr-interop",
    ),
)


def write(filepath: str) -> None:
    data = serialize(EVENT)
    Path(filepath).write_bytes(data)
    print("PY: wrote serialized event")


def read(filepath: str) -> None:
    data = Path(filepath).read_bytes()
    result = deserialize(data)

    checks = [
        result.id == EVENT.id,
        result.type == EVENT.type,
        result.occurred_at == EVENT.occurred_at,
        result.partition_key == EVENT.partition_key,
        result.payload == EVENT.payload,
        result.metadata is not None,
        result.metadata.trace_id == "trace-interop" if result.metadata else False,
        result.metadata.span_id == "span-interop" if result.metadata else False,
        result.metadata.correlation_id == "corr-interop" if result.metadata else False,
    ]

    if all(checks):
        print("PY: read and verified OK")
    else:
        print(f"PY: verification FAILED: {result}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: interop_py.py <write|read> <file>", file=sys.stderr)
        sys.exit(1)

    mode, filepath = sys.argv[1], sys.argv[2]
    if mode == "write":
        write(filepath)
    elif mode == "read":
        read(filepath)
