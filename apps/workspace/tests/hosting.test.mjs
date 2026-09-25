import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveWorkspaceRuntimeConfig } from "../src/runtimeConfig.js";

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("uses fixture mode and same-origin Gateway routing as safe runtime defaults", () => {
  const config = resolveWorkspaceRuntimeConfig({
    env: {},
    location: new URL("http://127.0.0.1:4174/#/work"),
  });

  assert.equal(config.mode, "fixture");
  assert.equal(config.apiBaseUrl, "/api");
  assert.equal(config.marketingUrl, "http://127.0.0.1:4173/#top");
  assert.equal(config.logoutUrl, "http://127.0.0.1:4173/#top");
  assert.equal(config.fixtureLatencyMs, 120);
});

test("maps Cloudflare Workers workspace preview hosts back to marketing", () => {
  const config = resolveWorkspaceRuntimeConfig({
    env: {},
    location: new URL("https://owomide-workspace.data-83e.workers.dev/#/work"),
  });

  assert.equal(config.marketingUrl, "https://owomide-marketing.data-83e.workers.dev/#top");
  assert.equal(config.logoutUrl, "https://owomide-marketing.data-83e.workers.dev/#top");
});

test("derives staging navigation without rebuilding the promoted image", () => {
  const config = resolveWorkspaceRuntimeConfig({
    env: {},
    location: new URL("https://app-staging.owomide.com/#/work"),
  });

  assert.equal(config.marketingUrl, "https://staging.owomide.com/#top");
  assert.equal(config.logoutUrl, "https://staging.owomide.com/#top");
  assert.equal(config.apiBaseUrl, "/api");
});

test("keeps local ingress navigation inside the local environment", () => {
  const config = resolveWorkspaceRuntimeConfig({
    env: {},
    location: new URL("http://app.owomide.local/#/work"),
  });

  assert.equal(config.marketingUrl, "http://owomide.local/#top");
  assert.equal(config.logoutUrl, "http://owomide.local/#top");
});

test("accepts explicit production boundaries without claiming a released live adapter", async () => {
  const config = resolveWorkspaceRuntimeConfig({
    env: {
      VITE_WORKSPACE_MODE: "live",
      VITE_API_BASE_URL: "/api/",
      VITE_MARKETING_URL: "https://owomide.com/#top",
      VITE_LOGOUT_URL: "https://owomide.com/#top",
      VITE_FIXTURE_LATENCY_MS: "0",
    },
    location: new URL("https://app.owomide.com/#/work"),
  });

  assert.deepEqual(config, {
    mode: "live",
    apiBaseUrl: "/api",
    marketingUrl: "https://owomide.com/#top",
    logoutUrl: "https://owomide.com/#top",
    fixtureLatencyMs: 0,
  });
  assert.throws(
    () => resolveWorkspaceRuntimeConfig({ env: { VITE_WORKSPACE_MODE: "preview" } }),
    /fixture or live/,
  );

  const workspaceSource = await readProjectFile("src/WorkspaceApp.jsx");
  assert.match(workspaceSource, /const siteHref = runtimeConfig\.marketingUrl/);
  assert.match(workspaceSource, /navigateExternal\(runtimeConfig\.logoutUrl\)/);
  assert.match(workspaceSource, /createWorkspaceRepositories\(\{[\s\S]*mode: runtimeConfig\.mode,[\s\S]*apiBaseUrl: runtimeConfig\.apiBaseUrl/);
});

test("is a normal pnpm Vite package with no prototype Sites packaging", async () => {
  const [manifestText, viteConfig] = await Promise.all([
    readProjectFile("package.json"),
    readProjectFile("vite.config.mjs"),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.name, "@owomide/workspace");
  assert.equal(manifest.scripts.build, "vite build");
  assert.equal(manifest.scripts["test:hosting"], "node --test tests/hosting.test.mjs");
  assert.doesNotMatch(manifestText, /prepare-sites|test:sites|openai\/hosting/i);
  assert.match(viteConfig, /outDir:\s*"dist"/);
  assert.match(viteConfig, /"\/api"[\s\S]*target:\s*gatewayTarget/);
});
