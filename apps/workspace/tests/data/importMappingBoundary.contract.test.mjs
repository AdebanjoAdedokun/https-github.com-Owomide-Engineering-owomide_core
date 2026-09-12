import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureWorkspaceRepositories, FIXTURE_MAPPING_IMPORT_ID, RepositoryError } from "../../src/data/index.js";

const supportedMapping = {
  tradeCostTarget: "cost.amountMinor",
  priceTarget: "price.amountMinor",
  effectiveAt: "2026-08-15T00:00:00+01:00",
};

test("Given the supplied import mapping, unsupported targets and effective times fail without advancing its version", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const initial = await repositories.imports.getJourney({ batchId: FIXTURE_MAPPING_IMPORT_ID, version: "4", stage: "map" });
  const cases = [
    [{ ...supportedMapping, tradeCostTarget: "not.a.field" }, "IMPORT_MAPPING_UNSUPPORTED"],
    [{ ...supportedMapping, tradeCostTarget: "price.amountMinor", priceTarget: "cost.amountMinor" }, "IMPORT_MAPPING_UNSUPPORTED"],
    [{ ...supportedMapping, priceTarget: { field: "price.amountMinor" } }, "IMPORT_MAPPING_UNSUPPORTED"],
    [{ ...supportedMapping, effectiveAt: "not-a-date" }, "IMPORT_EFFECTIVE_TIME_UNSUPPORTED"],
    [{ ...supportedMapping, effectiveAt: "2026-02-31T00:00:00+01:00" }, "IMPORT_EFFECTIVE_TIME_UNSUPPORTED"],
    [{ ...supportedMapping, effectiveAt: "2026-09-15T00:00:00+01:00" }, "IMPORT_EFFECTIVE_TIME_UNSUPPORTED"],
    [{ ...supportedMapping, effectiveAt: "" }, "IMPORT_MAPPING_REQUIRED"],
  ];
  for (const [index, [mapping, code]] of cases.entries()) {
    await assert.rejects(
      repositories.imports.saveMapping({ batchRef: initial.ref, mapping, idempotencyKey: `unsupported-import-mapping-${index}` }),
      (error) => error instanceof RepositoryError && error.envelope.error.code === code,
    );
    const unchanged = await repositories.imports.getJourney({ ref: initial.ref, stage: "map" });
    assert.equal(unchanged.ref.version, "4");
    assert.equal(unchanged.mapping.ambiguityCount, 2);
  }
});

test("Given the exact supported sample mapping, confirmation preserves measured confidence and repeated requests do not advance twice", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const initial = await repositories.imports.getJourney({ batchId: FIXTURE_MAPPING_IMPORT_ID, version: "4", stage: "map" });
  const request = { batchRef: initial.ref, mapping: supportedMapping, idempotencyKey: "supported-import-mapping-001" };
  const confirmed = await repositories.imports.saveMapping(request);
  const retry = await repositories.imports.saveMapping(request);
  assert.equal(confirmed.data.ref.version, "5");
  assert.equal(confirmed.data.mapping.ambiguityCount, 0);
  assert.equal(confirmed.data.mapping.reviewContext.effectiveAt, supportedMapping.effectiveAt);
  assert.equal(confirmed.data.mapping.rows.find((row) => row.source === "Trade Cost").confidenceBasisPoints, 5400);
  assert.equal(confirmed.data.mapping.rows.find((row) => row.source === "Price?").confidenceBasisPoints, 5100);
  assert.equal(retry.data.ref.version, "5");
  assert.equal(retry.mutation.deduplicated, true);
});
