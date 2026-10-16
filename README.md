# LicenseVault

> **A license should open the door.**
>
> LicenseVault turns an onchain IP license into a real access permission for protected
> digital content.

A protected digital asset stays locked until the connected wallet holds the license
required to read it.

**BLI Legal Tech Hackathon 2** · development network: **Story Aeneid** (chain `1315`)

### ▶ Live: **https://licensevault.vercel.app**

Open it and paste `0x226e01730F6991C1BD11f58d1204638bee89A863` (the recorded licence holder) or
`0x75D900D18866D8aA416CCEFD9e85D2C61dB0aCa9` (the contract owner, who holds no licence). Both
answers come from a real `eth_call` to the vault's read condition on live Aeneid, made by the
deployed server with **no key, no gas and no signature**.

The browser now supports the complete protected-read workflow: wallet connection, licence verification, signing the CDR read, recovering and decrypting the manifest, and verifying its SHA-256 digest. The successful browser run reported a 32-byte data key, decrypted the 804-byte manifest, and matched the expected digest `46cab4a8232e4eea226500b424416a353618c8606008d374dbb15f56bc864cd7`. The recovered payload is a JSON delivery manifest, **not the five individual files listed inside it**; see [asset provenance](./docs/ASSET_PROVENANCE.md) and [limitations](./docs/LIMITATIONS.md).

The read is a real CDR protocol operation, not a simulated UI state. The browser wallet signs the operation; the app does not ask for or receive the user's private key. A read may require testnet gas and protocol fees depending on the live protocol configuration. The successful run reported a zero CDR protocol read fee, with gas separate. The separate read-only gate probes in `evidence/licensevault-aeneid-001/gate-probes.json` show a holder allowed and a non-holder denied by the on-chain condition; those probes are `eth_call` checks, not protected-read transactions.

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

## Current demo status

The deployed app has completed the browser flow for the configured demo resource. The successful run reached all five checkpoints: wallet connection, licence verification, signed CDR read, manifest recovery/decryption, and content hash verification. The manifest hash matched the expected SHA-256 digest. The UI exposes a download of the recovered manifest after successful verification.

This is a **testnet MVP**, not a production rights-management system. It gates access to one fictional resource's encrypted JSON manifest on Story Aeneid (chain 1315). The manifest lists five asset files as metadata; those individual SVG, EPS, palette, and PDF binaries are not part of the protected payload. See [limitations](./docs/LIMITATIONS.md), [security model](./docs/SECURITY.md), and [asset provenance](./docs/ASSET_PROVENANCE.md).

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
