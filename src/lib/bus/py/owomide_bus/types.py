from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable, Protocol, Union


@dataclass(frozen=True)
class EventMetadata:
    trace_id: str = ""
    span_id: str = ""
    correlation_id: str = ""


@dataclass(frozen=True)
class Event:
    id: str
    type: str
    occurred_at: str
    partition_key: str
    payload: bytes
    metadata: EventMetadata | None = None


@dataclass(frozen=True)
class KafkaConfig:
    brokers: list[str]
    client_id: str
    ssl: bool = False
    sasl_mechanism: str | None = None
    sasl_username: str | None = None
    sasl_password: str | None = None


@dataclass(frozen=True)
class BusConfig:
    provider: str
    kafka: KafkaConfig | None = None


@dataclass(frozen=True)
class ReplayFromTimestamp:
    timestamp: int


ReplayFrom = Union[str, ReplayFromTimestamp]  # "beginning" | "latest" | ReplayFromTimestamp


@dataclass(frozen=True)
class SubscribeOptions:
    topic: str
    group: str
    replay_from: ReplayFrom = "latest"
    concurrency: int = 10
    max_retries: int = 5


Handler = Callable[[Event], Awaitable[None]]


class Subscription(Protocol):
    async def unsubscribe(self) -> None: ...


class Publisher(Protocol):
    async def publish(self, topic: str, event: Event) -> None: ...
    async def close(self) -> None: ...


class Subscriber(Protocol):
    async def subscribe(self, opts: SubscribeOptions, handler: Handler) -> Subscription: ...
    async def close(self) -> None: ...


@dataclass
class Bus:
    publisher: Publisher
    subscriber: Subscriber
