import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createWorkspaceLoginHref,
  resolveWorkspaceBaseUrl,
} from "../src/workspaceLogin.js";

test("uses the local workspace app when marketing runs locally", () => {
  const href = createWorkspaceLoginHref({
    location: { hostname: "127.0.0.1", protocol: "http:" },
  });

  assert.equal(href, "http://127.0.0.1:4174/#/login?returnTo=%2Fwork");
});

test("honours the configured workspace deployment and normalises its slash", () => {
  const href = createWorkspaceLoginHref({
    configuredUrl: " https://workspace.staging.owomide.com/// ",
    location: { hostname: "localhost", protocol: "http:" },
  });

  assert.equal(href, "https://workspace.staging.owomide.com/#/login?returnTo=%2Fwork");
});

test("defaults non-local deployments to the Owomide workspace host", () => {
  assert.equal(
    resolveWorkspaceBaseUrl({ location: { hostname: "owomide.com", protocol: "https:" } }),
    "https://app.owomide.com/",
  );
});

test("keeps the staging marketing and workspace hosts in the same environment", () => {
  assert.equal(
    resolveWorkspaceBaseUrl({ location: { hostname: "staging.owomide.com", protocol: "https:" } }),
    "https://app-staging.owomide.com/",
  );
});

test("keeps the local ingress hosts in the local environment", () => {
  assert.equal(
    resolveWorkspaceBaseUrl({ location: { hostname: "owomide.local", protocol: "http:" } }),
    "http://app.owomide.local/",
  );
});

test("desktop and mobile login CTAs share the resolved destination", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const loginLinks = source.match(/className="(?:header-login|mobile-login)"[^>]*href=\{workspaceLoginHref\}/g) || [];

  assert.equal(loginLinks.length, 2);
});
