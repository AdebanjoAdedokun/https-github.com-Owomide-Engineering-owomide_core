import React from "react";
import { configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { WorkspaceApp } from "../src/WorkspaceApp.jsx";
import { installWorkspaceSelectLayoutFixture } from "./helpers/workspaceSelectLayout.js";
import {
  FIXTURE_GENERATED_PROPOSAL_ID,
  RepositoryError,
  createDomainErrorEnvelope,
  createFixtureWorkspaceRepositories,
} from "../src/data/index.js";

// The full 76-scenario journey suite can saturate jsdom while repository-backed
// screens resolve. Keep the BDD gate deterministic without weakening assertions.
configure({ asyncUtilTimeout: 5000 });
installWorkspaceSelectLayoutFixture();

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "#/repricing/FX-004/preview");
});

async function givenTheRepricingPreviewIsOpen({ repositories } = {}) {
  const resolvedRepositories = repositories ?? createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
  const result = render(<WorkspaceApp repositories={resolvedRepositories} />);
  const preview = await screen.findByRole("region", { name: "Repricing preview" });
  return {
    ...result,
    user: userEvent.setup(),
    preview,
  };
}

async function repairOperationalBlockers(repositories, sourceRef, keyPrefix = "component-preview-repair") {
  let preview = await repositories.repricing.getPreview({ ref: sourceRef, limit: 200 });
  const repairable = preview.lines.filter((line) => ["stale-cost", "dimension"].includes(line.issue?.kind));
  for (const [index, line] of repairable.entries()) {
    const action = line.issue.kind === "stale-cost" ? "refresh-cost" : "repair-dimension";
    const result = await repositories.repricing.remediateLine({
      previewRef: preview.ref,
      lineId: line.id,
      action,
      idempotencyKey: `${keyPrefix}-${index}-0001`,
    });
    preview = await repositories.repricing.getPreview({ ref: result.data.ref, limit: 200 });
  }
  return preview;
}

async function givenGovernanceReadyPreviewIsOpen({ repositories } = {}) {
  const resolvedRepositories = repositories ?? createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
  const source = await resolvedRepositories.repricing.getPreview({ limit: 200 });
  const preview = await repairOperationalBlockers(resolvedRepositories, source.ref);
  window.history.replaceState(null, "", `#/repricing/${preview.ref.id}/preview?version=${encodeURIComponent(preview.ref.version)}`);
  return { ...(await givenTheRepricingPreviewIsOpen({ repositories: resolvedRepositories })), repositories: resolvedRepositories, preview };
}

function createObservedFixtureRepositories() {
  const repositories = createFixtureWorkspaceRepositories();
  const getDetail = repositories.proposals.getDetail.bind(repositories.proposals);
  const startPublication = repositories.publishing.start.bind(repositories.publishing);
  const retryPublication = repositories.publishing.retry.bind(repositories.publishing);
  let proposalDetailReads = 0;
  const proposalDetailRequests = [];
  const publicationStartRequests = [];
  const publicationRetryRequests = [];
  repositories.proposals.getDetail = async (...args) => {
    proposalDetailRequests.push(args[0]);
    const result = await getDetail(...args);
    proposalDetailReads += 1;
    return result;
  };
  repositories.publishing.start = async (request) => {
    publicationStartRequests.push(request);
    return startPublication(request);
  };
  repositories.publishing.retry = async (request) => {
    publicationRetryRequests.push(request);
    return retryPublication(request);
  };
  return {
    repositories,
    proposalDetailReads: () => proposalDetailReads,
    proposalDetailRequests,
    publicationStartRequests,
    publicationRetryRequests,
  };
}

