import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectorScrollFrame } from "../../src/workspaceInspectorFrame.js";

// Pure geometry safeguards. Only a real browser can verify wheel containment,
// native focus scrolling, CSS layout and the final evidence field's visibility.
const cases = [
  {
    name: "Given a long All lines surface, the inspector fits the remaining viewport instead of inheriting the table height",
    input: { surfaceTop: 354, surfaceBottom: 1384, viewportBottom: 900, headerBottom: 64 },
    expected: { top: 0, height: 530 },
  },
  {
    name: "Given a short Eligible surface, the inspector stops at the card boundary rather than extending past its clipping edge",
    input: { surfaceTop: 322, surfaceBottom: 833, viewportBottom: 900, headerBottom: 64 },
    expected: { top: 0, height: 511 },
  },
  {
    name: "Given a surface scrolled behind the header, the inspector's offset clears the header and retains a bottom gutter",
    input: { surfaceTop: -131, surfaceBottom: 900, viewportBottom: 900, headerBottom: 64 },
    expected: { top: 203, height: 812 },
  },
  {
    name: "Given a shifted visual viewport, its visible top takes precedence over a header above that viewport",
    input: { surfaceTop: 100, surfaceBottom: 700, viewportTop: 120, viewportBottom: 760, headerBottom: 80 },
    expected: { top: 28, height: 572 },
  },
  {
    name: "Given a shorter desktop viewport, the inspector shrinks to the visible space without changing the source table",
    input: { surfaceTop: 200, surfaceBottom: 1000, viewportBottom: 620, headerBottom: 64 },
    expected: { top: 0, height: 404 },
  },
  {
    name: "Given a surface below the viewport, the inspector has no visible height and remains inside its surface",
    input: { surfaceTop: 1000, surfaceBottom: 1600, viewportBottom: 900, headerBottom: 64 },
    expected: { top: 0, height: 0 },
  },
  {
    name: "Given a surface above the viewport, the inspector clamps to the surface end instead of escaping below it",
    input: { surfaceTop: -600, surfaceBottom: -100, viewportBottom: 900, headerBottom: 64 },
    expected: { top: 500, height: 0 },
  },
  {
    name: "Given a temporarily empty surface during layout, the inspector never receives negative dimensions",
    input: { surfaceTop: 300, surfaceBottom: 300, viewportBottom: 900, headerBottom: 64 },
    expected: { top: 0, height: 0 },
  },
  {
    name: "Given no sticky header, default viewport coordinates still preserve the 8px top and 16px bottom gutters",
    input: { surfaceTop: 0, surfaceBottom: 1000, viewportBottom: 900 },
    expected: { top: 8, height: 876 },
  },
];

for (const { name, input, expected } of cases) {
  test(name, () => {
    const result = inspectorScrollFrame(input);
    assert.deepEqual(result, expected);
    assert.ok(result.top >= 0);
    assert.ok(result.height >= 0);
    assert.ok(result.top + result.height <= input.surfaceBottom - input.surfaceTop);
    if (result.height > 0) {
      assert.ok(input.surfaceTop + result.top >= Math.max(input.viewportTop ?? 0, input.headerBottom ?? 0) + 8);
      assert.ok(input.surfaceTop + result.top + result.height <= input.viewportBottom - 16);
    }
  });
}
