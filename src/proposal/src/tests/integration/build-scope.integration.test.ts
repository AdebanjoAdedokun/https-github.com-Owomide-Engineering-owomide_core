import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { type HandlerContext } from "@connectrpc/connect";
import {
  BuildScopeRequestSchema,
} from "@owomide/proto/services/proposal/v1/proposal_pb.js";
import {
  type ListSkusRequest,
  type ListSkusResponse,
  ListSkusResponseSchema,
  type BatchGetPricesRequest,
  type BatchGetPricesResponse,
  BatchGetPricesResponseSchema,
  SkuSchema,
  PriceRecordSchema,
  type ApplyPriceChangesRequest,
  type ApplyPriceChangesResponse,
} from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { MoneySchema } from "@owomide/proto/common/v1/common_pb.js";
import { Database } from "../../db.js";
import { ProposalRepository } from "../../repo/proposal-repository.js";
import { ProposalServiceImpl } from "../../service.js";
import { ServiceAuthenticator } from "../../context.js";
import type { CatalogClient } from "../../clients/catalog.js";
import type { MarginClient } from "../../clients/margin.js";

const CHANNEL_ID = "00000000-0000-0000-0000-000000000001";
const SKU_ID_1   = "00000000-0000-0000-0000-000000000011";
const SKU_ID_2   = "00000000-0000-0000-0000-000000000012";
const SKU_ID_3   = "00000000-0000-0000-0000-000000000013";

class TestAuthenticator extends ServiceAuthenticator {
  override async authorize(
    _context: HandlerContext,
    _allowedServices: readonly string[]
  ): Promise<string> {
    return "gateway_svc";
  }
}

class StubMarginClient implements MarginClient {
  validateBatch = () =>
    Promise.reject(new Error("validateBatch should not be called in build-scope tests"));
}

class StubCatalogClient implements CatalogClient {
  constructor(
    private readonly skus: ReturnType<typeof create<typeof SkuSchema>>[],
    private readonly prices: ReturnType<typeof create<typeof PriceRecordSchema>>[],
  ) {}

  async listSkus(_req: ListSkusRequest, _headers: Headers): Promise<ListSkusResponse> {
    return create(ListSkusResponseSchema, { skus: this.skus });
  }
  async batchGetPrices(_req: BatchGetPricesRequest, _headers: Headers): Promise<BatchGetPricesResponse> {
    return create(BatchGetPricesResponseSchema, { prices: this.prices });
  }
  async applyPriceChanges(_req: ApplyPriceChangesRequest, _headers: Headers): Promise<ApplyPriceChangesResponse> {
    throw new Error("applyPriceChanges should not be called in build-scope tests");
  }
}

function makeContext(orgId: string, userId: string): HandlerContext {
  const headers = new Headers();
  headers.set("x-org-id", orgId);
  headers.set("x-user-id", userId);
  return {
    requestHeader: headers,
    responseHeader: new Headers(),
    responseTrailer: new Headers(),
    signal: new AbortController().signal,
    values: new Map(),
    peer: { addr: "test", protocol: "http2" },
    method: {
      name: "BuildScope",
      kind: 0,
      idempotency: 0,
      input: {} as never,
      output: {} as never,
    },
  } as unknown as HandlerContext;
}

function money(amount: bigint, currency = "NGN") {
  return create(MoneySchema, { amount, currency });
}

function makeSku(id: string) {
  return create(SkuSchema, { id, skuCode: `SKU-${id.slice(-4)}` });
}

function makePriceRecord(skuId: string, amount: bigint) {
  return create(PriceRecordSchema, {
    skuId,
    channelId: CHANNEL_ID,
    price: money(amount),
  });
}

const ORG_ID  = "00000000-0000-0000-0000-000000000099";
const USER_ID = "00000000-0000-0000-0000-000000000001";

const VALID_SCOPE = JSON.stringify({ channel_id: CHANNEL_ID });

