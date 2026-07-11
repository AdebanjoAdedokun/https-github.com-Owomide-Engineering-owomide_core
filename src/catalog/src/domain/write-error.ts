import { CatalogErrorCode } from "@owomide/proto/services/catalog/v1/catalog_pb.js";

export class RowWriteError extends Error {
  constructor(
    readonly code: CatalogErrorCode,
    message: string,
    readonly field?: string
  ) {
    super(message);
    this.name = "RowWriteError";
  }
}
