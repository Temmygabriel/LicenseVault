# LIMITATIONS

**Project:** LicenseVault
**Last updated:** 2026-10-05

Anyone judging this project should read this page. It states what LicenseVault does not do,
so the claims in `docs/CLAIM_STATUS.md` are not read as broader than they are.

---

## Scope limits

**Testnet only.** LicenseVault runs on Story Aeneid (chain 1315). No part of it is deployed
to mainnet, and no real value is at stake. Testnet state can be reset by the maintainers at
any time, which can invalidate a previously recorded run.

**One resource, one right.** The MVP protects a single fictional asset — the *Commercial
Brand Asset Pack* — gated by a single licensing condition. It is not a general-purpose
rights platform. It demonstrates one mechanism completely rather than many partially.

**The demo asset is fictional.** It is not a real brand, and no real licence relationship is
being represented. `docs/ASSET_PROVENANCE.md` records where the bytes came from.

**Hackathon scale.** Built under time and hardware constraints (an 8 GB development machine,
metered internet). Optimised for a demonstrable, honest mechanism rather than for production
hardening.

---

## What it does NOT do

**It does not prevent copying.** A user who is authorized to read can copy, screenshot, or
re-share what they read. LicenseVault gates *access*, not *downstream use*. Claiming
otherwise would be false, and `docs/CLAIM_STATUS.md` lists that claim as `UNSUPPORTED`.

**It is not universal DRM.** It is not a DRM product, does not integrate with media players,
and does not attempt to survive a determined authorized reader. It applies one on-chain
condition to one encrypted resource.

**It does not guarantee copyright compliance.** It cannot make anyone compliant with any
law. It can only require a specific on-chain token to be present before data is released.

**It does not give legal advice.** Nothing in the product, the UI copy, or the documentation
is legal advice. The word "license" here means an on-chain token from Story Protocol, which
is a technical artifact — not a legal opinion about anyone's rights.

**It does not adjudicate licence scope.** The condition checks that the caller holds a
license token for the configured IP. It does not evaluate whether the caller's intended use
falls inside the terms of that licence. See "precision limits" below.

---

## Technical limits

**Precision of the licence check.** `conditionData` pins `(LicenseToken contract, ipId)`.
The condition contract reports whether the caller holds a token for that IP; it does not
distinguish *which terms* a particular token was minted under when multiple term sets exist
for the same IP. So "has a licence for this IP" is not the same as "has a licence permitting
this specific use." That gap is real and is not closed in the MVP.

**Not a marketplace.** There is no storefront, no pricing UI, no discovery. Obtaining the
licence is a protocol action, not a shopping flow.

**Public infrastructure limits.** The project depends on the public Aeneid RPC and on a
CDR Story-API endpoint that is currently **plain HTTP on a raw IP address**. The latter is a
tracked open risk (`docs/SECURITY.md` §5). Availability is not guaranteed, and the endpoint
is not authenticated in transit.

**Faucet dependency.** The demo needs testnet DATA for gas and protocol fees. If the faucet
is unavailable, the demo cannot run until it refills. The faucet route is currently
`UNVERIFIED` and is deliberately not published as a guess.

**Reads cost a transaction.** A CDR read is a fee-bearing on-chain transaction, not a free
call. It is not instant; validator partial decryptions must be collected after the read
transaction confirms. The interface must show honest waiting rather than a simulated
progress bar.

**Explorer links.** The canonical Aeneid explorer URL is `UNVERIFIED`. Until it is
confirmed, the Proof surface shows identifiers without links. Fabricating an explorer URL
from a transaction hash is forbidden by the build contract.

**No caching of authority.** Because `RESET` returns to `LOCKED`, a page refresh
re-verifies. This is deliberate — stale cached authorization is a listed threat — but it
means the flow is not instant on reload.

---

## Dependency limits

**Two SDKs.** The published CDR SDK (0.2.2) cannot mint Story license tokens, despite
`main`-branch docs describing a helper that can. LicenseVault therefore uses the Story core
SDK for minting and the CDR SDK for the vault. See `docs/PROTOCOL_DECISION.md`.

**Pinned versions.** Protocol-facing packages are pinned exactly (`0.2.2`, `1.4.4`) for
reproducibility. They will not pick up fixes automatically.

**Unreleased features are not used.** Depending on `main`-branch code would put unreviewed
software on the demo's critical path, so it was declined.

---

## Honest status

As of 2026-10-05, **the gated read has not yet been demonstrated.** BUILD 0 and BUILD 1 are
complete; BUILD 2 (the smallest real protected vault, with a rejected read followed by an
allowed read) has not run. Every claim about LicenseVault's own access behaviour is therefore
`UNVERIFIED` in the claim register — including the claim that it works.

That is the current, accurate state. It will change when there is an evidence artifact to
support it, and not before.
