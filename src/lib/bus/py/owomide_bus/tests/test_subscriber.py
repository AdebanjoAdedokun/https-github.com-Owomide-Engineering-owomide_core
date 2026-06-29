from unittest.mock import AsyncMock, patch, MagicMock
import asyncio
import pytest

from owomide_bus.types import Event, KafkaConfig, SubscribeOptions
from owomide_bus.envelope import serialize


@pytest.fixture
def config():
    return KafkaConfig(brokers=["localhost:9092"], client_id="test-subscriber")


@pytest.fixture
def test_event():
    return Event(
        id="evt_sub_001",
        type="proposal.submitted",
        occurred_at="2026-06-29T12:00:00Z",
        partition_key="prop_abc",
        payload=b"\x0a\x05hello",
    )


class FakeMessage:
    def __init__(self, value: bytes | None):
        self.value = value
        self.key = None


class FakeConsumer:
    def __init__(self, messages: list[FakeMessage]):
        self._messages = messages
        self.start = AsyncMock()
        self.stop = AsyncMock()

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._messages:
            raise StopAsyncIteration
        return self._messages.pop(0)


@patch("owomide_bus.providers.kafka_subscriber.AIOKafkaProducer")
@patch("owomide_bus.providers.kafka_subscriber.AIOKafkaConsumer")
async def test_subscribes_and_receives_event(mock_consumer_cls, mock_dlq_cls, config, test_event):
    serialized = serialize(test_event)
    fake_consumer = FakeConsumer([FakeMessage(serialized)])
    mock_consumer_cls.return_value = fake_consumer

    handler = AsyncMock()

    from owomide_bus.providers.kafka_subscriber import KafkaSubscriber
    subscriber = KafkaSubscriber(config)
    opts = SubscribeOptions(topic="proposal.submitted", group="test.handler")
    sub = await subscriber.subscribe(opts, handler)

    await asyncio.sleep(0.1)

    handler.assert_awaited_once()
    received = handler.call_args[0][0]
    assert received.id == "evt_sub_001"
    assert received.type == "proposal.submitted"

    await sub.unsubscribe()


@patch("owomide_bus.providers.kafka_subscriber.AIOKafkaProducer")
@patch("owomide_bus.providers.kafka_subscriber.AIOKafkaConsumer")
async def test_skips_null_messages(mock_consumer_cls, mock_dlq_cls, config):
    fake_consumer = FakeConsumer([FakeMessage(None)])
    mock_consumer_cls.return_value = fake_consumer

    handler = AsyncMock()

    from owomide_bus.providers.kafka_subscriber import KafkaSubscriber
    subscriber = KafkaSubscriber(config)
    opts = SubscribeOptions(topic="proposal.submitted", group="test.null")
    sub = await subscriber.subscribe(opts, handler)

    await asyncio.sleep(0.1)

    handler.assert_not_awaited()
    await sub.unsubscribe()


@patch("owomide_bus.providers.kafka_subscriber.AIOKafkaProducer")
@patch("owomide_bus.providers.kafka_subscriber.AIOKafkaConsumer")
async def test_sends_to_dlq_after_max_retries(mock_consumer_cls, mock_dlq_cls, config, test_event):
    serialized = serialize(test_event)
    fake_consumer = FakeConsumer([FakeMessage(serialized)])
    mock_consumer_cls.return_value = fake_consumer

    mock_dlq_producer = AsyncMock()
    mock_dlq_cls.return_value = mock_dlq_producer

    handler = AsyncMock(side_effect=Exception("handler failed"))

    from owomide_bus.providers.kafka_subscriber import KafkaSubscriber
    subscriber = KafkaSubscriber(config)
    opts = SubscribeOptions(topic="proposal.submitted", group="test.dlq", max_retries=1)
    sub = await subscriber.subscribe(opts, handler)

    await asyncio.sleep(2.5)

    assert handler.await_count == 2
    mock_dlq_producer.send_and_wait.assert_awaited_once()
    dlq_call = mock_dlq_producer.send_and_wait.call_args
    assert dlq_call[0][0] == "proposal.submitted.dlq"

    await sub.unsubscribe()
