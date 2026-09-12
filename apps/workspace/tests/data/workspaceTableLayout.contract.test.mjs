import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const readSource = (file) => readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8");

// Structural regression guards, not a CSS rendering engine. These contracts keep
// the paired layout rules intact; browser screenshots and measured bounds remain
// the evidence for real alignment, font metrics and clipping at each viewport.
function rules(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const stack = [];
  const result = [];
  let cursor = 0;
  for (const token of source.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}]/g)) {
    if (token[0] === "{") {
      stack.push({ selector: source.slice(cursor, token.index).trim(), start: token.index + 1 });
      cursor = token.index + 1;
    } else if (token[0] === "}") {
      const block = stack.pop();
      if (block && !block.selector.startsWith("@")) {
        result.push({
          selectors: block.selector.split(",").map((selector) => selector.trim()),
          contexts: stack.map((parent) => parent.selector),
          values: Object.fromEntries([...source.slice(block.start, token.index).matchAll(/([\w-]+)\s*:\s*([^;{}]+);?/g)].map(([, key, value]) => [key, value.trim()])),
        });
      }
      cursor = token.index + 1;
    }
  }
  return result;
}

const parsed = new Map();
function declarations(file, selector, context = null) {
  if (!parsed.has(file)) parsed.set(file, rules(readSource(file)));
  return Object.assign({}, ...parsed.get(file).filter((rule) => rule.selectors.includes(selector)
    && (context ? rule.contexts.includes(context) : rule.contexts.length === 0)).map((rule) => rule.values));
}
const inlineInset = (style) => style["padding-inline"] ?? style.padding?.split(/\s+/)[1];
const gridTracks = (style) => style["grid-template-columns"].match(/minmax\([^)]*\)|[^\s]+/g);
function minmaxTrack(track) {
  const match = track.match(/^minmax\(\s*([\d.]+)px\s*,\s*([\d.]+)(px|fr)\s*\)$/);
  assert.ok(match, `${track} must explicitly preserve the reviewed minimum and growth limit`);
  return { min: Number(match[1]), max: Number(match[2]), unit: match[3] };
}

test("Given the imported styles, table typography, insets and named densities have one shared token definition", () => {
  const expected = {
    "--table-text-primary": "14px", "--table-line-primary": "20px",
    "--table-text-secondary": "12px", "--table-line-secondary": "18px",
    "--table-text-heading": "12px", "--table-line-heading": "16px",
    "--table-inset": "20px", "--table-inset-mobile": "16px",
    "--table-cell-gap": "16px", "--table-text-gap": "2px",
    "--table-row-data": "64px", "--table-row-workflow": "80px",
  };
  const tokens = declarations("workspace-tokens.css", ":root");
  const importedStyles = [...readSource("main.jsx").matchAll(/import "\.\/([^"\n]+\.css)"/g)].map(([, file]) => readSource(file)).join("\n");
  for (const [token, value] of Object.entries(expected)) {
    assert.equal(tokens[token], value, `${token} must use the reviewed shared scale`);
    assert.equal([...importedStyles.matchAll(new RegExp(`${token}\\s*:`, "g"))].length, 1, `${token} must not gain screen-specific redefinitions`);
  }
});

test("Given desktop Proposal, Policy and Mapping ledgers, paired headers and rows share their column tracks and inline inset", () => {
  for (const [headSelector, rowSelector] of [
    [".proposal-list__head", ".proposal-list > button"],
    [".rules-list__head", ".rules-list > button"],
    [".mapping-head", ".mapping-table > div:not(.mapping-head)"],
  ]) {
    const head = declarations("platform.css", headSelector);
    const row = declarations("platform.css", rowSelector);
    assert.ok(head["grid-template-columns"], `${headSelector} needs explicit paired tracks`);
    assert.equal(head["grid-template-columns"], row["grid-template-columns"]);
    assert.equal(head["min-width"], row["min-width"]);
    assert.equal(inlineInset(head), "var(--table-inset)", `${headSelector} must align with body content`);
    assert.equal(inlineInset(row), "var(--table-inset)", `${rowSelector} must align with its header`);
    assert.equal(inlineInset(declarations("workspace-premium-system.css", rowSelector)), "var(--table-inset)", "Composition styles must preserve the same body inset");
  }
});

