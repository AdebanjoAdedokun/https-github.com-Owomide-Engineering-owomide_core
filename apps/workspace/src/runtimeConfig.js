const SUPPORTED_MODES = new Set(["fixture", "live"]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function defaultMarketingUrl(location) {
  if (location && ["127.0.0.1", "localhost"].includes(location.hostname)) {
    return `${location.protocol}//${location.hostname}:4173/#top`;
  }
  if (location?.hostname === "app.owomide.local") {
    return "http://owomide.local/#top";
  }
  if (location?.hostname === "app-staging.owomide.com") {
    return "https://staging.owomide.com/#top";
  }
  if (location?.hostname === "app.owomide.com") {
    return "https://owomide.com/#top";
  }
  return "/#top";
}

function safeHttpDestination(value, fallback, origin) {
  const candidate = clean(value);
  if (!candidate) return fallback;

  let parsed;
  try {
    parsed = new URL(candidate, origin || "https://app.owomide.com");
  } catch {
    throw new TypeError("Workspace destinations must be valid HTTP(S) URLs or root-relative paths.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new TypeError("Workspace destinations must use HTTP(S) without embedded credentials.");
  }
  return candidate;
}

function apiBaseUrl(value, origin) {
  const candidate = clean(value) || "/api";
  const parsed = new URL(candidate, origin || "https://app.owomide.com");
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new TypeError("VITE_API_BASE_URL must be an HTTP(S) URL or root-relative path.");
  }
  if (parsed.search || parsed.hash) {
    throw new TypeError("VITE_API_BASE_URL cannot include a query string or fragment.");
  }
  return candidate.length > 1 ? candidate.replace(/\/+$/, "") : candidate;
}

function fixtureLatency(value) {
  const candidate = clean(value);
  if (!candidate) return 120;
  const milliseconds = Number(candidate);
  if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 10_000) {
    throw new TypeError("VITE_FIXTURE_LATENCY_MS must be between 0 and 10000.");
  }
  return milliseconds;
}

/**
 * Resolve build-time browser configuration without weakening the repository
 * boundary. `live` is a declared target only: repository composition still
 * rejects it until the generated Gateway adapter passes its release gate.
 */
export function resolveWorkspaceRuntimeConfig({ env = {}, location = globalThis.location } = {}) {
  const mode = clean(env.VITE_WORKSPACE_MODE) || "fixture";
  if (!SUPPORTED_MODES.has(mode)) {
    throw new TypeError("VITE_WORKSPACE_MODE must be either fixture or live.");
  }

  const origin = location?.origin;
  const marketingUrl = safeHttpDestination(
    env.VITE_MARKETING_URL,
    defaultMarketingUrl(location),
    origin,
  );
  const configuredLogout = clean(env.VITE_LOGOUT_URL);

  return Object.freeze({
    mode,
    apiBaseUrl: apiBaseUrl(env.VITE_API_BASE_URL, origin),
    marketingUrl,
    logoutUrl: configuredLogout
      ? safeHttpDestination(configuredLogout, null, origin)
      : marketingUrl,
    fixtureLatencyMs: fixtureLatency(env.VITE_FIXTURE_LATENCY_MS),
  });
}

export const WORKSPACE_RUNTIME_CONFIG = resolveWorkspaceRuntimeConfig({
  env: import.meta.env ?? {},
  location: globalThis.location,
});
