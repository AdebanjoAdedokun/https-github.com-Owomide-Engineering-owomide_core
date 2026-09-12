import test from "node:test";
import assert from "node:assert/strict";
import { canOpenWorkspaceRoute, workspaceHome } from "../../src/workspaceAccess.js";
import { parseWorkspaceHash, workspaceHash, routeFromReturnTo } from "../../src/workspaceRouting.js";

const session = (...effectiveCapabilities) => ({ effectiveCapabilities });

test("Given a Contributor, their home is isolated intake and protected workspace links are not offered", () => {
  const contributor = session("request:create", "request:read:own");
  assert.equal(workspaceHome(contributor).surface, "pricing-requests");
  for (const surface of ["work", "catalog", "catalog-detail", "proposals", "proposal", "proposal-approval", "publication", "repricing", "rules", "audit", "audit-detail", "company-access"]) {
    assert.equal(canOpenWorkspaceRoute(contributor, { surface }), false, surface);
  }
  for (const surface of ["pricing-requests", "pricing-request-new", "pricing-request"]) assert.equal(canOpenWorkspaceRoute(contributor, { surface }), true);
});

test("Given role labels without capabilities, no protected route is granted", () => {
  assert.equal(canOpenWorkspaceRoute({ roleCodes: ["account_owner", "pricing_manager"] }, { surface: "company-access" }), false);
  assert.equal(canOpenWorkspaceRoute({ roleCodes: ["pricing_contributor"] }, { surface: "pricing-request-new" }), false);
});

test("Given a policy owner or pricing manager, the landing surface follows actual capabilities", () => {
  assert.equal(workspaceHome(session("company:read", "company:policy:update")).surface, "company-access");
  assert.equal(workspaceHome(session("proposal:read", "request:triage", "repricing:prepare")).surface, "work");
  assert.equal(workspaceHome(session("proposal:read", "catalog:read")).surface, "catalog");
  assert.equal(workspaceHome(session("proposal:read", "request:triage")).surface, "pricing-requests");
  assert.equal(canOpenWorkspaceRoute(session("request:triage"), { surface: "pricing-request-new" }), false);
});

test("Given a field-restricted reader, participant audit does not become available through proposal read alone", () => {
  assert.equal(canOpenWorkspaceRoute(session("proposal:read"), { surface: "audit" }), false);
  assert.equal(canOpenWorkspaceRoute(session("proposal:read", "pricing:economics:read"), { surface: "audit" }), true);
});

test("Given request and access routes, exact request versions and safe login returns round-trip", () => {
  const routes = [
    { surface: "pricing-requests", view: "list" },
    { surface: "pricing-request-new", view: "create" },
    { surface: "pricing-request", resourceId: "sample-request-1", resourceVersion: "2", view: "detail" },
    { surface: "company-access", view: "access" },
  ];
  for (const route of routes) assert.deepEqual(parseWorkspaceHash(workspaceHash(route)), route);
  assert.equal(routeFromReturnTo("/requests").surface, "pricing-requests");
  assert.equal(routeFromReturnTo("//other.example/requests").surface, "work");
});
