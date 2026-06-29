from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from owomide_bus.types import KafkaConfig, SubscribeOptions, Handler
from owomide_bus.envelope import deserialize

logger = logging.getLogger(__name__)


class _KafkaSubscription:
    def __init__(self, consumer: AIOKafkaConsumer, task: asyncio.Task[None]) -> None:
        self._consumer = consumer
        self._task = task

    async def unsubscribe(self) -> None:
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        await self._consumer.stop()


class KafkaSubscriber:
    def __init__(self, config: KafkaConfig) -> None:
        self._config = config
        self._subscriptions: list[_KafkaSubscription] = []

    async def subscribe(self, opts: SubscribeOptions, handler: Handler) -> _KafkaSubscription:
        auto_offset_reset = "earliest" if opts.replay_from == "beginning" else "latest"

        consumer = AIOKafkaConsumer(
            opts.topic,
            bootstrap_servers=",".join(self._config.brokers),
            client_id=self._config.client_id,
            group_id=opts.group,
            auto_offset_reset=auto_offset_reset,
            enable_auto_commit=True,
        )
        await consumer.start()

        task = asyncio.create_task(
            self._consume_loop(consumer, handler, opts)
        )

        sub = _KafkaSubscription(consumer, task)
        self._subscriptions.append(sub)
        return sub

    async def _consume_loop(
        self,
        consumer: AIOKafkaConsumer,
        handler: Handler,
        opts: SubscribeOptions,
    ) -> None:
        max_retries = opts.max_retries
        semaphore = asyncio.Semaphore(opts.concurrency)

        try:
            async for msg in consumer:
                if msg.value is None:
                    continue

                async with semaphore:
                    event = deserialize(msg.value)
                    attempt = 0
                    while attempt <= max_retries:
                        try:
                            await handler(event)
                            break
                        except Exception:
                            attempt += 1
                            if attempt > max_retries:
                                await self._send_to_dlq(opts.topic, msg.value)
                                break
                            backoff = min(1.0 * (2 ** (attempt - 1)), 30.0)
                            await asyncio.sleep(backoff)
        except asyncio.CancelledError:
            return

    async def _send_to_dlq(self, topic: str, original_value: bytes) -> None:
        producer = AIOKafkaProducer(
            bootstrap_servers=",".join(self._config.brokers),
            client_id=self._config.client_id,
        )
        try:
            await producer.start()
            await producer.send_and_wait(
                f"{topic}.dlq",
                value=original_value,
                headers=[
                    ("x-original-topic", topic.encode("utf-8")),
                    ("x-failed-at", datetime.now(timezone.utc).isoformat().encode("utf-8")),
                ],
            )
        finally:
            await producer.stop()

    async def close(self) -> None:
        for sub in self._subscriptions:
            await sub.unsubscribe()
        self._subscriptions.clear()
