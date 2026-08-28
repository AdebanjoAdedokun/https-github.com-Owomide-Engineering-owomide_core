import { throwRepositoryError } from "./domainError.js";
import { createFixtureWorkspaceRepositories } from "./fixtureWorkspaceRepositories.js";
import { WORKSPACE_LIVE_BACKEND_ISSUES } from "./liveBackendGate.js";

/** @import {WorkspaceRepositories} from "./contracts.js" */

/**
 * Transport-neutral application composition seam.
 *
 * `live` is deliberately rejected until the OpenAPI contract and backend exit
 * gates are complete. A generated live adapter can be added behind this exact
 * function later without changing feature components.
 *
 * @param {{mode?: "fixture" | "live", apiBaseUrl?: string, latencyMs?: number}} [options]
 * @returns {WorkspaceRepositories}
 */
export function createWorkspaceRepositories({ mode = "fixture", apiBaseUrl = "/api", latencyMs = 0 } = {}) {
  if (mode === "fixture") return createFixtureWorkspaceRepositories({ latencyMs });
  throwRepositoryError({
    code: "LIVE_ADAPTER_NOT_RELEASED",
    message: "The live workspace adapter is not eligible for use yet.",
    details: {
      eligibility: "MOCK_ONLY",
      apiBaseUrl,
      requiredBackendIssues: WORKSPACE_LIVE_BACKEND_ISSUES,
    },
    retryable: false,
    domain: "workspace",
    traceId: "workspace-live-adapter-unreleased",
  });
}
