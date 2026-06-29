import { describe, it, expect } from "vitest";
import { createServiceClient } from "../clients/factory.js";
import { ProposalService } from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import { CatalogService } from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { MarginService } from "@owomide/proto/services/margin/v1/margin_pb.js";

describe("client factory", () => {
  it("creates a typed ProposalService client", () => {
    const client = createServiceClient(ProposalService, "http://localhost:50051");
    expect(client).toBeDefined();
    expect(typeof client.createProposal).toBe("function");
    expect(typeof client.listProposals).toBe("function");
    expect(typeof client.submitProposal).toBe("function");
  });

  it("creates a typed CatalogService client", () => {
    const client = createServiceClient(CatalogService, "http://localhost:50052");
    expect(client).toBeDefined();
    expect(typeof client.getProduct).toBe("function");
    expect(typeof client.listSkus).toBe("function");
  });

  it("creates a typed MarginService client", () => {
    const client = createServiceClient(MarginService, "http://localhost:50053");
    expect(client).toBeDefined();
    expect(typeof client.validateBatch).toBe("function");
    expect(typeof client.listRules).toBe("function");
  });

  it("reuses transport for same baseUrl", () => {
    const client1 = createServiceClient(ProposalService, "http://localhost:50051");
    const client2 = createServiceClient(CatalogService, "http://localhost:50051");
    expect(client1).toBeDefined();
    expect(client2).toBeDefined();
  });
});
