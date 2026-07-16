import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { TimestampSchema, type Timestamp } from "@bufbuild/protobuf/wkt";
import { ConnectError, Code } from "@connectrpc/connect";

export function timestampToDate(
  value: Timestamp | undefined,
  field: string,
  fallback?: Date
): Date {
  if (!value) {
    if (fallback) return fallback;
    throw new ConnectError(`${field} is required`, Code.InvalidArgument);
  }
  const milliseconds = Number(value.seconds) * 1_000 + Math.floor(value.nanos / 1_000_000);
  const date = new Date(milliseconds);
  if (!Number.isFinite(milliseconds) || Number.isNaN(date.getTime())) {
    throw new ConnectError(`${field} is invalid`, Code.InvalidArgument);
  }
  return date;
}

export function dateToTimestamp(value: Date | string | null): Timestamp | undefined {
  if (value === null) return undefined;
  const date = typeof value === "string" ? new Date(value) : value;
  const milliseconds = date.getTime();
  const seconds = Math.floor(milliseconds / 1_000);
  const nanos = (milliseconds - seconds * 1_000) * 1_000_000;
  const init: MessageInitShape<typeof TimestampSchema> = { seconds: BigInt(seconds), nanos };
  return create(TimestampSchema, init);
}
