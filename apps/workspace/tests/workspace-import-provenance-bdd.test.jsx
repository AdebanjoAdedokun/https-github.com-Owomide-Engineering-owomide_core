import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperationalWorkspace } from "../src/OperationalWorkspace.jsx";
import { createFixtureWorkspaceRepositories } from "../src/data/index.js";
import { FIXTURE_ACTOR_IDS } from "../src/data/fixtures/proposalJourneyV0.js";

async function prepareManagerImport() {
  const repositories = createFixtureWorkspaceRepositories();
  const manager = await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.manager);
  const created = await repositories.imports.create({ intent: "cost-update", idempotencyKey: "import-owner-create-001" });
  const uploaded = await repositories.imports.upload({ batchRef: created.data.ref, sourceFile: { name: "supplier-costs.csv", format: "CSV", rows: 80, isSynthetic: true }, idempotencyKey: "import-owner-upload-001" });
  const profiled = await repositories.imports.profile({ batchRef: uploaded.data.ref, idempotencyKey: "import-owner-profile-001" });
  const mapped = await repositories.imports.saveMapping({ batchRef: profiled.data.ref, mapping: { tradeCostTarget: "cost.amountMinor", priceTarget: "price.amountMinor", effectiveAt: "2026-08-15T00:00:00+01:00" }, idempotencyKey: "import-owner-map-001" });
  const reviewed = await repositories.imports.validate({ batchRef: mapped.data.ref, idempotencyKey: "import-owner-validate-001" });
  return { repositories, manager, reviewed: reviewed.data };
}

function renderReview({ repositories, session, journey }) {
  return render(<OperationalWorkspace route={{ surface: "import-review", resourceId: journey.ref.id, resourceVersion: journey.ref.version, view: "review" }} repositories={repositories} session={session} onNavigate={vi.fn()} />);
}

describe("Import preparer provenance", () => {
  it("Given a manager-created import, when an analyst opens its review, then the batch owner remains the manager in both review and ledger", async () => {
    const { repositories, manager, reviewed } = await prepareManagerImport();
    expect(reviewed.owner).toEqual(manager.actor);
    const analyst = await repositories.identity.selectDesignEvidenceActor(FIXTURE_ACTOR_IDS.teni);
    const ledger = await repositories.imports.list();
    expect(ledger.items.find((item) => item.ref.id === reviewed.ref.id).owner).toEqual(manager.actor);
    renderReview({ repositories, session: analyst, journey: reviewed });
    const review = await screen.findByRole("region", { name: "Import review" });
    const preparer = within(review).getByText("Prepared by").closest("div");
    expect(preparer).toHaveTextContent(manager.actor.displayName);
    expect(preparer).not.toHaveTextContent(analyst.actor.displayName);
  });

  it("Given the import has no preparer provenance, when its review opens, then no actor is invented", async () => {
    const { repositories, manager, reviewed } = await prepareManagerImport();
    const readJourney = repositories.imports.getJourney.bind(repositories.imports);
    repositories.imports.getJourney = async (request) => ({ ...await readJourney(request), owner: null });
    renderReview({ repositories, session: manager, journey: reviewed });
    const review = await screen.findByRole("region", { name: "Import review" });
    const preparer = within(review).getByText("Prepared by").closest("div");
    expect(preparer).toHaveTextContent("Preparer unavailable");
    expect(preparer).not.toHaveTextContent(manager.actor.displayName);
    expect(preparer).not.toHaveTextContent("Teni");
  });
});
