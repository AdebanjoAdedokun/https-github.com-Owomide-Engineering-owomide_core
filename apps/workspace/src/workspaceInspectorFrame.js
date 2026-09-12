/** Visible overlay scrollport, in coordinates relative to its results surface. */
export function inspectorScrollFrame({ surfaceTop, surfaceBottom, viewportTop = 0, viewportBottom, headerBottom = 0 }) {
  const surfaceHeight = Math.max(0, surfaceBottom - surfaceTop);
  const visibleTop = Math.max(surfaceTop, viewportTop + 8, headerBottom + 8);
  const visibleBottom = Math.min(surfaceBottom, viewportBottom - 16);
  return {
    top: Math.min(surfaceHeight, Math.max(0, visibleTop - surfaceTop)),
    height: Math.max(0, visibleBottom - visibleTop),
  };
}