async function whenTheBlockedProposalIsCreated(user, { proposalDetailReads } = {}) {
  const openExisting = screen.queryByRole("button", { name: "Open Proposal" });
  if (openExisting) {
    await user.click(openExisting);
  } else {
    await user.click(screen.getByRole("button", { name: "Create Proposal" }));
    const dialog = screen.getByRole("dialog", { name: "Create blocked Proposal" });
    await user.click(within(dialog).getByRole("button", { name: "Create blocked Proposal" }));
  }
  // Creation reads the detail once for the mutation handoff, then the new route
  // resolves that URL-backed context. Wait for both reads so subsequent input
  // never targets the short-lived pre-route render.
  if (proposalDetailReads) await waitFor(() => expect(proposalDetailReads()).toBeGreaterThanOrEqual(openExisting ? 1 : 2));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  const proposalViews = await screen.findByRole("tablist", { name: "Proposal views" });
  expect(window.location.hash).toMatch(/^#\/proposals\/[0-9a-f-]+\?version=3$/);
  return proposalViews;
}

async function whenCurrentAuthorityIsOpened(user) {
  const current = screen.queryByRole("complementary", { name: "Current authority" });
  if (current) return current;
  const trigger = screen.getByRole("button", { name: "People and permissions" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await user.click(trigger);
  const authority = await screen.findByRole("complementary", { name: "Current authority" });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(authority).toHaveFocus();
  return authority;
}

async function whenTheDesignEvidenceSessionChangesTo(user, actorName) {
  await user.click(screen.getByRole("button", { name: "Open session identity details" }));
  const identity = screen.getByRole("region", { name: "Session identity" });
  await user.click(within(identity).getByText("Preview another role"));
  await user.click(within(identity).getByRole("button", { name: new RegExp(actorName, "i") }));
  await new Promise((resolve) => window.setTimeout(resolve, 40));
  await screen.findByRole("tablist", { name: "Proposal views" });
  const authority = await whenCurrentAuthorityIsOpened(user);
  await waitFor(() => {
    expect(authority.querySelector(".proposal-authority__actor strong")).toHaveTextContent(actorName);
  });
  await user.click(within(authority).getByRole("button", { name: "Close current authority" }));
  expect(screen.queryByRole("complementary", { name: "Current authority" })).not.toBeInTheDocument();
}

async function thenConfirmTheDecision(user, { dialogName, confirmName }) {
  const dialog = await screen.findByRole("dialog", { name: dialogName });
  expect(within(dialog).getByRole("button", { name: "Close confirmation" })).toHaveFocus();
  if (dialogName === "Request bounded exception") {
    await user.type(within(dialog).getByRole("textbox", { name: "Business reason" }), "Recover the recorded supplier cost before the effective date.");
    await user.type(within(dialog).getByRole("textbox", { name: "Evidence reference" }), "SAMPLE-COST-RECOVERY-01");
  }
  await user.click(within(dialog).getByRole("button", { name: confirmName }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: dialogName })).not.toBeInTheDocument());
}

function returnedDataRows() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

async function thenTheServerResolvedLineCountIs(count) {
  await waitFor(() => {
    if (count === 0) {
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      return;
    }
    expect(returnedDataRows()).toHaveLength(count);
  }, { timeout: 2_500 });
  await waitFor(() => {
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
  }, { timeout: 2_500 });
}

async function whenTheNamedOptionIsSelected(user, combobox, name) {
  await user.click(combobox);
  await user.click(screen.getByRole("option", { name, exact: true }));
}

function repositoryFailure({ code, message, traceId }) {
  return new RepositoryError(createDomainErrorEnvelope({
    code,
    message,
    retryable: true,
    domain: "repricing",
    traceId,
  }));
}

describe("RPR-03 repricing preview — BDD interaction contract", () => {
  it("Given the repository boundary, when the workspace starts, then loading is explicit before the resolved preview appears", async () => {
    render(<WorkspaceApp />);

    expect(screen.getByRole("status")).toHaveTextContent("Resolving workspace context");
    expect(screen.queryByRole("region", { name: "Repricing preview" })).not.toBeInTheDocument();

    expect(await screen.findByRole("region", { name: "Repricing preview" })).toBeVisible();
  });

  it("Given an initial repository failure, when Retry workspace is activated, then the governed preview resolves without a reload", async () => {
    const fixture = createFixtureWorkspaceRepositories();
    let previewAttempts = 0;
    const repositories = {
      ...fixture,
      repricing: {
        async getPreview(request) {
          previewAttempts += 1;
          if (previewAttempts === 1) {
            throw repositoryFailure({
              code: "REPRICING_PREVIEW_UNAVAILABLE",
              message: "The repricing source is temporarily unavailable.",
              traceId: "bdd-initial-preview-failure",
            });
          }
          return fixture.repricing.getPreview(request);
        },
      },
    };
    const user = userEvent.setup();
    render(<WorkspaceApp repositories={repositories} />);

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("The repricing source is temporarily unavailable.");
    await user.click(within(error).getByRole("button", { name: "Retry workspace" }));

    expect(await screen.findByRole("region", { name: "Repricing preview" })).toBeVisible();
    expect(previewAttempts).toBe(2);
  });

  it("Given the premium workspace header, then global search chrome is absent and line search remains in page context", async () => {
    await givenTheRepricingPreviewIsOpen();

    expect(screen.queryByRole("button", { name: "Search repricing lines" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search SKU or product")).toBeVisible();
  });

  it("Given the keyboard command, when Control K is pressed, then focus moves to line search", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();

    await user.keyboard("{Control>}k{/Control}");

    expect(screen.getByPlaceholderText("Search SKU or product")).toHaveFocus();
  });

  it("Given the workspace selector, when it is activated, then workspace boundary details open and close", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    const trigger = screen.getByRole("button", { name: /Open .* workspace details/ });

    await user.click(trigger);
    expect(screen.getByRole("region", { name: "Workspace details" })).toHaveTextContent("Fictional data · No live writes");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("region", { name: "Workspace details" })).not.toBeInTheDocument();
  });

  it("Given the resolved identity, when it is activated, then effective memberships and server-shaped authority are shown", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();

    const trigger = screen.getByRole("button", { name: "Open session identity details" });
    expect(trigger.querySelector("small")).toHaveAttribute("title", expect.stringContaining("Pricing Analyst"));
    await user.click(trigger);

    const identity = screen.getByRole("region", { name: "Session identity" });
    expect(identity).toHaveTextContent("Pricing Analyst");
    expect(identity).toHaveTextContent("Import admin");
    expect(identity).toHaveTextContent("Actions adapt to your role and the current record.");
  });

  it("Given Teni's unresolved operational blockers, then Proposal creation stays unavailable until Preview remediation", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    const createProposal = screen.getByRole("button", { name: "Create Proposal" });

    expect(createProposal).toBeDisabled();
    expect(createProposal).toHaveAttribute("title", "Resolve 5 stale-cost or dimension blockers before governance.");
    expect(screen.queryByRole("button", { name: "Open Proposal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: /Decision details for/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Inspect Cassava flour, Select, 1 kg" }));

    const inspector = screen.getByRole("complementary", { name: "Decision details for Cassava flour" });
    expect(inspector).toHaveTextContent("Proposal handoff is blocked.");
    expect(inspector).toHaveTextContent("Resolve 5 stale-cost or dimension blockers before governance.");
    expect(within(inspector).getByRole("button", { name: "Apply floor price" })).toBeEnabled();
    expect(within(inspector).getByRole("button", { name: "Exclude line" })).toBeEnabled();
  });

  it("Given the product-composition Preview already has a governed Proposal, then Open Proposal replaces duplicate creation", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });

    expect(screen.getByRole("button", { name: "Open Proposal" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Create Proposal" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Inspect Cassava flour, Select, 1 kg" }));
    const lens = screen.getByRole("complementary", { name: "Decision details for Cassava flour" });
    expect(lens).toHaveTextContent("can open this Proposal");
    expect(lens).toHaveTextContent("Approval and publication remain separate");
  });

  it("Given a fresh Chika session, when the Repricing Preview resolves an existing Proposal target, then only its exact version can be opened", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const evidenceActors = await repositories.identity.listDesignEvidenceActors();
    const chika = evidenceActors.find((actor) => actor.actor.displayName.startsWith("Chika"));
    await repositories.identity.selectDesignEvidenceActor(chika.actor.id);
    const getDetail = repositories.proposals.getDetail.bind(repositories.proposals);
    const getPreview = repositories.repricing.getPreview.bind(repositories.repricing);
    const detailRequests = [];
    const resolvedPreviews = [];
    let createCalls = 0;
    const createFromPreview = repositories.proposals.createFromPreview.bind(repositories.proposals);
    repositories.proposals.createFromPreview = async (request) => {
      createCalls += 1;
      return createFromPreview(request);
    };
    repositories.proposals.getDetail = async (request) => {
      detailRequests.push(request);
      return getDetail(request);
    };
    repositories.repricing.getPreview = async (request = {}) => {
      const result = await getPreview(request);
      resolvedPreviews.push(result);
      return result;
    };
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });

    const openProposal = screen.getByRole("button", { name: "Open Proposal" });
    expect(openProposal).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Create Proposal" })).not.toBeInTheDocument();
    const chikaPreview = resolvedPreviews.at(-1);
    const createAction = chikaPreview.allowedActions.find((action) => action.code === "proposal.create");
    const readAction = chikaPreview.allowedActions.find((action) => action.code === "proposal.read");
    expect(createAction).toMatchObject({
      enabled: false,
      reason: {
        code: "ALREADY_EXISTS",
        message: "This exact Preview already has a governed Proposal. Open its current version instead.",
      },
    });
    expect(readAction).toMatchObject({
      enabled: true,
      requiredVersion: "3",
      targetRef: {
        kind: "resource",
        id: "767fb699-bfb5-56eb-a296-3a0a70c9430a",
        version: "3",
      },
    });
    expect(openProposal).not.toHaveAttribute("title");
    expect(screen.queryByRole("complementary", { name: /Decision details for/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Inspect Cassava flour, Select, 1 kg" }));
    const lens = screen.getByRole("complementary", { name: "Decision details for Cassava flour" });
    expect(lens).toHaveTextContent("Chika can open this Proposal.");
    expect(lens).not.toHaveTextContent("Chika can create a Proposal from this Preview.");
    expect(lens).toHaveTextContent("Approval and publication remain separate");

    await user.click(openProposal);

    expect(await screen.findByRole("tablist", { name: "Proposal views" })).toBeVisible();
    expect(window.location.hash).toBe("#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?version=3");
    expect(detailRequests.at(-1)).toEqual({
      ref: {
        kind: "resource",
        id: "767fb699-bfb5-56eb-a296-3a0a70c9430a",
        version: "3",
      },
    });
    const authoritativeResult = document.querySelector("[data-authoritative-result]");
    expect(authoritativeResult).toHaveTextContent("Proposal v3");
    expect(authoritativeResult).toHaveTextContent("Blocked");
    await user.click(screen.getByText("Review breakdown and version history"));
    const versionHistory = screen.getByText("Version history").closest("article");
    expect(within(versionHistory).getByText("v3")).toBeVisible();
    expect(within(versionHistory).getByText("0.0.0-design.1")).toBeVisible();
    expect(await whenCurrentAuthorityIsOpened(user)).toHaveTextContent("Chika");
    expect(createCalls).toBe(0);

    window.history.pushState(null, "", "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?version=2");
    window.dispatchEvent(new PopStateEvent("popstate"));

    const staleBoundary = await screen.findByRole("alert");
    expect(staleBoundary).toHaveTextContent("This proposal changed after it was opened.");
    expect(detailRequests.at(-1)).toEqual({
      ref: {
        kind: "resource",
        id: "767fb699-bfb5-56eb-a296-3a0a70c9430a",
        version: "2",
      },
    });
    expect(screen.queryByRole("tablist", { name: "Proposal views" })).not.toBeInTheDocument();
  });

  it("Given a workspace destination, when Catalog is activated, then its route-backed operational screen opens", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();

    await user.click(screen.getByRole("button", { name: "Catalog" }));

    expect(await screen.findByRole("region", { name: "Catalog" })).toBeVisible();
    expect(window.location.hash).toBe("#/catalog");
    expect(screen.getByRole("button", { name: "Catalog" })).toHaveAttribute("aria-current", "page");
  });

  it("Given the mobile workspace drawer, when it opens and Escape closes it, then focus and page scrolling are restored", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    const trigger = screen.getByRole("button", { name: "Open workspace navigation" });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Workspace navigation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Close workspace navigation" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Workspace navigation" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("Given the authoritative fixture, when a user searches by SKU, then only the matching line is returned", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();

    await user.type(screen.getByPlaceholderText("Search SKU or product"), "KLD-PANT-0099");

    await thenTheServerResolvedLineCountIs(1);
    expect(screen.getByRole("button", { name: "Inspect Seasoning mix, Classic, 5 kg" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Inspect Cassava flour, Select, 1 kg" })).not.toBeInTheDocument();
  });

  it("Given all lines, when the Need review state tab is selected, then only review lines remain", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();

    await user.click(screen.getByRole("tab", { name: "Need review 17" }));

    expect(screen.getByRole("tab", { name: "Need review 17" })).toHaveAttribute("aria-selected", "true");
    await thenTheServerResolvedLineCountIs(8);
    for (const row of returnedDataRows()) expect(within(row).getByRole("cell", { name: /Needs review:/ })).toBeVisible();
    expect(returnedDataRows().some((row) => row.textContent.includes("Margin policy"))).toBe(true);
    expect(returnedDataRows().some((row) => row.textContent.includes("Stale cost"))).toBe(true);
    expect(returnedDataRows().some((row) => row.textContent.includes("Unsupported dimension"))).toBe(true);
    expect(screen.getByRole("button", { name: "Next lines page" })).toBeDisabled();
  });

  it("Given the repricing tablist, when ArrowRight is pressed, then focus and the server-backed view advance together", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    const allLines = screen.getByRole("tab", { name: "All lines 1,248" });
    allLines.focus();

    await user.keyboard("{ArrowRight}");

    const review = screen.getByRole("tab", { name: "Need review 17" });
    expect(review).toHaveFocus();
    expect(review).toHaveAttribute("aria-selected", "true");
    await thenTheServerResolvedLineCountIs(8);

    await user.keyboard("{End}");
    const unpriced = screen.getByRole("tab", { name: "Unpriced 9" });
    expect(unpriced).toHaveFocus();
    expect(unpriced).toHaveAttribute("aria-selected", "true");
    await thenTheServerResolvedLineCountIs(1);

    await user.keyboard("{Home}");
    expect(allLines).toHaveFocus();
    expect(allLines).toHaveAttribute("aria-selected", "true");
    await thenTheServerResolvedLineCountIs(13);
  });

  it("Given a compact Repricing rail, when its states exceed the available width, then continuation replaces tab compression", async () => {
    await givenTheRepricingPreviewIsOpen();
    const rail = screen.getByRole("tablist", { name: "Repricing lines" });

    Object.defineProperty(rail, "clientWidth", { configurable: true, value: 320 });
    Object.defineProperty(rail, "scrollWidth", { configurable: true, value: 520 });
    Object.defineProperty(rail, "scrollLeft", { configurable: true, writable: true, value: 0 });
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => expect(rail).toHaveClass("has-overflow-after"));
    expect(rail).not.toHaveClass("has-overflow-before");
    expect(within(rail).getByRole("tab", { name: "All lines 1,248" })).toBeVisible();
    expect(within(rail).getByRole("tab", { name: "Need review 17" })).toBeVisible();
    expect(within(rail).getByRole("tab", { name: "Eligible 1,210" })).toBeVisible();
    expect(within(rail).getByRole("tab", { name: "Excluded 12" })).toBeVisible();
    expect(within(rail).getByRole("tab", { name: "Unpriced 9" })).toBeVisible();

    rail.scrollLeft = 96;
    rail.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(rail).toHaveClass("has-overflow-before", "has-overflow-after"));
  });

  it("Given the page action, when Review 17 is activated, then it opens the same authoritative review state", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();

    await user.click(screen.getByRole("button", { name: "Review issues" }));

    expect(screen.getByRole("tab", { name: "Need review 17" })).toHaveAttribute("aria-selected", "true");
    await thenTheServerResolvedLineCountIs(8);
  });

  it("Given an exact late-page line deep link, when state and search filters replace its result set, then the inspector and line URL stay synchronised", async () => {
    const lateDimensionLineId = "3b0619c1-8ed9-56ec-a8dc-21e3a3752205";
    window.history.replaceState(null, "", `#/repricing/FX-004/preview?version=0.0.0-design.1&line=${lateDimensionLineId}`);
    const { user } = await givenTheRepricingPreviewIsOpen();

    const lateInspector = await screen.findByRole("complementary", { name: "Decision details for Breakfast cereal" });
    expect(within(lateInspector).getByText("Unsupported dimension")).toBeVisible();
    expect(returnedDataRows()).toHaveLength(13);
    expect(screen.getByRole("button", { name: "Inspect Breakfast cereal, Family, 750 g" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("tab", { name: "Eligible 1,210" }));
    await thenTheServerResolvedLineCountIs(3);
    const firstEligible = returnedDataRows()[0];
    await waitFor(() => {
      expect(new URLSearchParams(window.location.hash.split("?")[1]).get("line")).toBe(firstEligible.dataset.lineId);
    });
    expect(screen.getByRole("complementary", { name: /Decision details for Long-grain rice/ })).toBeVisible();

    const search = screen.getByPlaceholderText("Search SKU or product");
    await user.clear(search);
    await user.type(search, "KLD-PANT-0003");
    await thenTheServerResolvedLineCountIs(1);
    const filteredLine = returnedDataRows()[0];
    await waitFor(() => {
      expect(new URLSearchParams(window.location.hash.split("?")[1]).get("line")).toBe(filteredLine.dataset.lineId);
    });
    expect(screen.getByRole("complementary", { name: "Decision details for Long-grain rice" })).toHaveTextContent("KLD-PANT-0003");
  });

  it("Given stale-cost and dimension blockers, when their Preview remediations run, then each action returns and routes to a new immutable Preview version", async () => {
    const repositories = createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
    const remediateLine = repositories.repricing.remediateLine.bind(repositories.repricing);
    const requests = [];
    repositories.repricing.remediateLine = async (request) => {
      requests.push(request);
      return remediateLine(request);
    };
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });

    await user.click(screen.getByRole("button", { name: "Next lines page" }));
    await user.click(await screen.findByRole("button", { name: "Inspect Groundnut oil, Classic, 1 L" }));
    const staleInspector = screen.getByRole("complementary", { name: "Decision details for Groundnut oil" });
    expect(staleInspector).toHaveTextContent("Cost evidence is stale");
    await user.click(within(staleInspector).getByRole("button", { name: "Refresh cost" }));

    await waitFor(() => expect(window.location.hash).toMatch(/version=0\.0\.0-design\.1-r1/));
    expect(screen.getByRole("tab", { name: "Eligible 1,211" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Need review 16" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Need review 16" }));
    const dimensionLine = await screen.findByRole("button", { name: "Inspect Laundry detergent, Fresh, 2 kg" });
    await user.click(dimensionLine);
    const dimensionInspector = screen.getByRole("complementary", { name: "Decision details for Laundry detergent" });
    expect(dimensionInspector).toHaveTextContent("Scope cannot be evaluated");
    await user.click(within(dimensionInspector).getByRole("button", { name: "Repair dimension" }));

    await waitFor(() => expect(window.location.hash).toMatch(/version=0\.0\.0-design\.1-r2/));
    expect(screen.getByRole("tab", { name: "Eligible 1,212" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Need review 15" })).toBeVisible();
    expect(requests.map(({ action }) => action)).toEqual(["refresh-cost", "repair-dimension"]);
    expect(requests[0].previewRef.version).toBe("0.0.0-design.1");
    expect(requests[1].previewRef.version).toBe("0.0.0-design.1-r1");
  });


  it("Given all lines, when the Eligible state tab is selected, then only eligible lines remain", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();

    await user.click(screen.getByRole("tab", { name: "Eligible 1,210" }));

    expect(screen.getByRole("tab", { name: "Eligible 1,210" })).toHaveAttribute("aria-selected", "true");
    await thenTheServerResolvedLineCountIs(3);
    for (const row of returnedDataRows()) expect(within(row).getByRole("cell", { name: "Eligible" })).toBeVisible();
  });

  it("Given excluded and unpriced outcomes, when their tabs open, then each remains distinct from review and honest about missing output", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();

    await user.click(screen.getByRole("tab", { name: "Excluded 12" }));
    await thenTheServerResolvedLineCountIs(1);
    expect(screen.getByRole("button", { name: "Inspect Maize meal, Value, 5 kg" })).toBeVisible();
    expect(within(returnedDataRows()[0]).getByRole("cell", { name: "Excluded" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Unpriced 9" }));
    await thenTheServerResolvedLineCountIs(1);
    expect(screen.getByRole("button", { name: "Inspect Brown beans, Value, 5 kg" })).toBeVisible();
    expect(within(returnedDataRows()[0]).getByRole("cell", { name: "Unpriced" })).toBeVisible();
    expect(returnedDataRows()[0]).toHaveTextContent("No output");
  });

  it("Given response-derived facets, when channel and location scope are applied, then stable IDs reach the server seam and results update", async () => {
    const fixture = createFixtureWorkspaceRepositories();
    const requests = [];
    const repositories = {
      ...fixture,
      repricing: {
        async getPreview(request) {
          requests.push(request);
          return fixture.repricing.getPreview(request);
        },
      },
    };
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    const channel = screen.getByRole("combobox", { name: "Filter by channel" });
    const location = screen.getByRole("combobox", { name: "Filter by location" });
    await whenTheNamedOptionIsSelected(user, channel, "Key accounts");
    await whenTheNamedOptionIsSelected(user, location, "Abuja fulfilment hub");
    const channelId = "4eb5c830-f8ff-5638-8f4d-9d114bb753b2";
    const locationId = "8ac88886-b971-55e8-bc09-00d5fc4d0fac";

    expect(screen.getByRole("button", { name: "Filters, 2 active" })).toHaveAttribute("aria-expanded", "true");
    await thenTheServerResolvedLineCountIs(3);
    expect(channelId).toBe("4eb5c830-f8ff-5638-8f4d-9d114bb753b2");
    expect(locationId).toBe("8ac88886-b971-55e8-bc09-00d5fc4d0fac");
    expect(requests.at(-1)).toMatchObject({ channelId, locationId, classification: "all", limit: 25 });
    expect(screen.getByText("3 sample lines · 1,248 in scope")).toBeVisible();
    expect(screen.getByRole("button", { name: "Inspect Seasoning mix, Classic, 5 kg" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Inspect Malt drink, Family, 330 ml" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Inspect Long-grain rice, Classic, 5 kg" })).toBeVisible();
  });

  it("Given scope filters with no intersection, when Clear filters is activated, then query, state, channel, and location return to their defaults", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    const search = screen.getByPlaceholderText("Search SKU or product");
    await user.type(search, "Cassava");
    await user.click(screen.getByRole("tab", { name: "Need review 17" }));
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const channel = screen.getByRole("combobox", { name: "Filter by channel" });
    const location = screen.getByRole("combobox", { name: "Filter by location" });
    await whenTheNamedOptionIsSelected(user, channel, "Marketplace");
    await whenTheNamedOptionIsSelected(user, location, "Abuja fulfilment hub");
    expect(await screen.findByText("No lines match this view.")).toBeVisible();
    await thenTheServerResolvedLineCountIs(0);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    await thenTheServerResolvedLineCountIs(13);
    expect(screen.getByRole("button", { name: "Filters" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Filter by channel" })).toHaveTextContent("All channels");
    expect(screen.getByRole("combobox", { name: "Filter by location" })).toHaveTextContent("All locations");
    expect(search).toHaveValue("");
    expect(screen.getByRole("tab", { name: "All lines 1,248" })).toHaveAttribute("aria-selected", "true");
  });

  it("Given comfortable rows, when density is toggled, then compact rows are enabled and the control offers the inverse action", async () => {
    const { user, container } = await givenTheRepricingPreviewIsOpen();

    await user.click(screen.getByRole("button", { name: "Use compact rows" }));

    expect(container.querySelector(".table-scroll")).toHaveClass("is-compact");
    expect(screen.getByRole("button", { name: "Use comfortable rows" })).toBeVisible();
  });

  it("Given the decision-first ledger, when calculations are expanded and collapsed, then essential outcomes stay visible and detailed evidence is recoverable", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    const row = screen.getByRole("button", { name: "Inspect Long-grain rice, Classic, 1 kg" }).closest("tr");
    expect(within(row).getByText("₦714.50")).toBeVisible();
    expect(within(row).getByText("₦739.51")).toBeVisible();
    expect(within(row).getByText("25.96%")).toBeVisible();
    expect(within(row).queryByText("Cost ₦547.50")).not.toBeInTheDocument();
    expect(within(row).queryByText("23.37%")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Resulting margin" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show calculations" }));
    expect(within(row).getByText("Cost ₦547.50")).toBeVisible();
    expect(within(row).getByText("23.37%")).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide calculations" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Hide calculations" }));
    expect(within(row).queryByText("Cost ₦547.50")).not.toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Inspect Long-grain rice, Classic, 1 kg" }));
    const inspector = screen.getByRole("complementary", { name: "Decision details for Long-grain rice" });
    expect(inspector).toHaveTextContent("23.37% margin");
    expect(inspector).toHaveTextContent("25.96% margin");
    expect(inspector).toHaveTextContent("Current cost₦547.50");
  });

  it("Given the default Repricing view, then every line selector truthfully exposes a closed inspector", async () => {
    await givenTheRepricingPreviewIsOpen();

    const selectors = screen.getAllByRole("button", { name: /^Inspect / });
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toHaveAttribute("aria-pressed", "false");
      expect(selector).toHaveAttribute("aria-expanded", "false");
      expect(selector).not.toHaveAttribute("aria-controls");
    }
    expect(screen.queryByRole("complementary", { name: /Decision details for/i })).not.toBeInTheDocument();
  });

  it("Given a price movement, when its row and inspector are read in document order, then Current leads the rule and Proposed follows it", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    await user.click(screen.getByRole("button", { name: "Show calculations" }));
    const selector = screen.getByRole("button", { name: "Inspect Long-grain rice, Classic, 1 kg" });
    const rowBridge = selector.closest("tr").querySelector(".row-price-movement");
    const [rowCurrent, rowRule, rowProposed] = rowBridge.children;

    expect(rowCurrent).toHaveTextContent("₦714.50");
    expect(rowRule).toHaveTextContent("+3.50%");
    expect(rowProposed).toHaveTextContent("₦739.51");

    await user.click(selector);
    const inspector = screen.getByRole("complementary", { name: "Decision details for Long-grain rice" });
    const [current, rule, proposed] = inspector.querySelector(".lens-price").children;
    expect(current).toHaveTextContent(/^Current₦714\.5023\.37% margin$/);
    expect(rule).toHaveTextContent(/^\+3\.50%\+₦25\.01$/);
    expect(proposed).toHaveTextContent(/^Proposed₦739\.5125\.96% margin$/);
  });

  it("Given the repricing ledger, when wide columns render, then composite values keep governed column structure", async () => {
    const { user, container } = await givenTheRepricingPreviewIsOpen();
    await user.click(screen.getByRole("button", { name: "Show calculations" }));
    const table = container.querySelector(".pricing-table");
    const columns = [...table.querySelectorAll("colgroup col")].map((column) => column.className);
    const rice = screen.getByRole("button", { name: "Inspect Long-grain rice, Classic, 1 kg" }).closest("tr");
    const scope = rice.querySelector(".scope-cell");

    expect(columns).toEqual([
      "pricing-col pricing-col--product",
      "pricing-col pricing-col--scope",
      "pricing-col pricing-col--price",
      "pricing-col pricing-col--margin",
      "pricing-col pricing-col--decision",
    ]);
    expect(table.querySelector(".pricing-head--price")).toHaveTextContent("Price adjustment");
    expect(rice.querySelector(".price-adjustment-cell .row-price-movement").children).toHaveLength(3);
    expect(rice.querySelector(".margin-policy-cell .margin-cell").children).toHaveLength(3);
    expect(scope).toHaveAttribute("title", "Retail web · Ibadan cross-dock");
    expect(scope).toHaveTextContent("Retail web · Ibadan cross-dock");
  });

  it("Given a repricing row, when a non-control cell is clicked, then the whole row selects without requiring its chevron", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    const selectedLine = screen.getByRole("button", { name: "Inspect Long-grain rice, Classic, 1 kg" });
    const row = selectedLine.closest("tr");
    const plainScopeCell = row.querySelector('td[data-label="Scope"]');

    expect(row).not.toHaveAttribute("aria-current");
    expect(within(row).queryByRole("button", { name: "Open line KLD-PANT-0002" })).not.toBeInTheDocument();
    expect(within(row).getAllByRole("button")).toEqual([selectedLine]);
    await user.click(plainScopeCell);

    const lens = screen.getByRole("complementary", { name: "Decision details for Long-grain rice" });
    expect(selectedLine).toHaveAttribute("aria-pressed", "true");
    expect(selectedLine).toHaveAttribute("aria-controls", "repricing-line-inspector");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(within(lens).getByText("KLD-PANT-0002", { exact: false })).toBeVisible();
    expect(within(lens).getByText("Policy clear")).toBeVisible();
    expect(within(lens).getByText("Selected for Proposal")).toBeVisible();
  });

  it("Given a repricing row selector, when Enter is pressed, then the inspector receives focus and Escape returns to the selected row", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    const selectedLine = screen.getByRole("button", { name: "Inspect Seasoning mix, Classic, 5 kg" });
    const row = selectedLine.closest("tr");

    selectedLine.focus();
    await user.keyboard("{Enter}");

    expect(selectedLine).toHaveAttribute("aria-pressed", "true");
    expect(selectedLine).toHaveAttribute("aria-controls", "repricing-line-inspector");
    expect(row).toHaveAttribute("aria-current", "true");
    const lens = screen.getByRole("complementary", { name: "Decision details for Seasoning mix" });
    expect(lens).toHaveFocus();
    expect(within(lens).getByText("KLD-PANT-0099", { exact: false })).toBeVisible();
    expect(within(lens).getByText("Policy exception")).toBeVisible();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Decision details for Seasoning mix" })).not.toBeInTheDocument());
    await waitFor(() => expect(selectedLine).toHaveFocus());
    expect(selectedLine).toHaveAttribute("aria-expanded", "false");
  });

  it("Given focus is in the decision inspector, when ArrowDown and ArrowUp are pressed, then adjacent lines replace the detail without losing inspector focus", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    await user.click(screen.getByRole("button", { name: "Inspect Seasoning mix, Classic, 5 kg" }));
    const seasoning = screen.getByRole("complementary", { name: "Decision details for Seasoning mix" });
    seasoning.focus();

    await user.keyboard("{ArrowDown}");
    const malt = await screen.findByRole("complementary", { name: "Decision details for Malt drink" });
    expect(malt).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    const restored = await screen.findByRole("complementary", { name: "Decision details for Seasoning mix" });
    expect(restored).toHaveFocus();
  });

  it("Given the collapsible decision inspector, when it is closed by its control or Escape, then the row regains focus", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    const origin = screen.getByRole("button", { name: "Inspect Cassava flour, Select, 1 kg" });

    expect(screen.queryByRole("complementary", { name: /Decision details for/i })).not.toBeInTheDocument();
    await user.click(origin);
    await user.click(screen.getByRole("button", { name: "Close decision inspector" }));

    await waitFor(() => expect(screen.queryByRole("complementary", { name: /Decision details for/i })).not.toBeInTheDocument());
    await waitFor(() => expect(origin).toHaveFocus());

    await user.click(origin);
    const lens = screen.getByRole("complementary", { name: "Decision details for Cassava flour" });
    lens.focus();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("complementary", { name: /Decision details for/i })).not.toBeInTheDocument());
    await waitFor(() => expect(origin).toHaveFocus());
  });

  it("Given a compact desktop surface, when a line opens as an overlay, then the list is protected and one exit restores it", async () => {
    const originalMatchMedia = window.matchMedia;
    const originalScrollTo = window.scrollTo;
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    window.matchMedia = (query) => ({
      matches: query === "(max-width: 1279px)",
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return true; },
    });
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.matches?.(".work-surface")) return { top: 0, right: 1200, bottom: 800, left: 0, width: 1200, height: 800 };
      return originalGetBoundingClientRect.call(this);
    };
    window.scrollTo = () => {};

    try {
      const { user, container } = await givenTheRepricingPreviewIsOpen();
      const origin = screen.getByRole("button", { name: "Inspect Cassava flour, Select, 1 kg" });
      const tableRegion = origin.closest(".table-region");

      await user.click(origin);

      const inspector = await screen.findByRole("complementary", { name: "Decision details for Cassava flour" });
      await waitFor(() => expect(tableRegion).toHaveAttribute("inert"));
      expect(tableRegion).toHaveAttribute("aria-hidden", "true");
      expect(container.querySelector(".consequence-lens-scrim")).toBeInTheDocument();
      expect(within(inspector).getAllByRole("button", { name: "Close decision inspector" })).toHaveLength(1);
      expect(within(inspector).getByText(/Line 1 of \d+/)).toBeVisible();
      expect(screen.queryByRole("button", { name: "Inspect Seasoning mix, Classic, 5 kg" })).not.toBeInTheDocument();

      await user.click(within(inspector).getByRole("button", { name: "Close decision inspector" }));
      await waitFor(() => expect(tableRegion).not.toHaveAttribute("inert"));
      expect(tableRegion).not.toHaveAttribute("aria-hidden");
      await waitFor(() => expect(origin).toHaveFocus());
    } finally {
      window.matchMedia = originalMatchMedia;
      window.scrollTo = originalScrollTo;
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it("Given the mobile repricing layout, when a non-control row cell is clicked, then detail focus and scroll hand off to the inspector", async () => {
    const originalMatchMedia = window.matchMedia;
    const originalScrollTo = window.scrollTo;
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const scrollHandoffs = [];
    window.matchMedia = (query) => ({
      matches: query === "(max-width: 1023px)" || query === "(max-width: 1279px)",
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return true; },
    });
    window.scrollTo = (options) => {
      scrollHandoffs.push(options);
    };
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.matches?.(".consequence-lens")) return { top: 420 };
      return originalGetBoundingClientRect.call(this);
    };

    try {
      const { user } = await givenTheRepricingPreviewIsOpen();
      const selectedLine = screen.getByRole("button", { name: "Inspect Long-grain rice, Classic, 1 kg" });
      const plainPriceMovementCell = selectedLine.closest("tr").querySelector('td[data-label="Price adjustment"]');

      await user.click(plainPriceMovementCell);

      const lens = await screen.findByRole("complementary", { name: "Decision details for Long-grain rice" });
      await waitFor(() => expect(lens).toHaveFocus());
      expect(scrollHandoffs).toEqual([{ top: 348, behavior: "smooth" }]);
      expect(window.location.hash).toMatch(/^#\/repricing\/FX-004\/preview\?version=0\.0\.0-design\.1&line=/);
      expect(within(lens).getByText("KLD-PANT-0002", { exact: false })).toBeVisible();

      await user.click(within(lens).getByRole("button", { name: "Close decision inspector" }));
      await waitFor(() => expect(screen.queryByRole("complementary", { name: /Decision details for/i })).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getByRole("button", { name: "Inspect Long-grain rice, Classic, 1 kg" })).toHaveFocus());
      expect(window.location.hash).toBe("#/repricing/FX-004/preview?version=0.0.0-design.1");
    } finally {
      window.matchMedia = originalMatchMedia;
      window.scrollTo = originalScrollTo;
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it("Given reduced motion at a compact breakpoint, when a line opens, then inspector focus moves without smooth scrolling", async () => {
    const originalMatchMedia = window.matchMedia;
    const originalScrollTo = window.scrollTo;
    const scrollHandoffs = [];
    window.matchMedia = (query) => ({
      matches: query === "(max-width: 1023px)" || query === "(max-width: 1279px)" || query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return true; },
    });
    window.scrollTo = (options) => scrollHandoffs.push(options);

    try {
      const { user } = await givenTheRepricingPreviewIsOpen();
      await user.click(screen.getByRole("button", { name: "Inspect Cassava flour, Select, 1 kg" }));
      const inspector = screen.getByRole("complementary", { name: "Decision details for Cassava flour" });

      await waitFor(() => expect(inspector).toHaveFocus());
      expect(scrollHandoffs).toHaveLength(1);
      expect(scrollHandoffs[0]).toMatchObject({ behavior: "auto" });
    } finally {
      window.matchMedia = originalMatchMedia;
      window.scrollTo = originalScrollTo;
    }
  });

  it("Given the current preview, when Create Proposal opens, then the confirmation preserves scope, issues, and authority boundaries", async () => {
    const { user } = await givenGovernanceReadyPreviewIsOpen();

    await user.click(screen.getByRole("button", { name: "Create Proposal" }));

    const dialog = screen.getByRole("dialog", { name: "Create blocked Proposal" });
    expect(within(dialog).getByText("1,227 lines")).toBeVisible();
    expect(within(dialog).getByText("Blocked")).toBeVisible();
    expect(within(dialog).getByText("12 issues preserved")).toBeVisible();
    expect(within(dialog).getByText("Carry all 1,227 selected lines into governance with all 12 issues preserved.")).toBeVisible();
    expect(within(dialog).getByText("Approval and publish remain separate")).toBeVisible();
  });

  it("Given an open Proposal confirmation, when Escape is pressed, then it closes and focus returns to the invoking control", async () => {
    const { user } = await givenGovernanceReadyPreviewIsOpen();
    const trigger = screen.getByRole("button", { name: "Create Proposal" });

    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Close Proposal confirmation" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("Given a confirmed blocked handoff, when Proposal creation completes, then the route-backed Proposal opens with scope and blockers intact", async () => {
    const { user } = await givenGovernanceReadyPreviewIsOpen();
    await whenTheBlockedProposalIsCreated(user);

    expect(screen.getByRole("heading", { name: "August cost recovery" })).toBeVisible();
    expect(document.querySelector("[data-authoritative-result]")).toHaveTextContent("Blocked");
    expect(screen.getByLabelText("Proposal population reconciliation")).toHaveTextContent("1,227");
    expect(screen.getByLabelText("Proposal population reconciliation")).toHaveTextContent("12");
    expect(within(screen.getByRole("region", { name: "Proposal next step" })).getByRole("button", { name: "Request exception review" })).toBeEnabled();
    expect(screen.queryByRole("complementary", { name: "Current authority" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /governed object/i })).not.toBeInTheDocument();
  });

  it("Given an empty search, when Clear filters is chosen, then the authoritative fixture view is restored", async () => {
    const { user } = await givenTheRepricingPreviewIsOpen();
    await user.type(screen.getByPlaceholderText("Search SKU or product"), "does-not-exist");
    expect(await screen.findByText("No lines match this view.")).toBeVisible();
    await thenTheServerResolvedLineCountIs(0);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    await thenTheServerResolvedLineCountIs(13);
    expect(screen.getByRole("tab", { name: "All lines 1,248" })).toHaveAttribute("aria-selected", "true");
  });

  it("Given a line-refresh repository error, when Retry is activated, then the requested view is recovered in place", async () => {
    const fixture = createFixtureWorkspaceRepositories();
    let previewCalls = 0;
    const repositories = {
      ...fixture,
      repricing: {
        async getPreview(request) {
          previewCalls += 1;
          if (previewCalls === 2) {
            throw repositoryFailure({
              code: "REPRICING_FILTER_UNAVAILABLE",
              message: "The filtered line view could not be resolved.",
              traceId: "bdd-line-refresh-failure",
            });
          }
          return fixture.repricing.getPreview(request);
        },
      },
    };
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });

    await user.click(screen.getByRole("tab", { name: "Need review 17" }));
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("The filtered line view could not be resolved.");
    await user.click(within(error).getByRole("button", { name: "Retry" }));

    await thenTheServerResolvedLineCountIs(8);
    expect(screen.queryByText("Line view could not be refreshed.")).not.toBeInTheDocument();
    expect(previewCalls).toBe(3);
  });

  it("Given a cursor-paged repository, when Next and Previous are activated, then one stable page replaces another and filters reset the cursor", async () => {
    const fixture = createFixtureWorkspaceRepositories();
    const requests = [];
    const repositories = {
      ...fixture,
      repricing: {
        async getPreview(request = {}) {
          requests.push({ cursor: request.cursor ?? null, query: request.query ?? "" });
          return fixture.repricing.getPreview({ ...request, limit: 2 });
        },
      },
    };
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });
    expect(returnedDataRows()).toHaveLength(2);
    const firstPageProducts = returnedDataRows().map((row) => row.textContent);
    const pager = screen.getByRole("navigation", { name: "lines pagination" });
    expect(pager).toHaveTextContent("1–2of 13 sample lines");
    expect(pager).toHaveTextContent("1,248 in scope");
    expect(screen.getByRole("button", { name: "Previous lines page" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next lines page" }));
    await thenTheServerResolvedLineCountIs(2);
    expect(returnedDataRows().map((row) => row.textContent)).not.toEqual(firstPageProducts);
    expect(pager).toHaveTextContent("3–4of 13 sample lines");
    expect(screen.getByRole("button", { name: "Previous lines page" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Previous lines page" }));
    await thenTheServerResolvedLineCountIs(2);
    expect(returnedDataRows().map((row) => row.textContent)).toEqual(firstPageProducts);

    await user.click(screen.getByRole("button", { name: "Next lines page" }));
    await thenTheServerResolvedLineCountIs(2);
    await user.type(screen.getByPlaceholderText("Search SKU or product"), "KLD-PANT-0003");
    await thenTheServerResolvedLineCountIs(1);
    expect(screen.getByRole("button", { name: "Previous lines page" })).toBeDisabled();
    expect(requests.map((request) => request.cursor)).toEqual([null, "fixture-rpr03:2", null, "fixture-rpr03:2", null]);
    expect(requests.at(-1)).toEqual({ cursor: null, query: "KLD-PANT-0003" });
  });

  it("Given an old Repricing page request is still pending, when a new filter resolves first, then the stale page failure cannot replace the current view", async () => {
    const fixture = createFixtureWorkspaceRepositories();
    let rejectStalePage;
    const repositories = {
      ...fixture,
      repricing: {
        async getPreview(request = {}) {
          if (request.cursor) {
            return new Promise((resolve, reject) => {
              rejectStalePage = reject;
            });
          }
          return fixture.repricing.getPreview({ ...request, limit: 2 });
        },
      },
    };
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });
    await user.click(screen.getByRole("button", { name: "Next lines page" }));
    await waitFor(() => expect(rejectStalePage).toBeTypeOf("function"));

    await user.type(screen.getByPlaceholderText("Search SKU or product"), "KLD-PANT-0003");
    await thenTheServerResolvedLineCountIs(1);
    rejectStalePage(repositoryFailure({
      code: "REPRICING_STALE_PAGE_FAILURE",
      message: "This superseded page request failed.",
      traceId: "bdd-stale-page-failure",
    }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(screen.queryByText("Line view could not be refreshed.")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "lines pagination" })).toHaveTextContent("1–1of 1 sample lines");
  });
});

