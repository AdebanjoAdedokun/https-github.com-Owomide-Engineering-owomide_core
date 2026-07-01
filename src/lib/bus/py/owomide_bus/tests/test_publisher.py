import unittest
from unittest.mock import AsyncMock, patch

from owomide_bus.envelope import deserialize
from owomide_bus.types import Event, KafkaConfig


def config():
    return KafkaConfig(brokers=["localhost:9092"], client_id="test-publisher")


def test_event():
    return Event(
        id="evt_pub_001",
        type="proposal.submitted",
        occurred_at="2026-06-29T12:00:00Z",
        partition_key="prop_abc",
        payload=b"\x0a\x05hello",
    )


class KafkaPublisherTest(unittest.IsolatedAsyncioTestCase):
    @patch("owomide_bus.providers.kafka_publisher.AIOKafkaProducer")
    async def test_connects_on_first_publish(self, mock_producer_cls):
        mock_producer = AsyncMock()
        mock_producer_cls.return_value = mock_producer

        from owomide_bus.providers.kafka_publisher import KafkaPublisher

        publisher = KafkaPublisher(config())
        await publisher.publish("proposal.submitted", test_event())

        mock_producer.start.assert_awaited_once()

    @patch("owomide_bus.providers.kafka_publisher.AIOKafkaProducer")
    async def test_does_not_reconnect(self, mock_producer_cls):
        mock_producer = AsyncMock()
        mock_producer_cls.return_value = mock_producer

        from owomide_bus.providers.kafka_publisher import KafkaPublisher

        publisher = KafkaPublisher(config())
        await publisher.publish("proposal.submitted", test_event())
        await publisher.publish("proposal.submitted", test_event())

        mock_producer.start.assert_awaited_once()

    @patch("owomide_bus.providers.kafka_publisher.AIOKafkaProducer")
    async def test_sends_serialized_envelope(self, mock_producer_cls):
        mock_producer = AsyncMock()
        mock_producer_cls.return_value = mock_producer

        from owomide_bus.providers.kafka_publisher import KafkaPublisher

        publisher = KafkaPublisher(config())
        await publisher.publish("proposal.submitted", test_event())

        mock_producer.send_and_wait.assert_awaited_once()
        call_kwargs = mock_producer.send_and_wait.call_args
        self.assertEqual(call_kwargs[0][0], "proposal.submitted")
        self.assertEqual(call_kwargs[1]["key"], b"prop_abc")

        deserialized = deserialize(call_kwargs[1]["value"])
        self.assertEqual(deserialized.id, "evt_pub_001")
        self.assertEqual(deserialized.type, "proposal.submitted")

    @patch("owomide_bus.providers.kafka_publisher.AIOKafkaProducer")
    async def test_close_stops_producer(self, mock_producer_cls):
        mock_producer = AsyncMock()
        mock_producer_cls.return_value = mock_producer

        from owomide_bus.providers.kafka_publisher import KafkaPublisher

        publisher = KafkaPublisher(config())
        await publisher.publish("proposal.submitted", test_event())
        await publisher.close()

        mock_producer.stop.assert_awaited_once()

    @patch("owomide_bus.providers.kafka_publisher.AIOKafkaProducer")
    async def test_close_safe_when_not_connected(self, mock_producer_cls):
        mock_producer = AsyncMock()
        mock_producer_cls.return_value = mock_producer

        from owomide_bus.providers.kafka_publisher import KafkaPublisher

        publisher = KafkaPublisher(config())
        await publisher.close()

        mock_producer.stop.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
