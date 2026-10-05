# CLAIM STATUS

**Project:** LicenseVault
**Last updated:** 2026-10-05

Allowed statuses, per build-spec §25:
`PROVEN` · `OBSERVED` · `INFERRED` · `UNVERIFIED` · `UNSUPPORTED`

- **PROVEN** — independently confirmed against live chain state or the published artifact.
- **OBSERVED** — seen in an official source, not independently reproduced by us.
- **INFERRED** — a reasonable conclusion from proven facts, not itself directly demonstrated.
- **UNVERIFIED** — not yet established either way.
- **UNSUPPORTED** — contradicted, or beyond what the system can show.

> This table is a claim *register*, not marketing. It is deliberately unflattering where the
> evidence is thin. Nothing moves to `PROVEN` without evidence recorded in `evidence/`.

---

## Ecosystem / protocol claims

| # | Claim | Status | Evidence / note |
|---|---|---|---|
| 1 | Story supports programmable IP licensing | PROVEN | Story's own contracts and SDK are published and deployed; `@story-protocol/core-sdk@1.4.4` on npm |
| 2 | Story Aeneid is available | PROVEN | live RPC answered `eth_chainId` = `0x523` = 1315 on 2026-10-05 |
| 3 | CDR is available on Aeneid | PROVEN | DKG + CDR contracts return live bytecode at the documented addresses |
| 4 | LicenseReadCondition is deployed on Aeneid | PROVEN | `eth_getCode` non-empty at `0xC064…f7a3`; address documented in official CONDITIONS.md |
| 5 | OwnerWriteCondition is deployed on Aeneid | PROVEN | `eth_getCode` non-empty at `0x4C9b…c34B` |
| 6 | The CDR SDK can be configured with a custom API endpoint | PROVEN | `apiUrl` is a required constructor parameter in the published `client.d.ts` |
| 7 | A license-gated read is possible via CDR conditions | OBSERVED | described in official `docs/CONDITIONS.md`; **not yet reproduced by us** |
| 8 | The published CDR SDK (0.2.2) can mint a Story license token itself | **UNSUPPORTED** | the documented `client.license.mintLicenseToken` is absent from the published package — see PROTOCOL_DISCOVERY.md §6 |
| 9 | A TLS Story-API endpoint exists | UNVERIFIED | only a plain-HTTP raw-IP endpoint is documented |
| 10 | Vercel can reach the CDR Story-API endpoint | UNVERIFIED | not yet tested |

## LicenseVault's own claims

| # | Claim | Status | Evidence / note |
|---|---|---|---|
| 11 | LicenseVault reproduces the gated read | **UNVERIFIED** | this is the BUILD 2–4 gate; no code exists yet |
| 12 | An unauthorized wallet is actually blocked | **UNVERIFIED** | must be shown by a real reverted read, not by UI copy |
| 13 | An authorized wallet actually succeeds | **UNVERIFIED** | must be shown by a real recovered plaintext |
| 14 | The access decision is produced by the protocol, not the UI | **UNVERIFIED** | architectural intent; proven only once #11–13 hold with the UI absent |
| 15 | The core demo path costs $0 | UNVERIFIED | testnet gas is free-of-charge but requires faucet funds; see COST_MATRIX.md |
| 16 | The gated flow is reproducible by a third party | **UNVERIFIED** | requires the verifier + evidence tree to exist first |

## Claims we explicitly DO NOT make

| # | Claim | Status | Note |
|---|---|---|---|
| 17 | Story is a 2026 BLI bounty / sponsor | **UNVERIFIED** | do not state this without current official BLI evidence |
| 18 | LicenseVault prevents all copying or piracy | **UNSUPPORTED** | false. A licensed reader can always re-share what they can read |
| 19 | LicenseVault guarantees copyright compliance | **UNSUPPORTED** | it gates access; it does not make anyone compliant |
| 20 | LicenseVault is universal DRM | **UNSUPPORTED** | scoped to a specific protected resource and a specific condition |
| 21 | LicenseVault is the first blockchain licensing platform | **UNSUPPORTED** | not knowable, and not our claim |
| 22 | LicenseVault provides legal advice | **UNSUPPORTED** | it does not, and must never imply it |

---

## The one claim we do make

> **LicenseVault uses an onchain licensing condition to control access to protected digital
> content.**

That sentence is the ceiling. Everything user-facing must stay at or below it.

## Promotion rule

A claim moves to `PROVEN` only when an artifact in `evidence/licensevault-aeneid-001/`
supports it and `tools/verify-canonical-run.ts` can independently confirm it. Until then it
stays `UNVERIFIED` — even if the feature appears to work on screen.
