# Self-hosted fonts

Latin-subset `woff2` files for the locked typography stack in `app/layout.tsx`, fetched by
`tools/fetch-fonts.mjs` and committed so the build does not depend on Google Fonts being reachable.

## Why they are in the repo

`next/font/google` downloads fonts at **build** time. On 2026-10-12 that build failed in CI with
twelve `Can't resolve '@vercel/turbopack-next/internal/font/google/font'` errors — on a commit that
changed only markdown — and then passed on a re-run. Google rate-limits CI runners, so the failure
was a matter of when. Self-hosting removes the build-time third party; there is no runtime
dependency either way, because `next/font` serves the files from our own origin in both cases.

No npm package was added. This only moved bytes into the repository.

## What is here

| Family | Weights | Styles | Used for |
|---|---|---|---|
| Newsreader | 400, 500 | normal, italic | editorial serif display |
| IBM Plex Sans | 400, 500, 600 | normal | interface |
| IBM Plex Mono | 400, 500 | normal | addresses, ids, protocol data |

Latin subset only — the app is English-only, so latin-ext, cyrillic and greek would be dead weight
in the repo and in every visitor's cache. Exactly the weights `layout.tsx` declares are present; no
unused bytes ship.

## Provenance and licence

Both families are licensed under the **SIL Open Font License 1.1**, which permits bundling and
redistribution:

- **IBM Plex** (Sans and Mono) — © IBM, <https://github.com/IBM/plex>
- **Newsreader** — © Production Type, <https://github.com/productiontype/Newsreader>

Retrieved from the Google Fonts CSS API (`fonts.googleapis.com/css2`) with a modern browser
User-Agent, which is what makes it serve `woff2` rather than much larger `ttf`. The fetch script
verifies the `wOF2` magic bytes on every file, so an HTML error page can never be committed here
pretending to be a font.

## Regenerating

```bash
node tools/fetch-fonts.mjs
```

If this ever produces different bytes, that is a real change to the typography and should be
followed by re-running `npm run ui:capture` — the BUILD 6 visual measurements were taken against
these exact files.
