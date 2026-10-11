# SECURITY MODEL

**Project:** LicenseVault
**Last updated:** 2026-10-12 (BUILD 7 — adversarial pass)
**Scope:** the MVP flow — one protected resource gated by one onchain licensing condition,
plus the public `/api/verify-license` endpoint added in BUILD 5.

---

## The security claim, stated precisely

> The decision to release protected content is made by an on-chain condition contract
> evaluated during a real CDR read. It is not made by the frontend.

Everything below exists to keep that sentence true under attack.

---

## 1. Trust boundaries

```
┌──────────────────────────────────────────────────────────────────────────┐
│  1. Browser                                                              │
│     Untrusted. Runs user-controlled code, extensions, devtools.          │
│     May be modified by the user at will.                                 │
└───────────────┬──────────────────────────────────────────────────────────┘
                │  (may be tampered with — never the authority)
┌───────────────▼──────────────────────────────────────────────────────────┐
│  2. User wallet                                                          │
│     Trusted to sign only what the user approves.                         │
│     Holds the user's own key. We never ask for it and never see it.      │
└───────────────┬──────────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────────┐
│  3. LicenseVault server (Next.js route handlers)                         │
│     Trusted for orchestration. Holds a DISPOSABLE testnet key ONLY.      │
│     Never holds plaintext of the protected payload.                      │
│     Never decides authorization on the client's say-so.                  │
└───┬───────────────────────┬──────────────────────────────────┬───────────┘
    │                       │                                  │
┌───▼─────────────┐ ┌───────▼──────────────┐ ┌─────────────────▼───────────┐
│ 4. Story RPC    │ │ 5. CDR Story-API     │ │ 6. Story / CDR contracts    │
│ aeneid.storyrpc │ │ REST (DKG partials,  │ │ THE AUTHORITY.              │
│ .io             │ │ global pubkey)       │ │ Condition contracts decide  │
│ Read transport. │ │ ⚠ plain HTTP today   │ │ allow/deny, on-chain.       │
└─────────────────┘ └──────────────────────┘ └──────────────┬──────────────┘
                                                            │
                                              ┌─────────────▼──────────────┐
                                              │ 7. Protected content       │
                                              │ Encrypted at rest. Readable│
                                              │ only with a data key that  │
                                              │ requires threshold partials│
                                              │ obtainable only via an     │
                                              │ authorized on-chain read.  │
                                              └────────────────────────────┘
```

### Boundary notes

**Boundary 1 — Browser.** Treated as hostile input. The UI renders state; it never
originates an authorization decision. If the browser claims "licensed," that claim is worth
nothing until the chain agrees.

**Boundary 2 — Wallet.** We request signatures only for actions that genuinely need the
user's authority. `lib/access/state.ts` classifies a rejection as `USER_CANCELLED` — never as
a licensing failure, so a user who declines is not told they lack rights.

**Boundary 3 — Server.** Holds a disposable Aeneid key for protocol orchestration. That key
is server-only. It is never placed behind a `NEXT_PUBLIC_*` variable, never logged, and never
serialized into a response. The server has no plaintext to leak, because the data key is only
recoverable through the protocol's threshold decryption.

**Boundary 4 — Story RPC.** Treated as an availability dependency, not a truth we blindly
trust. A wrong or lying RPC produces a *verification error*, never an unlock — because the
unlock requires decryption to actually succeed, and decryption requires validator partials
that the chain's state gates.

**Boundary 5 — CDR Story-API.** The weakest link today (see §5 below).

**Boundary 6 — Contracts.** The authority. `LicenseReadCondition` returns false for a caller
without the right license token, and the CDR contract reverts the read. That revert is the
product.

**Boundary 7 — Protected content.** Never served in plaintext by our infrastructure.

---

## 2. Threats and mitigations

