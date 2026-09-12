import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Source-level safeguards only. CSS layout, native wheel scrolling, disclosure
// expansion and final-field reachability also require the real-browser checks.
const css = readFileSync(new URL("../../src/workspace.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function declarations(selector, context = null) {
  const stack = [];
  const matches = [];
  let cursor = 0;
  for (const token of css.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}]/g)) {
    if (token[0] === "{") {
      stack.push({ selector: css.slice(cursor, token.index).trim(), start: token.index + 1 });
      cursor = token.index + 1;
    } else if (token[0] === "}") {
      const block = stack.pop();
      if (block?.selector.split(",").map((item) => item.trim()).includes(selector)
        && (context ? stack.some((parent) => parent.selector === context) : stack.length === 0)) {
        matches.push(Object.fromEntries([...css.slice(block.start, token.index).matchAll(/([\w-]+)\s*:\s*([^;{}]+);?/g)]
          .map(([, key, value]) => [key, value.trim()])));
      }
      cursor = token.index + 1;
    }
  }
  assert.ok(matches.length, `Missing ${selector} in ${context ?? "base styles"}`);
  return Object.assign({}, ...matches);
}

test("Given a short filtered table, its overlay inspector has no minimum height that can put the scrollport outside the clipping surface", () => {
  const overlay = declarations(".surface-body.has-inspector .consequence-lens", "@media (min-width: 1024px)");
  assert.equal(overlay.position, "absolute");
  assert.equal(overlay.top, "var(--inspector-scroll-top, 0px)");
  assert.equal(overlay.bottom, "0");
  assert.equal(overlay["min-height"], "0", "A 620px floor overflowed shorter result sets even at scrollTop maximum");
  assert.equal(overlay["overflow-y"], "auto");
});

test("Given a long result set, its overlay scrollport is viewport-bounded and cannot chain wheel input to the page", () => {
  const overlay = declarations(".surface-body.has-inspector .consequence-lens", "@media (min-width: 1024px)");
  assert.equal(overlay["max-height"], "var(--inspector-scroll-height, calc(100dvh - 96px))");
  assert.equal(overlay["overscroll-behavior-y"], "contain");
});

test("Given expandable policy reasoning, inspector sections preserve their content height inside the bounded scrollport", () => {
  assert.equal(declarations(".consequence-lens").display, "flex");
  assert.equal(declarations(".consequence-lens")["flex-direction"], "column");
  assert.equal(declarations(".consequence-lens > *")["flex-shrink"], "0");
});

test("Given a docked wide-screen inspector, it returns to document flow instead of keeping an absolute clipped-height constraint", () => {
  const docked = declarations(".surface-body.has-inspector .consequence-lens", "@container repricing-surface (min-width: 1500px)");
  assert.equal(docked.position, "relative");
  assert.equal(docked.inset, "auto");
  assert.ok(!docked.height || docked.height === "auto");
  assert.equal(docked["max-height"], "none", "A true dock must not keep the overlay's viewport-height cap");
});

test("Given a mobile inspector, table hiding retains a content-flow inspector instead of inheriting the desktop absolute overlay", () => {
  const mobile = declarations(".surface-body.has-inspector .consequence-lens", "@media (max-width: 1023px)");
  assert.ok(!mobile.position || mobile.position === "relative");
  assert.ok(!mobile.height || mobile.height === "auto");
  assert.equal(declarations(".surface-body.has-inspector .table-region", "@media (max-width: 1023px)").display, "none");
});
