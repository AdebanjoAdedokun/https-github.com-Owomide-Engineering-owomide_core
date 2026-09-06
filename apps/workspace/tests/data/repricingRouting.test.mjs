import assert from "node:assert/strict";
import { test } from "node:test";

import { parseWorkspaceHash, workspaceHash } from "../../src/workspaceRouting.js";

test("Given a generated Preview and selected line, when its route round-trips, then exact Preview version and line survive", () => {
  const route = {
    surface: "repricing",
    resourceId: "df79d27f-e87d-58ba-9167-87ced18c72b5",
    resourceVersion: "3",
    view: "preview",
    lineId: "480f12f1-c0fa-528e-b3d0-27e340e93046",
  };

  assert.deepEqual(parseWorkspaceHash(workspaceHash(route)), route);
  assert.equal(workspaceHash(route), "#/repricing/df79d27f-e87d-58ba-9167-87ced18c72b5/preview?version=3&line=480f12f1-c0fa-528e-b3d0-27e340e93046");
});

test("Given a generated Preview URL without a version, when it is parsed, then the missing version remains explicit for the application to fail closed", () => {
  assert.deepEqual(
    parseWorkspaceHash("#/repricing/df79d27f-e87d-58ba-9167-87ced18c72b5/preview"),
    {
      surface: "repricing",
      resourceId: "df79d27f-e87d-58ba-9167-87ced18c72b5",
      resourceVersion: null,
      view: "preview",
      lineId: null,
    },
  );
});
