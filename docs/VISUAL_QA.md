# Visual QA — the 12-category gate, scored

**Scored 2026-10-12 against build-spec §32/§61 and the UI lock brief §3–§9.**
**Result: 22 / 24.** No zero in the four redesign-trigger categories (product clarity, product
identity, mechanism visibility, technical honesty). Target is ≥20/24.

## How to read this

Every score below carries one evidence sentence and a screenshot file from `qa-screens/`. The
screenshots are produced by `npm run ui:capture`, which drives the real UI and **refuses to write a
scene that settles on a state other than the one it claims** — so the pictures are of states the
product actually reaches, not of states assembled for the occasion.

Three categories score 1 rather than 2. Each is a real limitation, stated rather than rounded up,
and none of them is a trigger category:

- **state coverage** — two states exist in the machine and cannot be reached from the browser.
- **motion** — there is very little, deliberately, and one place where it is arguably missing.
- **mobile** — one measured deviation from the locked header height, at 320px only.

The brief's §9 list asks for a *"real unlocked result with recovered content"*. **That screenshot
does not exist and is not fabricated.** The reason is in category 11.

---

## The scores

| # | Category | Score | Evidence | Screenshot |
|---|---|---|---|---|
| 1 | Product clarity | **2** | A first-time reader sees the protected thing, the licence it needs, its current state and the one action, all above the fold at 1440×900 — and the docket names the exact licence token the check asks about. | `desktop-locked.png` |
| 2 | Product-specific identity | **2** | Original `VaultMark` shield/keyhole, original `SealedRecordArt` archival illustration and an original favicon, all drawn in-repo (provenance in `docs/ASSET_PROVENANCE.md`); the surface reads as a typeset archival record, not a crypto dashboard — no gradients, no glassmorphism, one shadow. | `desktop-locked.png` |
| 3 | Technical mechanism visibility | **2** | The three-step explainer names the real mechanism (`LICENSE → VERIFY → PROTECTED READ`) and states that the protocol condition, not a UI toggle, decides access; the Proof Receipt shows IP asset, terms, token, vault uuid, network and six real transaction links. | `desktop-proof.png` |
| 4 | Hierarchy | **2** | Measured, not judged: header 69px, hero begins 48px below it, two columns at **42% / 58%** with a **64px** gap, docket **654px** wide — against the brief's 42/58, 48–64px and 600–680px. | `desktop-locked.png` |
| 5 | Typography | **2** | Newsreader display / IBM Plex Sans UI / IBM Plex Mono data, as locked; `h1` at 68px desktop falling to 40px mobile inside the locked 56–68px band, and the supporting sentence at 17px measuring **36 characters per line**, inside the brief's ~45. | `desktop-locked.png` |
| 6 | Spacing / density | **2** | No horizontal overflow at any of six viewports, docket padding holds at 320px, and the address field shrinks (604px → 222px) rather than widening its container, so density survives the narrowest screen. | `narrow-locked.png` |
| 7 | Signature interaction | **2** | The signature interaction is the product: submitting an address performs a real `eth_call` to the vault's read condition on Aeneid and returns ALLOWED for the licence holder and DENIED for everyone else — measured live, and it costs no key, no gas and no signature. | `desktop-verified.png` |
| 8 | State coverage | **1** | Five of the seven states are reachable and photographed (LOCKED, CHECKING, LICENSE VERIFIED, NO LICENSE, VERIFICATION ERROR); **`ACCESSING` and `ACCESS GRANTED` exist in the machine but cannot be reached from the browser**, because the protected read needs a funded account and the CDR keeper API. Scored 1, not 2 — see 11. | `desktop-verified.png`, `desktop-no-license.png`, `desktop-verification-error.png` |
| 9 | Motion | **1** | `prefers-reduced-motion` is honoured and the busy state is legible, but there is no state *transition* between LOCKED and LICENSE VERIFIED — the docket changes in place with no gesture marking the change. Honest score: the motion that exists is correct and there is not much of it. | `desktop-verified.png` |
| 10 | Mobile | **1** | 390×844 and 320×844 both render with no horizontal scroll and the docket action reachable and enabled; scored 1 because the header measures **87px at 320px** against the locked 64–72px — a deliberate trade recorded below, not an oversight. | `mobile-locked.png`, `narrow-locked.png` |
| 11 | Technical honesty | **2** | The strongest claim the page can make is `LICENSE VERIFIED`; it never prints `ACCESS GRANTED`, because the check verifies the licence and does not decrypt. A malformed request surfaces as `VERIFICATION ERROR` and never as `NO LICENSE` — pinned by a test whose comment says why: *"If it surfaced as `NO_LICENSE`, this product would tell a paying licensee they hold no rights because of a bug on our side of the wire."* | `desktop-verification-error.png` |
| 12 | Judge proof | **2** | The Proof Receipt is read from the committed run at render time and returns `null` rather than inventing values; it carries the independent verifier's own counts — **41 verified · 0 refuted · 1 not verifiable** — and six explorer links already re-checked against Aeneid in BUILD 3. | `desktop-proof.png` |

**Total: 22 / 24.**

---

## The three 1s, and why they are not higher

### 8 — state coverage

