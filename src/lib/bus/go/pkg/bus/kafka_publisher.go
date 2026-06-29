package bus

import (
	"context"

	"github.com/twmb/franz-go/pkg/kgo"
)

type KafkaPublisher struct {
	client *kgo.Client
}

func NewKafkaPublisher(brokers []string, clientID string) (*KafkaPublisher, error) {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.ClientID(clientID),
		kgo.ProducerBatchMaxBytes(1048576),
	)
	if err != nil {
		return nil, err
	}

	return &KafkaPublisher{client: client}, nil
}

func (p *KafkaPublisher) Publish(ctx context.Context, topic string, event *Event) error {
	data, err := Serialize(event)
	if err != nil {
		return err
	}

	record := &kgo.Record{
		Topic: topic,
		Key:   []byte(event.PartitionKey),
		Value: data,
	}

	result := p.client.ProduceSync(ctx, record)
	return result.FirstErr()
}

func (p *KafkaPublisher) Close() error {
	p.client.Close()
	return nil
}
