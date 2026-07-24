import { createClient, type Client } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import type { DescService } from "@bufbuild/protobuf";

const transports = new Map<string, ReturnType<typeof createGrpcTransport>>();

function getTransport(baseUrl: string) {
  let transport = transports.get(baseUrl);
  if (!transport) {
    transport = createGrpcTransport({ baseUrl });
    transports.set(baseUrl, transport);
  }
  return transport;
}

export function createServiceClient<T extends DescService>(
  service: T,
  baseUrl: string,
): Client<T> {
  return createClient(service, getTransport(baseUrl));
}
