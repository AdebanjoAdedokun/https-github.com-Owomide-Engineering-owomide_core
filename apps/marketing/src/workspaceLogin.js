const DEFAULT_PRODUCTION_WORKSPACE_URL = "https://app.owomide.com/";
const DEFAULT_STAGING_WORKSPACE_URL = "https://app-staging.owomide.com/";
const LOCAL_WORKSPACE_PORT = "4174";
const LOGIN_ROUTE = "#/login?returnTo=%2Fwork";

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function localWorkspaceUrl(location) {
  const protocol = location?.protocol === "https:" ? "https:" : "http:";
  const hostname = location?.hostname || "localhost";
  const host = hostname.includes(":") ? `[${hostname}]` : hostname;

  return `${protocol}//${host}:${LOCAL_WORKSPACE_PORT}/`;
}

export function resolveWorkspaceBaseUrl({ configuredUrl, location } = {}) {
  const configuredBase = configuredUrl?.trim();
  if (configuredBase) return configuredBase;

  if (isLocalHostname(location?.hostname)) return localWorkspaceUrl(location);
  if (location?.hostname === "owomide.local") return "http://app.owomide.local/";
  if (location?.hostname === "staging.owomide.com") return DEFAULT_STAGING_WORKSPACE_URL;

  return DEFAULT_PRODUCTION_WORKSPACE_URL;
}

export function createWorkspaceLoginHref(options = {}) {
  const workspaceBaseUrl = resolveWorkspaceBaseUrl(options).replace(/\/+$/, "");
  return `${workspaceBaseUrl}/${LOGIN_ROUTE}`;
}
