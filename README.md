# VECTOR

VECTOR (formerly Gdrew) is a local-first vector drawing tool: pen paths, node editing, booleans, and type on a path.

**Live:** https://sergioshklr.github.io/vector/ (the old `/gdrew/` URL redirects here)

Recovered from `gdrew.grok.me` (v1.15) on Nov 17, 2026, after the grok.me dashboard that owned the app disappeared.

## What's in here

- `folio/folio.js`, `folio/geom.js`: the original Gdrew v1.15 engine, copied verbatim from the live app.
- `folio/folio.css`: the app stylesheet, taken from a saved copy of the live page. One rule (`.shortcut-keys kbd`) had a broken border shorthand from the save and was rewritten as `border: 1px solid var(--line); border-bottom-width: 2px`.
- `assets/styles.css`: the base stylesheet (reset plus `.folio-mount` sizing), taken from the same saved page.
- `index.html`: a plain page that loads the CSS and both scripts and calls `Folio.mount()`. It replaces the React/Vite shell, which only did that.
- `favicon.svg`: rebuilt from the Gdrew brand glyph.

Removed: the grok.me manifest and icons (`/__grok/...`), the grok.com app-builder extensions script, and the grok project metadata.

## Drafts

Drafts autosave to `localStorage` under the same key as before (`folio.v1`, plus `gdrew.prefs`, `gdrew.unit`, `gdrew.theme`). Browser storage is tied to each site's address, though, so drafts saved on gdrew.grok.me don't show up here on their own. To move one over, use **File > Download as JSON** on the old site, then **File > Open** here.

No build step, no dependencies. To run it locally, serve the folder with any static server, for example `python3 -m http.server`.