| # | Threat | Mitigation | Status |
|---|---|---|---|
| 1 | **Fake client-side authorization** — attacker edits JS/state to claim a license | Authorization is decided on-chain in `checkReadCondition`. The browser has no vote. The unlock additionally requires real decryption, so a forged flag cannot produce plaintext. | Designed; proven in BUILD 2–4 |
| 2 | **Wrong license token** — caller presents a token for a different IP/terms | `conditionData` pins `(LicenseToken contract, ipId)` at allocation and is immutable. `accessAuxData` carries token IDs the contract validates. | Designed; test in BUILD 8 |
| 3 | **Wrong IP** | Same as #2 — the IP is fixed in `conditionData`, not supplied by the client. | Designed |
| 4 | **Wrong license terms** | The condition binds the IP; term-level scoping is enforced by which tokens exist for that IP. Recorded as a known precision limit in LIMITATIONS.md. | Partially designed |
| 5 | **Replay / retry confusion** — reuse a previous successful read | Reads are fee-bearing transactions against current chain state, and `accessAuxData` is validated per call. A stale success is not cached as authority; `RESET` forces re-validation. | Designed |
| 6 | **Wrong chain** — wallet on another network | `assertAeneidChain` throws `WrongNetworkError`, which classifies as `WRONG_NETWORK` → `VERIFICATION_ERROR`. It never becomes `NO_LICENSE`, so a user on the wrong network is told the truth. | **Implemented + unit-tested** |
| 7 | **Malicious resource metadata** | Metadata is validated at the boundary; it is never used to build a contract call or a filesystem path. | Designed |
| 8 | **Leaked server key** | Disposable testnet key only; server-side env var; CI fails on key-shaped strings in tracked files; `.env*` gitignored. | **Implemented (CI guard)** |
| 9 | **Exposed protected plaintext** | Plaintext is never persisted server-side. The state machine stores byte *counts*, never the key or content — see `UnlockEvidence`. | **Implemented** |
| 10 | **Manipulated proof display** | The Proof surface renders values read back from the chain, and shows no explorer link until an explorer URL is verified. | Designed; explorer UNVERIFIED |
| 11 | **Stale cached license state** | No indefinite caching. `RESET` returns to `LOCKED` so a refresh re-verifies rather than trusting a remembered success. | **Implemented + unit-tested** |
| 12 | **Timeout presented as "no license"** | `classifyThrownError` maps any timeout to `INFRASTRUCTURE_FAILURE`; `phaseForFailure` can only route `AUTHORIZATION_FAILURE` to `NO_LICENSE`. | **Implemented + unit-tested** |
| 13 | **Tampered CDR API response** | The endpoint is plain HTTP today, so responses are not authenticated in transit. Mitigated at the outcome level: a tampered partial yields garbage that fails the AES-GCM check, producing a decryption failure rather than a false unlock. | **OPEN — see §5** |
| 14 | **RPC credential read back by an anonymous caller** | Found and fixed in BUILD 7 (see §8). The error branch returned the operator's RPC URL verbatim, and hosted providers put the API key in that URL. Redacted by `lib/access/redact.ts`. | **FIXED — verified end-to-end** |
| 15 | **A per-caller verdict served to a different caller from a cache** | `cache-control: no-store, max-age=0` on every response from the route. A cached `LICENSE VERIFIED` for wallet A served to wallet B is a verdict about the wrong address. | **Implemented** |
| 16 | **Endpoint used to spend the operator's RPC quota** | Per-client limiter (12/min) **plus** a process-wide ceiling (240/min) that spoofing cannot bypass. The per-client half is explicitly documented as *not* a security boundary — see §8. | **Implemented; edge limit deferred** |

---

## 3. Required properties, and where they live

| Property | Where | Verified by |
|---|---|---|
| Protocol result is authoritative | `lib/access/state.ts` — success states require evidence objects | `tests/state.test.ts` |
| Private key isolation | server-only env; CI secret scan | `.github/workflows/ci.yml` |
| Network validation | `lib/protocol/network.ts` | `assertAeneidChain` |
| Strict input validation | `lib/protocol/conditions.ts` — `assertAddress`, non-negative token ids, non-empty list | `tests/conditions.test.ts` |
| Explicit failure states | `FailureKind` union with exhaustive `phaseForFailure` switch | compile-time + unit tests |
| No secret logging | `Failure.detail` documented as secret-free; keys never enter state | code review |
| No trust in client-reported authorization | precondition: `PLAINTEXT_RECOVERED` only valid in `ACCESSING` | `tests/state.test.ts` |

---

## 4. What the state machine structurally prevents

These are guaranteed by types, not by discipline:

1. **`UNLOCKED` is unreachable without a real read.** It requires `UnlockEvidence`
   containing a read transaction hash and a positive plaintext byte count. There is no
   code path that builds it from a boolean.
2. **`PLAINTEXT_RECOVERED` is only valid in `ACCESSING`**, which is only reachable from
   `LICENSE_VERIFIED`, which is only reachable from `CHECKING`.