`ACCESSING` and `ACCESS GRANTED` are real states in `lib/access/state.ts` and are exercised by
`tests/state.test.ts`. They are unreachable from the browser because reaching them requires the
actual confidential read: a funded Aeneid account, and the CDR keeper API, which is plain HTTP on a
private-range IP (`http://172.192.41.96:1317`) that a deployed server cannot reach.

The tempting move is to fake a decryption so the last two states can be photographed. That is the
one thing this project exists not to do, and the brief says so twice — *"Don't manufacture
screenshot states"* and *"`ACCESS GRANTED` is allowed only after the actual protected read/
decryption succeeds."* So the required screenshot is **absent and declared absent**:

> **`desktop-unlocked.png` does not exist.** It is the one item in the brief's §9 evidence list that
> this build cannot honestly produce. It becomes producible when the protected read runs in the
> browser, which is the CDR keeper API work tracked as the §7 risk.

### 9 — motion

There is no motion library and no animation dependency, by the brief's §8 instruction, and the
reduced-motion block is honoured. What is missing is smaller and real: when the check resolves, the
status label swaps text in place. A brief, non-decorative transition would tell a sighted visitor
that a change just happened, and it is the one place where the absence is noticeable rather than
disciplined.

### 10 — mobile

At 320px the header measures **87px** against a locked 64–72px. The cause is deliberate: the brief
separately requires *"no horizontal scroll"* and readability at 320px, and the header carries a
mark, a wordmark, two section links and a wallet chip. Below 560px the two section links step aside
and the wallet chip drops the word "Wallet"; the remaining height is the wrapped header. The brief's
two requirements conflict at this width, and no-horizontal-scroll was chosen. Recorded here rather
than hidden, because a judge measuring the header will find 87px.

---

## What the scoring pass changed

The pass was not only a scoring exercise; three defects came out of it and were fixed rather than
noted:

1. **The status label had no live region.** The brief §7 requires `role="status"`/`aria-live` for
   important state changes. A sighted visitor watched LOCKED become LICENSE VERIFIED; a
   screen-reader user was told nothing, and since the only action is asynchronous there was no other
   moment at which the change would be announced. `LicenseStatus` now carries `role="status"`.
2. **The audit probe measured the wrong element.** Its "supporting sentence" measurement was
   actually reading the 11px eyebrow, and it derived characters-per-line from an assumed 0.5em
   average glyph width — a guess dressed as a number. It now finds the paragraph after the `h1`
   positionally and counts real line boxes with `Range.getClientRects()`.
3. **The audit silently reported six empty viewports.** A duplicate `const` made the probe a
   `SyntaxError`, which returns `undefined`, which spreads into a row containing only the viewport
   name — indistinguishable from "measured, and there was nothing there". The audit now throws on
   any exception the page reports. This is the third bug of the same shape in this project's
   instruments (see also the button probe and the hydration check in `tools/ui-capture.mjs`): **a
   measurement tool that fails quietly is worse than no measurement tool.**

## Re-running this

```
npm run build && npm start -- -p 4173      # healthy server
npm run ui:audit                           # layout and contrast numbers
npm run ui:capture                         # LOCKED / VERIFIED / NO LICENSE / PROOF

STORY_RPC_URL=http://127.0.0.1:9 npm start -- -p 4174     # deliberately unreachable RPC
node tools/ui-capture.mjs http://localhost:4174/ qa-screens verification-error
```

Both tools take the base URL as their first argument, so a server on another port is
`node tools/ui-capture.mjs http://localhost:4177/ qa-screens`. Passing the wrong port is a clean
`ECONNREFUSED`, not a set of empty screenshots — the tool will not photograph a server it cannot
reach.

---

## Re-captured 2026-10-12, after the fonts were self-hosted

The typography stack moved from `next/font/google` to `next/font/local` (see `app/fonts/README.md`)
because the Google build-time fetch failed a CI run with twelve font-resolution errors and then
passed on a re-run. A font change can move layout, so the score was not assumed to still hold.

**Re-measured against the rebuilt server, every viewport identical to the numbers above:**

| Viewport | Overflow | Header | `h1` | Docket | Columns | Supporting sentence |
|---|---|---|---|---|---|---|
| desktop-1440 | none | 69px | 68px | 654px | 42/58, gap 64 | 17px, 36 chars/line, 4 lines |
| desktop-1280 | none | 69px | 68px | 654px | 42/58, gap 64 | 17px, 36 chars/line, 4 lines |
| desktop-1024 | none | 69px | 56.32px | 529px | 42/58, gap 64 | 17px, 36 chars/line, 4 lines |
| tablet-768 | none | 69px | 42.24px | 680px | single column | 17px, 36 chars/line, 4 lines |
| mobile-390 | none | 69px | 40px | 342px | single column | 17px, 36 chars/line, 4 lines |
| mobile-320 | none | **87px** | 40px | 272px | single column | 17px, 29 chars/line, 5 lines |

Every figure matches the pre-change measurement, including the 320px header height that the mobile
score of 1 is about. **The 22/24 stands unchanged, and the eight re-captured screenshots differ only
in the check timestamp the docket displays** — `desktop-verification-error.png` was not re-captured,
because it requires a server whose chain is deliberately unreachable and the tool refuses to
photograph that state on a healthy one.

