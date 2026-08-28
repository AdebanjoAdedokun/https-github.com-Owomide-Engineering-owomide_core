const DEFAULT_ROUTE = Object.freeze({ surface: "login", view: "default" });

const PROPOSAL_VIEWS = new Set(["overview", "lines", "margin", "comments", "activity"]);
const WORK_VIEWS = new Set(["needs-me", "blocked", "awaiting-approval", "ready-to-publish", "incomplete-rollout"]);
const IMPORT_STAGES = new Set(["upload", "profile", "map", "validate", "review", "commit", "result"]);

function withReturnTo(search) {
  const returnTo = search.get("returnTo");
  return returnTo ? { returnTo } : {};
}

/**
 * Hash routing keeps every mocked review/recovery surface refreshable in Vite
 * and the static preview worker. Protected routes always carry exact versions.
 * @param {string} [hash]
 */
export function parseWorkspaceHash(hash = globalThis.location?.hash ?? "") {
  const raw = hash.replace(/^#\/?/, "");
  if (!raw || raw === "top") return { ...DEFAULT_ROUTE };
  const [pathname, query = ""] = raw.split("?");
  const segments = pathname.split("/").filter(Boolean);
  const search = new URLSearchParams(query);

  if (segments[0] === "login") return { surface: "login", view: "default", ...withReturnTo(search) };
  if (segments[0] === "work") {
    const requested = search.get("view") ?? "needs-me";
    return { surface: "work", view: WORK_VIEWS.has(requested) ? requested : "needs-me" };
  }
  if (segments[0] === "catalog") return { surface: segments[1] ? "catalog-detail" : "catalog", resourceId: segments[1] ?? null, view: search.get("view") ?? "list" };
  if (segments[0] === "imports") {
    if (segments[1] === "new") return { surface: "import-new", view: "create" };
    if (segments[1] && IMPORT_STAGES.has(segments[2])) return {
      surface: `import-${segments[2]}`,
      resourceId: segments[1],
      resourceVersion: search.get("version"),
      operationId: search.get("operation"),
      operationVersion: search.get("operationVersion"),
      view: segments[2],
    };
    return { surface: "imports", resourceId: segments[1] ?? null, view: "ledger" };
  }
  if (segments[0] === "repricing") {
    if (segments[1] === "new" && segments[2] === "scope") return { surface: "repricing-scope", resourceId: "new", view: "scope" };
    if (segments[1] && segments[2] === "rule") return { surface: "repricing-rule", resourceId: segments[1], resourceVersion: search.get("version"), view: "rule" };
    if (segments[1] && segments[2] === "preview") return { surface: "repricing", resourceId: segments[1], resourceVersion: search.get("version"), view: "preview", lineId: search.get("line") };
    return { surface: "repricing-scope", resourceId: "new", view: "scope" };
  }
  if (segments[0] === "proposals" && !segments[1]) return { surface: "proposals", view: search.get("view") ?? "needs-me" };
  if (segments[0] === "proposals" && segments[1]) {
    const section = segments[2];
    if (section === "overrides" && segments[3]) return {
      surface: "proposal-override",
      resourceId: segments[1],
      resourceVersion: search.get("proposalVersion") ?? search.get("version"),
      overrideId: segments[3],
      overrideVersion: search.get("overrideVersion"),
      view: "review",
    };
    if (section === "review" && segments[3] === "approval") return { surface: "proposal-approval", resourceId: segments[1], resourceVersion: search.get("version"), view: "review" };
    if (section === "review" && segments[3] === "publish") return { surface: "proposal-publish", resourceId: segments[1], resourceVersion: search.get("version"), view: "review" };
    if (section === "publications" && segments[3]) return { surface: "publication", resourceId: segments[1], resourceVersion: search.get("proposalVersion"), operationId: segments[3], operationVersion: search.get("operationVersion"), view: "status" };
    const requestedView = search.get("view") ?? "overview";
    return { surface: "proposal", resourceId: segments[1], resourceVersion: search.get("version"), view: PROPOSAL_VIEWS.has(requestedView) ? requestedView : "overview" };
  }
  if (segments[0] === "operations" && segments[1]) return { surface: "operation", operationId: segments[1], operationVersion: search.get("version"), view: "status" };
  if (segments[0] === "rules") return { surface: segments[1] ? "rule-detail" : "rules", resourceId: segments[1] ?? null, view: "read" };
  if (segments[0] === "audit") return { surface: segments[1] ? "audit-detail" : "audit", entityType: segments[1] ?? null, resourceId: segments[2] ?? null, resourceVersion: search.get("version"), view: "history" };
  return { ...DEFAULT_ROUTE };
}

/** @param {Record<string, any>} route */
export function workspaceHash(route) {
  if (route.surface === "login") return `#/login${route.returnTo ? `?returnTo=${encodeURIComponent(route.returnTo)}` : ""}`;
  if (route.surface === "work") return `#/work${route.view && route.view !== "needs-me" ? `?view=${encodeURIComponent(route.view)}` : ""}`;
  if (route.surface === "catalog") return "#/catalog";
  if (route.surface === "catalog-detail") return `#/catalog/${route.resourceId}`;
  if (route.surface === "imports") return "#/imports";
  if (route.surface === "import-new") return "#/imports/new";
  if (route.surface?.startsWith("import-") && route.resourceId) {
    const search = new URLSearchParams();
    if (route.resourceVersion) search.set("version", route.resourceVersion);
    if (route.operationId) search.set("operation", route.operationId);
    if (route.operationVersion) search.set("operationVersion", route.operationVersion);
    const query = search.toString();
    return `#/imports/${route.resourceId}/${route.surface.replace("import-", "")}${query ? `?${query}` : ""}`;
  }
  if (route.surface === "repricing-scope") return "#/repricing/new/scope";
  if (route.surface === "repricing-rule") return `#/repricing/${route.resourceId}/rule${route.resourceVersion ? `?version=${encodeURIComponent(route.resourceVersion)}` : ""}`;
  if (route.surface === "repricing") {
    const search = new URLSearchParams();
    if (route.resourceVersion) search.set("version", route.resourceVersion);
    if (route.lineId) search.set("line", route.lineId);
    const query = search.toString();
    return `#/repricing/${route.resourceId ?? "FX-004"}/preview${query ? `?${query}` : ""}`;
  }
  if (route.surface === "proposals") return `#/proposals${route.view && route.view !== "needs-me" ? `?view=${encodeURIComponent(route.view)}` : ""}`;
  if (route.surface === "proposal-override") {
    const search = new URLSearchParams();
    if (route.resourceVersion) search.set("proposalVersion", route.resourceVersion);
    if (route.overrideVersion) search.set("overrideVersion", route.overrideVersion);
    const query = search.toString();
    return `#/proposals/${route.resourceId}/overrides/${route.overrideId}${query ? `?${query}` : ""}`;
  }
  if (route.surface === "proposal-approval") return `#/proposals/${route.resourceId}/review/approval${route.resourceVersion ? `?version=${encodeURIComponent(route.resourceVersion)}` : ""}`;
  if (route.surface === "proposal-publish") return `#/proposals/${route.resourceId}/review/publish${route.resourceVersion ? `?version=${encodeURIComponent(route.resourceVersion)}` : ""}`;
  if (route.surface === "publication") {
    const search = new URLSearchParams();
    if (route.resourceVersion) search.set("proposalVersion", route.resourceVersion);
    if (route.operationVersion) search.set("operationVersion", route.operationVersion);
    const query = search.toString();
    return `#/proposals/${route.resourceId}/publications/${route.operationId}${query ? `?${query}` : ""}`;
  }
  if (route.surface === "operation") return `#/operations/${route.operationId}${route.operationVersion ? `?version=${encodeURIComponent(route.operationVersion)}` : ""}`;
  if (route.surface === "proposal") {
    const search = new URLSearchParams();
    if (route.resourceVersion) search.set("version", route.resourceVersion);
    if (route.view && route.view !== "overview") search.set("view", route.view);
    const query = search.toString();
    return `#/proposals/${route.resourceId}${query ? `?${query}` : ""}`;
  }
  if (route.surface === "rules") return "#/rules";
  if (route.surface === "rule-detail") return `#/rules/${route.resourceId}`;
  if (route.surface === "audit") return "#/audit";
  if (route.surface === "audit-detail") return `#/audit/${route.entityType}/${route.resourceId}${route.resourceVersion ? `?version=${encodeURIComponent(route.resourceVersion)}` : ""}`;
  return "#/work";
}

/**
 * Resolve a post-login destination without allowing an external redirect.
 * Only routes understood by the workspace hash router can be restored.
 * @param {string | null | undefined} returnTo
 */
export function routeFromReturnTo(returnTo) {
  if (typeof returnTo !== "string" || !returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("://")) {
    return { surface: "work", view: "needs-me" };
  }
  const route = parseWorkspaceHash(`#${returnTo}`);
  return route.surface === "login" ? { surface: "work", view: "needs-me" } : route;
}

export function routeNavigationKey(route) {
  return [route.surface, route.resourceId, route.resourceVersion, route.operationId, route.operationVersion, route.overrideId, route.overrideVersion, route.view, route.lineId].filter(Boolean).join(":");
}

export { DEFAULT_ROUTE };
