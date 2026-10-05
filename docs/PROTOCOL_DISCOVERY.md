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

### FACT: Aeneid block explorer is `https://aeneid.datanetscan.io` — VERIFIED (was UNVERIFIED)
```
FACT:                The canonical Aeneid explorer is https://aeneid.datanetscan.io
SOURCE:              (a) the Data Foundation's own CDR docs index, which lists it as
                     "Explorer"; (b) independent cross-check of live block height.
URL:                 https://aeneid.datanetscan.io
                     https://aeneid.datanetscan.io/api/v2/blocks?type=block
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH — two independent confirmations:
                     (1) The explorer's block feed reported height 24525035 while the
                         Aeneid RPC returned eth_blockNumber = 0x17638eb = 24525035.
                         Same height → same chain.
                     (2) GET /tx/0x7fe1518410e5a90440fc902ef9abd5ec19dcc6d25ad3384d8d3f2c314e1adaee
                         → HTTP 200, the rendered page contained that hash, and
                         eth_getTransactionByHash confirmed the same tx on Aeneid.
                     Also consistent: coin_price null / market_cap "0" (testnet signature),
                     versus storyscan.io which reports a real token price and ~$75M cap
                     (i.e. storyscan.io is the MAINNET explorer, not Aeneid).
IMPLEMENTATION IMPACT: Explorer links may now be rendered — but ONLY for hashes that
                     genuinely exist on chain. AENEID_EXPLORER_URL is set, and
                     explorerTxUrl() exists so no call site builds a URL by hand.

### FACT: the previously-assumed explorer hosts are dead or belong to other networks
```
FACT:                aeneid.storyscan.io is NXDOMAIN; storyscan.io is mainnet.
SOURCE:              DNS lookup + live API probes
URL:                 https://aeneid.storyscan.xyz → 301 → https://aeneid.storyscan.io (dead host)
                     https://storyscan.io/api/v2/stats → live, reports a priced token
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH — nslookup aeneid.storyscan.io → "Non-existent domain".
IMPLEMENTATION IMPACT: A third-party config blob on the QuickNode faucet page still lists
                     "aeneid","Aeneid",1315,"https://aeneid.storyscan.io/" — that value is
                     stale. Do not reintroduce storyscan as the Aeneid explorer; a link to
                     a dead host is indistinguishable from a fabricated one.
```

### FACT: Story Protocol has rebranded — `story.foundation` now redirects to `datafdn.org`
```
FACT:                https://story.foundation and https://www.story.foundation both return
                     HTTP 308 → https://www.datafdn.org/ ("The Data Foundation").
                     Documentation has moved: https://docs.story.foundation currently serves
                     an EXPIRED TLS certificate (valid 2026-05-26 → 2026-08-24; expired ~6
                     weeks as of today) and no longer resolves over HTTPS from this host.
                     The live docs are at https://docs.datafdn.org (Mintlify, with .md and
                     llms.txt routes).
