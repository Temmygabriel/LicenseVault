# ARCHITECTURE

**Project:** LicenseVault
**Last updated:** 2026-10-05

---

## The one sentence

A protected resource is stored so that reading it requires an on-chain CDR read, and that
read only succeeds when a Story Protocol license condition is satisfied.

---

## Layering

The build contract (§38) requires that protocol logic not be scattered through UI
components. The dependency direction is strictly one-way:

```
┌──────────────────────────────────────────────────────────────┐
│  UI  (app/, components/)                                     │
│  Renders state. Decides nothing about access.                │
│  Contains NO protocol calls, NO contract addresses inline.   │
└───────────────────────────┬──────────────────────────────────┘
                            │  reads state, dispatches events
┌───────────────────────────▼──────────────────────────────────┐
│  Access state machine  (lib/access/state.ts)                 │
│  The access decision as a type. Pure. No I/O. Unit-tested.   │
│  Success requires evidence objects; fakes are impossible.    │
└───────────────────────────┬──────────────────────────────────┘
                            │  events carry evidence
┌───────────────────────────▼──────────────────────────────────┐
│  Protocol adapter  (lib/protocol/)                           │
│  constants.ts  verified addresses + chain facts, w/ provenance│
│  conditions.ts condition + access-proof ABI encoding (pure)   │
│  network.ts    chain validation                               │
│  (BUILD 2+)    story.ts / cdr.ts — the only files that may    │
│                import @piplabs/cdr-sdk or @story-protocol/*   │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  Story RPC  ·  CDR Story-API  ·  Story/CDR contracts         │
│  THE SOURCE OF TRUTH                                         │
└──────────────────────────────────────────────────────────────┘
```

**Rule:** only files under `lib/protocol/` may import the protocol SDKs. If a component
imports `@piplabs/cdr-sdk`, the layering has been violated.

---

## The gated read, end to end

```
   ┌───────────────────────────────────────────────────────────────┐
   │ SETUP  (once, performed by the licensor)                      │
   └───────────────────────────────────────────────────────────────┘

   1. Register a Story IP asset                          [Story SDK]
              │  → ipId
              ▼
   2. Attach license terms ("Commercial Use")            [Story SDK]
              │  → licenseTermsId
              ▼
   3. Allocate a CDR vault                               [CDR SDK]
        readConditionAddr  = LicenseReadCondition
        readConditionData  = abi.encode(LicenseToken, ipId)   ← immutable
        writeConditionAddr = OwnerWriteCondition
        writeConditionData = abi.encode(our server writer)
              │  → vaultUuid
              ▼
   4. Write the encrypted payload to the vault           [CDR SDK]
        (the data key is TDH2-encrypted to the DKG public key)

   ┌───────────────────────────────────────────────────────────────┐
   │ READ  (per user)                                              │
   └───────────────────────────────────────────────────────────────┘

   5. User's wallet requests a read                      [CDR SDK]
        accessAuxData = abi.encode(uint256[] [licenseTokenId])
              │
              ▼
   6. CDR contract calls:                                [ON-CHAIN]
        LicenseReadCondition.checkReadCondition(uuid, accessAuxData,
                                                conditionData, caller)
              │
       ┌──────┴───────┐
       │ false/revert │ true
       ▼              ▼
   READ REVERTED   read() succeeds
   (NO LICENSE)    → validators supply ECIES partials
                        │
                        ▼
                   collect threshold partials from CDR Story-API
                        │
                        ▼
                   TDH2 combine → data key
                        │
                        ▼
                   AES-GCM decrypt → plaintext
                        │
                        ▼
                   UNLOCKED
```

Step 6 is the product. Steps 5 and 6 together are why a frontend cannot fake the outcome:
the revert happens in the contract, and the plaintext cannot be recovered without partial
decryptions that the chain's state gates.

---

## Why the license and the vault are joined this way

`conditionData` is written **once**, at allocation, and is immutable. It fixes the pair
`(LicenseToken contract, ipId)` that this vault will *ever* accept. That means:

- the client cannot choose which IP it is claiming a license for;
- the client cannot substitute a different license token contract;
- the only thing the client supplies per read is *which* token IDs it holds — and the
  condition contract validates those against the caller's actual on-chain balance.

The client's entire freedom is "here are my token IDs." Everything else is pinned.

---

## Files

| Path | Role | I/O? |
|---|---|---|
| `lib/protocol/constants.ts` | Verified addresses, chain id, run id. Every value carries its provenance. | no |
| `lib/protocol/conditions.ts` | Builds/reads the condition and access-proof ABI blobs. Pure functions. | no |
| `lib/protocol/network.ts` | Chain validation. Throws `WrongNetworkError`. | no |
| `lib/access/state.ts` | The access state machine, failure classification, phase labels. | no |
| `app/page.tsx` | Current landing surface. Shows the Docket; asserts nothing. | reads constants |
| `.github/workflows/ci.yml` | install → lint → typecheck → test → build, plus a secret scan. | CI |

Planned (BUILD 2+), not yet present:

| Path | Role |
|---|---|
| `lib/protocol/story.ts` | IP registration, license terms, minting — wraps `@story-protocol/core-sdk` |
| `lib/protocol/cdr.ts` | vault allocate / write / read — wraps `@piplabs/cdr-sdk` |
| `lib/protocol/storage.ts` | storage provider for the CID path, if chosen |
| `app/api/*` | server route handlers; the only place the server key is used |
| `tools/spike/*` | the BUILD 2 CLI harness |
| `tools/verify-canonical-run.ts` | independent evidence verifier |

---

## Two SDKs, deliberately

See `docs/PROTOCOL_DECISION.md` for the full reasoning. Summary: the published CDR SDK
(0.2.2) cannot mint Story license tokens, although `main`-branch docs describe a helper that
can. We therefore use:

- **`@piplabs/cdr-sdk@0.2.2`** — the protected vault and the gated read;
- **`@story-protocol/core-sdk@1.4.4`** — the IP asset, the license terms, the token.

The adapter owns the join. This keeps every dependency on a published, versioned artifact.

---

## Deployment shape (BUILD 9)

```
Browser (wallet)
      │
      ▼
Vercel — Next.js app
      │  server route handlers hold the disposable key
      ├──────────────► Story RPC (https)          ✅ works
      └──────────────► CDR Story-API               ⚠ OPEN RISK
                        plain HTTP on a raw IP today
```

The CDR Story-API leg is the one deployment risk. `apiUrl` is a configurable constructor
parameter, so it can be repointed at a TLS endpoint or our own node's REST gateway without
patching the SDK. If neither is viable, build-spec §7 says report `BLOCKED` rather than
improvise. See `docs/SECURITY.md` §5.
