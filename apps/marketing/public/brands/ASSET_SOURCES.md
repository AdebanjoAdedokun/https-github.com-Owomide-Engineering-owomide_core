# Brand asset sources

The prototype-ready files are the short filenames in the first column. Source masters retained for traceability end in `-source`.

| Brand | Prototype file | Source URL | Source/local format | Notes |
| --- | --- | --- | --- | --- |
| Konga | `konga.svg` | https://group.konga.com/assets/images/konga%20logo.svg | SVG / SVG | Official Konga Group media-kit wordmark. |
| Jumia | `jumia.svg` | https://group.jumia.com/press/media-kit | Embedded SVG / SVG | Transparent dark wordmark with orange star, extracted unchanged from Jumia Group's official page. Official raster fallback: https://group.jumia.com/download/images/press/hd/logos/jumia-group-logo-high-resolution.png |
| Coca-Cola | `coca-cola.png` | https://www.coca-cola.com/content/dam/onexp/gb/en/great-britain-coca-cola-logo_black_600x96.png | RGBA PNG / RGBA PNG | Exact Coca-Cola wordmark cropped from the official transparent lockup for optical balance. The untouched downloaded lockup is retained as `coca-cola-source.png`. |
| SPAR | `spar.svg` | https://spar-international.com/wp-content/themes/spar_international/img/spar-logo.svg | SVG / SVG | Official SPAR International horizontal logo. Use once even when representing both Nigeria and Rwanda. |
| Prince Ebeano | `prince-ebeano.png` | https://princeebeano.com/assets/images/logo/logo.png | RGBA PNG / RGBA PNG | Official circular supermarket badge. |
| Naivas | `naivas.svg` | https://corporate.naivas.info/wp-content/uploads/2025/08/naivas-logo.svg | SVG / SVG | Official Naivas corporate-site lockup. The SVG embeds the supplied orange badge artwork. |
| Quickmart | `quickmart.png` | https://corporate.quickmart.co.ke/wp-content/uploads/2026/08/red-quickmart-logo.png | RGBA PNG / RGBA PNG | Official transparent red wordmark, 361×67. |
| Carrefour | `carrefour.png` | https://cdn-netpr.pl/file/mediakit/1177350/d6/logo_korpo_poziom.jpg | JPEG / RGBA PNG | Official Carrefour press-kit master. `carrefour-source.jpg` is retained; `carrefour.png` only removes the near-white canvas and preserves the supplied artwork. |
| Market Square | `market-square.png` | https://marketsquareng.com/img/logo-m.2f54d7ff.png | RGBA PNG / RGBA PNG | Official site wordmark, 180×49. This was the best complete colored wordmark surfaced; the larger official `MSlogowhite` file contains the bag/line device rather than the full wordmark. |
| Shoprite | `shoprite.svg` | https://cdn.worldvectorlogo.com/logos/shoprite.svg | SVG / SVG | Reliable consumer Shoprite vector. `shoprite-source.svg` is retained; `shoprite.svg` removes only the dark rectangular canvas and border, leaving the supplied red wordmark paths unchanged. Direct retrieval from `https://shoprite.ng/` timed out, so no first-party standalone logo file was available. |
| Simba Supermarket | `simba-supermarket.webp` | https://www.simbasupermarket.com/assets/images/simba-new.webp | Transparent WebP / transparent WebP | Official site horizontal lockup, 600×148. |
| Sawa Citi | `sawa-citi.jpg` | https://pbs.twimg.com/profile_images/1334049325048098816/SrfdcqqZ.jpg | JPEG / JPEG | Official Sawa Citi X profile artwork. `sawa-citi-source.jpg` is retained; `sawa-citi.jpg` is a tight crop that preserves the full cart, wordmark, and descriptor. No standalone transparent first-party wordmark surfaced. |

## Optical sizing

Use a 56px-high logo slot with `object-fit: contain`; align by visible artwork rather than intrinsic file bounds.

- Standard horizontal wordmarks — Jumia, Coca-Cola, SPAR, Quickmart, Carrefour, Shoprite: 22–26px visible height.
- Konga: 28–30px visible height because the circular smile mark carries more visual mass.
- Market Square: 26–28px visible height; do not render above its 180×49 source dimensions.
- Naivas: 34–38px visible height because its orange container is part of the lockup.
- Simba Supermarket and Sawa Citi: 32–36px visible height so their descriptors remain legible.
- Prince Ebeano: 44–48px visible height; treat it as a badge, not a wordmark.

Avoid global grayscale or opacity below 72%; several regional marks lose recognition when their signature colors are flattened.