describe("Operational workspace — fixture journey BDD contract", () => {
  it.each([
    ["awaiting-approval", "Nothing awaiting approval."],
    ["ready-to-publish", "Nothing ready to publish."],
    ["incomplete-rollout", "No incomplete rollouts."],
  ])("Given an empty %s queue, when I return to my work, then the route, selected tab and records recover", async (view, message) => {
    window.history.replaceState(null, "", `#/work?view=${view}`);
    const user = userEvent.setup();
    render(<WorkspaceApp />);
    await screen.findByText(message);
    expect(screen.queryByText("No work requires this authority.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to my work" }));
    const tab = await screen.findByRole("tab", { name: /Needs me/ });
    expect(tab).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(tab).toHaveFocus());
    expect(window.location.hash).toBe("#/work");
    expect(within(screen.getByRole("tabpanel")).getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("Given a populated Work queue, when a search has surrounding spaces or no matches, then results and clear-search recovery remain predictable", async () => {
    window.history.replaceState(null, "", "#/work?view=blocked");
    const user = userEvent.setup();
    render(<WorkspaceApp />);
    const search = await screen.findByRole("textbox", { name: "Search work" });
    const initialCount = within(screen.getByRole("tabpanel")).getAllByRole("button").length;
    await user.type(search, "   blocked   ");
    expect(within(screen.getByRole("tabpanel")).getAllByRole("button")).toHaveLength(initialCount);
    await user.clear(search);
    await user.type(search, "unmatched-work-identifier");
    expect(screen.getByText("No matching work in this view.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(window.location.hash).toBe("#/work?view=blocked");
    expect(within(screen.getByRole("tabpanel")).getAllByRole("button")).toHaveLength(initialCount);
    await user.type(search, "   ");
    expect(within(screen.getByRole("tabpanel")).getAllByRole("button")).toHaveLength(initialCount);
  });

  it("Given short operational queues, when Work and Proposals render, then each closes with an evidence-backed compact summary", async () => {
    window.history.replaceState(null, "", "#/work");
    const user = userEvent.setup();
    const { container } = render(<WorkspaceApp />);

    await screen.findByRole("region", { name: "Work queue" });
    expect(container.querySelector("main")).toHaveClass("workspace-main");
    expect(container.querySelector("main")).not.toHaveClass("workspace-main--wide");
    const workSummary = screen.getByLabelText("Work queue summary");
    expect(workSummary).toHaveTextContent("3 work items");
    expect(workSummary).toHaveTextContent("Line counts may overlap between stages.");
    expect(workSummary).not.toHaveTextContent("Line attention");

    await user.click(screen.getByRole("button", { name: "Proposals" }));
    await screen.findByRole("region", { name: "Proposal queue" });
    const proposalSummary = screen.getByLabelText("Proposal queue summary");
    expect(proposalSummary).toHaveTextContent("1 proposal");
  });

  it("Given the desktop Catalog directory, when rows render, then variant and human SKU share one compact identity line", async () => {
    window.history.replaceState(null, "", "#/catalog");
    render(<WorkspaceApp />);

    const catalog = await screen.findByRole("region", { name: "Catalog" });
    const cassava = within(catalog).getAllByRole("button").find((button) => button.textContent.includes("Cassava flour"));
    const identity = cassava.querySelector(".catalog-identity");
    expect(identity.querySelector("small")).toHaveTextContent("Select, 1 kg · SKU KLD-PANT-0032");
    expect(identity.querySelector("em")).not.toBeInTheDocument();
    expect(cassava.querySelector(".catalog-scope")).toHaveTextContent("Marketplace · Ibadan cross-dock");
    expect(cassava.querySelector(".catalog-source")).toBeNull();
    expect(within(catalog).getByRole("textbox", { name: "Search product or SKU code" })).toBeVisible();
    expect(catalog.querySelectorAll(".catalog-status-current").length).toBeGreaterThan(0);
    expect([...catalog.querySelectorAll(".ops-status")].some((status) => status.textContent.trim() === "Current")).toBe(false);
  });

  it("Given the dense Repricing ledger, when it opens, then it opts out of the bounded content shell", async () => {
    const { container } = await givenTheRepricingPreviewIsOpen();
    expect(container.querySelector("main")).toHaveClass("workspace-main", "workspace-main--wide");
  });

  it("Given the login route, when the sample session resolves, then the role-aware Work Queue and all authorised destinations open", async () => {
    window.history.replaceState(null, "", "#/login?returnTo=%2Fwork");
    const user = userEvent.setup();
    render(<WorkspaceApp />);

    expect(screen.getByRole("heading", { name: "Sign in to Owómidé." })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("region", { name: "Work queue" })).toBeVisible();
    expect(window.location.hash).toBe("#/work");
    for (const destination of ["Work queue", "Catalog", "Imports", "Repricing", "Proposals", "Margin policies", "Audit"]) {
      expect(screen.getByRole("button", { name: destination })).toBeVisible();
    }
  });

  it("Given a landing-page login link targets Catalog, when the session opens and later signs out, then both directions of the website flow remain available", async () => {
    window.history.replaceState(null, "", "#/login?returnTo=%2Fcatalog");
    const user = userEvent.setup();
    const externalDestinations = [];
    render(<WorkspaceApp navigateExternal={(href) => externalDestinations.push(href)} />);

    expect(await screen.findByText("Owómidé Fixture Co.")).toBeVisible();
    for (const websiteLink of screen.getAllByRole("link", { name: /Back to (Owómidé )?website/i })) {
      expect(websiteLink).toHaveAttribute("href", expect.stringMatching(/:4173\/#top$/));
    }
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("region", { name: "Catalog" })).toBeVisible();
    expect(window.location.hash).toBe("#/catalog");
    await user.click(screen.getByRole("button", { name: "Open session identity details" }));
    const identity = screen.getByRole("region", { name: "Session identity" });
    expect(within(identity).getByRole("link", { name: "Back to website" })).toHaveAttribute("href", expect.stringMatching(/:4173\/#top$/));
    await user.click(within(identity).getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(externalDestinations).toEqual([expect.stringMatching(/:4173\/#top$/)]));
    expect(window.location.hash).toBe("#/catalog");
    expect(screen.queryByRole("region", { name: "Catalog" })).not.toBeInTheDocument();
  });

  it("Given an external return target, when sign-in succeeds, then the workspace rejects the redirect and opens Work queue", async () => {
    window.history.replaceState(null, "", "#/login?returnTo=https%3A%2F%2Fevil.example");
    const user = userEvent.setup();
    render(<WorkspaceApp />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("region", { name: "Work queue" })).toBeVisible();
    expect(window.location.hash).toBe("#/work");
  });

  it("Given the 1440 Catalog list, when a product opens, then its Merchant SKU stays human-facing while the canonical UUID backs the route", async () => {
    window.history.replaceState(null, "", "#/catalog");
    const user = userEvent.setup();
    const { container } = render(<WorkspaceApp />);

    const catalog = await screen.findByRole("region", { name: "Catalog" });
    const cassava = within(catalog).getAllByRole("button").find((button) => button.textContent.includes("Cassava flour"));
    expect(cassava).toBeTruthy();
    await user.click(cassava);

    const peek = screen.getByRole("complementary", { name: "Catalog detail for Cassava flour" });
    expect(peek).toHaveTextContent("Merchant SKU");
    expect(peek).toHaveTextContent("KLD-PANT-0032");
    expect(peek).toHaveTextContent("Organisation-scoped business identifier");
    expect(container).not.toHaveTextContent("480f12f1-c0fa-528e-b3d0-27e340e93046");

    await user.click(within(peek).getByRole("button", { name: "Open full record" }));

    expect(await screen.findByRole("region", { name: "Price and cost record" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Cassava flour" })).toBeVisible();
    expect(screen.getByText(/SKU code KLD-PANT-0032/)).toBeVisible();
    const effective = container.querySelector(".catalog-record-dates");
    expect(effective).toBeTruthy();
    expect(effective).toHaveTextContent("Effective");
    expect(effective.querySelector("time")).toHaveTextContent(/Aug 2026/);
    expect(within(effective).getByText("Recorded")).toBeVisible();
    expect(window.location.hash).toBe("#/catalog/480f12f1-c0fa-528e-b3d0-27e340e93046");
  });

  it("Given an operational Catalog route, when Control K is pressed, then that screen's search receives focus without leaving the route", async () => {
    window.history.replaceState(null, "", "#/catalog");
    const user = userEvent.setup();
    render(<WorkspaceApp />);

    await screen.findByRole("region", { name: "Catalog" });
    const search = screen.getByPlaceholderText("Search product or SKU code");
    await user.keyboard("{Control>}k{/Control}");

    expect(search).toHaveFocus();
    expect(window.location.hash).toBe("#/catalog");
  });

  it("Given the bounded Catalog sample, when its cursor pager and search are used, then pages replace cleanly and the authoritative total stays separate", async () => {
    const fixture = createFixtureWorkspaceRepositories();
    const requests = [];
    const catalogList = fixture.catalog.list.bind(fixture.catalog);
    fixture.catalog.list = async (request = {}) => {
      requests.push({ cursor: request.cursor ?? null, query: request.query ?? "", limit: request.limit });
      return catalogList(request);
    };
    window.history.replaceState(null, "", "#/catalog");
    const user = userEvent.setup();
    render(<WorkspaceApp repositories={fixture} />);

    const catalog = await screen.findByRole("region", { name: "Catalog" });
    const pager = within(catalog).getByRole("navigation", { name: "SKUs pagination" });
    expect(pager).toHaveTextContent("1–8of 13 sample SKUs");
    expect(pager).toHaveTextContent("1,248 authoritative SKUs");
    expect(within(catalog).getByRole("button", { name: "Previous SKUs page" })).toBeDisabled();

    await user.click(within(catalog).getByRole("button", { name: "Next SKUs page" }));
    await waitFor(() => expect(pager).toHaveTextContent("9–13of 13 sample SKUs"));
    expect(within(catalog).queryByText("Cassava flour")).not.toBeInTheDocument();
    expect(within(catalog).getByRole("button", { name: "Previous SKUs page" })).toBeEnabled();

    await user.click(within(catalog).getByRole("button", { name: "Previous SKUs page" }));
    await waitFor(() => expect(within(catalog).getByText("Cassava flour")).toBeVisible());

    await user.type(within(catalog).getByPlaceholderText("Search product or SKU code"), "Malt drink");
    await waitFor(() => expect(requests).toHaveLength(4));
    await waitFor(() => expect(within(catalog).getByText("Malt drink")).toBeVisible());
    expect(within(catalog).getByRole("button", { name: "Previous SKUs page" })).toBeDisabled();
    expect(requests.map((request) => request.cursor)).toEqual([null, "fixture-catalog:8", null, null]);
    expect(requests.at(-1)).toEqual({ cursor: null, query: "Malt drink", limit: 8 });
  });

  it("Given a Catalog search is waiting to apply, when pagination is inspected, then an old result-set cursor cannot be reused", async () => {
    const fixture = createFixtureWorkspaceRepositories();
    const requests = [];
    const catalogList = fixture.catalog.list.bind(fixture.catalog);
    fixture.catalog.list = async (request = {}) => {
      requests.push({ cursor: request.cursor ?? null, query: request.query ?? "" });
      return catalogList(request);
    };
    window.history.replaceState(null, "", "#/catalog");
    const user = userEvent.setup();
    render(<WorkspaceApp repositories={fixture} />);

    const catalog = await screen.findByRole("region", { name: "Catalog" });
    const search = within(catalog).getByPlaceholderText("Search product or SKU code");
    const next = within(catalog).getByRole("button", { name: "Next SKUs page" });

    await user.type(search, "Malt drink");
    expect(next).toBeDisabled();
    await user.click(next);
    await waitFor(() => expect(requests).toHaveLength(2));
    await waitFor(() => expect(within(catalog).getByText("Malt drink")).toBeVisible());
    expect(requests).toEqual([
      { cursor: null, query: "" },
      { cursor: null, query: "Malt drink" },
    ]);
  });

  it("Given a Catalog next-page request fails once, when Retry page is activated, then the exact failed cursor is retried", async () => {
    const fixture = createFixtureWorkspaceRepositories();
    const requests = [];
    let failNextOnce = true;
    const catalogList = fixture.catalog.list.bind(fixture.catalog);
    fixture.catalog.list = async (request = {}) => {
      requests.push(request.cursor ?? null);
      if (request.cursor === "fixture-catalog:8" && failNextOnce) {
        failNextOnce = false;
        throw new Error("Catalog page temporarily unavailable.");
      }
      return catalogList(request);
    };
    window.history.replaceState(null, "", "#/catalog");
    const user = userEvent.setup();
    render(<WorkspaceApp repositories={fixture} />);

    const catalog = await screen.findByRole("region", { name: "Catalog" });
    const pager = within(catalog).getByRole("navigation", { name: "SKUs pagination" });
    await user.click(within(catalog).getByRole("button", { name: "Next SKUs page" }));

    const error = await within(catalog).findByRole("alert");
    expect(error).toHaveTextContent("The workspace data could not be loaded.");
    expect(pager).toHaveTextContent("1–8of 13 sample SKUs");
    await user.click(within(error).getByRole("button", { name: "Retry page" }));

    await waitFor(() => expect(pager).toHaveTextContent("9–13of 13 sample SKUs"));
    expect(requests).toEqual([null, "fixture-catalog:8", "fixture-catalog:8"]);
  });

  it("Given operational data resolved for Teni, when the evidence session changes to an actor without Catalog access, then stale data is removed and a permitted home opens", async () => {
    window.history.replaceState(null, "", "#/catalog");
    const repositories = createFixtureWorkspaceRepositories();
    const user = userEvent.setup();
    render(<WorkspaceApp repositories={repositories} />);

    expect(await screen.findByRole("region", { name: "Catalog" })).toHaveTextContent("Cassava flour");
    await user.click(screen.getByRole("button", { name: "Open session identity details" }));
    const identity = screen.getByRole("region", { name: "Session identity" });
    await user.click(within(identity).getByRole("button", { name: /Moyo/i }));

    expect(await screen.findByRole("region", { name: "Work queue" })).toBeVisible();
    expect(window.location.hash).toMatch(/^#\/work(?:\?|$)/);
    expect(screen.queryByRole("region", { name: "Catalog" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cassava flour")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Catalog" })).not.toBeInTheDocument();
  });

  it("Given the compact Catalog overlay, when a row opens and Escape closes its inspector, then the list is inert and focus returns to the row", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({
      matches: query === "(max-width: 1279px)",
      media: query,
      onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return true; },
    });
    try {
      window.history.replaceState(null, "", "#/catalog");
      const user = userEvent.setup();
      render(<WorkspaceApp />);
      const catalog = await screen.findByRole("region", { name: "Catalog" });
      const cassava = within(catalog).getAllByRole("button").find((button) => button.textContent.includes("Cassava flour"));
      await user.click(cassava);
      const peek = screen.getByRole("complementary", { name: "Catalog detail for Cassava flour" });
      await waitFor(() => expect(peek).toHaveFocus());
      expect(cassava).toHaveAttribute("aria-expanded", "true");
      expect(cassava).toHaveAttribute("aria-controls", "catalog-detail-peek");
      expect(catalog.querySelector(".ops-list-plane")).toHaveAttribute("inert");
      expect(catalog.querySelector(".ops-list-plane")).toHaveAttribute("aria-hidden", "true");
      expect(catalog.querySelector(".ops-peek-scrim")).toBeTruthy();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("complementary", { name: "Catalog detail for Cassava flour" })).not.toBeInTheDocument());
      await waitFor(() => expect(cassava).toHaveFocus());
      expect(catalog.querySelector(".ops-list-plane")).not.toHaveAttribute("inert");
      expect(window.location.hash).toBe("#/catalog");
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("Given the 320 workspace drawer, when Catalog is chosen and a SKU is opened, then navigation and detail stay route-backed without a desktop peek", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({
      matches: query === "(max-width: 1100px)" || query === "(max-width: 1023px)" || query === "(max-width: 1279px)",
      media: query,
      onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return true; },
    });
    try {
      window.history.replaceState(null, "", "#/work");
      const user = userEvent.setup();
      render(<WorkspaceApp />);
      await screen.findByRole("region", { name: "Work queue" });
      await user.click(screen.getByRole("button", { name: "Open workspace navigation" }));
      const drawer = screen.getByRole("dialog", { name: "Workspace navigation" });
      await user.click(within(drawer).getByRole("button", { name: "Catalog" }));
      const catalog = await screen.findByRole("region", { name: "Catalog" });
      const cassava = within(catalog).getAllByRole("button").find((button) => button.textContent.includes("Cassava flour"));
      await user.click(cassava);

      expect(await screen.findByRole("region", { name: "Price and cost record" })).toBeVisible();
      expect(screen.queryByRole("complementary", { name: "Catalog detail for Cassava flour" })).not.toBeInTheDocument();
      expect(window.location.hash).toBe("#/catalog/480f12f1-c0fa-528e-b3d0-27e340e93046");
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("Given Work Queue views, when keyboard arrows move the active tab, then selected state, panel labelling and route remain synchronised", async () => {
    window.history.replaceState(null, "", "#/work");
    const user = userEvent.setup();
    render(<WorkspaceApp />);

    const queue = await screen.findByRole("region", { name: "Work queue" });
    const tabs = within(queue).getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(within(queue).getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tabs[0].id);

    tabs[0].focus();
    await user.keyboard("{ArrowRight}");

    const blocked = await waitFor(() => {
      const next = screen.getByRole("tab", { name: "Blocked 2" });
      expect(next).toHaveFocus();
      return next;
    });
    expect(blocked).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", blocked.id);
    expect(window.location.hash).toBe("#/work?view=blocked");
  });

  it("Given a fresh Sample data import, when the seven repository-backed stages complete, then Commit reconciles an exact versioned partial result", async () => {
    window.history.replaceState(null, "", "#/imports");
    const user = userEvent.setup();
    const repositories = createFixtureWorkspaceRepositories();
    render(<WorkspaceApp repositories={repositories} />);

    expect(await screen.findByRole("region", { name: "Import ledger" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create sample import" }));
    expect(await screen.findByRole("region", { name: "Sample data boundary" })).toBeVisible();
    expect(window.location.hash).toBe("#/imports/new");

    await user.click(screen.getByRole("button", { name: "Create sample import" }));
    const sourceFile = await screen.findByRole("region", { name: "Source file" });
    const uploadBoundary = screen.getByRole("region", { name: "Upload boundary" });
    expect(sourceFile).toBeVisible();
    expect(window.location.hash).toBe("#/imports/8e92ec6a-fb50-5e9b-8cd7-b624423f3aa8/upload?version=1");
    expect(screen.getByRole("button", { name: "Step 1 of 7: Upload, current" })).toHaveAttribute("aria-current", "step");
    expect(within(sourceFile).queryByRole("button", { name: "Record sample source" })).not.toBeInTheDocument();
    expect(within(uploadBoundary).getByRole("button", { name: "Record sample source" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Choose the CSV sample/i }));
    expect(within(uploadBoundary).getByRole("button", { name: "Record sample source" })).toBeEnabled();
    await user.click(within(uploadBoundary).getByRole("button", { name: "Record sample source" }));
    expect(await screen.findByRole("region", { name: "Profiled source" })).toHaveTextContent("KLD-PANT-0032");
    expect(window.location.hash).toBe("#/imports/8e92ec6a-fb50-5e9b-8cd7-b624423f3aa8/profile?version=2");

    await user.click(screen.getByRole("button", { name: "Profile sample source" }));
    expect(await screen.findByRole("button", { name: "Review field mapping" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Review field mapping" }));
    const mapping = await screen.findByRole("region", { name: "Field mapping" });
    expect(mapping).toHaveTextContent("Merchant SKU");
    expect(mapping).not.toHaveTextContent("Choose field");
    expect(within(mapping).getAllByText("Needs confirmation")).toHaveLength(2);
    expect(mapping).toHaveTextContent("Current cost");
    expect(mapping).toHaveTextContent("Current price");
    expect(mapping).toHaveTextContent("54% match");
    expect(mapping).toHaveTextContent("51% match");
    expect(mapping).toHaveTextContent("Custom mappings and file uploads are not available in this sample");
    await user.click(within(mapping).getByRole("button", { name: "Use reviewed sample mapping" }));
    await waitFor(() => expect(window.location.hash).toContain("/map?version=4"));
    await waitFor(() => expect(screen.getByRole("region", { name: "Field mapping" })).toHaveTextContent("Required fields are ready for validation"));
    const mappedSurface = screen.getByRole("region", { name: "Field mapping" });
    expect(mappedSurface).not.toHaveTextContent("Needs confirmation");
    expect(mappedSurface).toHaveTextContent("54% match");
    expect(mappedSurface).toHaveTextContent("51% match");
    expect(mappedSurface).toHaveTextContent("Supplier cost update · sample · v4");
    const validateRows = within(mappedSurface).getByRole("button", { name: /Validate \d+ rows/ });
    expect(validateRows).toBeEnabled();
    await user.click(validateRows);

    const validation = await screen.findByRole("region", { name: "Validation and repair" });
    expect(within(validation).getByLabelText("Validation row reconciliation")).toHaveTextContent("Input80");
    expect(within(validation).getByLabelText("Validation row reconciliation")).toHaveTextContent("Unresolved5");
    const rowTwelve = within(validation).getByRole("button", { name: /Row 12/i });
    expect(rowTwelve).toHaveAttribute("aria-expanded", "false");
    expect(rowTwelve).not.toHaveAttribute("aria-controls");
    await user.click(rowTwelve);
    const issueInspector = await screen.findByRole("complementary", { name: "Issue detail for row 12" });
    await waitFor(() => expect(issueInspector).toHaveFocus());
    expect(rowTwelve).toHaveAttribute("aria-expanded", "true");
    expect(rowTwelve).toHaveAttribute("aria-controls", "import-issue-inspector");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Issue detail for row 12" })).not.toBeInTheDocument());
    await waitFor(() => expect(rowTwelve).toHaveFocus());
    await user.click(within(validation).getByRole("button", { name: "Review import" }));

    const review = await screen.findByRole("region", { name: "Import review" });
    const openCommit = within(review).getByRole("button", { name: "Confirm and continue" });
    const acknowledgement = within(review).getByRole("checkbox", {
      name: /I reviewed the mapping, warnings, exclusions and unresolved input.*Record my acknowledgement for this batch version/i,
    });
    const acknowledgementLabel = acknowledgement.closest("label");
    const reviewDocument = review.querySelector(".review-document");
    const commitBoundary = review.querySelector(".review-consequence");
    expect(reviewDocument).toBeInTheDocument();
    expect(commitBoundary).toBeInTheDocument();
    expect(reviewDocument.nextElementSibling).toBe(commitBoundary);
    expect(commitBoundary.nextElementSibling).toBe(acknowledgementLabel);
    expect(commitBoundary).toHaveTextContent(/separate Commit step; it does not start the import/i);
    expect(acknowledgementLabel).toHaveClass("risk-confirmation");
    expect(acknowledgementLabel.querySelector("strong")).toHaveTextContent("I reviewed the mapping, warnings, exclusions and unresolved input.");
    expect(acknowledgementLabel.querySelector("small")).toHaveTextContent("Record my acknowledgement for this batch version.");
    expect(acknowledgement).not.toBeChecked();
    expect(openCommit).toBeDisabled();
    await user.click(acknowledgement);
    expect(acknowledgement).toBeChecked();
    expect(openCommit).toBeEnabled();
    await user.click(openCommit);

    const commit = await screen.findByRole("region", { name: "Sample data commit" });
    expect(window.location.hash).toBe("#/imports/8e92ec6a-fb50-5e9b-8cd7-b624423f3aa8/commit?version=6");
    const startCommit = within(commit).getByRole("button", { name: "Start sample commit" });
    expect(startCommit).toBeEnabled();
    expect(within(commit).queryByRole("button", { name: "Reconcile sample operation" })).not.toBeInTheDocument();
    await user.click(startCommit);

    await waitFor(() => expect(window.location.hash).toMatch(/^#\/imports\/8e92ec6a-fb50-5e9b-8cd7-b624423f3aa8\/commit\?version=7&operation=ce84573e-186f-5bce-a141-ef2ddfae836e&operationVersion=1$/));
    const unknownCommit = await screen.findByRole("region", { name: "Sample data commit" });
    expect(await within(unknownCommit).findByText("Outcome unknown")).toBeVisible();
    expect(unknownCommit).toHaveTextContent("CommittedPending reconciliation");
    expect(unknownCommit).toHaveTextContent("RejectedPending reconciliation");
    expect(unknownCommit).not.toHaveTextContent("Committed0");
    expect(within(unknownCommit).queryByRole("button", { name: "Start sample commit" })).not.toBeInTheDocument();
    const reconcile = within(unknownCommit).getByRole("button", { name: "Reconcile sample operation" });
    expect(reconcile).toBeEnabled();
    await user.click(reconcile);

    const result = await screen.findByRole("region", { name: "Import result" });
    expect(result).toHaveTextContent(/partial result/i);
    expect(result).toHaveTextContent("Rejected4");
    expect(result).toHaveTextContent("Remaining input5");
    expect(within(result).getByRole("button", { name: "Review unresolved input" })).toBeVisible();
    expect(result).toHaveTextContent(/Live retry and export are not available in this sample/i);
    expect(screen.getByRole("region", { name: "Import Result stage" })).toHaveTextContent("Sample only · Catalog unchanged");
    expect(window.location.hash).toMatch(/^#\/imports\/8e92ec6a-fb50-5e9b-8cd7-b624423f3aa8\/result\?version=8&operation=ce84573e-186f-5bce-a141-ef2ddfae836e&operationVersion=2$/);
  });

  it("Given an exact mapping-stage Import ref, when its future Result URL is opened directly, then no reconciled outcome is disclosed", async () => {
    window.history.replaceState(null, "", "#/imports/6e39103a-9d95-5d82-ae84-da005ccdd42c/result?version=4");
    render(<WorkspaceApp repositories={createFixtureWorkspaceRepositories()} />);

    const boundary = await screen.findByRole("alert");
    expect(boundary).toHaveTextContent(/result|stage|state|available/i);
    expect(screen.queryByRole("region", { name: "Import result" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Import complete with exceptions/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to Map" })).toBeVisible();
  });

  it("Given the prepared repricing Scope, when Scope and +4.25% Rule versions persist, then their exact generated Preview opens and can become a Proposal", async () => {
    window.history.replaceState(null, "", "#/repricing/new/scope");
    const user = userEvent.setup();
    const repositories = createFixtureWorkspaceRepositories();
    render(<WorkspaceApp repositories={repositories} />);

    const preparedScope = await screen.findByRole("region", { name: "Prepared scope criteria" });
    expect(preparedScope).toHaveTextContent("All active categories");
    expect(preparedScope).toHaveTextContent("8 categories");
    expect(preparedScope).toHaveTextContent("Wholesale accounts");
    expect(preparedScope).toHaveTextContent("Marketplace");
    expect(preparedScope).toHaveTextContent("Lagos distribution centre");
    expect(preparedScope).toHaveTextContent("Ibadan cross-dock");
    expect(within(preparedScope).queryByRole("button", { name: /Pantry|Marketplace|Ibadan/i })).not.toBeInTheDocument();
    const population = screen.getByRole("region", { name: "Complete population" });
    expect(population).toHaveTextContent("Matched");
    expect(population).toHaveTextContent("1,248");
    expect(population).toHaveTextContent("Priced1,239");
    expect(within(population).getByRole("button", { name: "Save scope to continue" })).toBeDisabled();
    await user.click(within(preparedScope).getByRole("button", { name: "Save prepared scope" }));
    expect(await within(preparedScope).findByText("Scope version 1")).toBeVisible();
    await user.click(within(population).getByRole("button", { name: "Continue to adjustment" }));

    const rule = await screen.findByRole("region", { name: "Price adjustment" });
    const ruleValue = within(rule).getByRole("textbox");
    expect(ruleValue).toHaveValue("3.50");
    await user.clear(ruleValue);
    await user.type(ruleValue, "4.25");
    expect(screen.getByText("New preview required.")).toBeVisible();
    expect(window.location.hash).toBe("#/repricing/df79d27f-e87d-58ba-9167-87ced18c72b5/rule?version=1");
    const saveRule = screen.getByRole("button", { name: "Save adjustment" });
    expect(saveRule).toBeEnabled();
    await user.click(saveRule);
    expect(await screen.findByText("Adjustment version 2 saved.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Generate versioned Preview" }));

    expect(await screen.findByRole("region", { name: "Repricing preview" })).toBeVisible();
    expect(window.location.hash).toBe("#/repricing/df79d27f-e87d-58ba-9167-87ced18c72b5/preview?version=3");
    expect(document.querySelector(".page-meta")).toHaveTextContent("Price adjustment · +4.25%");
    expect(screen.getByText("₦1,681.03")).toBeVisible();
    const readyPreview = await repairOperationalBlockers(repositories, {
      kind: "resource",
      id: "df79d27f-e87d-58ba-9167-87ced18c72b5",
      version: "3",
    }, "component-generated-flow-repair");
    window.history.pushState(null, "", `#/repricing/${readyPreview.ref.id}/preview?version=${encodeURIComponent(readyPreview.ref.version)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    const create = screen.getByRole("button", { name: "Create Proposal" });
    await waitFor(() => expect(create).toBeEnabled());
    await user.click(create);
    const dialog = screen.getByRole("dialog", { name: "Create blocked Proposal" });
    expect(dialog).toHaveTextContent("7 issues preserved");
    await user.click(within(dialog).getByRole("button", { name: "Create blocked Proposal" }));
    expect(await screen.findByRole("tablist", { name: "Proposal views" })).toBeVisible();
    expect(window.location.hash).toBe(`#/proposals/${FIXTURE_GENERATED_PROPOSAL_ID}?version=3`);
    expect(screen.queryByRole("complementary", { name: /Decision details for/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Audit" }));
    const audit = await screen.findByRole("region", { name: "Audit ledger" });
    expect(within(audit).getByText("No audit events match this view.")).toBeVisible();
    expect(within(audit).queryByText(/Import Uploaded|Repricing Previewed|Proposal Created/i)).not.toBeInTheDocument();
  });

  it("Given a generated Preview deep link without an exact version, when it opens, then the workspace fails closed before displaying repricing evidence", async () => {
    window.history.replaceState(null, "", "#/repricing/df79d27f-e87d-58ba-9167-87ced18c72b5/preview");
    render(<WorkspaceApp repositories={createFixtureWorkspaceRepositories()} />);

    const boundary = await screen.findByRole("alert");
    expect(boundary).toHaveTextContent("This Preview link must identify the exact persisted Preview version.");
    expect(screen.queryByRole("region", { name: "Repricing preview" })).not.toBeInTheDocument();
  });

  it("Given the directory routes, when Proposal, Rule and participant-scoped Audit records open, then each detail remains URL-backed and read-bound", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const listProposals = repositories.proposals.list.bind(repositories.proposals);
    const listAudit = repositories.audit.list.bind(repositories.audit);
    let resolvedProposals = null;
    let resolvedAudit = null;
    repositories.proposals.list = async (request) => {
      resolvedProposals = await listProposals(request);
      return resolvedProposals;
    };
    repositories.audit.list = async (request) => {
      resolvedAudit = await listAudit(request);
      return resolvedAudit;
    };
    const user = userEvent.setup();
    window.history.replaceState(null, "", "#/proposals");
    const { container } = render(<WorkspaceApp repositories={repositories} />);

    const proposals = await screen.findByRole("region", { name: "Proposal queue" });
    const proposalRows = [...container.querySelectorAll(".proposal-list > button")];
    expect(proposalRows).toHaveLength(resolvedProposals.items.length);
    expect(resolvedProposals.items.every((item) => item.ref.kind === "resource")).toBe(true);
    const proposal = proposalRows[0];
    expect(proposal).toHaveTextContent("August cost recovery");
    await user.click(proposal);
    expect(await screen.findByRole("tablist", { name: "Proposal views" })).toBeVisible();
    expect(window.location.hash).toBe("#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?version=3");

    await user.click(screen.getByRole("button", { name: "Margin policies" }));
    const rules = await screen.findByRole("region", { name: "Margin policies" });
    const scopeLabels = [...rules.querySelectorAll(".rules-list > button > span:nth-child(2)")]
      .map((node) => node.textContent?.trim())
      .filter(Boolean);
    expect(new Set(scopeLabels).size).toBeGreaterThan(1);
    expect(rules.querySelector(".rule-floor")).toHaveStyle({ "--rule-floor-progress": "56%" });
    expect(rules).toHaveTextContent("Design v1");
    expect(rules).not.toHaveTextContent("v0.0.0-design.1");
    const pantryRule = within(rules).getAllByRole("button").find((button) => button.textContent.includes("Pantry & staples"));
    await user.click(pantryRule);
    expect(await screen.findByRole("region", { name: "Margin policy definition" })).toHaveTextContent("14.00%");
    expect(window.location.hash).toBe("#/rules/c886c96d-18d7-51b6-8290-c3f1962b8ede");

    await user.click(screen.getByRole("button", { name: "Audit" }));
    const ledger = await screen.findByRole("region", { name: "Audit ledger" });
    await waitFor(() => expect(resolvedAudit?.filterResult?.accessScope).toBe("owned-or-involved-proposals"));
    expect(within(ledger).queryByRole("button", { name: /edit|delete|publish/i })).not.toBeInTheDocument();
    const event = container.querySelector(".audit-ledger > article");
    expect(event).toBeTruthy();
    const objectLink = within(event).getByRole("link", { name: /Open .* history/i });
    expect(objectLink).toHaveAttribute("href", expect.stringMatching(/^#\/audit\/[^/]+\/[^?]+\?version=/));
    expect(event.querySelector("time")).toHaveAttribute("datetime");
    expect(event.querySelector("time small")).not.toBeEmptyDOMElement();
    await user.click(objectLink);
    expect(await screen.findByRole("region", { name: "Entity history" })).toBeVisible();
    expect(window.location.hash).toMatch(/^#\/audit\/proposal\/.*\?version=/);
  });

  it("Given every visible participant-scoped Audit row, when each row is opened, then every advertised target resolves to read-only entity history", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const directory = await repositories.audit.list({ limit: 30 });
    expect(directory.filterResult.accessScope).toBe("owned-or-involved-proposals");

    for (let index = 0; index < directory.items.length; index += 1) {
      window.history.replaceState(null, "", "#/audit");
      const user = userEvent.setup();
      const { container, unmount } = render(<WorkspaceApp repositories={repositories} />);
      await screen.findByRole("region", { name: "Audit ledger" }, { timeout: 5000 });
      const rows = [...container.querySelectorAll(".audit-ledger > article")];
      expect(rows).toHaveLength(directory.items.length);

      await user.click(within(rows[index]).getByRole("link", { name: /Open .* history/i }));

      expect(await screen.findByRole("region", { name: "Entity history" })).toBeVisible();
      expect(screen.queryByRole("button", { name: /edit|delete|publish/i })).not.toBeInTheDocument();
      expect(window.location.hash).toContain(directory.items[index].object.id);
      expect(window.location.hash).toContain(`version=${encodeURIComponent(directory.items[index].object.version)}`);
      unmount();
    }
  });
});

describe("Proposal governance journey — BDD interaction contract", () => {
  it("Given an exact Proposal version, when Margin opens, then retained policy evidence and explicit authority replace the former normalised Overview", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const requests = [];
    const getMarginEvidence = repositories.proposals.getMarginEvidence.bind(repositories.proposals);
    repositories.proposals.getMarginEvidence = async (request) => {
      requests.push(request);
      return getMarginEvidence(request);
    };
    window.history.replaceState(null, "", "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?version=3&view=margin");

    render(<WorkspaceApp repositories={repositories} />);

    const margin = await screen.findByRole("region", { name: "Retained margin evidence" });
    expect(window.location.hash).toContain("version=3&view=margin");
    expect(requests).toEqual([{ proposalRef: { kind: "resource", id: "767fb699-bfb5-56eb-a296-3a0a70c9430a", version: "3" } }]);
    expect(margin).toHaveTextContent("Margin evidence · v3");
    expect(margin).toHaveTextContent("Minimum margin");
    expect(margin).toHaveTextContent("12 retained in the exact Proposal population");
    expect(within(margin).getByRole("button", { name: "Request exception" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "Margin 12" })).toHaveAttribute("aria-selected", "true");
  });

  it("Given an exact Proposal comment thread, when Teni records a comment, then the request and rendered record use returned version, actor and action copy", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const requests = [];
    const addComment = repositories.proposals.addComment.bind(repositories.proposals);
    repositories.proposals.addComment = async (request) => {
      requests.push(request);
      return addComment(request);
    };
    window.history.replaceState(null, "", "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?version=3&view=comments");

    render(<WorkspaceApp repositories={repositories} />);
    const user = userEvent.setup();
    const comments = await screen.findByRole("region", { name: "Proposal comments" });
    expect(comments).toHaveTextContent("Please retain the line-level floor evidence");
    expect(within(comments).getByLabelText("Add version-bound comment")).toBeVisible();
    expect(comments).toHaveTextContent("The Proposal decision state does not change.");

    await user.type(within(comments).getByRole("textbox", { name: "Add version-bound comment" }), "The expiry is confirmed against the retained evidence.");
    await user.click(within(comments).getByRole("button", { name: "Add comment" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].proposalRef).toEqual({ kind: "resource", id: "767fb699-bfb5-56eb-a296-3a0a70c9430a", version: "3" });
    expect(requests[0].idempotencyKey).toMatch(/^proposal-comment:767fb699-bfb5-56eb-a296-3a0a70c9430a:v3:/);
    expect(requests[0].body).toBe("The expiry is confirmed against the retained evidence.");
    await waitFor(() => expect(comments).toHaveTextContent("The expiry is confirmed against the retained evidence."));
    expect(comments).toHaveTextContent("Teni");
    expect(screen.getByRole("tab", { name: "Comments 2" })).toHaveAttribute("aria-selected", "true");
  });

  it("Given a Proposal reader without comment capability, when Comments opens, then existing human records remain readable and the composer is explicitly denied", async () => {
    const repositories = createFixtureWorkspaceRepositories({ designEvidenceCapabilities: ["proposal:read", "pricing:economics:read"] });
    window.history.replaceState(null, "", "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?version=3&view=comments");

    render(<WorkspaceApp repositories={repositories} />);

    const comments = await screen.findByRole("region", { name: "Proposal comments" });
    expect(comments).toHaveTextContent("Please retain the line-level floor evidence");
    expect(comments).toHaveTextContent("Comment permission is required for this Proposal version.");
    expect(within(comments).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("Given a comment mutation fails once, when the preserved action is retried, then the same idempotency key completes without losing the human draft", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const addComment = repositories.proposals.addComment.bind(repositories.proposals);
    const requests = [];
    repositories.proposals.addComment = async (request) => {
      requests.push(request);
      if (requests.length === 1) {
        throw new RepositoryError(createDomainErrorEnvelope({
          code: "PROPOSAL_COMMENT_TEMPORARILY_UNAVAILABLE",
          message: "The comment could not be recorded yet.",
          details: { workPreserved: true },
          retryable: true,
          domain: "proposal-comment",
          traceId: "bdd-proposal-comment-retry",
        }));
      }
      return addComment(request);
    };
    window.history.replaceState(null, "", "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?version=3&view=comments");

    render(<WorkspaceApp repositories={repositories} />);
    const user = userEvent.setup();
    const comments = await screen.findByRole("region", { name: "Proposal comments" });
    const composer = within(comments).getByRole("textbox", { name: "Add version-bound comment" });
    await user.type(composer, "Preserve this note through a safe retry.");
    await user.click(within(comments).getByRole("button", { name: "Add comment" }));

    expect(await within(comments).findByRole("alert")).toHaveTextContent("The comment could not be recorded yet.");
    expect(composer).toHaveValue("Preserve this note through a safe retry.");
    await user.click(within(comments).getByRole("button", { name: "Add comment" }));

    await waitFor(() => expect(composer).toHaveValue(""));
    expect(requests).toHaveLength(2);
    expect(requests[1].idempotencyKey).toBe(requests[0].idempotencyKey);
    expect(comments).toHaveTextContent("Preserve this note through a safe retry.");
  });

  it("Given an empty exact-version comment page, when Comments resolves, then an honest empty state appears without hiding the permitted action", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const listComments = repositories.proposals.listComments.bind(repositories.proposals);
    repositories.proposals.listComments = async (request) => {
      const thread = await listComments(request);
      return { ...thread, items: [], page: { ...thread.page, returnedCount: 0, totalCount: 0, nextCursor: null } };
    };
    window.history.replaceState(null, "", "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?version=3&view=comments");

    render(<WorkspaceApp repositories={repositories} />);

    const comments = await screen.findByRole("region", { name: "Proposal comments" });
    expect(comments).toHaveTextContent("No comments have been recorded for Proposal v3.");
    expect(within(comments).getByRole("textbox", { name: "Add version-bound comment" })).toBeVisible();
  });

  it("Given a Proposal evidence deep link omits its version, when Margin or Comments is requested, then it fails closed before Proposal data is read", async () => {
    for (const view of ["margin", "comments"]) {
      const repositories = createFixtureWorkspaceRepositories();
      const getDetail = repositories.proposals.getDetail.bind(repositories.proposals);
      let reads = 0;
      repositories.proposals.getDetail = async (...args) => {
        reads += 1;
        return getDetail(...args);
      };
      window.history.replaceState(null, "", `#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?view=${view}`);
      const rendered = render(<WorkspaceApp repositories={repositories} />);

      const boundary = await screen.findByRole("alert");
      expect(boundary).toHaveTextContent("This evidence view must identify the exact Proposal version.");
      expect(reads).toBe(0);
      expect(screen.queryByRole("tablist", { name: "Proposal views" })).not.toBeInTheDocument();
      rendered.unmount();
    }
  });

  it("Given a Proposal evidence read fails once, when Retry this view is chosen, then the exact route and object stay in place", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const getMarginEvidence = repositories.proposals.getMarginEvidence.bind(repositories.proposals);
    let attempts = 0;
    repositories.proposals.getMarginEvidence = async (request) => {
      attempts += 1;
      if (attempts === 1) {
        throw new RepositoryError(createDomainErrorEnvelope({
          code: "PROPOSAL_MARGIN_TEMPORARILY_UNAVAILABLE",
          message: "The retained margin snapshot could not be resolved yet.",
          details: {},
          retryable: true,
          domain: "proposal-margin",
          traceId: "bdd-proposal-margin-retry",
        }));
      }
      return getMarginEvidence(request);
    };
    window.history.replaceState(null, "", "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?version=3&view=margin");

    render(<WorkspaceApp repositories={repositories} />);
    const user = userEvent.setup();
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("The retained margin snapshot could not be resolved yet.");
    await user.click(within(error).getByRole("button", { name: "Retry this view" }));

    expect(await screen.findByRole("region", { name: "Retained margin evidence" })).toBeVisible();
    expect(window.location.hash).toContain("version=3&view=margin");
    expect(attempts).toBe(2);
  });

  it("Given the governed Proposal anchor, then its causal price bridge reads Current, change, Proposed before the separate policy floor", async () => {
    const { repositories, proposalDetailReads } = createObservedFixtureRepositories();
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });
    await whenTheBlockedProposalIsCreated(user, { proposalDetailReads });

    const anchor = screen.getByRole("region", { name: "Financial consequence for Cassava flour" });
    const prices = anchor.querySelector(".proposal-anchor__prices");
    const [current, bridge, proposed, floor] = prices.children;

    expect(current.querySelector("small")).toHaveTextContent("Current price");
    expect(current).toHaveTextContent("₦1,612.50");
    expect(bridge).toHaveClass("proposal-anchor__delta");
    expect(bridge).toHaveTextContent("+3.50%");
    expect(bridge.querySelector("i")).toHaveAttribute("aria-hidden", "true");
    expect(proposed.querySelector("small")).toHaveTextContent("Proposed price");
    expect(proposed).toHaveTextContent("₦1,668.94");
    expect(floor).toHaveClass("proposal-anchor__floor");
    expect(floor.querySelector("small")).toHaveTextContent("Applied floor");
  });

  it("Given a Proposal overview, when Current authority is opened and dismissed, then optional context and focus are restored without taxing the default canvas", async () => {
    const { repositories, proposalDetailReads } = createObservedFixtureRepositories();
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });
    await whenTheBlockedProposalIsCreated(user, { proposalDetailReads });

    const trigger = screen.getByRole("button", { name: "People and permissions" });
    const toolbar = trigger.closest(".proposal-surface__toolbar");
    expect(toolbar).not.toBeNull();
    expect(toolbar).toContainElement(screen.getByRole("tablist", { name: "Proposal views" }));
    expect(toolbar).toContainElement(trigger);
    expect(trigger.parentElement).toBe(toolbar);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "proposal-authority-panel");
    expect(screen.queryByRole("complementary", { name: "Current authority" })).not.toBeInTheDocument();

    await user.click(trigger);
    const authority = await screen.findByRole("complementary", { name: "Current authority" });
    expect(authority).toHaveFocus();
    expect(screen.getByRole("button", { name: "Hide people and permissions" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Dismiss current authority overlay" })).toBeVisible();

    await user.click(within(authority).getByRole("button", { name: "Close current authority" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Current authority" })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    const reopened = await screen.findByRole("complementary", { name: "Current authority" });
    reopened.focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Current authority" })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("Given a blocked Proposal, when each resolved role performs only its permitted step, then publication reconciles without collapsing authority boundaries", async () => {
    const {
      repositories,
      proposalDetailReads,
      proposalDetailRequests,
      publicationStartRequests,
      publicationRetryRequests,
    } = createObservedFixtureRepositories();
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });
    await whenTheBlockedProposalIsCreated(user, { proposalDetailReads });
    expect(proposalDetailRequests[0]).toEqual({
      ref: {
        kind: "resource",
        id: "767fb699-bfb5-56eb-a296-3a0a70c9430a",
        version: "3",
      },
    });

    // Teni requests a bounded exception. The request does not approve the Proposal.
    await user.click(within(screen.getByRole("region", { name: "Proposal next step" })).getByRole("button", { name: "Request exception review" }));
    await thenConfirmTheDecision(user, {
      dialogName: "Request bounded exception",
      confirmName: "Request exception",
    });
    await waitFor(() => expect(document.querySelector("[data-authoritative-result]")).toHaveTextContent("Review requested"));
    expect(await whenCurrentAuthorityIsOpened(user)).toHaveTextContent("requester cannot decide their own exception");

    // The requester receives no decision CTA. A protected deep link may still
    // inspect the exact preserved request without exposing decision controls.
    expect(screen.queryByRole("button", { name: "Review protected exception" })).not.toBeInTheDocument();
    window.history.pushState(
      null,
      "",
      "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a/overrides/7ca1b72c-f1b4-5ab4-b5ed-8962c53c6cb2?proposalVersion=3&overrideVersion=1",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    const requesterReview = await screen.findByRole("region", { name: "Review protected exception" });
    expect(window.location.hash).toBe("#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a/overrides/7ca1b72c-f1b4-5ab4-b5ed-8962c53c6cb2?proposalVersion=3&overrideVersion=1");
    expect(requesterReview).toHaveTextContent("requester cannot decide their own exception");
    expect(within(requesterReview).queryByRole("button", { name: "Approve exception" })).not.toBeInTheDocument();
    expect(within(requesterReview).queryByRole("button", { name: "Deny exception" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Proposal" }));
    await screen.findByRole("tablist", { name: "Proposal views" });

    // Chika records the independent exception decision. The Proposal returns as
    // a ready draft rather than skipping ahead to approved.
    await whenTheDesignEvidenceSessionChangesTo(user, "Chika");
    await user.click(screen.getByRole("button", { name: "Review exception" }));
    expect(await screen.findByRole("region", { name: "Review protected exception" })).toBeVisible();
    expect(window.location.hash).toBe("#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a/overrides/7ca1b72c-f1b4-5ab4-b5ed-8962c53c6cb2?proposalVersion=3&overrideVersion=1");
    await user.click(screen.getByRole("button", { name: "Approve exception" }));
    await thenConfirmTheDecision(user, {
      dialogName: "Approve bounded exception",
      confirmName: "Approve exception",
    });
    await waitFor(() => expect(document.querySelector("[data-authoritative-result]")).toHaveTextContent("Ready"));
    expect(screen.getByLabelText("Proposal population reconciliation")).toHaveTextContent("1,227");
    expect(screen.getByLabelText("Proposal population reconciliation")).toHaveTextContent("0");
    expect(window.location.hash).toBe("#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?version=7");

    // The global shortcut must follow the current same-ID Proposal version,
    // not the v3 closure that installed the original key listener.
    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => {
      expect(window.location.hash).toBe("#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a?version=7&view=lines");
    });
    expect(screen.getByRole("tab", { name: "Lines 1,227" })).toHaveAttribute("aria-selected", "true");

    // Only the author can submit the reconciled current version.
    await whenTheDesignEvidenceSessionChangesTo(user, "Teni");
    await user.click(screen.getByRole("button", { name: "Submit for independent review" }));
    await thenConfirmTheDecision(user, {
      dialogName: "Submit current version",
      confirmName: "Submit for approval",
    });
    await waitFor(() => expect(document.querySelector("[data-authoritative-result]")).toHaveTextContent("Submitted"));

    // Chika's approval records authority but must leave Catalog unpublished.
    await whenTheDesignEvidenceSessionChangesTo(user, "Chika");
    await user.click(screen.getByRole("button", { name: "Review current version" }));
    expect(await screen.findByRole("region", { name: "Review the current version" })).toBeVisible();
    expect(screen.getByText("Approval does not publish")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Approve Proposal" }));
    await thenConfirmTheDecision(user, {
      dialogName: "Approve current version",
      confirmName: "Approve Proposal",
    });
    await waitFor(() => expect(document.querySelector("[data-authoritative-result]")).toHaveTextContent("Approved"));
    const approvedAuthority = await whenCurrentAuthorityIsOpened(user);
    expect(approvedAuthority).toHaveTextContent("Approved, not published");
    expect(approvedAuthority).toHaveTextContent("separately authorise the Catalog write");
    expect(publicationStartRequests).toHaveLength(0);

    // Farida separately starts the durable release operation.
    await whenTheDesignEvidenceSessionChangesTo(user, "Farida");
    await user.click(screen.getByRole("button", { name: "Review publication" }));
    expect(await screen.findByRole("region", { name: "Publication review" })).toBeVisible();
    expect(screen.getByText("This action changes Catalog prices")).toBeVisible();
    const detailReadsBeforePublicationStart = proposalDetailRequests.length;
    await user.click(screen.getByRole("button", { name: "Start publication" }));
    await thenConfirmTheDecision(user, {
      dialogName: "Publish 1,227 prices",
      confirmName: "Start publication",
    });
    expect(publicationStartRequests).toHaveLength(1);
    expect(proposalDetailRequests[detailReadsBeforePublicationStart]).toEqual({
      ref: {
        kind: "resource",
        id: "767fb699-bfb5-56eb-a296-3a0a70c9430a",
        version: "9",
      },
    });

    // An unknown outcome is not success. It must be reconciled before retry.
    const operation = await screen.findByRole("region", { name: "Publication operation" });
    expect(within(operation).getByRole("heading", { name: "Outcome not yet confirmed" })).toBeVisible();
    expect(operation).toHaveTextContent("Do not start another release");
    expect(operation).toHaveTextContent("Unconfirmed");
    expect(within(operation).queryByRole("button", { name: /Retry/i })).not.toBeInTheDocument();
    expect(within(operation).queryByRole("button", { name: /Start publication/i })).not.toBeInTheDocument();
    await user.click(within(operation).getByRole("button", { name: "Check operation status" }));

    // Reconciliation reports the exact incomplete result rather than a generic
    // success state.
    await waitFor(() => {
      const currentOperation = screen.getByRole("region", { name: "Publication operation" });
      expect(within(currentOperation).getByRole("heading", { name: "Publication incomplete" })).toBeVisible();
      expect(currentOperation).toHaveTextContent("1,223");
      expect(currentOperation).toHaveTextContent("4");
      expect(currentOperation).toHaveTextContent("Duplicate writes0");
      expect(currentOperation).toHaveTextContent("4 Catalog writes require a bounded recovery.");
    });
    const recoveryScope = screen.getByText("Recovery scope").closest("section");
    expect(recoveryScope).toHaveTextContent("Only 4 unresolved writes can be retried.");
    expect(recoveryScope).toHaveTextContent("Catalog rows4");
    expect(recoveryScope).toHaveTextContent("Original operation lineage retained");
    expect(recoveryScope).not.toHaveTextContent(/retained dimensions|dimensions retained|retained markets|retained channels/i);

    // The retry confirmation carries the same-operation boundary and advances
    // to an explicit reconciling state before success can be declared.
    await user.click(screen.getByRole("button", { name: "Retry 4 unresolved lines" }));
    const retryDialog = await screen.findByRole("dialog", { name: "Retry 4 unresolved prices" });
    expect(retryDialog).toHaveTextContent("original idempotency key");
    await user.click(within(retryDialog).getByRole("button", { name: "Retry 4 prices" }));
    expect(await screen.findByRole("heading", { name: "Retry is reconciling" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Publication operation" })).toHaveTextContent("Only the 4 unresolved writes");
    expect(publicationRetryRequests).toHaveLength(1);
    expect(publicationRetryRequests[0].idempotencyKey).toBe(publicationStartRequests[0].idempotencyKey);

    await user.click(screen.getByRole("button", { name: "Check reconciled result" }));
    await waitFor(() => {
      const currentOperation = screen.getByRole("region", { name: "Publication operation" });
      expect(within(currentOperation).getByRole("heading", { name: "Published and reconciled" })).toBeVisible();
      expect(currentOperation).toHaveTextContent("1,227");
      expect(currentOperation).toHaveTextContent("Remaining0");
      expect(currentOperation).toHaveTextContent("Duplicate writes0");
    });

    // Moyo can reconstruct the complete evidence ledger; Farida's release
    // session does not gain audit authority implicitly.
    await user.click(screen.getByRole("button", { name: "Back to Proposal" }));
    await whenTheDesignEvidenceSessionChangesTo(user, "Moyo");
    await user.click(screen.getByRole("tab", { name: "Activity 25" }));
    const activity = await screen.findByRole("tabpanel");
    expect(activity).toHaveTextContent("25 sequenced events · 0 gaps");
    expect(within(activity).getAllByRole("listitem")).toHaveLength(25);
  }, 20_000);

  it("Given a blocked Proposal, when protected approval or publication deep links are opened in the wrong state, then both routes fail closed", async () => {
    const { repositories, proposalDetailReads } = createObservedFixtureRepositories();
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });
    await whenTheBlockedProposalIsCreated(user, { proposalDetailReads });

    window.history.pushState(null, "", "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a/review/approval?version=3");
    window.dispatchEvent(new PopStateEvent("popstate"));

    const boundary = await screen.findByRole("alert");
    expect(boundary).toHaveTextContent("This Proposal is not awaiting an independent decision.");
    expect(boundary).toHaveTextContent("Protected review screens only open for a pending exception or submitted Proposal.");
    const approvalPrerequisites = within(boundary).getByLabelText("Authority prerequisites");
    expect(approvalPrerequisites).toHaveTextContent("Exact Proposal version");
    expect(approvalPrerequisites).toHaveTextContent("Policy exceptions reconciled");
    expect(approvalPrerequisites).toHaveTextContent("Independent review state");
    expect(screen.queryByRole("button", { name: "Approve Proposal" })).not.toBeInTheDocument();

    await user.click(within(boundary).getByRole("button", { name: "Return to Proposal" }));
    await screen.findByRole("tablist", { name: "Proposal views" });
    window.history.pushState(null, "", "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a/review/publish?version=3");
    window.dispatchEvent(new PopStateEvent("popstate"));

    const publicationBoundary = await screen.findByRole("alert");
    expect(publicationBoundary).toHaveTextContent("This Proposal is not approved for release.");
    expect(publicationBoundary).toHaveTextContent("Publication is a separate permission");
    const publicationPrerequisites = within(publicationBoundary).getByLabelText("Authority prerequisites");
    expect(publicationPrerequisites).toHaveTextContent("Independent approval recorded");
    expect(publicationPrerequisites).toHaveTextContent("Publication readiness");
    expect(screen.queryByRole("button", { name: "Start publication" })).not.toBeInTheDocument();
  });

  it("Given an exact pending exception, when the generic Proposal approval route is opened, then it cannot substitute for the version-bound exception review", async () => {
    const { repositories, proposalDetailReads } = createObservedFixtureRepositories();
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });
    await whenTheBlockedProposalIsCreated(user, { proposalDetailReads });
    await user.click(within(screen.getByRole("region", { name: "Proposal next step" })).getByRole("button", { name: "Request exception review" }));
    await thenConfirmTheDecision(user, {
      dialogName: "Request bounded exception",
      confirmName: "Request exception",
    });

    window.history.pushState(null, "", "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a/review/approval?version=3");
    window.dispatchEvent(new PopStateEvent("popstate"));

    const boundary = await screen.findByRole("alert");
    expect(boundary).toHaveTextContent("Open the version-bound exception review link before deciding this pending request.");
    expect(screen.queryByRole("region", { name: "Review protected exception" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve exception|Approve Proposal|Deny exception/i })).not.toBeInTheDocument();
  });

  it("Given protected Proposal links omit exact versions, when each route is opened, then reads and actions fail closed", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const getDetail = repositories.proposals.getDetail.bind(repositories.proposals);
    let proposalReads = 0;
    repositories.proposals.getDetail = async (...args) => {
      proposalReads += 1;
      return getDetail(...args);
    };
    const proposalId = "767fb699-bfb5-56eb-a296-3a0a70c9430a";
    const publicationId = "3b93717c-f05f-56d4-9762-646a7e915e1f";
    const cases = [
      {
        hash: `#/proposals/${proposalId}/overrides/override-fixture-01`,
        message: "This protected exception link must identify the exact Proposal and exception versions.",
      },
      {
        hash: `#/proposals/${proposalId}/review/approval`,
        message: "This protected review link must identify the exact Proposal version.",
      },
      {
        hash: `#/proposals/${proposalId}/review/publish`,
        message: "This protected review link must identify the exact Proposal version.",
      },
      {
        hash: `#/proposals/${proposalId}/publications/${publicationId}`,
        message: "This protected publication link must identify the exact Proposal and operation versions.",
      },
      {
        hash: `#/operations/${publicationId}`,
        message: "This protected publication link must identify the exact Proposal and operation versions.",
      },
    ];

    for (const routeCase of cases) {
      window.history.replaceState(null, "", routeCase.hash);
      const { unmount } = render(<WorkspaceApp repositories={repositories} />);
      const boundary = await screen.findByRole("alert");
      expect(boundary).toHaveTextContent(routeCase.message);
      expect(within(boundary).queryByRole("button", { name: "Retry workspace" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Approve|Deny|Start publication|Check operation/i })).not.toBeInTheDocument();
      unmount();
    }

    expect(proposalReads).toBe(0);
  });

  it("Given a filtered repricing view, when its Proposal opens, then governed evidence reloads from the locked source and eligible lines stay policy-clear", async () => {
    const {
      repositories,
      proposalDetailReads,
    } = createObservedFixtureRepositories();
    const getPreview = repositories.repricing.getPreview.bind(repositories.repricing);
    const previewRequests = [];
    repositories.repricing.getPreview = async (request = {}) => {
      previewRequests.push(request);
      return getPreview(request);
    };
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });

    await user.type(screen.getByPlaceholderText("Search SKU or product"), "KLD-PANT-0099");
    await thenTheServerResolvedLineCountIs(1);
    expect(screen.getByRole("button", { name: "Inspect Seasoning mix, Classic, 5 kg" })).toBeVisible();

    await whenTheBlockedProposalIsCreated(user, { proposalDetailReads });

    expect(screen.getByRole("region", { name: "Financial consequence for Cassava flour" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Lines 1,227" }));
    expect(await screen.findByText(/\d+ fixture lines shown/)).toBeVisible();
    const proposalLines = screen.getAllByRole("region", { name: /Financial consequence for/ });
    const eligibleLine = proposalLines.find((line) => line.textContent.includes("KLD-PANT-0001"));
    expect(eligibleLine).toBeTruthy();
    expect(within(eligibleLine).getByText("Policy clear")).toBeVisible();
    expect(eligibleLine).toHaveTextContent("11.61 pp above policy");
    expect(eligibleLine).not.toHaveTextContent("below policy");

    expect(previewRequests.some((request) => request.query === "KLD-PANT-0099")).toBe(true);
    expect(previewRequests.at(-1)).toEqual({
      ref: {
        kind: "fixture-scenario",
        id: "FX-004",
        version: "0.0.0-design.1",
      },
      limit: 25,
    });
  }, 15_000);

  it("Given the Proposal source adapter resolves a different Preview ref, when governed evidence loads, then the Proposal fails closed", async () => {
    const repositories = createFixtureWorkspaceRepositories({ startWithExistingProposal: false });
    const source = await repositories.repricing.getPreview({ limit: 200 });
    const readyPreview = await repairOperationalBlockers(repositories, source.ref, "component-source-mismatch-repair");
    const getPreview = repositories.repricing.getPreview.bind(repositories.repricing);
    repositories.repricing.getPreview = async (request = {}) => {
      const result = await getPreview(request);
      if (request.ref && request.classification == null && request.query == null) {
        return { ...result, ref: { ...result.ref, id: "unexpected-preview-ref" } };
      }
      return result;
    };
    window.history.replaceState(null, "", `#/repricing/${readyPreview.ref.id}/preview?version=${encodeURIComponent(readyPreview.ref.version)}`);
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });

    await user.click(screen.getByRole("button", { name: "Create Proposal" }));
    const dialog = screen.getByRole("dialog", { name: "Create blocked Proposal" });
    await user.click(within(dialog).getByRole("button", { name: "Create blocked Proposal" }));

    const boundary = await screen.findByRole("alert");
    expect(boundary).toHaveTextContent("The resolved Preview does not match this Proposal's locked source evidence.");
    expect(screen.queryByRole("tablist", { name: "Proposal views" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Financial consequence for/ })).not.toBeInTheDocument();
  });

  it("Given a pending bounded exception, when Chika explicitly denies it, then the Proposal stays blocked and the denial is auditable", async () => {
    const {
      repositories,
      proposalDetailReads,
    } = createObservedFixtureRepositories();
    const decideOverride = repositories.proposals.decideOverride.bind(repositories.proposals);
    const decisions = [];
    repositories.proposals.decideOverride = async (request) => {
      decisions.push(request.decision);
      return decideOverride(request);
    };
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });
    await whenTheBlockedProposalIsCreated(user, { proposalDetailReads });
    await user.click(within(screen.getByRole("region", { name: "Proposal next step" })).getByRole("button", { name: "Request exception review" }));
    await thenConfirmTheDecision(user, {
      dialogName: "Request bounded exception",
      confirmName: "Request exception",
    });
    await whenTheDesignEvidenceSessionChangesTo(user, "Chika");
    await user.click(screen.getByRole("button", { name: "Review exception" }));
    const review = await screen.findByRole("region", { name: "Review protected exception" });
    expect(window.location.hash).toBe("#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a/overrides/7ca1b72c-f1b4-5ab4-b5ed-8962c53c6cb2?proposalVersion=3&overrideVersion=1");
    expect(within(review).getByRole("button", { name: "Approve exception" })).toBeVisible();
    await user.click(within(review).getByRole("button", { name: "Deny exception" }));
    await thenConfirmTheDecision(user, {
      dialogName: "Deny bounded exception",
      confirmName: "Deny exception",
    });

    expect(decisions).toEqual(["deny"]);
    await waitFor(() => expect(document.querySelector("[data-authoritative-result]")).toHaveTextContent("Blocked"));
    const population = screen.getByLabelText("Proposal population reconciliation");
    expect(population).toHaveTextContent("Selected1,227");
    expect(population).toHaveTextContent("Policy clear1,210");
    expect(population).toHaveTextContent("Needs review17");
    await user.click(screen.getByText("Review breakdown and version history"));
    expect(screen.getByText("Different actor recorded")).toBeVisible();

    await whenTheDesignEvidenceSessionChangesTo(user, "Moyo");
    await user.click(await screen.findByRole("tab", { name: "Activity 15" }));
    const activity = await screen.findByRole("tabpanel");
    expect(activity).toHaveTextContent("15 sequenced events · 0 gaps");
    expect(activity).toHaveTextContent("override denied");
    expect(activity).toHaveTextContent("all twelve margin lines remained blocked");
  });

  it("Given a session without Proposal read permission, when a versioned review link is opened, then access fails closed before version disclosure", async () => {
    const repositories = createFixtureWorkspaceRepositories({ designEvidenceCapabilities: [] });
    window.history.replaceState(null, "", "#/proposals/767fb699-bfb5-56eb-a296-3a0a70c9430a/review/approval?version=stale-version");

    render(<WorkspaceApp repositories={repositories} />);

    const boundary = await screen.findByRole("alert");
    expect(boundary).toHaveTextContent("The resolved session is not authorised for this action.");
    expect(boundary).not.toHaveTextContent(/stale|changed after it was opened|current version/i);
    expect(screen.queryByRole("tablist", { name: "Proposal views" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Review protected exception|Review the current version/ })).not.toBeInTheDocument();
  });

  it("Given a protected mutation fails, when Teni retries from the same confirmation, then the error stays explicit and the preserved action can complete", async () => {
    const { repositories, proposalDetailReads } = createObservedFixtureRepositories();
    const requestOverride = repositories.proposals.requestOverride.bind(repositories.proposals);
    let requestAttempts = 0;
    repositories.proposals.requestOverride = async (request) => {
      requestAttempts += 1;
      if (requestAttempts === 1) {
        throw new RepositoryError(createDomainErrorEnvelope({
          code: "OVERRIDE_SERVICE_UNAVAILABLE",
          message: "The protected exception could not be recorded yet.",
          retryable: true,
          domain: "override",
          traceId: "bdd-override-temporary-failure",
        }));
      }
      return requestOverride(request);
    };
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });
    await whenTheBlockedProposalIsCreated(user, { proposalDetailReads });
    await user.click(within(screen.getByRole("region", { name: "Proposal next step" })).getByRole("button", { name: "Request exception review" }));

    const dialog = screen.getByRole("dialog", { name: "Request bounded exception" });
    const confirm = within(dialog).getByRole("button", { name: "Request exception" });
    await user.type(within(dialog).getByRole("textbox", { name: "Business reason" }), "Recover the recorded supplier cost before the effective date.");
    await user.type(within(dialog).getByRole("textbox", { name: "Evidence reference" }), "SAMPLE-COST-RECOVERY-RETRY");
    await user.click(confirm);

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The protected exception could not be recorded yet.");
    expect(dialog).toBeVisible();
    expect(confirm).toBeEnabled();
    expect(requestAttempts).toBe(1);

    await user.click(confirm);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Request bounded exception" })).not.toBeInTheDocument());
    await waitFor(() => expect(document.querySelector("[data-authoritative-result]")).toHaveTextContent("Review requested"));
    expect(requestAttempts).toBe(2);
  });

  it("Given Proposal tabs, when keyboard arrows, Home, and End are used, then route, focus, and selected panel stay synchronised", async () => {
    const { repositories, proposalDetailReads } = createObservedFixtureRepositories();
    const { user } = await givenTheRepricingPreviewIsOpen({ repositories });
    await whenTheBlockedProposalIsCreated(user, { proposalDetailReads });
    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();

    await user.keyboard("{ArrowRight}");
    const lines = await screen.findByRole("tab", { name: "Lines 1,227" });
    await waitFor(() => expect(lines).toHaveFocus());
    expect(lines).toHaveAttribute("aria-selected", "true");
    expect(window.location.hash).toContain("view=lines");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Lines 1,227");

    await user.keyboard("{End}");
    const activity = await screen.findByRole("tab", { name: "Activity 0" });
    await waitFor(() => expect(activity).toHaveFocus());
    expect(activity).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Activity 0");

    await user.keyboard("{Home}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus());
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });

  it("Given a protected Proposal action dialog, when it opens and Escape closes it, then focus, inert background, and scrolling are restored", async () => {
    const { repositories, proposalDetailReads } = createObservedFixtureRepositories();
    const { user, container } = await givenTheRepricingPreviewIsOpen({ repositories });
    await whenTheBlockedProposalIsCreated(user, { proposalDetailReads });
    const trigger = within(screen.getByRole("region", { name: "Proposal next step" })).getByRole("button", { name: "Request exception review" });
    expect(screen.queryByRole("complementary", { name: "Current authority" })).not.toBeInTheDocument();

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Request bounded exception" });
    expect(within(dialog).getByRole("button", { name: "Close confirmation" })).toHaveFocus();
    expect(container.querySelector(".workspace-app")).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Request bounded exception" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(container.querySelector(".workspace-app")).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });
});