test("Given the compact Catalog, the desktop header and rows keep one inset and one track definition", () => {
  const context = "@media (min-width: 1101px)";
  const head = declarations("catalog-record.css", ".catalog-split-surface.catalog-ledger-compact .catalog-header", context);
  const row = declarations("catalog-record.css", ".catalog-split-surface.catalog-ledger-compact .catalog-list > button", context);
  assert.equal(head["grid-template-columns"], row["grid-template-columns"]);
  assert.equal(head["padding-inline"], "var(--table-inset)");
  assert.equal(head["padding-inline"], row["padding-inline"]);
  assert.equal(head["column-gap"], row["column-gap"]);
});

test("Given right-aligned financial values, the Policy Floor and Catalog price headings align to the same edge", () => {
  assert.equal(declarations("platform.css", ".rules-list__head > span:nth-child(3)")["text-align"], "right");
  assert.equal(declarations("workspace-flow-polish.css", ".rule-floor")["text-align"], "right");
  const context = "@media (min-width: 1101px)";
  assert.equal(declarations("catalog-record.css", ".catalog-ledger-compact .catalog-ledger-price-heading", context)["text-align"], "right");
  assert.equal(declarations("catalog-record.css", ".catalog-ledger-compact .catalog-list > button > .catalog-money", context)["text-align"], "right");
});

test("Given short Policy precedence labels, the track is capped while financial and metadata columns retain useful space", () => {
  const row = declarations("platform.css", ".rules-list > button");
  const tracks = gridTracks(row);
  assert.equal(tracks.length, 6);
  const precedence = minmaxTrack(tracks[1]);
  assert.equal(precedence.unit, "px", "Precedence must not absorb a full fraction for a short category label");
  assert.ok(precedence.min >= 104 && precedence.max <= 160, "Precedence retains a readable but bounded width");
  for (const [index, minimum] of [[2, 88], [3, 116], [4, 72]]) {
    const track = minmaxTrack(tracks[index]);
    assert.ok(track.min >= minimum, `Policy column ${index + 1} needs its content allowance`);
    assert.equal(track.unit, "fr", "Available width must also reach the financial and metadata group");
    assert.ok(track.max > 0);
  }
});

test("Given a desktop right-aligned amount followed by metadata, both ledgers reserve a paired 48px optical gutter", () => {
  const context = "@media (min-width: 1101px)";
  for (const [file, head, row, headCell, bodyCell, trackContext] of [
    ["platform.css", ".rules-list__head", ".rules-list > button", ".rules-list__head > span:nth-child(4)", ".rules-list > button > span:nth-child(4)", null],
    ["catalog-record.css", ".catalog-split-surface.catalog-ledger-compact .catalog-header", ".catalog-split-surface.catalog-ledger-compact .catalog-list > button", ".catalog-ledger-compact .catalog-ledger-status-heading", ".catalog-ledger-compact .catalog-list > button > span.catalog-ledger-status", context],
  ]) {
    const headingGap = declarations(file, head, trackContext)["column-gap"];
    const bodyGap = declarations(file, row, trackContext)["column-gap"];
    const headingInset = declarations(file, headCell, context)["padding-inline-start"];
    const bodyInset = declarations(file, bodyCell, context)["padding-inline-start"];
    assert.equal(headingGap, "24px");
    assert.equal(bodyGap, headingGap);
    assert.equal(headingInset, "24px");
    assert.equal(bodyInset, headingInset, "Moving the heading alone would recreate the original alignment defect");
    assert.equal(parseFloat(bodyGap) + parseFloat(bodyInset), 48);
  }
});

