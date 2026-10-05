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

### Note A — faucet route is UNVERIFIED

Candidate faucet URLs returned HTTP 403, which is consistent with bot protection and does
**not** confirm the route exists. The exact faucet URL must be confirmed before we instruct
the user to fund a wallet, and it must be confirmed again at demo time. Per build-spec §1.1
we will not publish a guessed faucet URL.

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
| Paid storage (Pinata paid, Storacha paid tiers) | Not needed for BUILD 2 — the smallest real vault keeps the payload tiny. Revisit only if the file path is chosen, and only on a free tier. |
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
