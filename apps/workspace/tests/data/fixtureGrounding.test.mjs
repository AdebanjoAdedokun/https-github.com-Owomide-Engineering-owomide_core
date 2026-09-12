import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  FIXTURE_COUNTS,
  FIXTURE_ACTOR_IDS,
  FIXTURE_AUDIT_EVENTS,
  FIXTURE_ID,
  FIXTURE_OVERRIDE_ID,
  FIXTURE_PREVIEW_REF,
  FIXTURE_PROPOSAL_ID,
  FIXTURE_PUBLICATION_ID,
  FIXTURE_VERSION,
  createFixtureWorkspaceRepositories,
} from "../../src/data/index.js";

const canonicalFixturePath = join(
  homedir(),
  "Documents",
  "Companies",
  "Owomide",
  "owomide_frontend",
  "fixtures",
  "v0",
  "fixture.json",
);
const localTestDirectory = dirname(fileURLToPath(import.meta.url));
const canonicalFx010SnapshotPath = join(localTestDirectory, "fixtures", "fx010-canonical-audit.snapshot.json");
const canonicalFx010Snapshot = JSON.parse(readFileSync(canonicalFx010SnapshotPath, "utf8"));

function normalizeForStableJson(value) {
  if (Array.isArray(value)) return value.map(normalizeForStableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeForStableJson(value[key])]),
    );
  }
  return value;
}

function stableSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(normalizeForStableJson(value)))
    .digest("hex");
}

test("Given the canonical fixture checkout, when the adapter snapshot is compared, then its metadata, FX-004 counts and six visible lines match", async (context) => {
  if (!existsSync(canonicalFixturePath)) {
    context.skip("Canonical owomide_frontend fixture checkout is not available in this environment.");
    return;
  }
  const canonical = JSON.parse(readFileSync(canonicalFixturePath, "utf8"));
  const fx004 = canonical.scenarios.find((scenario) => scenario.id === "FX-004");
  const preview = await createFixtureWorkspaceRepositories().repricing.getPreview();

  assert.equal(canonical.meta.fixtureId, FIXTURE_ID);
  assert.equal(canonical.meta.fixtureVersion, FIXTURE_VERSION);
  assert.equal(FIXTURE_PREVIEW_REF.id, fx004.id);
  assert.deepEqual(FIXTURE_COUNTS, fx004.expected.counts);

  for (const line of preview.lines) {
    const source = canonical.catalog.find((sku) => sku.id === line.id);
    assert.ok(source, `missing canonical line ${line.id}`);
    assert.equal(line.sku, source.sku);
    assert.deepEqual(line.currentCost, source.currentCost);
    assert.deepEqual(line.currentPrice, source.repricing.currentPrice);
    assert.deepEqual(line.proposedPrice, source.repricing.proposedPrice);
    assert.deepEqual(line.absoluteDelta, source.repricing.absoluteDelta);
    assert.equal(line.currentMarginBasisPoints, source.repricing.oldMarginBasisPoints);
    assert.equal(line.proposedMarginBasisPoints, source.repricing.proposedMarginBasisPoints);
    assert.equal(line.policy.floorBasisPoints, source.repricing.marginFloor.basisPoints);
    assert.deepEqual(line.policy.floorPrice, source.repricing.marginFloor.amount);
    assert.equal(line.provenance.rowNumber, source.source.rowNumber);
    assert.equal(line.provenance.catalogVersion, source.version);
  }

  for (const option of preview.facets.channels) {
    const source = canonical.channels.find((channel) => channel.id === option.id);
    assert.ok(source, `missing canonical channel ${option.id}`);
    assert.equal(option.name, source.name);
  }
  for (const option of preview.facets.locations) {
    const source = canonical.locations.find((location) => location.id === option.id);
    assert.ok(source, `missing canonical location ${option.id}`);
    assert.equal(option.name, source.name);
  }
});

test("Given canonical FX-010, when the Proposal journey fixture is compared, then actors, resource lineage and all audit events remain exact", () => {
  assert.equal(canonicalFx010Snapshot.sourceFixtureId, FIXTURE_ID);
  assert.equal(canonicalFx010Snapshot.sourceFixtureVersion, FIXTURE_VERSION);
  assert.equal(canonicalFx010Snapshot.scenarioId, "FX-010");
  assert.equal(canonicalFx010Snapshot.projection, "auditEvents");
  assert.equal(canonicalFx010Snapshot.algorithm, "sha256-stable-json-v1");
  assert.equal(FIXTURE_AUDIT_EVENTS.length, canonicalFx010Snapshot.eventCount);
  assert.equal(FIXTURE_AUDIT_EVENTS.at(0)?.id, canonicalFx010Snapshot.firstEventId);
  assert.equal(FIXTURE_AUDIT_EVENTS.at(-1)?.id, canonicalFx010Snapshot.lastEventId);
  assert.equal(stableSha256(FIXTURE_AUDIT_EVENTS), canonicalFx010Snapshot.sha256);

  if (!existsSync(canonicalFixturePath)) return;
  const canonical = JSON.parse(readFileSync(canonicalFixturePath, "utf8"));
  const fx010 = canonical.scenarios.find((scenario) => scenario.id === "FX-010");

  // FX-010's four historical actors remain exact. New September role samples
  // are intentionally outside this canonical audit reconstruction.
  assert.deepEqual(["teni", "chika", "farida", "moyo"].map((key) => FIXTURE_ACTOR_IDS[key]), canonical.actors.map((actor) => actor.id));
  assert.equal(FIXTURE_PROPOSAL_ID, canonical.auditEvents.find((event) => event.eventType === "proposal.created").object.id);
  assert.equal(FIXTURE_OVERRIDE_ID, canonical.auditEvents.find((event) => event.eventType === "override.requested").object.id);
  assert.equal(FIXTURE_PUBLICATION_ID, canonical.auditEvents.find((event) => event.eventType === "publish.started").object.id);
  assert.deepEqual(FIXTURE_AUDIT_EVENTS.map((event) => event.id), fx010.expected.eventIds);
  assert.equal(stableSha256(canonical.auditEvents), canonicalFx010Snapshot.sha256);
  assert.deepEqual(
    FIXTURE_AUDIT_EVENTS.map(({ id, sequence, occurredAt, eventType, object, actorId, actorRole, sourceType, before, after, reason, isSynthetic }) => ({
      actorId,
      actorRole,
      after,
      before,
      eventType,
      id,
      isSynthetic,
      object,
      occurredAt,
      reason,
      sequence,
      sourceType,
    })),
    canonical.auditEvents,
  );
});
