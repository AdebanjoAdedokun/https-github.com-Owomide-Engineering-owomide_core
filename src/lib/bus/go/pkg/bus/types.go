package bus

import "context"

type EventMetadata struct {
	TraceID       string
	SpanID        string
	CorrelationID string
}

type Event struct {
	ID           string
	Type         string
	OccurredAt   string
	PartitionKey string
	Payload      []byte
	Metadata     *EventMetadata
}

type ReplayFrom string

const (
	ReplayFromBeginning ReplayFrom = "beginning"
	ReplayFromLatest    ReplayFrom = "latest"
)

type SubscribeOptions struct {
	Topic      string
	Group      string
	ReplayFrom ReplayFrom
	Concurrency int
	MaxRetries  int
}

type Handler func(ctx context.Context, event *Event) error

type Subscription interface {
	Unsubscribe() error
}

type Publisher interface {
	Publish(ctx context.Context, topic string, event *Event) error
	Close() error
}

type Subscriber interface {
	Subscribe(ctx context.Context, opts SubscribeOptions, handler Handler) (Subscription, error)
	Close() error
}

type Bus struct {
	Publisher  Publisher
	Subscriber Subscriber
}

type KafkaConfig struct {
	Brokers  []string
	ClientID string
}

type Config struct {
	Provider string
	Kafka    KafkaConfig
}
