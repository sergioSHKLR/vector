# VECTOR — brand kit

From the SHKLR brand kit (final, rev 3, approved 19 Nov 2026). Generated; update from the kit, not by hand.

## VECTOR

- Tagline: “Local-first vector drawing.”
- Mode: dual (light + dark, favicon.svg swaps with prefers-color-scheme)
- Plate light **#e8eaed** — glyph #111111 curve + end nodes 15.67:1, #5a8f43 centre node ring 3.2:1
- Plate dark **#0d1014** — glyph #f2f2f2 curve + end nodes 17.03:1, #6aa84f centre node ring 6.65:1

Files in `vector/`:
- `icons/` master SVGs (glyph, tile, square, maskable, mono); `icons/flat/` SDRAW-safe copies (no groups, transforms, clips or arcs).
- `png/` tile PNGs 16–1024, maskable and apple-touch.
- `web/` site drop-ins: favicon.svg/.ico/16/32/48, apple-touch-icon, icon-192/512, maskable, monochrome, manifest.webmanifest, meta-head.html, splash/ (iOS).
- `wordmark/` wordmark and lockups (SVG, flat SVG, PNG), all text outlined.
- `social/` og-1200x630, x-card-1200x600, github-card-1280x640 (repo social preview), whatsapp, Instagram sizes.

## Type
- UI and wordmarks: **SHKLR Mono Narrow 1.000** (`fonts/`, OFL 1.1, derivative of Monaspace Neon).
- Content: system-ui sans; reading serif: `ui-serif, Georgia, Cambria, "Times New Roman", serif`. No Google Fonts.

## Rules
- The plate is the app’s real surface colour; glyph colours ≥ 3:1 against it, text ≥ 4.5:1.
- Wordmarks: uppercase SHKLR Mono Narrow Bold, +0.02em, ink #111111 on light / #f2f2f2 on dark.
- Clear space 25% of the tile; minimum tile 16 px.

`tokens/` holds the colour and type tokens for the whole SHKLR family.
