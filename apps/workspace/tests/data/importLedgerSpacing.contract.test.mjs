import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// These source contracts protect the paired layout and responsive intent.
// Browser measurements, not these tests, establish the visible content gaps.
function rules(file) {
  const source = readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const stack = [];
  const result = [];
  let cursor = 0;
  for (const token of source.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}]/g)) {
    if (token[0] === "{") {
      stack.push({ selector: source.slice(cursor, token.index).trim(), start: token.index + 1 });
      cursor = token.index + 1;
    } else if (token[0] === "}") {
      const block = stack.pop();
      if (block && !block.selector.startsWith("@")) result.push({
        selectors: block.selector.split(",").map((selector) => selector.trim()),
        contexts: stack.map((parent) => parent.selector),
        values: Object.fromEntries([...source.slice(block.start, token.index).matchAll(/([\w-]+)\s*:\s*([^;{}]+);?/g)].map(([, key, value]) => [key, value.trim()])),
      });
      cursor = token.index + 1;
    }
  }
  return result;
}

const platform = rules("platform.css");
const composition = rules("workspace-premium-system.css");
function declarations(source, selector, context = null) {
  return Object.assign({}, ...source.filter((rule) => rule.selectors.includes(selector)
    && (context ? rule.contexts.includes(context) : rule.contexts.length === 0)).map((rule) => rule.values));
}

test("Given an Import ledger, Progress and accounting retain shared content-weighted tracks and a visible gutter", () => {
  const head = declarations(platform, ".import-ledger__head");
  const row = declarations(platform, ".import-ledger > button");
  assert.equal(head["grid-template-columns"], row["grid-template-columns"]);
  assert.equal(head["min-width"], "1000px");
  assert.equal(row["min-width"], head["min-width"]);
  assert.equal(head.gap, "24px");
  assert.equal(row.gap, head.gap);
  const tracks = row["grid-template-columns"].match(/minmax\([^)]*\)|[^\s]+/g);
  assert.equal(tracks.length, 6);
  assert.equal(tracks[0], "minmax(240px, 1fr)", "The file, not short accounting labels, takes the available space");
  assert.equal(tracks[1], "160px", "Progress must fit its longest current label without squeezing its icon");
  assert.equal(tracks[2], "minmax(200px, 240px)", "Accounting stays readable without absorbing a whole flexible fraction");
  assert.equal(declarations(composition, ".import-ledger > button")["column-gap"], undefined,
    "Later shared styles must not reduce only the body's paired gutter");
});

test("Given an Import progress badge, its width follows content and its icon does not shrink", () => {
  const badge = declarations(platform, ".import-ledger > button > .ops-status");
  assert.equal(badge.width, "max-content");
  assert.equal(badge["max-width"], "100%");
  assert.equal(badge["justify-self"], "start");
  assert.equal(declarations(platform, ".import-ledger > button > .ops-status svg").flex, "0 0 14px");
});

test("Given long source filenames, Import rows wrap the full value instead of clipping the source", () => {
  const filename = declarations(platform, ".import-file small");
  assert.equal(filename["overflow-wrap"], "anywhere");
  assert.notEqual(filename["text-overflow"], "ellipsis");
  assert.notEqual(filename["white-space"], "nowrap");
  assert.equal(declarations(platform, ".import-ledger")["overflow-x"], "auto");
});

test("Given a tablet or phone, Import rows retain their dedicated card areas and mobile spacing", () => {
  const context = "@media (max-width: 1100px)";
  const row = declarations(composition, ".import-ledger > button", context);
  assert.equal(declarations(platform, ".import-ledger > button", context)["min-width"], "0");
  assert.equal(row["grid-template-columns"], "minmax(0, 1fr) max-content");
  assert.equal(row["grid-template-areas"].replace(/\s+/g, " "), '"file file" "counts status" "owner updated"');
  assert.equal(row.gap, "var(--space-4)");
  const badge = declarations(composition, ".import-ledger > button > .ops-status", context);
  assert.equal(badge["grid-area"], "status");
  assert.equal(badge["justify-self"], "end");
});
