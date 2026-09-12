# Inspector scrolling and Imports spacing — 12 September 2026

Follow-up: the short-table cutoff correction below did not establish scroll ownership on long tables. See `INSPECTOR_SCROLL_CONTAINMENT_2026-09-12.md` for the subsequent viewport-bound and wheel-containment fix.

Both user-reported defects are implemented locally. No commit, push or deployment was performed; no pricing, permissions or persisted sample records were changed.

## Inspector cutoff

The desktop overlay had `top: 0; bottom: 0` but also a 620px minimum height. Beside three filtered rows, its containing surface was only 511px high. The surrounding card clipped the oversized scrollport. Reaching maximum scroll still left the final Scope field below the visible card boundary.

Changed the existing desktop overlay rule to `min-height: 0`, allowing its inset constraints to define its height. Direct inspector sections now retain their natural height rather than flex-shrinking. Mobile and docked layouts retain their content-flow behaviour.

Fresh browser verification:

- **Before, 1440px:** at maximum scroll 371px, final evidence extended below the card's clipping boundary. [Reproduced cutoff](inspector-import-fixes-2026-09-12/01-scroll-cutoff-before.png).
- **After, 1440px:** panel height is 511px, matching its container. At maximum scroll 481px, the last Scope field ends at y=809.9, inside panel bottom y=832.9. [Final field visible](inspector-import-fixes-2026-09-12/02-scroll-bottom-fixed.png).
- **Expanded reasoning:** Enter opens the native policy disclosure. Maximum scroll grows to 557px and the final field remains visible at the same bottom position. Native scrolling up reaches zero; scrolling down reaches 557px. [Expanded bottom](inspector-import-fixes-2026-09-12/03-expanded-bottom-fixed.png).
- **1024px:** maximum scroll 558px; final field bottom y=712.2, inside the panel and the 768px viewport. [Tablet](inspector-import-fixes-2026-09-12/04-tablet-bottom.png).
- **390px:** inspector stays in normal page flow, with no inner scrolling needed. Page scrolling reaches final Scope at y=799.2 within the 844px viewport. Escape returns focus to the originating product row. [Mobile](inspector-import-fixes-2026-09-12/05-mobile-bottom.png).

## Imports spacing

The 132px Progress track stretched the badges, allowed icons to shrink, and left only the old 16px gutter before Row accounting. Rebalanced the existing header/body tracks together: flexible batch identity, 160px Progress, Accounting capped at 240px, compact Owner and adequate Updated width. Shared gaps are 24px; badges size to their content and icons do not shrink below 14px.

- **1366px:** row/header tracks match, all rows fit the 1060px ledger. Measured badge-to-count gaps are 63.3px for Field mapping and 45.9px for Reconciled result. Icons are 14px. [Laptop](inspector-import-fixes-2026-09-12/06-imports-laptop.png).
- **390px:** existing card layout is retained. All rows fit at 364px without horizontal document overflow; badges and filenames remain readable. [Mobile](inspector-import-fixes-2026-09-12/07-imports-mobile.png).

## Regression coverage

**299 tests passed: 138 data/source contracts, 153 BDD, 8 hosting. Production Vite build passed.**

New regressions cover intrinsic Import badges and paired tracks, bounded inspector overlay height, non-shrinking sections, expanding/collapsing reasoning, final evidence fields, adjacent-line replacement and Escape focus restoration. Source and jsdom tests are not scroll/rendering proof; the fresh browser checks above substantiate reachability and spacing. This was a focused two-defect correction, not an all-screen or accessibility certification. The wide docked inspector was source-checked, not visually exercised in this run.
