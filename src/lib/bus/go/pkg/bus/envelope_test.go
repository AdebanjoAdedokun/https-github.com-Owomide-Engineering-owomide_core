package bus

import (
	"bytes"
	"testing"
)

func TestRoundTripWithMetadata(t *testing.T) {
	event := &Event{
		ID:           "evt_001",
		Type:         "proposal.submitted",
		OccurredAt:   "2026-06-29T12:00:00Z",
		PartitionKey: "prop_abc",
		Payload:      []byte{10, 14, 112, 114, 111, 112, 95, 97, 98, 99},
		Metadata: &EventMetadata{
			TraceID:       "trace-123",
			SpanID:        "span-456",
			CorrelationID: "corr-789",
		},
	}

	data, err := Serialize(event)
	if err != nil {
		t.Fatalf("Serialize failed: %v", err)
	}

	result, err := Deserialize(data)
	if err != nil {
		t.Fatalf("Deserialize failed: %v", err)
	}

	if result.ID != event.ID {
		t.Errorf("ID: got %q, want %q", result.ID, event.ID)
	}
	if result.Type != event.Type {
		t.Errorf("Type: got %q, want %q", result.Type, event.Type)
	}
	if result.OccurredAt != event.OccurredAt {
		t.Errorf("OccurredAt: got %q, want %q", result.OccurredAt, event.OccurredAt)
	}
	if result.PartitionKey != event.PartitionKey {
		t.Errorf("PartitionKey: got %q, want %q", result.PartitionKey, event.PartitionKey)
	}
	if !bytes.Equal(result.Payload, event.Payload) {
		t.Errorf("Payload mismatch")
	}
	if result.Metadata == nil {
		t.Fatal("Metadata is nil")
	}
	if result.Metadata.TraceID != "trace-123" {
		t.Errorf("TraceID: got %q, want %q", result.Metadata.TraceID, "trace-123")
	}
	if result.Metadata.SpanID != "span-456" {
		t.Errorf("SpanID: got %q, want %q", result.Metadata.SpanID, "span-456")
	}
	if result.Metadata.CorrelationID != "corr-789" {
		t.Errorf("CorrelationID: got %q, want %q", result.Metadata.CorrelationID, "corr-789")
	}
}

func TestRoundTripWithoutMetadata(t *testing.T) {
	event := &Event{
		ID:           "evt_002",
		Type:         "import.committed",
		OccurredAt:   "2026-06-29T13:00:00Z",
		PartitionKey: "batch_xyz",
		Payload:      []byte{1, 2, 3},
	}

	data, err := Serialize(event)
	if err != nil {
		t.Fatalf("Serialize failed: %v", err)
	}

	result, err := Deserialize(data)
	if err != nil {
		t.Fatalf("Deserialize failed: %v", err)
	}

	if result.ID != event.ID {
		t.Errorf("ID mismatch")
	}
	if !bytes.Equal(result.Payload, event.Payload) {
		t.Errorf("Payload mismatch")
	}
	if result.Metadata != nil {
		t.Errorf("Expected nil metadata")
	}
}

func TestEmptyPayload(t *testing.T) {
	event := &Event{
		ID:           "evt_003",
		Type:         "test.empty",
		OccurredAt:   "2026-06-29T14:00:00Z",
		PartitionKey: "key_1",
		Payload:      []byte{},
	}

	data, err := Serialize(event)
	if err != nil {
		t.Fatalf("Serialize failed: %v", err)
	}

	result, err := Deserialize(data)
	if err != nil {
		t.Fatalf("Deserialize failed: %v", err)
	}

	if result.ID != "evt_003" {
		t.Errorf("ID mismatch")
	}
}

func TestBinaryPayloadIntegrity(t *testing.T) {
	payload := make([]byte, 256)
	for i := range payload {
		payload[i] = byte(i)
	}

	event := &Event{
		ID:           "evt_004",
		Type:         "test.binary",
		OccurredAt:   "2026-06-29T15:00:00Z",
		PartitionKey: "key_2",
		Payload:      payload,
	}

	data, err := Serialize(event)
	if err != nil {
		t.Fatalf("Serialize failed: %v", err)
	}

	result, err := Deserialize(data)
	if err != nil {
		t.Fatalf("Deserialize failed: %v", err)
	}

	if !bytes.Equal(result.Payload, payload) {
		t.Errorf("Payload mismatch")
	}
}
