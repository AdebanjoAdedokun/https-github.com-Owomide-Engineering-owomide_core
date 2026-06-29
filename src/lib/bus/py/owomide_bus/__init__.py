from owomide_bus.types import (
    Event,
    EventMetadata,
    BusConfig,
    KafkaConfig,
    SubscribeOptions,
    Handler,
    Subscription,
    Publisher,
    Subscriber,
    Bus,
)
from owomide_bus.envelope import serialize, deserialize
from owomide_bus.providers.kafka_publisher import KafkaPublisher
from owomide_bus.providers.kafka_subscriber import KafkaSubscriber


def create_bus(config: BusConfig) -> Bus:
    if config.provider != "kafka":
        raise ValueError(f"Unknown bus provider: {config.provider}")

    if config.kafka is None:
        raise ValueError("Kafka config required when provider is 'kafka'")

    publisher = KafkaPublisher(config.kafka)
    subscriber = KafkaSubscriber(config.kafka)
    return Bus(publisher=publisher, subscriber=subscriber)


__all__ = [
    "create_bus",
    "Event",
    "EventMetadata",
    "BusConfig",
    "KafkaConfig",
    "SubscribeOptions",
    "Handler",
    "Subscription",
    "Publisher",
    "Subscriber",
    "Bus",
    "serialize",
    "deserialize",
]
