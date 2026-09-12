import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../../src/workflow-craft.css", import.meta.url), "utf8");
const declaration = (selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `Missing workflow composition rule: ${selector}`);
  return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
};

test("Given Import and Proposal share legacy class names, Proposal review overrides the Import grid only in its own scope", () => {
  const review = declaration(".proposal-page > .review-document");
  assert.match(review, /display:\s*block/);
  assert.match(review, /padding:\s*0/);
  assert.match(declaration(".import-journey .review-document"), /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.ok(!/^\.review-document\s*\{/m.test(css), "A global document override would recouple both workflows");
});

test("Given a narrow proposal card, exact money reflows against the card width without truncation", () => {
  assert.match(declaration(".proposal-anchor"), /container:\s*proposal-anchor \/ inline-size/);
  assert.match(css, /@container proposal-anchor \(max-width: 760px\)/);
  assert.match(css, /@container proposal-anchor \(max-width: 560px\)/);
  assert.match(declaration(".proposal-anchor__prices strong"), /white-space:\s*nowrap/);
  assert.ok(!/\.proposal-anchor__prices strong\s*\{[^}]*text-overflow:\s*ellipsis/.test(css), "Financial values cannot be ellipsised");
});

test("Given review acknowledgements and notices, icon and checkbox slots cannot grow with the text", () => {
  const notice = declaration(".import-journey .risk-confirmation");
  assert.match(notice, /grid-template-columns:\s*24px minmax\(0, 1fr\)/);
  assert.match(notice, /align-items:\s*start/);
  assert.match(notice, /gap:\s*12px/);
});