describe("BuildScope", () => {
  let db: Database;
  let service: ProposalServiceImpl;

  beforeAll(() => {
    // BuildScope makes no DB calls — construct with a dummy URL (pool connects lazily)
    db = new Database({
      databaseUrl: "postgresql://unused:unused@localhost:5432/unused",
      databasePoolSize: 1,
      databaseStatementTimeoutMs: 5_000,
    });
  });

  afterAll(async () => {
    await db.close();
  });

  function makeService(catalogClient: CatalogClient) {
    return new ProposalServiceImpl(
      db,
      new TestAuthenticator("owomide-internal", {}),
      new ProposalRepository(),
      catalogClient,
      new StubMarginClient(),
    );
  }

  describe("happy path", () => {
    it("returns ScopedSkus with current prices for matching SKUs", async () => {
      const skus = [makeSku(SKU_ID_1), makeSku(SKU_ID_2), makeSku(SKU_ID_3)];
      const prices = [
        makePriceRecord(SKU_ID_1, 120000n),
        makePriceRecord(SKU_ID_2, 85000n),
        makePriceRecord(SKU_ID_3, 310000n),
      ];
      service = makeService(new StubCatalogClient(skus, prices));

      const impl = service.implementation.buildScope!;
      const resp = await impl(
        create(BuildScopeRequestSchema, { scopeJson: VALID_SCOPE }) as never,
        makeContext(ORG_ID, USER_ID),
      ) as { skus: Array<{ skuId: string; channelId: string; currentPrice: { amount: bigint } }> };

      expect(resp.skus).toHaveLength(3);
      const ids = resp.skus.map((s) => s.skuId);
      expect(ids).toContain(SKU_ID_1);
      expect(ids).toContain(SKU_ID_2);
      expect(ids).toContain(SKU_ID_3);
      for (const s of resp.skus) {
        expect(s.channelId).toBe(CHANNEL_ID);
        expect(s.currentPrice).toBeDefined();
      }
    });

    it("returns empty list when Catalog has no matching SKUs", async () => {
      service = makeService(new StubCatalogClient([], []));

      const impl = service.implementation.buildScope!;
      const resp = await impl(
        create(BuildScopeRequestSchema, { scopeJson: VALID_SCOPE }) as never,
        makeContext(ORG_ID, USER_ID),
      ) as { skus: unknown[] };

      expect(resp.skus).toHaveLength(0);
    });

    it("silently drops SKUs that have no active price for the channel", async () => {
      const skus = [makeSku(SKU_ID_1), makeSku(SKU_ID_2)];
      // Only SKU_ID_1 has a price; SKU_ID_2 is priced but excluded from BatchGetPrices response
      const prices = [makePriceRecord(SKU_ID_1, 120000n)];
      service = makeService(new StubCatalogClient(skus, prices));

      const impl = service.implementation.buildScope!;
      const resp = await impl(
        create(BuildScopeRequestSchema, { scopeJson: VALID_SCOPE }) as never,
        makeContext(ORG_ID, USER_ID),
      ) as { skus: Array<{ skuId: string }> };

      expect(resp.skus).toHaveLength(1);
      expect(resp.skus[0]!.skuId).toBe(SKU_ID_1);
    });
  });

  describe("invalid scope_json", () => {
    beforeAll(() => {
      service = makeService(new StubCatalogClient([], []));
    });

    it("returns InvalidArgument for non-JSON input", async () => {
      const impl = service.implementation.buildScope!;
      await expect(
        impl(
          create(BuildScopeRequestSchema, { scopeJson: "not-json" }) as never,
          makeContext(ORG_ID, USER_ID),
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof ConnectError && err.code === Code.InvalidArgument,
      );
    });

    it("returns InvalidArgument when channel_id is missing", async () => {
      const impl = service.implementation.buildScope!;
      await expect(
        impl(
          create(BuildScopeRequestSchema, { scopeJson: "{}" }) as never,
          makeContext(ORG_ID, USER_ID),
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof ConnectError && err.code === Code.InvalidArgument,
      );
    });

    it("returns InvalidArgument when channel_id is not a UUID", async () => {
      const impl = service.implementation.buildScope!;
      await expect(
        impl(
          create(BuildScopeRequestSchema, {
            scopeJson: JSON.stringify({ channel_id: "not-a-uuid" }),
          }) as never,
          makeContext(ORG_ID, USER_ID),
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof ConnectError && err.code === Code.InvalidArgument,
      );
    });

    it("returns InvalidArgument for unknown scope fields", async () => {
      const impl = service.implementation.buildScope!;
      await expect(
        impl(
          create(BuildScopeRequestSchema, {
            scopeJson: JSON.stringify({ channel_id: CHANNEL_ID, tag: "promo" }),
          }) as never,
          makeContext(ORG_ID, USER_ID),
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof ConnectError && err.code === Code.InvalidArgument,
      );
    });
  });
});
