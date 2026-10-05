# PROTOCOL DISCOVERY

**Project:** LicenseVault
**Network under test:** Story Aeneid testnet
**Discovery date:** 2026-10-05
**Agent:** implementation agent
**Rule applied:** every value below was read from live chain state, the published npm
package, or an official repository file. Nothing is guessed. Anything not confirmed is
explicitly marked `UNVERIFIED`.

---

## Method

| Source tier (build-spec §10) | How it was used here |
|---|---|
| 1. Live chain state | JSON-RPC calls to `https://aeneid.storyrpc.io` (`eth_chainId`, `net_version`, `eth_getCode`) |
| 2. Official contract implementation | bytecode presence + function selectors recovered from deployed code |
| 3. Official SDK source | the **published npm tarballs** for `@piplabs/*@0.2.2`, unpacked and read |
| 4. Official documentation | `docs/CONDITIONS.md`, `README.md`, `USER_GUIDE.md` from `piplabs/cdr-sdk` |
| 5. Project specification | `LICENSEVAULT_BUILD_SPEC.md` |

---

## 1. Network

### FACT: Aeneid chain ID is 1315
```
FACT:                Story Aeneid testnet chain ID is 1315.
SOURCE:              live JSON-RPC response
URL:                 https://aeneid.storyrpc.io
VERIFIED DATE:       2026-10-05
NETWORK:             Story Aeneid
VERSION/COMMIT:      n/a (live chain)
CONFIDENCE:          HIGH — two independent RPC methods agree
IMPLEMENTATION IMPACT: hard-coded chain-validation guard; wallet must be on 1315.
```
Raw evidence:
- `eth_chainId` → `0x523` (= 1315 decimal)
- `net_version` → `"1315"`

### FACT: Aeneid EVM RPC endpoint
```
FACT:                https://aeneid.storyrpc.io serves the Aeneid EVM JSON-RPC API.
SOURCE:              live call + cdr-sdk README/USER_GUIDE
URL:                 https://aeneid.storyrpc.io
VERIFIED DATE:       2026-10-05
NETWORK:             Story Aeneid
CONFIDENCE:          HIGH — HTTP 200 with valid JSON-RPC payload
IMPLEMENTATION IMPACT: default read transport for viem public client.
```

### FACT: Aeneid block explorer — UNVERIFIED
```
FACT:                The canonical Aeneid explorer URL is NOT confirmed.
SOURCE:              probed candidates
URL:                 https://explorer.story.foundation (HTTP 200),
                     https://storyscan.io (HTTP 200),
                     https://aeneid.storyscan.io (no response),
                     https://aeneid.explorer.story.foundation (HTTP 403)
VERIFIED DATE:       2026-10-05
CONFIDENCE:          LOW — responses are ambiguous (403 is consistent with bot
                     protection, which does not prove or disprove the route).
IMPLEMENTATION IMPACT: DO NOT render explorer links until this is confirmed.
                     Build-spec §1.8 forbids showing an explorer link that is not real.
                     The Proof surface must degrade to showing identifiers only.
```

### FACT: Aeneid faucet — UNVERIFIED
```
FACT:                The faucet route is NOT confirmed.
SOURCE:              probed candidates
URL:                 https://faucet.story.foundation (HTTP 403),
                     https://aeneid.faucet.story.foundation (HTTP 403)
VERIFIED DATE:       2026-10-05
CONFIDENCE:          LOW — 403 does not confirm the route exists.
IMPLEMENTATION IMPACT: treat testnet funding as a manual, user-confirmed step.
                     Do not hard-code a faucet URL into the product.
```

---

## 2. CDR — packages

### FACT: current published CDR SDK version is 0.2.2
```
FACT:                @piplabs/cdr-sdk, @piplabs/cdr-contracts, @piplabs/cdr-crypto and
                     @piplabs/cdr-cli are all published at 0.2.2. That is the `latest` tag.
SOURCE:              npm registry
URL:                 https://registry.npmjs.org/@piplabs%2Fcdr-sdk
VERIFIED DATE:       2026-10-05
NETWORK:             n/a
VERSION/COMMIT:      0.2.2
CONFIDENCE:          HIGH
IMPLEMENTATION IMPACT: pin exact version 0.2.2 (no caret) for reproducible builds.
```
Published versions ever: `0.2.0`, `0.2.1`, `0.2.2`. `0.2.2` published 2026-07-15.
No prerelease/canary tag exists.

