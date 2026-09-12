# Repricing scroll ownership — 12 September 2026

## What the earlier fix missed

The previous fix removed a minimum-height cutoff beside short filtered tables. It did not bound the inspector to the viewport or stop wheel gestures from propagating to the page. Longer All lines / Need review tables exposed this remaining defect.

Reproduced at 1440 × 900: All lines produced a 1030px inspector ending at y=1351.9, outside the viewport, with **zero inner scroll range**. A native scroll inside it moved the document from y=0 to y=485 instead.

## Correction

- Desktop overlays are bounded by the intersection of the results surface and the visible viewport, with clearance below the header and a 16px bottom gutter. Geometry updates on surface resize, window scroll, and visual-viewport changes.
- `overscroll-behavior-y: contain` keeps wheel/trackpad scrolling inside the inspector at its top and bottom boundaries. The document is not globally locked: scrolling outside the inspector still works.
- Mobile and genuinely docked wide layouts retain normal document flow and no nested scroll area. Overlay geometry is cleared when changing layouts.
- Automatic page scrolling on handoff is limited to mobile (<1024px), not desktop overlays. Opening a row focuses its inspector with `preventScroll`.
- Repricing's clipped-tab reveal now scrolls only its horizontal rail, matching the other workspace tabs. It no longer calls `scrollIntoView` on a tab, which could move page ancestors.

## Real-browser verification

| Case | Result |
| --- | --- |
| All lines, 1440 × 900 | Inspector 562px high, ends at y=884; inner scrolling reaches 374 while document remains at y=0, including repeated bottom gestures |
| Need review, 1440 × 900 | Same 562px scrollport and containment; final Scope ends at y=860.9, above inspector bottom y=884 |
| Eligible, 1440 × 900 | Short-card bound preserved: 511px high; inner scroll reaches 481; repeated bottom gestures leave document at y=0 |
| Expanded policy reasoning | Final evidence remains reachable; repeated bottom gestures preserve the then-current document position |
| Top edge with document already scrolled | Inner scrolling reaches zero; additional upward gestures leave document at y=485 |
| Outside gesture | Scrolling the table side still moves the document; the inspector remains within the visible portion of its surface |
| Short desktop, 1024 × 600 | Inspector ends at y=584; final Scope at y=561.2; inner scroll reaches 729; repeated bottom gestures leave document at y=0 |
| Native click and Escape, 1024 × 768 | Both preserve document y=236; focus moves into the inspector, then returns to Cassava's row |
| Mobile, 390 × 844 | No inner scroll range; document End reaches final Scope at y=799.2 |
| Wide dock, 2000 × 1000 | Relative positioning, no max-height constraint, no inner scroll range, overlay geometry removed |

Captures are in `inspector-scroll-containment-2026-09-12/`. Native scrolling and native click/Escape were used to distinguish actual page movement from browser automation's own locator-reveal behaviour. Desktop disclosure click automation moved the page while bringing the disclosure into view; the expanded-boundary test therefore compares document position immediately before and after the subsequent native scroll, not before that automated click.

Geometry/source contracts and BDD tests cover the viewport bounds, containment declarations, layout resets, per-tab evidence, focus restoration and mobile-only handoff. These tests do not substitute for the browser wheel checks above. Physical-device and screen-reader testing were not performed.

Final verification: 330 tests passed (148 data, 174 BDD, 8 hosting); the workspace production build passed. The full-suite log is `/tmp/owomide-scroll-final-suite.JQbMgH`. This is regression evidence for the implemented behaviour, not a full-product design sign-off.

No pricing, handoff, role or permission records were changed. Local changes only; not committed, pushed or deployed.
