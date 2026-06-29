package main

import (
	"bytes"
	"fmt"
	"os"

	"github.com/owomide/bus/pkg/bus"
)

var event = &bus.Event{
	ID:           "interop_001",
	Type:         "proposal.submitted",
	OccurredAt:   "2026-06-29T12:00:00Z",
	PartitionKey: "prop_interop",
	Payload:      []byte{10, 14, 112, 114, 111, 112, 95, 105, 110, 116, 101, 114, 111, 112},
	Metadata: &bus.EventMetadata{
		TraceID:       "trace-interop",
		SpanID:        "span-interop",
		CorrelationID: "corr-interop",
	},
}

func write(filepath string) error {
	data, err := bus.Serialize(event)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath, data, 0644); err != nil {
		return err
	}
	fmt.Println("GO: wrote serialized event")
	return nil
}

func read(filepath string) error {
	data, err := os.ReadFile(filepath)
	if err != nil {
		return err
	}

	result, err := bus.Deserialize(data)
	if err != nil {
		return fmt.Errorf("deserialize failed: %w", err)
	}

	checks := []bool{
		result.ID == event.ID,
		result.Type == event.Type,
		result.OccurredAt == event.OccurredAt,
		result.PartitionKey == event.PartitionKey,
		bytes.Equal(result.Payload, event.Payload),
		result.Metadata != nil,
		result.Metadata != nil && result.Metadata.TraceID == "trace-interop",
		result.Metadata != nil && result.Metadata.SpanID == "span-interop",
		result.Metadata != nil && result.Metadata.CorrelationID == "corr-interop",
	}

	for _, ok := range checks {
		if !ok {
			return fmt.Errorf("verification FAILED: %+v", result)
		}
	}

	fmt.Println("GO: read and verified OK")
	return nil
}

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintf(os.Stderr, "Usage: interop_go <write|read> <file>\n")
		os.Exit(1)
	}

	mode, filepath := os.Args[1], os.Args[2]
	var err error
	switch mode {
	case "write":
		err = write(filepath)
	case "read":
		err = read(filepath)
	default:
		fmt.Fprintf(os.Stderr, "Unknown mode: %s\n", mode)
		os.Exit(1)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "GO: %v\n", err)
		os.Exit(1)
	}
}