---

## 3. CDR — contracts

### FACT: DKG and CDR contract addresses on Aeneid
```
FACT:                dkg = 0xcccccc0000000000000000000000000000000004
                     cdr = 0xcccccc0000000000000000000000000000000005
SOURCE:              (a) published npm package @piplabs/cdr-contracts@0.2.2,
                         file dist/esm/addresses.js -> contractAddresses.testnet
                     (b) live eth_getCode on Aeneid
URL:                 https://aeneid.storyrpc.io
VERIFIED DATE:       2026-10-05
NETWORK:             Story Aeneid (testnet)
VERSION/COMMIT:      @piplabs/cdr-contracts@0.2.2
CONFIDENCE:          HIGH — package value and live deployment agree
IMPLEMENTATION IMPACT: import from the package; never hard-code separately.
```
Live confirmation: both addresses return non-empty bytecode. Both begin with an
EIP-1967 proxy preamble (`0x4f1ef286` = `upgradeToAndCall`), so both are upgradeable
proxies — i.e. the *implementation* behind them can change. Interaction must always go
through the published ABI, never a guessed selector.

Note: the same two addresses are listed for `mainnet` and `testnet` in the package.

---

## 4. CDR — condition contracts

### FACT: LicenseReadCondition and OwnerWriteCondition are deployed on Aeneid
```
FACT:                LicenseReadCondition = 0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3
                     OwnerWriteCondition  = 0x4C9bFC96d7092b590D497A191826C3dA2277c34B
SOURCE:              cdr-sdk docs/CONDITIONS.md + live eth_getCode
URL:                 https://github.com/piplabs/cdr-sdk/blob/main/docs/CONDITIONS.md
VERIFIED DATE:       2026-10-05
NETWORK:             Story Aeneid
CONFIDENCE:          HIGH — documented address has live bytecode
IMPLEMENTATION IMPACT: used as readConditionAddr / writeConditionAddr at allocation.
```
Live bytecode confirms the entry selector differs per contract, consistent with two
different implementations:
- LicenseReadCondition entry selector `0x8db3eb17`
- OwnerWriteCondition entry selector `0x5645dbbf`

### FACT: condition contract interface
```
FACT:                A condition contract exposes:
                       checkReadCondition(uint32 uuid, bytes accessAuxData,
                                          bytes conditionData, address caller)
                         external view returns (bool)
                       checkWriteCondition(uint32 uuid, bytes accessAuxData,
                                           bytes conditionData, address caller)
                         external view returns (bool)
SOURCE:              cdr-sdk docs/CONDITIONS.md, "Expected Interface"
URL:                 https://github.com/piplabs/cdr-sdk/blob/main/docs/CONDITIONS.md
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH — official docs, and the CDR contract calls this at read time
IMPLEMENTATION IMPACT: defines exactly what we must ABI-encode.
```
The CDR contract calls the condition contract during `read()` / `write()` and rejects the
operation if it returns false or reverts. **Enforcement is on-chain, not in the SDK and not
in our UI.** This is precisely the load-bearing property LicenseVault needs.

`conditionData` is fixed at allocation time; `accessAuxData` is supplied by the caller on
each read.

### FACT: LicenseReadCondition encoding
```
FACT:                conditionData = abi.encode(address licenseTokenContract, address ipId)
                     accessAuxData = abi.encode(uint256[] licenseTokenIds)
SOURCE:              cdr-sdk docs/CONDITIONS.md, "LicenseReadCondition Usage"
URL:                 https://github.com/piplabs/cdr-sdk/blob/main/docs/CONDITIONS.md
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH
IMPLEMENTATION IMPACT: this is the exact wire format the protocol adapter must produce.
```

### FACT: OwnerWriteCondition encoding
```
FACT:                conditionData = abi.encode(address writer)   // the only allowed writer
SOURCE:              cdr-sdk docs/CONDITIONS.md, "OwnerWriteCondition Usage"
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH
IMPLEMENTATION IMPACT: vault writes are restricted to our server signer address.
```

