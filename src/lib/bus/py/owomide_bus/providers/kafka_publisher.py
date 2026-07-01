from __future__ import annotations

try:
    from aiokafka import AIOKafkaProducer
except ModuleNotFoundError:
    AIOKafkaProducer = None

from owomide_bus.types import Event, KafkaConfig
from owomide_bus.envelope import serialize


class KafkaPublisher:
    def __init__(self, config: KafkaConfig) -> None:
        self._config = config
        self._producer: AIOKafkaProducer | None = None

    async def _ensure_connected(self) -> AIOKafkaProducer:
        if self._producer is None:
            if AIOKafkaProducer is None:
                raise RuntimeError("aiokafka is required to use KafkaPublisher")
            self._producer = AIOKafkaProducer(
                bootstrap_servers=",".join(self._config.brokers),
                client_id=self._config.client_id,
                enable_idempotence=True,
            )
            await self._producer.start()
        return self._producer

    async def publish(self, topic: str, event: Event) -> None:
        producer = await self._ensure_connected()
        value = serialize(event)
        key = event.partition_key.encode("utf-8")
        await producer.send_and_wait(topic, value=value, key=key)

    async def close(self) -> None:
        if self._producer is not None:
            await self._producer.stop()
            self._producer = None
