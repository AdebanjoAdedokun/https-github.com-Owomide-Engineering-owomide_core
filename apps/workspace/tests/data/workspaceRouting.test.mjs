import assert from "node:assert/strict";
import { test } from "node:test";

import { parseWorkspaceHash, workspaceHash } from "../../src/workspaceRouting.js";

test("Given a persisted pricing rule, when its route round-trips, then the exact rule version is retained", () => {
  const route = { surface: "repricing-rule", resourceId: "FX-004", resourceVersion: "3", view: "rule" };
  assert.deepEqual(parseWorkspaceHash(workspaceHash(route)), route);
});

test("Given a protected exception review, when its route round-trips, then both governed object versions are retained", () => {
  const route = {
    surface: "proposal-override",
    resourceId: "proposal-id",
    resourceVersion: "7",
    overrideId: "override-id",
    overrideVersion: "2",
    view: "review",
  };
  assert.deepEqual(parseWorkspaceHash(workspaceHash(route)), route);
});

test("Given a durable publication operation, when its direct route round-trips, then the exact operation version is retained", () => {
  const route = { surface: "operation", operationId: "operation-id", operationVersion: "4", view: "status" };
  assert.deepEqual(parseWorkspaceHash(workspaceHash(route)), route);
});

test("Given a mutable Import commit operation, when its route round-trips, then batch and operation versions remain exact", () => {
  const route = {
    surface: "import-commit",
    resourceId: "import-batch-id",
    resourceVersion: "7",
    operationId: "import-operation-id",
    operationVersion: "1",
    view: "commit",
  };
  assert.deepEqual(parseWorkspaceHash(workspaceHash(route)), route);
});

test("Given the new Import entry route, when it round-trips, then creation remains distinct from the versioned Upload stage", () => {
  const createRoute = { surface: "import-new", view: "create" };
  const uploadRoute = { surface: "import-upload", resourceId: "import-batch-id", resourceVersion: "1", operationId: null, operationVersion: null, view: "upload" };
  assert.deepEqual(parseWorkspaceHash(workspaceHash(createRoute)), createRoute);
  assert.deepEqual(parseWorkspaceHash(workspaceHash(uploadRoute)), uploadRoute);
});