3. **`NO_LICENSE` cannot be produced by an error string.** `VERIFICATION_FAILED` throws
   `IllegalTransitionError` if it would resolve to `NO_LICENSE`; only the explicit
   `LICENSE_ABSENT` event, carrying a `RejectionEvidence.basis`, can.
4. **Adding a failure kind without deciding its phase is a compile error** — the switch in
   `phaseForFailure` is exhaustive.

---

## 5. Open security issue — the CDR Story-API endpoint

**Severity: low–medium. Status: OPEN. Exposure: availability, not confidentiality.**

The Story-API REST endpoint documented by the CDR SDK is `http://172.192.41.96:1317` —
**plain HTTP on a raw IP**. The current official docs confirm this is still the only Aeneid
value, label it "Plain HTTP. May change between deployments.", and advise pointing `apiUrl`
at your own node's REST gateway for production.

**The endpoint is in the trust path — this is stated by the SDK, not inferred.** The published
`Consumer` docs say partials come from `/dkg/cdr_partials`, that the keeper verifies each
validator's signature on ingress and *drops the signature bytes*, and that **"the SDK trusts
the keeper at the same level as any other authoritative chain RPC read."** So the transport is
unauthenticated and the SDK is relying on that host being honest and available.

**What that does and does not expose** (worked through in `docs/PROTOCOL_DISCOVERY.md` §7):

| Property | Holds | Basis |
|---|---|---|
| Confidentiality of the data key | ✅ | Partials are ECIES-encrypted to the reader's ephemeral public key; the private key never leaves the client. Intercepting a partial reveals nothing usable. |
| Integrity of recovered content | ✅ | The SDK's own text: a misrouted partial "would not yield a meaningful ECIES decryption… the resulting garbage bytes would propagate through `tdh2Combine` and ultimately fail at the outermost AES-GCM auth check." The vault ciphertext is read from chain, not from this endpoint. Tampering **fails closed**. |
| Availability of a read | ❌ | An attacker — or the endpoint simply being down or moved — can prevent the poll reaching threshold, timing out the read. |
| Authorization deniability | ✅ | The gate is `LicenseReadCondition`, evaluated on chain before the read transaction. The REST host serves partials only after the chain has already permitted the read. |

**Consequence the code must encode.** A failure on this path is `INFRASTRUCTURE_FAILURE`, and
must **never** become `NO_LICENSE`. A dropped partial is not a missing licence. This is the
concrete scenario that rule exists for; `classifyThrownError` routes timeouts to
`INFRASTRUCTURE_FAILURE` and `tests/state.test.ts` pins it.

**Mitigations already in place.** `apiUrl` is a constructor parameter, not a constant;
`CDR_API_URL_AENEID` records the documented default, and `.env.example` exposes `CDR_API_URL`
so it can be repointed without a code change. The endpoint is treated as an operational
dependency that can move, not as a fixed address.

**Available but not yet adopted.** `collectPartials` / `accessCDR` accept `attestationConfig`,
which verifies each validator's SGX enclave (MRENCLAVE / MRSIGNER / SVN) before accepting a
partial and reports untrusted ones via `onInvalidPartial`. The docs note the attestation
reports come from the per-round cache, so this adds no request. **Decision deferred to
BUILD 8** — it hardens against a dishonest validator, which is a related but distinct concern
from a dishonest transport, and it is not needed to demonstrate the mechanism.

**Planned resolution (BUILD 9, before deployment).**
1. Test reachability from a Vercel serverless function.
2. If reachable only over plain HTTP, run our own node's `:1317` REST gateway, or front the
   endpoint with TLS on infrastructure we control.
3. Re-read the docs at `docs.datafdn.org` (note: `docs.story.foundation` currently serves an
   **expired certificate**) to check whether an official TLS endpoint has appeared.

**Per build-spec §7: if neither is viable, the correct outcome is to report `BLOCKED`, not to
invent a workaround.** That instruction is recorded here so it survives to BUILD 9.

---

## 6. Secrets policy

- Never commit `.env`, `.env.local`, private keys, seed phrases, or wallet files.
- Never a `NEXT_PUBLIC_*PRIVATE_KEY`. CI fails on that pattern explicitly.
- Disposable testnet wallets only. Never Mainnet funds. Never a valuable wallet.
- Never ask a user for a seed phrase or private key. The product never needs one.
- CI additionally fails on any tracked `.env*` file other than `.env.example`.

