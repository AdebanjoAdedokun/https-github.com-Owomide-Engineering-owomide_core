import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney, formatSignedMoney } from "../../src/workspacePresenter.js";

const ngn = (amountMinor) => ({ amountMinor, currency: "NGN" });
test("Given exact minor-unit strings, when formatting large prices, then every grouped digit and cent survives beyond Number precision", () => {
  assert.equal(formatMoney(ngn("1234567890")), "₦12,345,678.90");
  assert.equal(formatMoney(ngn("9007199254740993")), "₦90,071,992,547,409.93");
  assert.equal(formatMoney(ngn(123456789012345678901n)), "₦1,234,567,890,123,456,789.01");
  assert.equal(formatSignedMoney(ngn("9007199254740993")), "+₦90,071,992,547,409.93");
  assert.equal(formatSignedMoney(ngn("-9007199254740993")), "−₦90,071,992,547,409.93");
});

test("Given zero and negative sub-unit amounts, when formatting money, then sign and exactly two decimals are preserved", () => {
  assert.equal(formatMoney(ngn("0")), "₦0.00");
  assert.equal(formatMoney(ngn("-1")), "-₦0.01");
  assert.equal(formatMoney(ngn("-12345")), "-₦123.45");
  assert.equal(formatSignedMoney(ngn(0n)), "+₦0.00");
  assert.equal(formatSignedMoney(ngn("-1")), "−₦0.01");
  assert.equal(formatMoney(ngn(123)), "₦1.23");
});

test("Given another locale, when formatting an exact value, then locale grouping and decimal separators are retained", () => {
  assert.equal(formatMoney({ amountMinor: "12345678901234567", currency: "EUR" }, "de-DE"), "123.456.789.012.345,67€");
  assert.equal(formatMoney({ amountMinor: "1234567890", currency: "INR" }, "en-IN"), "₹1,23,45,678.90");
  assert.equal(formatMoney({ amountMinor: "1234567890", currency: "EUR" }, "fr-FR"), "12\u202f345\u202f678,90€");
});

test("Given missing, malformed or already-imprecise money, when formatted, then neither zero nor NaN nor a signed Unavailable is fabricated", () => {
  for (const value of [null, undefined, "", " ", "1.5", "1e3", "NaN", "Infinity", {}, [], false, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(formatMoney(ngn(value)), "Unavailable");
    assert.equal(formatSignedMoney(ngn(value)), "Unavailable");
  }
  for (const value of [null, {}, { amountMinor: "100" }, { amountMinor: "100", currency: "bad-currency" }]) {
    assert.equal(formatMoney(value), "Unavailable");
    assert.equal(formatSignedMoney(value), "Unavailable");
  }
});
