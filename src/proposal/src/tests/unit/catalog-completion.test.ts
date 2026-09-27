import { describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { ApplyPriceChangesResponseSchema, PriceChangeSchema, WriteStatus } from "@owomide/proto/services/catalog/v1/catalog_pb.js";
import { requireCompletePriceApplication } from "../../domain/catalog-completion.js";

const changes = ["a", "b"].map((id) => create(PriceChangeSchema, { proposalLineId: id, skuId: `sku-${id}` }));
function response() {
  return create(ApplyPriceChangesResponseSchema, {
    operationId: "operation-1",
    results: changes.map((change) => ({ sourceItemRef: change.proposalLineId, skuId: change.skuId,
      status: WriteStatus.UPDATED, priceRecordIds: [`price-${change.proposalLineId}`] })),
  });
}

describe("confirmed price application", () => {
  it("accepts complete evidence including idempotent replay", () => {
    const result = response();
    result.replayed = true;
    result.results[0]!.status = WriteStatus.UNCHANGED;
    expect(() => requireCompletePriceApplication(changes, result)).not.toThrow();
  });
  it.each(["rejected", "missing", "duplicate", "unexpected", "wrong-sku", "no-record", "unspecified", "error"])("rejects %s evidence", (failure) => {
    const result = response();
    const row = result.results[0]!;
    if (failure === "rejected") row.status = WriteStatus.REJECTED;
    if (failure === "missing") result.results.pop();
    if (failure === "duplicate") result.results[1] = row;
    if (failure === "unexpected") row.sourceItemRef = "unknown";
    if (failure === "wrong-sku") row.skuId = "other";
    if (failure === "no-record") row.priceRecordIds = [];
    if (failure === "unspecified") row.status = WriteStatus.UNSPECIFIED;
    if (failure === "error") row.errors.push({ $typeName: "owomide.services.catalog.v1.CatalogWriteError", code: 1, message: "invalid" });
    expect(() => requireCompletePriceApplication(changes, result)).toThrow("did not confirm every proposal line");
  });
  it("rejects an empty proposal", () => {
    expect(() => requireCompletePriceApplication([], create(ApplyPriceChangesResponseSchema))).toThrow();
  });
});
