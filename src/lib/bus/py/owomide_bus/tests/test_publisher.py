from unittest.mock import AsyncMock, patch
import pytest

from owomide_bus.types import Event, KafkaConfig
from owomide_bus.envelope import deserialize


@pytest.fixture
def config():
    return KafkaConfig(brokers=["localhost:9092"], client_id="test-publisher")


@pytest.fixture
def test_event():
    return Event(
        id="evt_pub_001",
        type="proposal.submitted",
        occurred_at="2026-06-29T12:00:00Z",
        partition_key="prop_abc",
        payload=b"\x0a\x05hello",
    )


@patch("owomide_bus.providers.kafka_publisher.AIOKafkaProducer")
async def test_connects_on_first_publish(mock_producer_cls, config, test_event):
    mock_producer = AsyncMock()
    mock_producer_cls.return_value = mock_producer

    from owomide_bus.providers.kafka_publisher import KafkaPublisher
    publisher = KafkaPublisher(config)
    await publisher.publish("proposal.submitted", test_event)

    mock_producer.start.assert_awaited_once()


@patch("owomide_bus.providers.kafka_publisher.AIOKafkaProducer")
async def test_does_not_reconnect(mock_producer_cls, config, test_event):
    mock_producer = AsyncMock()
    mock_producer_cls.return_value = mock_producer

    from owomide_bus.providers.kafka_publisher import KafkaPublisher
    publisher = KafkaPublisher(config)
    await publisher.publish("proposal.submitted", test_event)
    await publisher.publish("proposal.submitted", test_event)

    mock_producer.start.assert_awaited_once()


@patch("owomide_bus.providers.kafka_publisher.AIOKafkaProducer")
async def test_sends_serialized_envelope(mock_producer_cls, config, test_event):
    mock_producer = AsyncMock()
    mock_producer_cls.return_value = mock_producer

    from owomide_bus.providers.kafka_publisher import KafkaPublisher
    publisher = KafkaPublisher(config)
    await publisher.publish("proposal.submitted", test_event)

    mock_producer.send_and_wait.assert_awaited_once()
    call_kwargs = mock_producer.send_and_wait.call_args
    assert call_kwargs[0][0] == "proposal.submitted"
    assert call_kwargs[1]["key"] == b"prop_abc"

    deserialized = deserialize(call_kwargs[1]["value"])
    assert deserialized.id == "evt_pub_001"
    assert deserialized.type == "proposal.submitted"


@patch("owomide_bus.providers.kafka_publisher.AIOKafkaProducer")
async def test_close_stops_producer(mock_producer_cls, config, test_event):
    mock_producer = AsyncMock()
    mock_producer_cls.return_value = mock_producer

    from owomide_bus.providers.kafka_publisher import KafkaPublisher
    publisher = KafkaPublisher(config)
    await publisher.publish("proposal.submitted", test_event)
    await publisher.close()

    mock_producer.stop.assert_awaited_once()


@patch("owomide_bus.providers.kafka_publisher.AIOKafkaProducer")
async def test_close_safe_when_not_connected(mock_producer_cls, config):
    mock_producer = AsyncMock()
    mock_producer_cls.return_value = mock_producer

    from owomide_bus.providers.kafka_publisher import KafkaPublisher
    publisher = KafkaPublisher(config)
    await publisher.close()

    mock_producer.stop.assert_not_awaited()