test("Given the compact Catalog, scope and status have content-weighted flexible tracks rather than leftover slivers", () => {
  const context = "@media (min-width: 1101px)";
  const row = declarations("catalog-record.css", ".catalog-split-surface.catalog-ledger-compact .catalog-list > button", context);
  const tracks = gridTracks(row);
  assert.equal(tracks.length, 5);
  for (const [index, minimum] of [[0, 200], [1, 160], [2, 136], [3, 128]]) {
    const track = minmaxTrack(tracks[index]);
    assert.ok(track.min >= minimum, `Catalog column ${index + 1} must retain its reviewed content allowance`);
    assert.equal(track.unit, "fr");
    assert.ok(track.max > 0);
  }
});

test("Given mobile cards, the extra financial-to-metadata inset stays confined to desktop ledger rules", () => {
  const targets = new Set([
    ".rules-list__head > span:nth-child(4)",
    ".rules-list > button > span:nth-child(4)",
    ".catalog-ledger-compact .catalog-ledger-status-heading",
    ".catalog-ledger-compact .catalog-list > button > span.catalog-ledger-status",
  ]);
  const importedFiles = [...readSource("main.jsx").matchAll(/import "\.\/([^"\n]+\.css)"/g)].map(([, file]) => file);
  let insetDeclarations = 0;
  for (const file of importedFiles) {
    for (const rule of rules(readSource(file))) {
      if (!rule.selectors.some((selector) => targets.has(selector))) continue;
      for (const property of ["padding-inline-start", "padding-left"]) {
        const value = rule.values[property];
        if (value == null || /^0(?:px)?$/.test(value)) continue;
        insetDeclarations += 1;
        assert.ok(rule.contexts.includes("@media (min-width: 1101px)"), `${file}: ${property} must not indent mobile card labels or status`);
      }
    }
  }
  assert.ok(insetDeclarations >= 2, "Both ledgers must declare the reviewed desktop-only gutter");
});

test("Given a desktop ledger narrower than its tracks, overflow belongs to the ledger rather than hidden surface clipping", () => {
  for (const selector of [".proposal-list", ".rules-list", ".queue-list"]) {
    const style = declarations("platform.css", selector);
    assert.equal(style["min-width"], "0", `${selector} must be able to shrink inside the surface`);
    assert.equal(style["overflow-x"], "auto", `${selector} needs its own fallback scrolling at every desktop width`);
  }
  const queue = declarations("platform.css", ".queue-row");
  assert.equal(queue.width, "100%");
  assert.equal(inlineInset(queue), "var(--table-inset)", "Work rows retain a trailing content gutter");
});

test("Given mobile policy evidence, paired cells start on one grid line with equal label rhythm and a shared mobile inset", () => {
  const context = "@media (max-width: 520px)";
  const file = "workspace-flow-polish.css";
  const row = declarations(file, ".rules-list > button", context);
  assert.equal(row["align-items"], "start", "Different text heights must not vertically centre and stagger the dividers");
  assert.equal(row.padding, "var(--table-inset-mobile)");
  const scope = declarations(file, ".rules-list > button > span:nth-child(2)", context);
  const floor = declarations(file, ".rules-list > button > strong", context);
  assert.equal(scope["grid-row"], "2");
  assert.equal(floor["grid-row"], scope["grid-row"]);
  const scopeLabel = declarations(file, ".rules-list > button > span:nth-child(2)::before", context);
  const floorLabel = declarations(file, ".rules-list > button > strong::before", context);
  assert.equal(scopeLabel.content, '"Precedence"');
  assert.equal(floorLabel.content, '"Floor"');
  assert.equal(scopeLabel["line-height"], "var(--table-line-heading)");
  assert.equal(floorLabel["line-height"], scopeLabel["line-height"]);
});
