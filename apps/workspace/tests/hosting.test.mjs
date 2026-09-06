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

test("serves the SPA on unprivileged port 8080 and never masks API routing errors", async () => {
  const nginx = await readProjectFile("nginx.conf");

  assert.match(nginx, /listen 8080;/);
  assert.match(nginx, /location \/[\s\S]*try_files \$uri \$uri\/ \/index\.html;/);
  assert.match(nginx, /location = \/api[\s\S]*return 404/);
  assert.match(nginx, /location \^~ \/api\/[\s\S]*return 404/);
  assert.match(nginx, /location = \/healthz[\s\S]*return 200/);
});

test("builds into an unprivileged nginx image from the monorepo workspace", async () => {
  const dockerfile = await readProjectFile("Dockerfile");

  assert.match(dockerfile, /pnpm --filter @owomide\/workspace build/);
  assert.match(dockerfile, /FROM nginxinc\/nginx-unprivileged:1\.27-alpine AS runtime/);
  assert.match(dockerfile, /COPY --from=build \/repo\/apps\/workspace\/dist \/usr\/share\/nginx\/html/);
  assert.match(dockerfile, /EXPOSE 8080/);
  assert.doesNotMatch(dockerfile, /Sites|\.openai|worker\/index/);
});
