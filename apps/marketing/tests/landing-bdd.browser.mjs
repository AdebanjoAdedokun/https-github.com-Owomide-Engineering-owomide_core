/**
 * Browser-level BDD for the compact Full Pricing System spine.
 *
 * Run this with the product's Browser tab and viewport capability. Geometry is
 * intentionally read from rendered boxes so font metrics cannot silently move
 * the numeral off the icon's optical centre.
 */

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function runLandingProcessSpineBrowserBdd({
  tab,
  viewport,
  baseUrl = "http://127.0.0.1:4173/",
  tolerancePx = 1,
}) {
  const results = [];

  try {
    for (const size of [
      { width: 390, height: 844 },
      { width: 320, height: 720 },
    ]) {
      await viewport.set(size);
      const currentUrl = await tab.url();
      if (currentUrl === baseUrl) await tab.reload();
      else await tab.goto(baseUrl);
      await tab.playwright.waitForLoadState({ state: "load", timeoutMs: 10_000 });
      await tab.playwright.getByRole("heading", { name: "One spine from evidence to outcome." }).waitFor({ state: "visible", timeoutMs: 10_000 });

      const measured = await tab.playwright.evaluate(() => {
        const rows = [...document.querySelectorAll(".system-spine > li")];
        if (rows.length !== 4) throw new Error(`Expected four pricing-system rows, received ${rows.length}`);
        const box = (element) => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height, centerY: rect.top + rect.height / 2 };
        };
        return {
          rows: rows.map((row) => {
            const number = row.querySelector(".system-ledger__number");
            const icon = row.querySelector(".system-ledger__icon");
            if (!number || !icon) throw new Error("A pricing-system row lost its numeral or icon");
            return { number: box(number), icon: box(icon) };
          }),
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
        };
      });

      const numberLeft = measured.rows[0].number.left;
      const iconLeft = measured.rows[0].icon.left;
      measured.rows.forEach((row, index) => {
        const centreDelta = Math.abs(row.number.centerY - row.icon.centerY);
        assert(centreDelta <= tolerancePx, `Row ${index + 1} numeral/icon centres differ by ${centreDelta.toFixed(2)}px at ${size.width}px`);
        assert(Math.abs(row.number.left - numberLeft) <= tolerancePx, `Row ${index + 1} numeral left edge drifted at ${size.width}px`);
        assert(Math.abs(row.icon.left - iconLeft) <= tolerancePx, `Row ${index + 1} icon left edge drifted at ${size.width}px`);
      });
      assert(measured.overflow <= 0, `Landing page overflowed by ${measured.overflow}px at ${size.width}px`);

      results.push({
        size,
        centreDeltas: measured.rows.map((row) => Math.abs(row.number.centerY - row.icon.centerY)),
        overflow: measured.overflow,
      });
    }
  } finally {
    await viewport.reset();
  }

  return { passed: results.length, failed: 0, results };
}

/**
 * Rendered clearance regression for governance phase detail. Every phase uses
 * one invariant mobile lead row, preserving breathing room before the lineage
 * divider while the fixed card and desktop stay put.
 */
