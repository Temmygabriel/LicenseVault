# COST MATRIX

**Project:** LicenseVault
**Last updated:** 2026-10-05
**Gate:** `ZERO-COST CORE PATH PASS` — **met, with two items flagged as not re-verified today.**

The core path (build the app, prove the gated read on Aeneid, deploy to Vercel, let a judge
verify) must cost nothing and must not require a payment card. Nothing on the critical path
is behind a paywall or a credit purchase.

---

## Core path dependencies

| Dependency | Purpose | Plan / tier | Cost | Quota | Card required | Credential required | Expiry / credit risk | Official source | Verified | Mandatory? |
|---|---|---|---|---|---|---|---|---|---|---|
| **Story Aeneid testnet** | The chain the whole product runs on | Public testnet | $0 | Public RPC, rate-limited | No | No (public RPC) | Testnet may be reset or retired by the maintainers | `https://aeneid.storyrpc.io` | 2026-10-05 (live JSON-RPC) | **Mandatory** |
| **CDR contracts** (DKG, CDR, conditions) | The vault + the access gate | Deployed on Aeneid | $0 to use | n/a | No | No | Protocol fees are paid in testnet DATA, not money | `docs/PROTOCOL_DISCOVERY.md` | 2026-10-05 (live bytecode) | **Mandatory** |
| **`@piplabs/cdr-sdk`** and siblings | Protected vault: allocate / write / read / decrypt | npm, MIT | $0 | n/a | No | No | MIT-licensed; pinned to 0.2.2 | npm registry | 2026-10-05 | **Mandatory** |
| **`@story-protocol/core-sdk`** | Register IP, attach license terms, mint license token | npm | $0 | n/a | No | No | Published package; version 1.4.4 | npm registry | 2026-10-05 | **Mandatory** |
| **Testnet DATA (gas + protocol fees)** | Pays for allocate / write / read / mint | Testnet faucet | $0 — test money, no real value | Faucet-drip limited | No | No | **Faucet availability is the main dependency risk.** If the faucet is dry, the demo cannot run until it refills | Faucet route **UNVERIFIED** — see note A | Not verified | **Mandatory** |
| **GitHub** (repo + Actions) | Source of truth + all heavy work (install, build, test) | Free | $0 | Public repo: Actions minutes are free. Private repo: 2,000 min/month | No | Yes — already have (`Temmygabriel`) | None foreseen at this scale | github.com | 2026-10-05 (in use) | **Mandatory** |
| **Vercel** | Frontend hosting | Hobby (free) | $0 | Free-tier bandwidth/function limits apply | **Not re-verified today** — see note B | Yes (free account) | Hobby tier is subject to fair-use limits | vercel.com | **Not verified** | **Mandatory** (BUILD 9) |
| **Node.js + npm** | Build + run | Local, already installed | $0 | n/a | No | No | Node 24 / npm 11 present | n/a | 2026-10-05 | **Mandatory** |

### Note A — faucet route now VERIFIED; the drip *amount* is not

**Resolved 2026-10-05.** `https://faucet.quicknode.com/story` returns HTTP 200, and the page
itself declares "Story Aeneid" and chain ID 1315, with the meta description "Claim your IP
testnet tokens for free — one drip per network every 12 hours." That is enough to give a human
a concrete funding route, and it is recorded as `AENEID_FAUCET_URL`.

**What is still not verified: the quantity per drip.** Third-party sources disagree with each
other and with the faucet's own copy (5 IP/24h vs a base drip on a 12-hour cooldown vs
0.1 IP/day). The faucet's own description does not state an amount. Rather than pick the
most plausible-sounding number, the amount is recorded as **UNVERIFIED** — and it does not
affect the build, because the harness reads `allocateFee()` / `writeFee()` / `readFee()` from
chain at runtime instead of assuming a required balance.

The official Story faucet hosts (`faucet.story.foundation`,
`aeneid.faucet.story.foundation`) both return HTTP 403, consistent with bot protection.
403 neither confirms nor denies the route, so they are recorded as **INCONCLUSIVE** and are
not used.

Per build-spec §1.1 no guessed faucet URL is published, and no faucet amount is asserted.

### Note A2 — no storage service is on the critical path (decided 2026-10-05)

The CDR SDK offers a file-based flow — `uploadFile` / `downloadFile`, aliased as
`createFileVault` / `readFileVault` — but those methods **require a `StorageProvider`**
(Helia / Storacha / Synapse ship in the SDK). That would put a third-party storage network
with its own availability and pricing on the critical path.

The core path therefore uses `uploadCDR` / `accessCDR`, where the vault protects the
**data key** and content encryption is ours. The demo payload is encrypted with that key and
is small. **Result: no external storage dependency, no pinning service, no per-GB cost.** The
file API is listed as deliberately-not-used below.

### Note B — Vercel free-tier terms not re-verified today

Vercel's Hobby tier is widely used for Next.js and is free, but build-spec §9 requires
verifying *current* documentation rather than assuming, and master-prompt §10 requires
recording payment-card requirements. This is a **BUILD 9 gate item**: before deploying we
re-read Vercel's current pricing/limits page and record:

- whether the Hobby tier still covers the required runtime and function duration;
- the current function timeout on Hobby (matters — a CDR read polls for validator partials);
- whether any card is required to sign up.

If Hobby cannot support the required read duration, that is a **BLOCKED** condition to
report, not something to paper over.

---

## Deliberately NOT used

Each of these was considered and rejected, because a $0 core path is a hard requirement.

| Rejected | Why |
|---|---|
| Paid RPC providers (Alchemy, Infura paid tiers) | Aeneid's public RPC works and costs nothing. Adding a paid provider would put the core path behind a card. |
| **Any `StorageProvider` (Helia / Storacha / Synapse)** | The SDK's `uploadFile`/`downloadFile` methods *require* one. Choosing them would put a third-party storage network — with its own availability and pricing — on the critical path. `uploadCDR`/`accessCDR` protect the **data key** with no storage provider at all. Decided 2026-10-05, see Note A2. |
| Paid storage (Pinata paid, Storacha paid tiers) | Not needed — the smallest real vault keeps the payload tiny, and the core path uses no storage network at all. |
| Paid hosting other than Vercel | The spec names Vercel. |
| Paid databases (Supabase paid, Neon paid) | **No database is needed at all.** Build-spec §1.19: a local database must never become the authorization source of truth. The chain is the source of truth. Not adding one removes a whole class of problems. |
| Paid AI / LLM APIs | Explicitly out of MVP scope (build-spec §1.15, §31). |
| Paid monitoring / analytics | Out of scope, and adds nothing a judge needs. |
| Any service requiring credits before the core flow works | Master-prompt §8: not a free dependency. |

---

## Cost of the demo itself

| Item | Cost |
|---|---|
| Aeneid testnet gas + CDR protocol fees | $0 — testnet DATA from a faucet, no monetary value |
| Hosting the demo | $0 — Vercel Hobby |
| CI | $0 — GitHub Actions |
| Wallet | $0 — a fresh disposable testnet wallet |
| **Total** | **$0** |

**No step in the demo requires the user to spend money or enter a card number.**

---

## Gate result

**`ZERO-COST CORE PATH PASS`** — the core path is free and card-free.

Two items are honestly flagged rather than assumed: the faucet route and Vercel's current
free-tier terms. Neither introduces cost; both are verification debts to clear before the
phases that depend on them (BUILD 2 for the faucet, BUILD 9 for Vercel).
