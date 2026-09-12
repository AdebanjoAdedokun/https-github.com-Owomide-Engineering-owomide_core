import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OperationalWorkspace } from "../src/OperationalWorkspace.jsx";
import { FIXTURE_CATALOG_SAMPLE, createFixtureWorkspaceRepositories } from "../src/data/index.js";
import { formatEffectiveAt, formatRecordedAt } from "../src/workspacePresenter.js";

async function openRecord(summary = FIXTURE_CATALOG_SAMPLE[0]) {
  const repositories = createFixtureWorkspaceRepositories();
  const session = await repositories.identity.getSession();
  repositories.catalog.getDetail = vi.fn().mockResolvedValue({ kind: "catalog-sku-detail", summary });
  const onNavigate = vi.fn();
  const rendered = render(<OperationalWorkspace route={{ surface: "catalog-detail", resourceId: summary.id, view: "detail" }} repositories={repositories} session={session} onNavigate={onNavigate} />);
  await screen.findByRole("region", { name: "Price and cost record" });
  return { ...rendered, user: userEvent.setup(), onNavigate };
}

describe("Catalog full record", () => {
  it("Given the compact catalog ledger, when a row is opened, then source is absent from scanning rows but complete in the inspector", async () => {
    const repositories = createFixtureWorkspaceRepositories();
    const session = await repositories.identity.getSession();
    const onNavigate = vi.fn();
    render(<OperationalWorkspace route={{ surface: "catalog", view: "list" }} repositories={repositories} session={session} onNavigate={onNavigate} />);
    const catalog = await screen.findByRole("region", { name: "Catalog" });
    const row = catalog.querySelector(".catalog-list > button");
    const summary = FIXTURE_CATALOG_SAMPLE.find((item) => row.textContent.includes(item.merchantSku));
    expect(catalog).toHaveClass("catalog-ledger-compact");
    expect(row.querySelector(".catalog-source")).toBeNull();
    expect(row).not.toHaveTextContent("Catalog baseline");
    expect(row.querySelector(".catalog-ledger-status")).toBeVisible();
    expect(row.querySelector(".catalog-money")).toHaveTextContent("Cost");
    const user = userEvent.setup();
    await user.click(row);
    const inspector = screen.getByRole("complementary", { name: `Catalog detail for ${summary.product.name}` });
    expect(inspector).toHaveTextContent(`${summary.source.fileName} · row ${summary.source.rowNumber}`);
    expect(inspector).toHaveTextContent(summary.merchantSku);
    await user.click(within(inspector).getByRole("button", { name: "Open full record" }));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ surface: "catalog-detail", resourceId: summary.id, view: "detail" });
  });

  it("Given a priced catalog record, when the full record opens, then complete effective and recorded dates are ordinary metadata separate from money", async () => {
    const summary = FIXTURE_CATALOG_SAMPLE.find((item) => item.currentPrice && item.source?.importedAt);
    const { container } = await openRecord(summary);
    expect(screen.getByRole("heading", { name: summary.product.name, level: 1 })).toBeVisible();
    expect(screen.getByText(summary.product.variant)).toBeVisible();
    expect(screen.getByText(`SKU code ${summary.merchantSku}`)).toBeVisible();
    const pricing = screen.getByRole("region", { name: "Price and cost record" });
    const dates = pricing.querySelector(".catalog-record-dates");
    const [effective, recorded] = dates.querySelectorAll("time");
    expect(effective).toHaveAttribute("datetime", summary.effectiveAt);
    expect(effective).toHaveTextContent(formatEffectiveAt(summary.effectiveAt));
    expect(recorded).toHaveAttribute("datetime", summary.source.importedAt);
    expect(recorded).toHaveTextContent(formatRecordedAt(summary.source.importedAt));
    expect(pricing.querySelector(".catalog-record-amounts").children).toHaveLength(2);
    expect(container.querySelector(".record-money, .record-note, .record-layout")).toBeNull();
    expect(screen.getByText("This record is read-only. Price changes go through repricing and approval.")).toBeVisible();
  });

  it("Given long source and alias identifiers, when the record opens, then no evidence is shortened or replaced with invented trust labels", async () => {
    const baseline = FIXTURE_CATALOG_SAMPLE[0];
    const sourceFile = "regional_supplier_cost_ledger_reconciled_for_september_2026_company_catalogue.csv";
    const alias = "SUPPLIER-REFERENCE-0000123456789012345678901234567890";
    const summary = {
      ...baseline,
      source: { ...baseline.source, fileName: sourceFile, rowNumber: 42 },
      identifiers: [
        { namespace: "Merchant SKU", value: baseline.merchantSku, primary: true },
        { namespace: "Supplier reference", value: alias, primary: false },
      ],
    };
    await openRecord(summary);
    const evidence = screen.getByRole("region", { name: "Record evidence" });
    expect(within(evidence).getByText(`${sourceFile} · row 42`)).toBeVisible();
    expect(within(evidence).getByText(alias)).toBeVisible();
    expect(within(evidence).getByText(baseline.merchantSku)).toBeVisible();
    expect(within(evidence).getByText("Primary")).toBeVisible();
    expect(within(evidence).getByText("Alias")).toBeVisible();
    expect(within(evidence).getByText(summary.channel.name)).toBeVisible();
    expect(within(evidence).getByText(summary.location.name)).toBeVisible();
    expect(within(evidence).queryByText("Trusted")).not.toBeInTheDocument();
  });

  it("Given a record without a current price, when opened, then price and effective-date absence remain explicit rather than becoming zero", async () => {
    const summary = FIXTURE_CATALOG_SAMPLE.find((item) => !item.currentPrice);
    await openRecord(summary);
    expect(screen.getByText("Price missing")).toBeVisible();
    const pricing = screen.getByRole("region", { name: "Price and cost record" });
    expect(within(pricing).getByText("No current price effective date")).toBeVisible();
    expect(pricing.querySelector(".catalog-record-amounts dd.is-unavailable")).toHaveTextContent("Unavailable");
    expect(pricing).not.toHaveTextContent("₦0.00");
  });

  it("Given a full record, when Catalog back is selected, then the user returns to the list without a write", async () => {
    const { user, onNavigate } = await openRecord();
    await user.click(screen.getByRole("button", { name: "Catalog", exact: true }));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ surface: "catalog", view: "list" });
  });
});
