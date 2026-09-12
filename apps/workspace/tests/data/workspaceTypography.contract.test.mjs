import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const readSource = (file) => readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8");
const screenFiles = ["workspace.css", "proposal.css", "platform.css", "workspace-premium-system.css", "workspace-flow-polish.css"];
const cssRules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];

test("Given the workspace stylesheet stack, shared foundations load first and have one definition", () => {
  const main = readSource("main.jsx");
  const tokenImport = main.indexOf('import "./workspace-tokens.css"');
  assert.ok(tokenImport >= 0, "The workspace must import its shared tokens");
  for (const file of screenFiles) {
    assert.ok(tokenImport < main.indexOf(`import "./${file}"`), `${file} must load after the shared tokens`);
  }

  const tokens = readSource("workspace-tokens.css");
  const stack = [tokens, ...screenFiles.map(readSource)].join("\n");
  for (const [, token] of tokens.matchAll(/(--[\w-]+)\s*:/g)) {
    const definitions = [...stack.matchAll(new RegExp(`${token}\\s*:`, "g"))];
    assert.equal(definitions.length, 1, `${token} must have one shared definition, not a late override`);
  }
});

test("Given any operational page title at any breakpoint, its type uses the compact shared scale", () => {
  for (const file of screenFiles) {
    for (const [, selectors, declarations] of cssRules(readSource(file))) {
      if (!/\bh1\b/.test(selectors) || selectors.includes(".login-story")) continue;
      for (const [property, token] of [
        ["font-size", "--text-page-title"],
        ["line-height", "--text-page-title-line"],
        ["letter-spacing", "--text-page-title-tracking"],
      ]) {
        const value = declarations.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1]?.trim();
        if (value) assert.equal(value, `var(${token})`, `${file}: ${selectors.trim()} must not override the title scale`);
      }
    }
  }
});

test("Given work-surface text, its explicit font size is at least the metadata floor", () => {
  for (const file of screenFiles) {
    for (const [, selectors, declarations] of cssRules(readSource(file))) {
      if (selectors.trim() === ".login-story footer") continue;
      const fontSize = declarations.match(/font-size\s*:\s*([\d.]+)px/)?.[1];
      if (fontSize) assert.ok(Number(fontSize) >= 11, `${file}: ${selectors.trim()} has accidental microtype`);
    }
  }
});
