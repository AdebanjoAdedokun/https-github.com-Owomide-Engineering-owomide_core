package bus

import "fmt"

func New(config Config) (*Bus, error) {
	switch config.Provider {
	case "kafka":
		pub, err := NewKafkaPublisher(config.Kafka.Brokers, config.Kafka.ClientID)
		if err != nil {
			return nil, fmt.Errorf("failed to create kafka publisher: %w", err)
		}

		sub := NewKafkaSubscriber(config.Kafka.Brokers, config.Kafka.ClientID)

		return &Bus{
			Publisher:  pub,
			Subscriber: sub,
		}, nil

	default:
		return nil, fmt.Errorf("unknown bus provider: %s", config.Provider)
	}
}
