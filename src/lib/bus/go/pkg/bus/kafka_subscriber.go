package bus

import (
	"context"
	"math"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
)

type KafkaSubscriber struct {
	brokers  []string
	clientID string
	cancels  []context.CancelFunc
}

func NewKafkaSubscriber(brokers []string, clientID string) *KafkaSubscriber {
	return &KafkaSubscriber{
		brokers:  brokers,
		clientID: clientID,
	}
}

type kafkaSubscription struct {
	cancel context.CancelFunc
}

func (s *kafkaSubscription) Unsubscribe() error {
	s.cancel()
	return nil
}

func (s *KafkaSubscriber) Subscribe(ctx context.Context, opts SubscribeOptions, handler Handler) (Subscription, error) {
	kopts := []kgo.Opt{
		kgo.SeedBrokers(s.brokers...),
		kgo.ClientID(s.clientID),
		kgo.ConsumerGroup(opts.Group),
		kgo.ConsumeTopics(opts.Topic),
	}

	if opts.ReplayFrom == ReplayFromBeginning {
		kopts = append(kopts, kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()))
	}

	client, err := kgo.NewClient(kopts...)
	if err != nil {
		return nil, err
	}

	maxRetries := opts.MaxRetries
	if maxRetries == 0 {
		maxRetries = 5
	}

	subCtx, cancel := context.WithCancel(ctx)
	s.cancels = append(s.cancels, cancel)

	go s.consumeLoop(subCtx, client, handler, opts.Topic, maxRetries)

	return &kafkaSubscription{cancel: cancel}, nil
}

func (s *KafkaSubscriber) consumeLoop(ctx context.Context, client *kgo.Client, handler Handler, topic string, maxRetries int) {
	defer client.Close()

	for {
		fetches := client.PollFetches(ctx)
		if ctx.Err() != nil {
			return
		}

		fetches.EachRecord(func(record *kgo.Record) {
			event, err := Deserialize(record.Value)
			if err != nil {
				return
			}

			for attempt := 0; attempt <= maxRetries; attempt++ {
				if err := handler(ctx, event); err == nil {
					return
				}

				if attempt >= maxRetries {
					s.sendToDLQ(ctx, topic, record.Value)
					return
				}

				backoff := time.Duration(math.Min(float64(time.Second)*math.Pow(2, float64(attempt)), float64(30*time.Second)))
				select {
				case <-time.After(backoff):
				case <-ctx.Done():
					return
				}
			}
		})
	}
}

func (s *KafkaSubscriber) sendToDLQ(ctx context.Context, topic string, value []byte) {
	dlqClient, err := kgo.NewClient(
		kgo.SeedBrokers(s.brokers...),
		kgo.ClientID(s.clientID),
	)
	if err != nil {
		return
	}
	defer dlqClient.Close()

	record := &kgo.Record{
		Topic: topic + ".dlq",
		Value: value,
		Headers: []kgo.RecordHeader{
			{Key: "x-original-topic", Value: []byte(topic)},
			{Key: "x-failed-at", Value: []byte(time.Now().UTC().Format(time.RFC3339))},
		},
	}

	dlqClient.ProduceSync(ctx, record)
}

func (s *KafkaSubscriber) Close() error {
	for _, cancel := range s.cancels {
		cancel()
	}
	s.cancels = nil
	return nil
}
