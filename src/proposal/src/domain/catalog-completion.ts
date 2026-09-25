import { Code, ConnectError } from "@connectrpc/connect";
import { WriteStatus, type ApplyPriceChangesResponse, type PriceChange } from "@owomide/proto/services/catalog/v1/catalog_pb.js";

/** Transport success is insufficient: every requested line needs confirmed evidence. */
export function requireCompletePriceApplication(changes: PriceChange[], response: ApplyPriceChangesResponse): void {
  const expected = new Map(changes.map((change) => [change.proposalLineId, change.skuId]));
  const seen = new Set<string>();
  const successful = new Set([WriteStatus.CREATED, WriteStatus.UPDATED, WriteStatus.UNCHANGED]);
  const complete = changes.length > 0 && expected.size === changes.length &&
    response.results.length === changes.length && response.results.every((row) => {
      if (!expected.has(row.sourceItemRef) || seen.has(row.sourceItemRef)) return false;
      seen.add(row.sourceItemRef);
      return row.skuId === expected.get(row.sourceItemRef) && successful.has(row.status) &&
        row.errors.length === 0 && row.priceRecordIds.length > 0;
    });
  if (!complete || (response.summary?.rejected ?? 0) > 0) {
    throw new ConnectError(
      "Catalog did not confirm every proposal line. Some prices may have changed; reconcile the Catalog operation before retrying. Proposal remains approved.",
      Code.FailedPrecondition,
      { metadata: { "catalog-operation-id": response.operationId } },
    );
  }
}
