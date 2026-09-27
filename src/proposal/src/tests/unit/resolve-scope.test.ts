import { expect, it, vi } from "vitest";
import { create } from "@bufbuild/protobuf";
import { ListSkusResponseSchema, BatchGetPricesResponseSchema } from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import type { CatalogClient } from "../../clients/catalog.js";
import { resolveScope } from "../../domain/resolve-scope.js";

function client(count = 501): CatalogClient {
  return {
    applyPriceChanges: vi.fn(),
    listSkus: vi.fn(async (req) => {
      const offset = Number(req.pagination?.pageToken || 0);
      const size = Math.min(200, count - offset);
      return create(ListSkusResponseSchema, {
        skus: Array.from({ length: size }, (_, i) => ({ id: `sku-${offset + i}` })),
        pagination: { nextPageToken: offset + size < count ? String(offset + size) : "" },
      });
    }),
    batchGetPrices: vi.fn(async (req) => create(BatchGetPricesResponseSchema, {
      prices: req.skuIds.map((skuId: string) => ({ skuId, channelId: "channel", price: { amount: 100n, currency: "NGN" } })),
    })),
  };
}

it("retains all 5,000 scope members across pages and price batches", async () => {
  const catalog = client(5000);
  const result = await resolveScope(catalog, { channel_id: "channel" }, new Headers());
  expect(result.skus).toHaveLength(5000);
  expect(result.prices.size).toBe(5000);
  expect(catalog.listSkus).toHaveBeenCalledTimes(25);
  expect(catalog.batchGetPrices).toHaveBeenCalledTimes(25);
});

it.each(["missing", "ambiguous", "wrong-channel", "wrong-segment"])("refuses %s prices instead of silently dropping scope members", async (failure) => {
  const catalog = client(1);
  catalog.batchGetPrices = vi.fn(async () => create(BatchGetPricesResponseSchema, {
    prices: failure === "missing" ? [] : Array.from({ length: failure === "ambiguous" ? 2 : 1 }, () => ({
      skuId: "sku-0", channelId: failure === "wrong-channel" ? "other" : "channel",
      customerSegmentId: failure === "wrong-segment" ? "other" : undefined,
      price: { amount: 100n, currency: "NGN" },
    })),
  }));
  await expect(resolveScope(catalog, { channel_id: "channel" }, new Headers())).rejects.toThrow("missing or ambiguous");
});

it("rejects repeated cursors rather than looping forever", async () => {
  const catalog = client();
  catalog.listSkus = vi.fn(async () => create(ListSkusResponseSchema, { pagination: { nextPageToken: "same" } }));
  await expect(resolveScope(catalog, { channel_id: "channel" }, new Headers())).rejects.toThrow("repeated");
});
