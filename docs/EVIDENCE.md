# EVIDENCE

**Project:** LicenseVault
**Canonical run:** `licensevault-aeneid-001`
**Last updated:** 2026-10-05

---

## Principle

> A UI animation is not proof. A database record is not proof. A screenshot is not proof.
> **A real protocol result is proof.**

An artifact is written **only after the corresponding event genuinely happens** on chain.
Nothing in this directory is pre-generated, illustrative, or filled in from expectation.

---

## Current state of the evidence tree

**The evidence tree does not exist yet, and that is correct.**

BUILD 2 has not run. No vault has been allocated on Aeneid, no license token has been
minted, and no read — rejected or allowed — has been attempted. Therefore there is nothing
truthful to record.

```
evidence/
└── licensevault-aeneid-001/     ← NOT YET CREATED
```

Creating these files now would be fabricating evidence, which the build contract forbids
(§1.6, §23). They appear when the events do.

---

## Planned artifacts (build-spec §23)

Each will be created by `tools/spike/*` at the moment the corresponding operation succeeds,
and will contain only observed facts.

| Artifact | Written when | Must contain |
|---|---|---|
| `environment.json` | before anything else | chain id (verified, not assumed), RPC, SDK versions, timestamp |
| `ip-asset.json` | the IP asset is registered | ipId, registration tx hash, block |
| `license-terms.json` | terms are attached | licenseTermsId, tx hash, terms summary |
| `license-token.json` | a licence is minted | token ids, mint tx hash, holder address |
| `vault.json` | the vault is allocated and written | vault uuid, condition addresses, conditionData blobs, allocate + write tx hashes |
| `unauthorized-read.json` | a read from a wallet **without** the licence | caller, the revert reason, and the evidence it was an authorization refusal rather than an outage |
| `license-mint.json` | the licence is obtained | mint tx hash, resulting token ids |
| `authorized-read.json` | a read from the licensed wallet | read tx hash, partials collected, threshold met |
| `decrypted-resource.json` | plaintext is recovered | length + digest of the recovered bytes, **never the bytes themselves** |
| `verification.json` | the verifier has run | the pass/unverified result for each check |

### For every transaction recorded

- transaction hash
- chain / network
- block number if available
- the operation it performed
- the contract it touched
- an explorer URL **only if the explorer route has been verified**

---

## Rules this directory follows

1. **Never manufacture an explorer URL from a guessed hash.** If the explorer is
   unverified, the artifact records the hash and no link.
2. **Never record a success that was not observed.** A failed step is recorded as a failure.
3. **Never store protected plaintext.** Records carry a length and a digest, which is enough
   to prove recovery without turning the evidence directory into the leak.
4. **Never store a private key, seed phrase, or signed payload containing one.**
5. **A timeout is recorded as a timeout** — not as a rejection, and not as a success.

---

## Independent verification

`tools/verify-canonical-run.ts` (build-spec §24) re-checks the evidence against live
protocol state wherever practical. Its output is:

```
NETWORK: PASS | UNVERIFIED | FAIL
IP ASSET: ...
LICENSE TERMS: ...
LICENSE TOKEN: ...
VAULT: ...
UNAUTHORIZED READ: ...
AUTHORIZED READ: ...
DECRYPTION: ...
FINAL RESULT: PASS | UNVERIFIED | FAIL
```

**If the verifier cannot independently confirm a claim, it reports `UNVERIFIED`, not
`PASS`.** An `UNVERIFIED` line is an honest result, not a failure to be smoothed over — it
names exactly which part of the chain of evidence a judge cannot yet check for themselves.

The verifier does not currently exist; it is a BUILD 5 deliverable.
