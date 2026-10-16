# LicenseVault — implementation and verification notes

**Last updated:** 2026-10-16  
**Live app:** https://licensevault.vercel.app  
**Network:** Story Aeneid testnet, chain ID 1315

## Current demonstrated flow

The deployed browser demo has completed wallet connection, licence verification, a wallet-signed CDR read, data-key recovery, browser-side decryption of the 804-byte JSON manifest, and SHA-256 verification. The observed plaintext digest matched:

```
46cab4a8232e4eea226500b424416a353618c8606008d374dbb15f56bc864cd7
```

The protected payload is the JSON manifest only. Its five listed SVG/EPS/palette/PDF files are metadata and are not included as decrypted binaries.

## Evidence boundaries

- `evidence/licensevault-aeneid-001/gate-probes.json` records read-only condition checks from 2026-10-07. Token 73227 was allowed for its recorded holder and denied for a different wallet. These were `eth_call` results, not signed protected-read transactions.
- The successful browser demo used a separately minted token, ID 73228, as observed in the live workflow.
- A successful run through the deployed proxy does not make the upstream CDR transport secure. The Vercel-to-keeper connection remains plain HTTP; see [SECURITY.md](./docs/SECURITY.md#5-cdr-story-api-transport-risk--open).
- A fresh independent replay of the complete browser flow remains distinct from the observed demo and should not be implied unless it is performed.

## Reproduction and checks

Use Node/npm compatible with the lockfile, then run:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The repository CI workflow runs automated checks. For a live demo, use a wallet on Story Aeneid and testnet funds as required by the current transaction fee. Never use mainnet funds or commit credentials. Review `.env.example` for safe configuration names.

## Current scope

LicenseVault demonstrates a single on-chain licence condition controlling access to one fictional encrypted resource on testnet. It is not universal DRM, does not prevent an authorized reader from copying content, and does not provide legal advice. See [LIMITATIONS.md](./docs/LIMITATIONS.md) and [CLAIM_STATUS.md](./docs/CLAIM_STATUS.md).

This file intentionally records the current state and key reproducibility pointers, not a chronological transcript of every development phase. Historical details remain in Git commit history.
