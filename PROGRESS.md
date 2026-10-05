# LICENSEVAULT — LIVE BUILD PROGRESS

> **This file is the running state of the project. It is updated at every phase boundary.**
> Last updated: 2026-10-05 (Phase 1 — Protocol Discovery)

**Repo:** https://github.com/Temmygabriel/LicenseVault
**Local:** `C:\Users\USER\Documents\HACKATHONS BUILDS\BLI_LEGALTECH_HACK\LICENSEVAULT`
**Contracts read:** `LICENSEVAULT_BUILD_SPEC.md` (2005 lines) + `LICENSEVAULT_DEEPSEEK_MASTER_PROMPT.md` (1620 lines)

---

## PHASE STATUS

| Phase | Name | Status |
|---|---|---|
| BUILD 0 | Repo + environment | ⏳ IN PROGRESS |
| BUILD 1 | Protocol discovery | ⏳ IN PROGRESS |
| BUILD 2 | Real protected resource | ⬜ NOT STARTED |
| BUILD 3 | Unauthorized read rejection | ⬜ NOT STARTED |
| BUILD 4 | Real licensed access | ⬜ NOT STARTED |
| BUILD 5 | Evidence + verifier | ⬜ NOT STARTED |
| BUILD 6 | Core application | ⬜ NOT STARTED |
| BUILD 7 | Visual implementation | ⬜ NOT STARTED |
| BUILD 8 | Security / hardening | ⬜ NOT STARTED |
| BUILD 9 | Vercel deployment | ⬜ NOT STARTED |
| BUILD 10 | Demo / submission | ⬜ NOT STARTED |

Legend: ⬜ not started · ⏳ in progress · ✅ PASS · 🚫 BLOCKED · ❌ FAILED

---

## VERIFIED PROTOCOL FACTS (verified 2026-10-05)

All verified against **live chain state** and the **published npm package** — not guessed.

### Network — Story Aeneid
| Fact | Value | How verified |
|---|---|---|
| Chain ID | `1315` | Live `eth_chainId` → `0x523` **and** `net_version` → `1315` |
| EVM RPC | `https://aeneid.storyrpc.io` | Live call returned HTTP 200 + valid JSON-RPC |
| CDR SDK packages | `0.2.2` (all four) | npm registry `latest` dist-tag |

### CDR contracts (Aeneid)
| Contract | Address | How verified |
|---|---|---|
| DKG | `0xcccccc0000000000000000000000000000000004` | `eth_getCode` → deployed (ERC1967 proxy) |
| CDR | `0xcccccc0000000000000000000000000000000005` | `eth_getCode` → deployed (ERC1967 proxy) |

### Condition contracts (Aeneid)
| Contract | Address | How verified |
|---|---|---|
| LicenseReadCondition | `0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3` | `eth_getCode` → deployed, selector `0x8db3eb17` |
| OwnerWriteCondition | `0x4C9bFC96d7092b590D497A191826C3dA2277c34B` | `eth_getCode` → deployed, selector `0x5645dbbf` |
| LicenseToken (Aeneid) | `0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC` | `eth_getCode` → deployed (ERC1967 proxy) |

### SDK API surface (verified by reading the published 0.2.2 tarball)
- `new CDRClient({ network, publicClient, walletClient, apiUrl, minThresholdRatio?, logger? })`
  - `network` is `"mainnet" | "testnet"` — **not** a chain ID. RPC is supplied by the caller via a viem client.
  - `apiUrl` is **required** and **configurable** ✅ (answers build-spec §7 Q3)
- `client.uploader.uploadCDR(...)` → `{ uuid, ciphertext, txHashes: { allocate, write } }`
- `client.consumer.accessCDR(...)` → `{ dataKey, txHash }`
- `client.observer.getGlobalPubKey()`, `getVault(uuid)`, `getThresholdAt(round)`
- Condition helpers shipped: `open / ownerOnly / tokenGate / merkle / custom` — **no built-in `licenseRead` helper**

### Condition interface (from `docs/CONDITIONS.md`)
```solidity
function checkReadCondition(uint32 uuid, bytes calldata accessAuxData,
                            bytes calldata conditionData, address caller)
    external view returns (bool);
```
- `conditionData` is set **once at allocation**; `accessAuxData` is supplied **per read**.