SOURCE:              live HTTP + openssl x509 inspection
URL:                 https://www.datafdn.org · https://docs.datafdn.org/llms.txt
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH — redirect chain and certificate dates read directly.
IMPLEMENTATION IMPACT: Cite docs.datafdn.org, not docs.story.foundation. No on-chain value
                     changed: the Aeneid RPC still returns chain id 1315 (0x523) and every
                     contract address in constants.ts remains live. The rebrand is a
                     documentation- and naming-level change, not a protocol change. Note
                     that the CDR SDK package scope is still @piplabs/*.
```

### FACT: the Aeneid faucet route — VERIFIED (was UNVERIFIED)
```
FACT:                https://faucet.quicknode.com/story is a reachable Story faucet that
                     explicitly covers Story Aeneid (chain 1315).
SOURCE:              the page's own metadata and structured data
URL:                 https://faucet.quicknode.com/story
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH for reachability and network identity (HTTP 200; page declares
                     "Story Aeneid" 17× and chain ID 1315 3×; meta description reads
                     "Claim your IP testnet tokens for free — one drip per network every
                     12 hours"). MEDIUM for the drip amount — see below.
IMPLEMENTATION IMPACT: AENEID_FAUCET_URL records this so a human has a concrete funding
                     route. Funding remains a MANUAL, user-performed step: the project
                     never automates a claim and never asks for a seed phrase.
```
```
NOTE — deliberately NOT recorded: the drip amount.
Third-party sources disagree with each other and with the faucet's own copy (5 IP/24h vs
a base drip with a 12-hour cooldown vs 0.1 IP/day). The faucet's own meta description is
the only first-party statement found ("one drip per network every 12 hours") and it does
not state a quantity. The amount is therefore recorded as UNVERIFIED rather than picked
from the most plausible-sounding source. It does not affect the build: the harness reads
the live allocate/write/read fee from chain rather than assuming a balance requirement.
```
```
NOTE — the official Story faucet endpoints could not be confirmed either way:
https://faucet.story.foundation and https://aeneid.faucet.story.foundation both return
HTTP 403, consistent with bot protection. 403 neither proves nor disproves the route, so
those URLs are recorded as INCONCLUSIVE and are not used.
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

### FACT: the official docs print an INVALID EIP-55 checksum for the CDR address
```
FACT:                The CDR runtime-configuration page prints the CDR address as
                     0xCcCcCC0000000000000000000000000000000005. That casing is not a
                     valid EIP-55 checksum — viem's isAddress() rejects it.
                     The correct checksum (computed from the lowercase form with viem's
                     getAddress) is 0xCCCcCC0000000000000000000000000000000005.
                     The DKG address in the same table, 0xCcCcCC…04, IS correct.
SOURCE:              https://docs.datafdn.org/developers/cdr-sdk/advanced-configuration
                     cross-checked against viem 2.57.3 getAddress/isAddress
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH — deterministic: recompute the checksum and compare.
IMPLEMENTATION IMPACT: This is a documentation typo, NOT a different contract. EIP-55
                     casing encodes no address data — it is a typo-detection scheme — so
                     the underlying 20 bytes are identical either way and the deployed
                     contract is unaffected. But any strict tool rejects the docs' form,
                     so constants.ts uses the computed-correct checksum, and
                     tests/constants.test.ts pins BOTH facts: that our constant is valid,
                     and that the docs' form is not. This stops a future contributor
                     "correcting" our constant back to the documented-but-broken casing.
                     It also demonstrates why every address here is validated rather
                     than pasted: the same check that caught our own test fixture earlier
                     caught an error in the official documentation.
```

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

### CORRECTION: the high-level aliases DO exist in published 0.2.2
```
FACT:                The docs describe createVault / readVault / createFileVault /
                     readFileVault / downloadFile / getRegisteredValidators as release
                     notes. All are PRESENT in the published 0.2.2 package — verified by
                     grepping the shipped dist, not by trusting the docs. They are
                     declared aliases on the classes:
                       Uploader.createVault     = uploadCDR
                       Uploader.createFileVault = uploadFile
                       Consumer.readVault       = accessCDR
                       Consumer.readFileVault   = downloadFile
SOURCE:              node_modules/@piplabs/cdr-sdk/dist/commonjs/{uploader,consumer}.d.ts
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH
IMPLEMENTATION IMPACT: This CORRECTS an incomplete BUILD 1 record. The earlier note
                     ("the license-mining feature is unreleased") was and remains true
                     for mintLicenseToken ONLY — grep still returns nothing for it in
                     0.2.2. But createVault/readVault et al. are NOT unreleased; they
                     ship in 0.2.2 as aliases. The build will use the canonical names
                     (uploadCDR/accessCDR) since those are what the aliases point at.
```

### FACT: the file-based vault API needs a StorageProvider — so we avoid it
```
FACT:                uploader.uploadFile / consumer.downloadFile require a
                     `storageProvider` (Helia / Storacha / Synapse providers ship in
                     dist/storage/*). They encrypt a file, upload it to that storage
                     network, and write a CID into the vault.
                     uploadCDR / accessCDR require NO storage provider: the vault holds
                     the TDH2-encrypted DATA KEY, and content encryption is the caller's.
SOURCE:              @piplabs/cdr-sdk@0.2.2 dist/{uploader,consumer,storage/types}.d.ts
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH — the parameter is mandatory in the type signature.
IMPLEMENTATION IMPACT: This decides the $0 core path. The file API would add an external
                     pinning/storage dependency (a third-party service with its own
                     availability and pricing). The core path therefore uses
                     uploadCDR/accessCDR: the vault protects the KEY, and the small demo
                     payload is encrypted with that key. Result: no storage service is
                     on the critical path. `uploadFile`/`downloadFile` are recorded as
                     deliberately-not-used in docs/COST_MATRIX.md.
```

### FACT: how our license condition plugs in — `conditions.custom`
```
FACT:                conditions.custom({ address, conditionData }) returns
                     { address, conditionData } — a pass-through for exactly this case:
                     a custom condition contract with pre-encoded data.
SOURCE:              @piplabs/cdr-sdk@0.2.2 dist/esm/conditions.d.ts
VERIFIED DATE:       2026-10-05
CONFIDENCE:          HIGH
IMPLEMENTATION IMPACT: our encodeLicenseReadConditionData() output is the conditionData
                     for conditions.custom({ address: LICENSE_READ_CONDITION_ADDRESS, ... }).
                     The SDK never needs to know what a license is — it forwards bytes.
                     (createVault also exposes skipConditionValidation, default false,
                     meaning the SDK validates the condition contract interface up front.
                     We keep validation ON: a condition address without the expected
                     interface should fail loudly at allocation, not silently at read.)
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
| 1. Is that endpoint still current? | **YES** — reconfirmed 2026-10-05 on the current official page, which is the *only* network row and is labelled "Plain HTTP. May change between deployments." | HIGH |
| 2. Does an official TLS endpoint exist? | **NO** — and the docs actively advise pointing `apiUrl` at your own node's REST gateway for production rather than using the shared endpoint | HIGH (that no TLS endpoint is offered); none exists in the SDK or docs |
| 3. Does the SDK permit a configurable endpoint? | **YES** — `apiUrl` is a required constructor parameter | HIGH |
| 4. Can Vercel reach it? | **UNVERIFIED** — not yet tested from a serverless environment | — |
| 5. Is the response safe for the intended server-side flow? | **PARTIALLY — see the trust analysis below.** Confidentiality holds; availability does not | HIGH on the mechanism |

Reachability probe: the host answered (HTTP 404 on a probe path), so it is *up*, but that
does **not** make it *safe*.

### Trust analysis — what the plain-HTTP endpoint actually exposes

The published 0.2.2 `Consumer` documentation states the model explicitly: partial decryptions
are read from `/dkg/cdr_partials`, the keeper has already verified each validator's signature
on ingress and dropped the signature bytes, and **"the SDK trusts the keeper at the same level
as any other authoritative chain RPC read."** So this endpoint *is* in the trust path — which
makes the plain-HTTP transport a real finding, not a cosmetic one.

Working through what an on-path attacker on `http://172.192.41.96:1317` could actually do:

| Property | Holds? | Why |
|---|---|---|
| **Confidentiality of the data key** | ✅ YES | Partials are ECIES-encrypted to the consumer's ephemeral public key. Without the recipient private key — which never leaves the client — a substitute partial yields nothing usable. Reading them off the wire does not reveal the key. |
| **Integrity of the recovered content** | ✅ YES | A forged or misrouted partial "would not yield a meaningful ECIES decryption… the resulting garbage bytes would propagate through `tdh2Combine` and ultimately fail at the outermost AES-GCM auth check." The vault ciphertext itself comes from chain, not from this endpoint. So a tampered read fails closed rather than yielding attacker-chosen plaintext. |
| **Availability of a read** | ❌ NO | An attacker (or simply the endpoint being down) can drop or corrupt partials so the poll never reaches threshold, and the read times out. Note the docs also warn the endpoint "may change between deployments" — so an outage is a realistic event, not just an attack. |
| **Deniability that a read was authorized** | ✅ YES | The authorization decision is made on-chain by `LicenseReadCondition`. The REST endpoint only serves partials *after* the chain has already permitted the read transaction. |

**Conclusion: the exposure is availability and operational fragility, not confidentiality.**
That is a materially different — and less severe — finding than "plain HTTP leaks the key",
and it is the reason this is tracked as an open risk rather than a blocker.

Two consequences the build must encode:

1. **A failure here must classify as `INFRASTRUCTURE_FAILURE`, never `NO_LICENSE`.** A dropped
   partial is not a missing licence. `classifyThrownError` already routes timeouts to
   `INFRASTRUCTURE_FAILURE`; this is the concrete scenario that rule exists for, and
   `tests/state.test.ts` pins it.
2. **`apiUrl` must be read from the environment, not inlined.** It is a shared, mutable,
   plain-HTTP host. `CDR_API_URL_AENEID` records the documented default, and `.env.example`
   exposes `CDR_API_URL` so it can be repointed at a self-hosted node without a code change.

Optional hardening available from the SDK, recorded but not yet adopted: `attestationConfig`
on `collectPartials`/`accessCDR` verifies each validator's SGX enclave (MRENCLAVE / MRSIGNER /
SVN) before accepting a partial, reporting untrusted ones via `onInvalidPartial`. The docs note
the attestation reports come from the per-round cache, so this costs no extra request.
Decision deferred to BUILD 8; noted in `docs/SECURITY.md` §5.

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
| 3 | Aeneid explorer | `https://aeneid.datanetscan.io` | **HIGH** (was UNVERIFIED) |
| 4 | Aeneid faucet | `https://faucet.quicknode.com/story` | **HIGH** reachability (was UNVERIFIED); amount UNVERIFIED |
| 5 | CDR package version | `0.2.2` | HIGH |
| 6 | DKG contract | `0xCcCcCC0000000000000000000000000000000004` | HIGH |
| 7 | CDR contract | `0xCCCcCC0000000000000000000000000000000005` | HIGH |
| 8 | LicenseReadCondition | `0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3` | HIGH |
| 9 | OwnerWriteCondition | `0x4C9bFC96d7092b590D497A191826C3dA2277c34B` | HIGH |
| 10 | LicenseToken (Aeneid) | `0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC` | MED-HIGH |
| 11 | Condition interface | `checkReadCondition(uint32,bytes,bytes,address)` | HIGH |
| 12 | License read encoding | `(licenseToken, ipId)` / `uint256[]` | HIGH |
| 13 | SDK `apiUrl` configurable | yes | HIGH |
| 14 | License mint in published SDK | **no — conflict** | HIGH |
| 15 | Story-API endpoint safety | **OPEN RISK** — availability, not confidentiality | HIGH (mechanism) |
| 16 | High-level aliases in 0.2.2 | `createVault`/`readVault`/`createFileVault`/`readFileVault` present | HIGH (corrects #14's neighbourhood) |
| 17 | File API needs a StorageProvider | yes → avoid on the $0 core path | HIGH |
| 18 | `conditions.custom` is the license plug-in point | yes | HIGH |
| 19 | Docs host | `docs.datafdn.org` (Story → Data Foundation rebrand; `docs.story.foundation` cert EXPIRED) | HIGH |
| 20 | Official docs checksum for CDR address | **INVALID** — `0xCcCcCC…05` fails EIP-55 | HIGH |

**BUILD 1 gate: PASS** — every fact required to implement the gated read is verified to HIGH
confidence. As of the 2026-10-05 re-verification pass, facts 3 and 4 are now VERIFIED
(explorer and faucet), leaving **one** genuinely unverified item — Vercel → CDR API
reachability — which is a BUILD 9 question and is not required for BUILD 2. Three
corrections to the original pass are recorded rather than quietly amended: the SDK-surface
list was incomplete (#16), the file/storage API was not previously accounted for (#17), and
the official docs contain a bad checksum (#20).

**No core protocol fact was guessed.** Where a source was wrong, the source is recorded as
wrong and the corrected value is pinned by a test.
