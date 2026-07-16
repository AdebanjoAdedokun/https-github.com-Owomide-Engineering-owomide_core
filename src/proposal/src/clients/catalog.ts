import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import type {
  ApplyPriceChangesRequest,
  ApplyPriceChangesResponse,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { CatalogService } from "@owomide/proto/services/catalog/v1/catalog_pb.js";

export interface CatalogClient {
  applyPriceChanges(req: ApplyPriceChangesRequest, headers: Headers): Promise<ApplyPriceChangesResponse>;
}

export class GrpcCatalogClient implements CatalogClient {
  private readonly client: ReturnType<typeof createClient<typeof CatalogService>>;

  constructor(baseUrl: string) {
    this.client = createClient(CatalogService, createGrpcTransport({ baseUrl }));
  }

  async applyPriceChanges(req: ApplyPriceChangesRequest, headers: Headers): Promise<ApplyPriceChangesResponse> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.client.applyPriceChanges!(req, { headers });
  }
}
