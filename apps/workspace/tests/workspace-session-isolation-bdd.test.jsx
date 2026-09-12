import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it } from "vitest";
import { WorkspaceApp } from "../src/WorkspaceApp.jsx";
import { createFixtureWorkspaceRepositories } from "../src/data/index.js";
import { workspaceHash } from "../src/workspaceRouting.js";
import { shortActorName } from "../src/workspacePresenter.js";

beforeEach(() => window.sessionStorage.clear());

it("Given pending privileged evidence, switching to Contributor discards the old session response", async () => {
  const repositories = createFixtureWorkspaceRepositories();
  const proposal = await repositories.proposals.getDetail();
  const actors = await repositories.identity.listDesignEvidenceActors();
  const contributor = actors.find((session) => session.roleCodes.includes("pricing_contributor"));
  window.history.replaceState(null, "", workspaceHash({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "overview" }));

  let release;
  let evidencePending = false;
  const pending = new Promise((resolve) => { release = resolve; });
  const getPreview = repositories.repricing.getPreview.bind(repositories.repricing);
  repositories.repricing.getPreview = async (...args) => {
    const result = await getPreview(...args);
    evidencePending = true;
    await pending;
    return result;
  };

  const user = userEvent.setup();
  render(<WorkspaceApp repositories={repositories} />);
  await waitFor(() => expect(evidencePending).toBe(true));
  await user.click(screen.getByRole("button", { name: "Open session identity details" }));
  const identity = screen.getByRole("region", { name: "Session identity" });
  await user.click(within(identity).getByText("Preview another role"));
  await user.click(within(identity).getByRole("button", { name: new RegExp(shortActorName(contributor.actor.displayName)) }));
  await screen.findByRole("heading", { name: "Pricing requests" });

  await act(async () => { release(); await pending; });
  await waitFor(() => expect(screen.getByRole("button", { name: "Open session identity details" })).toHaveTextContent(shortActorName(contributor.actor.displayName)));
  expect(screen.queryByText(proposal.title)).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Pricing requests" })).toBeInTheDocument();
  expect((await repositories.identity.getSession()).actor.id).toBe(contributor.actor.id);
});

it("Given an external logout redirect is delayed, protected Catalog content clears before leaving the page", async () => {
  window.history.replaceState(null, "", "#/catalog");
  const repositories = createFixtureWorkspaceRepositories();
  const destinations = [];
  const user = userEvent.setup();
  render(<WorkspaceApp repositories={repositories} navigateExternal={(url) => destinations.push(url)} />);
  await screen.findByRole("region", { name: "Catalog" });
  await user.click(screen.getByRole("button", { name: "Open session identity details" }));
  await user.click(within(screen.getByRole("region", { name: "Session identity" })).getByRole("button", { name: "Sign out" }));

  await waitFor(() => expect(destinations).toHaveLength(1));
  expect(screen.queryByRole("region", { name: "Catalog" })).not.toBeInTheDocument();
  expect(screen.queryByText("Cassava flour")).not.toBeInTheDocument();
});
