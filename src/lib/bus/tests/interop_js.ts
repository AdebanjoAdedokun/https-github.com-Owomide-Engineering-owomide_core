import { writeFileSync, readFileSync } from "node:fs";
import { serialize, deserialize } from "../js/src/envelope.js";
import type { Event } from "../js/src/types.js";

const event: Event = {
  id: "interop_001",
  type: "proposal.submitted",
  occurredAt: "2026-06-29T12:00:00Z",
  partitionKey: "prop_interop",
  payload: new Uint8Array([10, 14, 112, 114, 111, 112, 95, 105, 110, 116, 101, 114, 111, 112]),
  metadata: {
    traceId: "trace-interop",
    spanId: "span-interop",
    correlationId: "corr-interop",
  },
};

const mode = process.argv[2];
const file = process.argv[3];

if (!mode || !file) {
  console.error("Usage: interop_js.ts <write|read> <file>");
  process.exit(1);
}

if (mode === "write") {
  const bytes = serialize(event);
  writeFileSync(file, Buffer.from(bytes));
  console.log("JS: wrote serialized event");
} else if (mode === "read") {
  const bytes = new Uint8Array(readFileSync(file));
  const result = deserialize(bytes);

  const checks = [
    result.id === event.id,
    result.type === event.type,
    result.occurredAt === event.occurredAt,
    result.partitionKey === event.partitionKey,
    Buffer.from(result.payload).equals(Buffer.from(event.payload)),
    result.metadata?.traceId === "trace-interop",
    result.metadata?.spanId === "span-interop",
    result.metadata?.correlationId === "corr-interop",
  ];

  if (checks.every(Boolean)) {
    console.log("JS: read and verified OK");
  } else {
    console.error("JS: verification FAILED", result);
    process.exit(1);
  }
}