---

## 7. Adversarial test matrix (build-spec §22)

| Test | Expected | Status |
|---|---|---|
| no license | read rejected | ✅ live, BUILD 2 (`DENIED`) |
| wrong IP license | read rejected | ✅ covered by #2 — `conditionData` pins the IP |
| wrong terms/license | read rejected | ⬜ noted as a precision limit in `LIMITATIONS.md` |
| arbitrary token | read rejected | ✅ live — unminted id reverts `ERC721NonexistentToken` (`0x7e273289`) |
| malformed auxiliary data | rejected safely | ✅ live — empty `accessAuxData` reverts with no decodable reason, mapped to `UNKNOWN`, never `DENIED` |
| wrong chain | blocked | ✅ implemented, unit-tested |
| user rejects wallet action | clear cancellation | ✅ classified, unit-tested |
| tx reverts | failure, not success | ✅ classified, unit-tested |
| timeout | unknown/error, not success | ✅ unit-tested |
| refresh after success | state revalidated | ✅ `RESET` unit-tested |
| forged client state | cannot grant protected read | ✅ structurally prevented |
| **bad address to the public route** | `400`, no chain call made | ✅ live + unit-tested |
| **`GET` on the public route** | `405`, explained | ✅ live + unit-tested |
| **RPC failure returns a credential** | no credential in the body | ✅ **live, BUILD 7** — `tests/redact.test.ts` |
| **spoofed `x-forwarded-for`** | cannot lift the process-wide ceiling | ✅ unit-tested; documented as not-a-boundary |

Network-level tests now run against the live chain — the canonical vault exists on Aeneid and
`tools/verify-canonical-run.ts` re-derives every claim from it. See `docs/EVIDENCE.md`.

---

## 8. BUILD 7 — the credential leak, and why a comment would not have held

**Found by:** reading the error branch of `app/api/verify-license/route.ts` rather than the happy
path, then confirming it live.

**The finding.** The route reports infrastructure failures honestly, and it returned the underlying
viem message verbatim:

```
HTTP request failed.
Status: 404
URL: https://<operator-rpc-host>/v3/<OPERATOR_API_KEY>
Request body: {"method":"eth_chainId"}
Version: viem@2.57.3
```

Most hosted RPC providers — Alchemy, QuickNode, Infura — put the credential **in the URL path**.
So any anonymous caller could POST, make the RPC fail, and read back the operator's RPC API key.
For this deployment the default Aeneid endpoint is public and keyless, which is exactly why it would
have gone unnoticed until someone configured a private one — the leak would appear the first time
the app was configured *properly*.

**Confirmed live, not reasoned about.** A server started with
`STORY_RPC_URL="https://aeneid.storyrpc.io/v3/SUPER_SECRET_API_KEY"` returned that full URL in the
response body. Re-run after the fix against a rebuilt server: the body keeps `Status: 404` and
`viem@2.57.3`, and contains neither the key nor the host.

**Why the fix is in a module with its own tests.** The leak lived in a code path that only runs
*after* something else has already failed. Nobody reads the error branch while changing the success
branch, so a comment saying "don't leak the URL here" is not a control — it is a note addressed to
someone who is not looking. `lib/access/redact.ts` makes the safe behaviour the default and
`tests/redact.test.ts` pins it with the real viem message.

**What redaction keeps, on purpose.** `HTTP request failed` and `Status: 404` — the failure class
and the HTTP status are what make the error actionable without naming the endpoint. Redaction that
destroys the diagnostic is its own failure: the unreachable-RPC screenshot in `qa-screens/` depends
on that text being legible. When redaction changes the text it *says so*, because a silently
rewritten error message is its own kind of lie. The full message goes to the server log.

**The rate limiter, stated accurately.** The per-client limit keys on `x-forwarded-for`, which a
caller can set to anything when the app is not behind a proxy that overwrites it. Vary the header
and the per-client budget is gone. That is tolerable **only** because nothing is being protected by
it — the authorization decision is made by the chain, not by this counter — and because a
process-wide ceiling (240/min) bounds total outbound probes regardless of what any caller claims
about itself. The file says this out loud rather than letting a reviewer infer a boundary that is
not there. A real per-client limit belongs at the edge.

**Who may run the limiter's counters.** `MAX_KEY_LENGTH` bounds the map key, and the map is
pruned, so a caller inventing unique header values cannot grow it without bound.
