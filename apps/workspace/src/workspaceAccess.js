// Presentation routing only. Repositories must independently enforce every read
// and mutation; a navigation check is never a security boundary.
export const ROLE_SURFACES = new Set(["pricing-requests", "pricing-request-new", "pricing-request", "company-access"]);

export function hasAnyCapability(session, capabilities) {
  return capabilities.some((capability) => session?.effectiveCapabilities?.includes(capability));
}

export function workspaceHome(session) {
  if (hasAnyCapability(session, ["proposal:review", "publish:execute", "import:prepare", "repricing:prepare", "audit:read"])) return { surface: "work", view: "needs-me" };
  if (hasAnyCapability(session, ["request:create", "request:read:own", "request:triage"])) return { surface: "pricing-requests", view: "list" };
  if (hasAnyCapability(session, ["company:read"])) return { surface: "company-access", view: "access" };
  if (hasAnyCapability(session, ["catalog:read"])) return { surface: "catalog", view: "list" };
  if (hasAnyCapability(session, ["proposal:read"])) return { surface: "proposals", view: "needs-me" };
  return { surface: "work", view: "needs-me" };
}

export function canOpenWorkspaceRoute(session, route) {
  const surface = route.surface;
  if (surface === "login") return true;
  if (surface === "work") return hasAnyCapability(session, ["proposal:read", "import:prepare", "repricing:prepare", "audit:read"]);
  if (surface === "company-access") return hasAnyCapability(session, ["company:read"]);
  if (surface === "pricing-request-new") return hasAnyCapability(session, ["request:create"]);
  if (surface === "pricing-requests" || surface === "pricing-request") return hasAnyCapability(session, ["request:read:own", "request:triage"]);
  if (surface === "catalog" || surface === "catalog-detail") return hasAnyCapability(session, ["catalog:read"]);
  if (surface === "imports" || surface.startsWith("import-")) return hasAnyCapability(session, ["import:prepare"]);
  if (surface === "repricing") return hasAnyCapability(session, ["repricing:prepare", "proposal:read"]);
  if (surface.startsWith("repricing-")) return hasAnyCapability(session, ["repricing:prepare"]);
  if (surface === "proposals" || surface.startsWith("proposal") || surface === "publication" || surface === "operation") return hasAnyCapability(session, ["proposal:read"]);
  if (surface === "rules" || surface === "rule-detail") return hasAnyCapability(session, ["rules:read"]);
  if (surface === "audit" || surface === "audit-detail") return hasAnyCapability(session, ["audit:read"]) || (hasAnyCapability(session, ["proposal:read"]) && hasAnyCapability(session, ["pricing:economics:read"]));
  return false;
}
