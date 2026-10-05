# LicenseVault

> **A license should open the door.**
>
> LicenseVault turns an onchain IP license into a real access permission for protected
> digital content.

A protected digital asset stays locked until the connected wallet holds the license
required to read it.

**BLI Legal Tech Hackathon 2** · development network: **Story Aeneid** (chain `1315`)

---

## The one workflow

```
PROTECTED RESOURCE
      ↓
LICENSE REQUIRED
      ↓
WALLET WITHOUT LICENSE
      ↓
READ REJECTED          ← enforced on-chain by a condition contract
      ↓
OBTAIN CORRECT LICENSE
      ↓
READ AGAIN
      ↓
READ ALLOWED           ← enforced on-chain, not in the UI
      ↓
PROTECTED CONTENT RECOVERED
      ↓
VERIFIABLE PROOF
```

The protocol produces the access decision. The interface only explains it.

---

## Status — read this before judging the demo

This repository is being built strictly in the phase order defined by
[`LICENSEVAULT_BUILD_SPEC.md`](./LICENSEVAULT_BUILD_SPEC.md). The build contract forbids
building the polished frontend before the real protocol spike passes.

| Phase | | Status |
|---|---|---|
| BUILD 0 | Repo + environment | ✅ done |
| BUILD 1 | Protocol discovery | ✅ done — every fact verified against live chain state |
| BUILD 2 | Real protected resource on Aeneid | ⬜ next |
| BUILD 3 | Unauthorized read rejection | ⬜ |
| BUILD 4 | Real licensed access | ⬜ |
| BUILD 5 | Evidence + independent verifier | ⬜ |
| BUILD 6 | Core application | ⬜ |
| BUILD 7 | Visual implementation | ⬜ |
| BUILD 8 | Security / hardening | ⬜ |
| BUILD 9 | Vercel deployment | ⬜ |
| BUILD 10 | Demo / submission | ⬜ |

**What exists right now is real, but it is not yet the product.** The landing page shows the
Access Docket in its `RESTRICTED` state with the primary action deliberately **disabled**,
because no protected vault has been created on Aeneid yet and therefore no real access
decision exists to report. See [`PROGRESS.md`](./PROGRESS.md) for the live state.

---

## What is verified so far

Every value below was read from **live chain state** or the **published npm package** — none
is guessed. Full evidence, sources and confidence levels:
[`docs/PROTOCOL_DISCOVERY.md`](./docs/PROTOCOL_DISCOVERY.md).

| Fact | Value |
|---|---|
| Aeneid chain ID | `1315` (live `eth_chainId` → `0x523`) |
| Aeneid RPC | `https://aeneid.storyrpc.io` |
| CDR SDK version | `@piplabs/cdr-sdk@0.2.2` |
| DKG contract | `0xcccccc0000000000000000000000000000000004` |
| CDR contract | `0xcccccc0000000000000000000000000000000005` |
| LicenseReadCondition | `0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3` |
| OwnerWriteCondition | `0x4C9bFC96d7092b590D497A191826C3dA2277c34B` |
| LicenseToken (Aeneid) | `0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC` |

### The mechanism

A CDR vault is allocated with a read condition. At read time the CDR contract calls that
condition contract on-chain:

```solidity
function checkReadCondition(
    uint32 uuid,
    bytes calldata accessAuxData,   // supplied by the caller on each read
    bytes calldata conditionData,   // fixed at allocation time
    address caller
) external view returns (bool);
```

`LicenseReadCondition` returns true only for holders of a Story license token for the encoded
IP asset. If it returns false or reverts, **the read transaction reverts on-chain**. The gate
is therefore not something the frontend can be talked out of.

---

## Repository layout

```
app/                        Next.js App Router surfaces
lib/
  protocol/constants.ts     VERIFIED protocol values, each with provenance
  protocol/conditions.ts    condition + access-proof ABI encoding (pure, tested)
  protocol/network.ts       chain validation
  access/state.ts           the access state machine and failure classification
tests/                      unit tests (fast, no network)
tools/                      protocol harness + evidence verifier (BUILD 2+)
docs/                       discovery, decisions, claims, security, cost
evidence/                   canonical run artifacts — created only after real events
PROGRESS.md                 live build state — updated at every phase boundary
```

### Design rule worth knowing

`lib/access/state.ts` makes a fake success **structurally impossible**, not merely
discouraged. `UNLOCKED` requires evidence carrying a real read transaction hash and a
measured plaintext length. `NO_LICENSE` requires evidence that the protocol actively
refused. A timeout is classified as an infrastructure failure and can never be rendered as
"you do not have a license." The unit tests in `tests/state.test.ts` assert exactly that.

---

## Local development

Heavy work (install, build, full test suite) is designed to run in **GitHub Actions**, not
on a low-memory dev machine. See `.github/workflows/ci.yml`.

```bash
cp .env.example .env.local     # then fill in values
npm ci                         # or: npm install
npm run dev                    # http://localhost:3000
```

Useful commands:

```bash
npm run lint
npm run typecheck
npm test                       # fast unit tests, no network
npm run build
```

---

## Secrets

Never commit `.env`, `.env.local`, private keys, seed phrases or wallet files. Never put a
private key behind a `NEXT_PUBLIC_*` variable — that ships it to the browser. Only
`.env.example`, with safe placeholders, is committed. CI fails the build if a key-shaped
string or a `NEXT_PUBLIC_*PRIVATE_KEY` appears in tracked files.

---

## Documents

- [`LICENSEVAULT_BUILD_SPEC.md`](./LICENSEVAULT_BUILD_SPEC.md) — the primary build contract
- [`LICENSEVAULT_DEEPSEEK_MASTER_PROMPT.md`](./LICENSEVAULT_DEEPSEEK_MASTER_PROMPT.md) — agent operating rules
- [`PROGRESS.md`](./PROGRESS.md) — live build state
- [`docs/PROTOCOL_DISCOVERY.md`](./docs/PROTOCOL_DISCOVERY.md) — every verified protocol fact, with sources
- [`docs/PROTOCOL_DECISION.md`](./docs/PROTOCOL_DECISION.md) — the technical choices and why
- [`docs/CLAIM_STATUS.md`](./docs/CLAIM_STATUS.md) — what is proven, observed, inferred, and explicitly *not* claimed

---

## What LicenseVault does not claim

It does not prevent copying by someone who is licensed to read. It is not universal DRM. It
does not guarantee copyright compliance, and it does not give legal advice. It is scoped to
one protected resource gated by one onchain licensing condition, on a testnet.

The claim it does make:

> **LicenseVault uses an onchain licensing condition to control access to protected digital
> content.**