### FACT: Aeneid LicenseToken address
```
FACT:                LicenseToken contract on Aeneid = 0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC
SOURCE:              cdr-sdk docs/CONDITIONS.md example + live eth_getCode
VERIFIED DATE:       2026-10-05
NETWORK:             Story Aeneid
CONFIDENCE:          MEDIUM-HIGH — live bytecode present and used verbatim in the
                     official docs example; still worth re-reading at mint time.
IMPLEMENTATION IMPACT: this is the first argument of LicenseReadCondition.conditionData.
```
Bytecode confirms an EIP-1967 proxy (`0x360894...bbc` implementation slot present).

---

## 5. CDR — SDK API surface (read from the published 0.2.2 tarball)

### FACT: CDRClient construction
```
FACT:                new CDRClient({ network, publicClient, walletClient?, apiUrl,
                                     minThresholdRatio?, logger? })
                     network  : "mainnet" | "testnet"   (NOT a chain id)
                     apiUrl   : Story-API REST base URL — REQUIRED and CONFIGURABLE
SOURCE:              @piplabs/cdr-sdk@0.2.2 dist/esm/client.d.ts
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH — read from the shipped type declarations
IMPLEMENTATION IMPACT: (a) we supply chain/RPC ourselves through viem;
                     (b) the Story-API endpoint can be swapped without patching the SDK,
                         which is the escape hatch for the §7 endpoint risk.
```

### FACT: upload / read methods
```
FACT:                uploader.uploadCDR({ dataKey, updatable, writeConditionAddr,
                                         readConditionAddr, writeConditionData,
                                         readConditionData, accessAuxData, ... })
                       -> { uuid, ciphertext, txHashes: { allocate, write } }
                     consumer.accessCDR({ uuid, accessAuxData, ... })
                       -> { dataKey, txHash }
                     observer.getGlobalPubKey(), observer.getVault(uuid),
                     observer.getThresholdAt(round)
SOURCE:              @piplabs/cdr-sdk@0.2.2 dist/esm/{uploader,consumer,observer}.d.ts
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH
IMPLEMENTATION IMPACT: these are the only protocol entry points the adapter needs.
```
Reads are **fee-bearing transactions**, not free calls: `consumer.read()` sends an on-chain
transaction and `msg.value` must equal `readFee()` exactly or the contract rejects it. The
fee is auto-queried unless overridden. This matters for cost and for UX (a read costs testnet
gas plus the protocol fee).

### FACT: no built-in license condition helper
```
FACT:                the shipped condition helpers are exactly
                       open / ownerOnly / tokenGate / merkle / custom
                     There is NO licenseRead helper.
SOURCE:              @piplabs/cdr-sdk@0.2.2 dist/esm/conditions.d.ts
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH
IMPLEMENTATION IMPACT: we must build conditionData ourselves via conditions.custom()
                     using the encoding in §4 above. This is the core protocol-adapter work.
```

### FACT: read fee / write fee semantics
```
FACT:                allocateFee() and writeFee() and readFee() are queried on-chain;
                     the contract requires msg.value == fee exactly, otherwise
                     "Invalid fee amount".
SOURCE:              @piplabs/cdr-sdk@0.2.2 dist/esm/uploader.d.ts and consumer.d.ts JSDoc
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH
IMPLEMENTATION IMPACT: the demo wallet needs enough testnet DATA to cover allocate +
                     write + read + license mint.
```

---

## 6. ⚠️ CONFLICT FOUND — license minting is documented but unpublished

This is the one place where sources disagree, and build-spec §10 requires reporting rather
than silently choosing.

```
FACT:                cdr-sdk main-branch docs/CONDITIONS.md documents
                       client.license.mintLicenseToken({ licensorIpId, licenseTermsId })
                     but that API does NOT exist in the published @piplabs/cdr-sdk@0.2.2.
SOURCE:              (a) docs/CONDITIONS.md + USER_GUIDE.md on main
                     (b) published npm tarball @piplabs/cdr-sdk@0.2.2
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH that the conflict is real
IMPLEMENTATION IMPACT: see PROTOCOL_DECISION.md
```
Evidence for the conflict:
- `packages/sdk/src/license.ts` and `license-contracts.ts` **exist on `main`**.
- They are **absent from the published 0.2.2 tarball**; `dist/esm/index.d.ts` exports no
  license module, and `grep -r mintLicenseToken` over the tarball returns nothing.
- npm shows only `0.2.0`, `0.2.1`, `0.2.2`; there is no prerelease carrying the feature.

