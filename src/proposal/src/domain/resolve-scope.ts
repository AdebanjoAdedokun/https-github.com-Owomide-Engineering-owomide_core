import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { ListSkusRequestSchema, BatchGetPricesRequestSchema, type Sku } from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import type { Money } from "@owomide/proto/common/v1/common_pb.js";
import type { CatalogClient } from "../clients/catalog.js";
import type { ScopeDsl } from "./scope-dsl.js";

export async function resolveScope(catalog: CatalogClient, scope: ScopeDsl, headers: Headers) {
  const skus: Sku[] = [];
  const ids = new Set<string>();
  const tokens = new Set<string>();
  let pageToken = "";
  do {
    const page = await catalog.listSkus(create(ListSkusRequestSchema, {
      channelId: scope.channel_id, productId: scope.product_id, category: scope.category,
      query: scope.query, pagination: { pageSize: 200, pageToken },
    }), headers);
    for (const sku of page.skus) {
      if (ids.has(sku.id)) throw new ConnectError("Scope changed during pagination; rebuild the scope", Code.Aborted);
      ids.add(sku.id);
      skus.push(sku);
    }
    pageToken = page.pagination?.nextPageToken ?? "";
    if (pageToken && tokens.has(pageToken)) throw new ConnectError("Catalog repeated a scope cursor", Code.DataLoss);
    tokens.add(pageToken);
  } while (pageToken);

  const prices = new Map<string, Money>();
  const unresolved: string[] = [];
  for (let offset = 0; offset < skus.length; offset += 200) {
    const batch = skus.slice(offset, offset + 200);
    const response = await catalog.batchGetPrices(create(BatchGetPricesRequestSchema, {
      skuIds: batch.map((sku) => sku.id), channelId: scope.channel_id,
      customerSegmentId: scope.customer_segment_id,
    }), headers);
    for (const sku of batch) {
      const matches = response.prices.filter((price) => price.skuId === sku.id);
      const match = matches[0];
      if (matches.length !== 1 || !match?.price || match.channelId !== scope.channel_id ||
          (match.customerSegmentId ?? "") !== (scope.customer_segment_id ?? "")) {
        unresolved.push(sku.id);
      } else {
        prices.set(sku.id, match.price);
      }
    }
  }
  if (unresolved.length) throw new ConnectError(
    `Scope contains ${unresolved.length} missing or ambiguous current prices; resolve them before preview: ${unresolved.slice(0, 20).join(", ")}`,
    Code.FailedPrecondition,
  );
  return { skus, prices };
}