export async function runGovernancePhaseDetailClearanceBrowserBdd({
  tab,
  viewport,
  baseUrl = "http://127.0.0.1:4173/#governance",
  minimumEntryClearancePx = 8,
  minimumSettledClearancePx = 15,
  entryTranslatePx = 7,
  tolerancePx = 1,
}) {
  const results = [];

  const ensureGovernanceVisible = async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const visibility = await tab.playwright.evaluate(() => {
        const film = document.querySelector(".governance-film");
        if (!film) throw new Error("Governance film is missing");
        const rect = film.getBoundingClientRect();
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        return {
          ratio: rect.height > 0 ? visibleHeight / rect.height : 0,
          scrollDelta: rect.top + rect.height / 2 - window.innerHeight / 2,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      });
      if (visibility.ratio >= 0.4) return;
      await tab.cua.scroll({
        x: Math.round(visibility.viewportWidth / 2),
        y: Math.round(visibility.viewportHeight / 2),
        scrollX: 0,
        scrollY: Math.round(Math.max(-500, Math.min(500, visibility.scrollDelta))),
      });
      await tab.playwright.waitForTimeout(120);
    }
    throw new Error("Governance film could not reach its visibility activation threshold");
  };

  const openGovernance = async () => {
    const currentUrl = await tab.url();
    if (currentUrl === baseUrl) await tab.reload();
    else await tab.goto(baseUrl);
    await tab.playwright.waitForLoadState({ state: "load", timeoutMs: 10_000 });
    await tab.playwright.getByRole("heading", { name: /The decision moves/ }).waitFor({ state: "visible", timeoutMs: 10_000 });
    await ensureGovernanceVisible();
  };

  const waitForPhase = async (phase) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const className = await tab.playwright.locator(".proposal-journey-card").getAttribute("class");
      if (className?.includes(`proposal-journey-card--${phase}`)) return;
      await tab.playwright.waitForTimeout(100);
    }
    throw new Error(`Governance film did not reach its ${phase} phase`);
  };

  const measure = async () => tab.playwright.evaluate(() => {
    const card = document.querySelector(".proposal-journey-card");
    const continuity = card?.querySelector(".proposal-continuity");
    const detail = continuity?.querySelector(".proposal-continuity__lead.is-active p");
    const lineage = continuity?.querySelector(".proposal-lineage");
    if (!card || !continuity || !detail || !lineage) throw new Error("Active governance phase detail or lineage divider is missing");
    const cardRect = card.getBoundingClientRect();
    const detailRect = detail.getBoundingClientRect();
    const lineageRect = lineage.getBoundingClientRect();
    const firstTrack = Number.parseFloat(getComputedStyle(continuity).gridTemplateRows);
    return {
      cardHeight: cardRect.height,
      firstTrack,
      clearance: lineageRect.top - detailRect.bottom,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
    };
  });

  try {
    await viewport.set({ width: 1440, height: 900 });
    await openGovernance();
    const desktop = await measure();
    assert(Math.abs(desktop.firstTrack - 66) <= tolerancePx, `Desktop governance lead row moved to ${desktop.firstTrack.toFixed(2)}px`);
    assert(desktop.overflow <= 0, `Landing page overflowed by ${desktop.overflow}px at 1440px`);
    results.push({ width: 1440, phase: "desktop", ...desktop });

    for (const size of [
      { width: 390, height: 844 },
      { width: 320, height: 720 },
    ]) {
      await viewport.set(size);
      await openGovernance();
      for (const phase of ["draft", "submitted", "approved", "authorised", "verified"]) {
        await waitForPhase(phase);
        const observedEntry = await measure();
        await tab.playwright.waitForTimeout(800);
        const settled = await measure();
        const modelledEntryClearance = settled.clearance - entryTranslatePx;
        assert(Math.abs(settled.firstTrack - 96) <= tolerancePx, `${phase} lead row was ${settled.firstTrack.toFixed(2)}px at ${size.width}px`);
        assert(Math.abs(settled.cardHeight - 598) <= tolerancePx, `${phase} card height moved to ${settled.cardHeight.toFixed(2)}px at ${size.width}px`);
        assert(modelledEntryClearance >= minimumEntryClearancePx, `${phase} modelled entry clearance was only ${modelledEntryClearance.toFixed(2)}px at ${size.width}px`);
        assert(settled.clearance >= minimumSettledClearancePx, `${phase} settled detail retained only ${settled.clearance.toFixed(2)}px before the lineage divider at ${size.width}px`);
        assert(settled.overflow <= 0, `Landing page overflowed by ${settled.overflow}px at ${size.width}px`);
        results.push({ width: size.width, phase, observedEntryClearance: observedEntry.clearance, modelledEntryClearance, settledClearance: settled.clearance, cardHeight: settled.cardHeight, overflow: settled.overflow });
      }
    }
  } finally {
    await viewport.reset();
  }

  return { passed: results.length, failed: 0, results };
}
