import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() { return true; },
  }),
});

window.requestAnimationFrame ??= (callback) => window.setTimeout(callback, 0);
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => {
  cleanup();
});
