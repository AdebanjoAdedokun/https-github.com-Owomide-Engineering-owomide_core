package bus

import (
	"fmt"

	eventspb "github.com/owomide/proto/events"
	"google.golang.org/protobuf/proto"
)

func Serialize(event *Event) ([]byte, error) {
	envelope := &eventspb.EventEnvelope{
		Id:           event.ID,
		Type:         event.Type,
		OccurredAt:   event.OccurredAt,
		PartitionKey: event.PartitionKey,
		Payload:      event.Payload,
	}

	if event.Metadata != nil {
		envelope.Metadata = &eventspb.EventMetadata{
			TraceId:       event.Metadata.TraceID,
			SpanId:        event.Metadata.SpanID,
			CorrelationId: event.Metadata.CorrelationID,
		}
	}

	return proto.Marshal(envelope)
}

func Deserialize(data []byte) (*Event, error) {
	envelope := &eventspb.EventEnvelope{}
	if err := proto.Unmarshal(data, envelope); err != nil {
		return nil, fmt.Errorf("failed to unmarshal event envelope: %w", err)
	}

	event := &Event{
		ID:           envelope.Id,
		Type:         envelope.Type,
		OccurredAt:   envelope.OccurredAt,
		PartitionKey: envelope.PartitionKey,
		Payload:      envelope.Payload,
	}

	if envelope.Metadata != nil {
		event.Metadata = &EventMetadata{
			TraceID:       envelope.Metadata.TraceId,
			SpanID:        envelope.Metadata.SpanId,
			CorrelationID: envelope.Metadata.CorrelationId,
		}
	}

	return event, nil
}