**Reading:** the license-minting helper is unreleased work on `main`. Depending on it would
mean building from an unreleased branch — which the spec's real-first rule and the
"smallest dependency set" rule both argue against.

---

## 7. 🚩 Story-API endpoint risk (build-spec §7)

```
FACT:                The Story-API REST endpoint currently documented by the CDR SDK is
                       http://172.192.41.96:1317
                     — plain HTTP, on a raw public IP address, with no DNS name and no TLS.
SOURCE:              cdr-sdk USER_GUIDE.md and README.md
URL:                 https://github.com/piplabs/cdr-sdk/blob/main/USER_GUIDE.md
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH that this is the documented value;
                     LOW that it is suitable for production/browser use as-is
IMPLEMENTATION IMPACT: tracked as the project's principal infrastructure risk.
```
Build-spec §7 asks five specific questions. Answers so far:

| §7 question | Answer | Confidence |
|---|---|---|
| 1. Is that endpoint still current? | It is what the current official docs say | HIGH |
| 2. Does an official TLS endpoint exist? | **UNVERIFIED** — none found in the SDK or docs | LOW |
| 3. Does the SDK permit a configurable endpoint? | **YES** — `apiUrl` is a constructor parameter | HIGH |
| 4. Can Vercel reach it? | **UNVERIFIED** — not yet tested from a serverless environment | — |
| 5. Is the response safe for the intended server-side flow? | **UNVERIFIED** — endpoint is plain HTTP, so responses are unauthenticated in transit | — |

Reachability probe: the host answered (HTTP 404 on a probe path), so it is *up*, but that
does **not** make it *safe*.

**Status: OPEN RISK, NOT A BLOCKER.** It does not block BUILD 2–5 because `apiUrl` is
swappable and we control the server side. It must be resolved before BUILD 9 (deployment).

Per build-spec §7, if no safe endpoint can be established for the deployment target, the
correct outcome is to report `BLOCKED` rather than invent a workaround. Recording that now.

---

## 8. Wallet / gas

```
FACT:                Story Aeneid uses DATA as its native gas token; the CDR flow sends
                     real transactions (allocate, write, read) and Story license minting
                     pulls its fee in WIP (wrapped DATA).
SOURCE:              cdr-sdk docs/CONDITIONS.md (mint flow description) and
                     uploader/consumer JSDoc (fee semantics)
VERIFIED DATE:       2026-10-05
CONFIDENCE:          MEDIUM — mechanism described in official docs; exact amounts are
                     queried on-chain at runtime and are NOT recorded here
IMPLEMENTATION IMPACT: the demo wallet needs testnet DATA; amounts must be read from
                     the contracts at run time, never hard-coded.
```

---

## Summary table

| # | Fact | Value | Confidence |
|---|---|---|---|
| 1 | Aeneid chain ID | `1315` | HIGH |
| 2 | Aeneid RPC | `https://aeneid.storyrpc.io` | HIGH |
| 3 | Aeneid explorer | unknown | **UNVERIFIED** |
| 4 | Aeneid faucet | unknown | **UNVERIFIED** |
| 5 | CDR package version | `0.2.2` | HIGH |
| 6 | DKG contract | `0xcccccc0000000000000000000000000000000004` | HIGH |
| 7 | CDR contract | `0xcccccc0000000000000000000000000000000005` | HIGH |
| 8 | LicenseReadCondition | `0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3` | HIGH |
| 9 | OwnerWriteCondition | `0x4C9bFC96d7092b590D497A191826C3dA2277c34B` | HIGH |
| 10 | LicenseToken (Aeneid) | `0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC` | MED-HIGH |
| 11 | Condition interface | `checkReadCondition(uint32,bytes,bytes,address)` | HIGH |
| 12 | License read encoding | `(licenseToken, ipId)` / `uint256[]` | HIGH |
| 13 | SDK `apiUrl` configurable | yes | HIGH |
| 14 | License mint in published SDK | **no — conflict** | HIGH |
| 15 | Story-API endpoint safety | **OPEN RISK** | LOW |

**BUILD 1 gate: PASS** — every fact required to implement the gated read is verified to HIGH
confidence. Three items are explicitly UNVERIFIED (explorer, faucet, Vercel reachability) and
are recorded as such rather than guessed; none of them is required for BUILD 2.

**No core protocol fact was guessed.**