**LicenseReadCondition encoding (verified from official docs):**
```ts
// at allocation time — static config
readConditionData = encodeAbiParameters(
  [{ type: "address" }, { type: "address" }],
  [ LICENSE_TOKEN_CONTRACT, IP_ID ],
);
// at read time — per caller
accessAuxData = encodeAbiParameters([{ type: "uint256[]" }], [[ BigInt(licenseTokenId) ]]);
```

**OwnerWriteCondition encoding:**
```ts
writeConditionData = encodeAbiParameters([{ type: "address" }], [uploaderAddress]);
```

---

## ⚠️ SOURCE CONFLICT — RESOLVED

`docs/CONDITIONS.md` on GitHub `main` documents:
```ts
client.license.mintLicenseToken({ licensorIpId, licenseTermsId })
```
**This does NOT exist in the published `@piplabs/cdr-sdk@0.2.2`.**

Evidence:
- npm has only `0.2.0`, `0.2.1`, `0.2.2` published (0.2.2 on 2026-07-15). No prerelease.
- `packages/sdk/src/license.ts` + `license-contracts.ts` exist on **main** but are absent from the published tarball.
- `index.d.ts` of 0.2.2 exports no license module.

**Resolution (per build-spec §10 source-of-truth order — published official SDK outranks repo docs):**
the license-minting feature is **unreleased**. LicenseVault will therefore:
1. use **`@piplabs/cdr-sdk@0.2.2`** for the protected vault (allocate / write / read / decrypt), and
2. mint the Story license token via Story's own official **`@story-protocol/core-sdk`** (npm `1.4.4`).

This keeps the dependency set published + stable, follows the spec's protocol-adapter architecture,
and avoids depending on unreleased `main`-branch code.

---

## 🚩 OPEN RISK — CDR Story-API endpoint (build-spec §7)

| Item | Finding |
|---|---|
| Documented `apiUrl` | `http://172.192.41.96:1317` |
| Protocol | **plain HTTP** (not TLS) |
| Host | raw public IP, no DNS name |
| Reachability | reachable — HTTP 404 on the probe path (host up) |
| SDK override | ✅ `apiUrl` is a constructor param — swappable without patching the SDK |
| Vercel viability | ❓ **UNVERIFIED** — a raw HTTP IP is fragile and insecure from serverless |

**Status: NOT yet a blocker.** Mitigations available: proxy server-side, or run our own
`story` node's `:1317` gateway. Must be resolved before BUILD 9 (deployment).

---

## DECISIONS MADE

1. **Package manager: npm** — pnpm is not installed locally and the spec says keep the toolchain small on an 8 GB machine. npm ships with Node 24.
2. **License minting via `@story-protocol/core-sdk`, not CDR SDK** — see conflict above.
3. **Heavy work goes to GitHub Actions** — local machine is 8 GB with limited data (master prompt §6/§7).
4. **`gh` CLI located** at `C:\Users\USER\AppData\Local\gh-install\bin\gh.exe` (not on PATH; authenticated as `Temmygabriel`, `repo` scope).

---

## NEXT ACTIONS

1. Scaffold BUILD 0: Next.js + TypeScript, `.gitignore`, `.env.example`, `docs/`, test structure.
2. Write `docs/PROTOCOL_DISCOVERY.md` + `docs/PROTOCOL_DECISION.md` from the verified facts above.
3. Add GitHub Actions CI (install → lint → typecheck → test → build) so heavy work runs in the cloud.
4. Add `docs/CLAIM_STATUS.md`, `docs/SECURITY.md`, `docs/COST_MATRIX.md`.
5. Commit + push to `Temmygabriel/LicenseVault`.
6. Then BUILD 2: smallest real protected vault on Aeneid (CLI harness, no UI).

---

## BLOCKERS

**None currently.** All BUILD 1 facts verified. The Story-API endpoint risk is tracked, not blocking BUILD 2–5.

---

## GUARDRAILS (restated so they are never lost)

- Never guess a protocol fact. Unknown = `UNVERIFIED`.
- Never mock a failed protocol operation and call it real.
- Never fabricate tx hashes or explorer links.
- Never show `ACCESS GRANTED` unless the real protected read succeeded.
- A timeout must **never** resolve to `NO LICENSE`.
- A local flag must **never** resolve to `UNLOCKED`.
- The protocol proves the access. The UI explains the access.
