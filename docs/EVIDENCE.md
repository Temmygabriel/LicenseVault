# EVIDENCE

**Project:** LicenseVault  
**Canonical run:** `licensevault-aeneid-001`  
**Last updated:** 2026-10-16

---

## Principle

A UI animation is not proof. A screenshot alone is not proof. Evidence should distinguish live protocol results, reproducible repository artifacts, and what was observed in the deployed demo.

## Evidence currently available

### 1. On-chain licence-condition probes

`evidence/licensevault-aeneid-001/gate-probes.json` records read-only `eth_call` checks observed on Story Aeneid on 2026-10-07 for vault UUID `11062` and condition `0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3`:

- A real holder presenting token ID `73227` received `true`.
- A different wallet presenting that same token ID received `false`.
- Empty auxiliary data and a nonexistent token reverted, but the artifact correctly does **not** treat those cases as proof of a licensing denial.

These calls changed no state, transferred no value, and spent no gas. They establish the condition's observed allow/deny result for those inputs; they are not themselves a CDR protected-read transaction. The recorded token ID is `73227`, distinct from the separate token `73228` later minted for a browser demo.

### 2. Protected payload and digest

The canonical resource is a fictional **Commercial Brand Asset Pack** whose protected plaintext is an 804-byte UTF-8 JSON manifest. The sealed blob is 832 bytes. The expected plaintext SHA-256 is:

```
46cab4a8232e4eea226500b424416a353618c8606008d374dbb15f56bc864cd7
```

The manifest describes five files as metadata. Those individual files are not included in the encrypted payload. See `docs/ASSET_PROVENANCE.md` and `evidence/licensevault-aeneid-001/protected-content-manifest.json`.

### 3. Successful protected read and browser recovery

The repository's `PROGRESS.md` records a successful real CDR read through the deployed proxy: a 32-byte data key was recovered, 804 plaintext bytes were decrypted, and the digest matched. The deployed browser workflow was subsequently observed completing all five checkpoints: wallet connection, licence verification, signed CDR read, manifest recovery/decryption, and content hash verification. The browser showed a matching SHA-256 and offered the recovered manifest for download.

The browser result is reported as an observed successful demo, not as an independently replayed third-party verification. Do not confuse the browser workflow with the read-only gate probes in section 1. Also, do not claim that the five listed binary assets themselves were delivered or decrypted.

## Artifact rules

1. Do not manufacture transaction hashes, block numbers, explorer URLs, or timestamps.
2. Do not label an infrastructure error as an authorization denial.
3. Do not store private keys, seed phrases, or protected plaintext unnecessarily.
4. Preserve the distinction between read-only `eth_call` results and state-changing signed transactions.
5. If a verifier cannot independently confirm a claim, report `UNVERIFIED`, not `PASS`.

## Remaining verification work

- Re-run the canonical verifier against current Aeneid state and the current deployed revision.
- Preserve the exact browser-run transaction hash and environment metadata in a machine-readable run artifact if they are available from the existing run; do not invent them if they are not.
- Test the denial path using a wallet that does not hold the required licence without asking a user to submit a protected-read transaction that is expected to revert.
- Keep the scope statement explicit: the protected payload is a JSON manifest, not the five listed binaries.
