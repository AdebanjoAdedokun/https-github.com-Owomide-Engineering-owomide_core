import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import type {
  ValidateBatchRequest,
  ValidateBatchResponse,
} from "@owomide/proto/services/margin/v1/margin_pb.js";
import { MarginService } from "@owomide/proto/services/margin/v1/margin_pb.js";

export interface MarginClient {
  validateBatch(req: ValidateBatchRequest, headers: Headers): Promise<ValidateBatchResponse>;
}

export class GrpcMarginClient implements MarginClient {
  private readonly client: ReturnType<typeof createClient<typeof MarginService>>;

  constructor(baseUrl: string) {
    this.client = createClient(MarginService, createGrpcTransport({ baseUrl }));
  }

  async validateBatch(req: ValidateBatchRequest, headers: Headers): Promise<ValidateBatchResponse> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.client.validateBatch!(req, { headers });
  }
}
