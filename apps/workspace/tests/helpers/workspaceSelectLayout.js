import { afterEach, beforeEach, vi } from "vitest";

/** jsdom has no layout; give only this floating control a visible anchor. */
export function installWorkspaceSelectLayoutFixture() {
  let anchorBounds;
  beforeEach(() => {
    const original = Element.prototype.getBoundingClientRect;
    anchorBounds = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.classList?.contains("workspace-select-trigger")) {
        return { x: 24, y: 120, top: 120, left: 24, right: 344, bottom: 164, width: 320, height: 44, toJSON() { return this; } };
      }
      return original.call(this);
    });
  });
  afterEach(() => { anchorBounds?.mockRestore(); });
}
