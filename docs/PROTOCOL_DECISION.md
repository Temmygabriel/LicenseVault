# PROTOCOL DECISION

**Project:** LicenseVault
**Date:** 2026-10-05
**Depends on:** `docs/PROTOCOL_DISCOVERY.md`
**Purpose:** record the technical choices made where the build spec left room, and the
evidence behind each one.

---

## Decision 1 — Use `@piplabs/cdr-sdk@0.2.2` (published), not `main`

**Context.** `docs/CONDITIONS.md` on the cdr-sdk `main` branch documents a
`client.license.mintLicenseToken(...)` helper. That helper is **not in the published 0.2.2
package** (verified by unpacking the npm tarball — see discovery §6).

**Options considered.**

| Option | Assessment |
|---|---|
| A. Depend on cdr-sdk `main` via git URL | Rejected. Unreleased code, needs a local `pnpm build`, unversioned, and would put an unreviewed branch on the demo's critical path. |
| B. Depend on a hypothetical prerelease | Rejected. No prerelease exists on npm. |
| C. **Published 0.2.2 for CDR + Story's own SDK for minting** | **Chosen.** |

**Decision.** Use `@piplabs/cdr-sdk@0.2.2` (pinned, exact) for the protected vault, and use
Story's official `@story-protocol/core-sdk` (`1.4.4`) to register the IP asset, attach license
terms, and mint license tokens.

**Why this is correct, not merely convenient.**
1. Build-spec §10 ranks *current official SDK source* above *repository documentation*. The
   published package **is** the current official SDK source; the `main` doc describes code
   that has not shipped.
2. It keeps every dependency on a published, versioned artifact — reproducible for a judge.
3. It matches the spec's own architecture (§8): the license relationship and the protected
   read are two protocol concerns joined by our adapter, not necessarily one SDK call.
4. It avoids building unreleased code on an 8 GB machine (master prompt §6).

**Consequence for the product.** LicenseVault's protocol adapter owns the join:

```
Story: register IP → attach license terms → mint license token
                                  │
                                  ▼
CDR:  allocate vault (readCondition = LicenseReadCondition, conditionData = (LicenseToken, ipId))
      write encrypted payload
                                  │
                                  ▼
      read with accessAuxData = abi.encode(uint256[] [tokenId])  → allowed / rejected
```

**Risk accepted.** If `piplabs` publishes the mint helper later, we may collapse two SDKs into
one. That is a simplification, not a correction. Recorded here so a future reader knows the
split was a deliberate response to a real version conflict.

---

## Decision 2 — Condition encoding is our code, not the SDK's

The shipped condition helpers are `open / ownerOnly / tokenGate / merkle / custom`, and
`custom` is a pass-through. There is no `licenseRead` helper.

**Decision.** Build `conditionData` and `accessAuxData` ourselves with `viem`'s
`encodeAbiParameters`, using the exact shapes from the official docs:

```ts
// allocation time — static
const readConditionData = encodeAbiParameters(
  [{ type: "address" }, { type: "address" }],
  [LICENSE_TOKEN_ADDRESS, ipId],
);
const writeConditionData = encodeAbiParameters(
  [{ type: "address" }],
  [serverWriterAddress],
);

// read time — per caller
const accessAuxData = encodeAbiParameters(
  [{ type: "uint256[]" }],
  [[BigInt(licenseTokenId)]],
);
```

**Why.** These encodings are documented, and they are the entire interface between our
product and the protocol. Keeping them in one small, unit-tested module means a judge can
read exactly how the gate is built. Scattering them through UI components would violate
master-prompt §38.

---

## Decision 3 — Authority lives on-chain; the UI never decides

**Decision.** The successful state (`ACCESS GRANTED` / `UNLOCKED`) may be reached **only**
when the real decryption returns the plaintext. No local flag, no cached boolean, no React
state may produce it.

**Reasoning.** Build-spec §33 lists "the app claims ACCESS GRANTED from local state only" and
"the core gated read is simulated" as NO-GO conditions. The whole product thesis is that the
resource *itself* respects the licence.

**Implementation shape.** A single reducer with explicit, mutually exclusive outcomes —
`NO_LICENSE`, `VERIFICATION_ERROR`, `LICENSE_VERIFIED`, `UNLOCKED`, `CANCELLED`,
`TRANSACTION_FAILED`, `DECRYPTION_FAILED`. A read revert caused by the condition contract
maps to `NO_LICENSE`. A network/RPC failure maps to `VERIFICATION_ERROR`. **A timeout never
maps to `NO_LICENSE`** (build-spec §11).

---

## Decision 4 — Plaintext never exists on the server in readable form

**Decision.** The protected payload is encrypted client-side-of-the-protocol and stored as
CDR ciphertext, or as ciphertext in storage referenced by CID. Only an authorized
`accessCDR` + `tdh2Combine` yields the data key. The server does not keep a plaintext copy
that the UI could be tricked into serving.

**Reasoning.** Build-spec §21 and §33 both treat "exposed protected plaintext" and "forgery
that grants a read" as real threats. If the server held plaintext and the UI gated on a
React flag, the gate would be theatre.

**Open item.** The exact storage path (on-chain ciphertext vs CID + storage provider) is
settled in BUILD 2 when we build the smallest real vault. Not decided here from theory.

---

## Decision 5 — Heavy work runs in GitHub Actions

**Decision.** `npm install`, production build, lint, typecheck and the test suite run in CI.
Locally we run only targeted commands.

**Reasoning.** Master prompt §6: the dev machine has 8 GB RAM; §7: internet/data is limited.

---

## Decision 6 — TypeScript 5.9.3, not 7.x

**Context.** npm's `latest` for `typescript` is `7.0.2` (the new native compiler). `5.9.3` is
the newest 5.x.

**Decision.** Pin `5.9.3`.

**Reasoning.** TypeScript 7 is a major-version compiler rewrite. The Next.js / ESLint
integration is the risk surface, and the demo's reliability outranks being on the newest
compiler. This is a reversible choice — not a protocol fact. Recorded so it reads as
deliberate rather than stale.

---

## Decision 7 — npm, not pnpm

`pnpm` is not installed locally and the cdr-sdk's own docs require pnpm v9+ only for building
*that* repo, not for consuming its packages. We consume published packages. npm ships with
Node 24 and is already present.

---

## Unresolved — carried forward

| Item | Status | Resolve by |
|---|---|---|
| Aeneid explorer URL | UNVERIFIED | before Proof surface ships |
| Aeneid faucet route | UNVERIFIED | before user funding step |
| Story-API endpoint safety / TLS | OPEN RISK | before BUILD 9 (Vercel) |
| Vercel → Story-API reachability | UNVERIFIED | BUILD 9 |
| Storage path (on-chain vs CID) | undecided on purpose | BUILD 2 |

Per build-spec §7, if no safe Story-API endpoint can be established for the deployment
target, the honest outcome is `BLOCKED`, not a silent workaround.
