# LICENSEVAULT — LIVE BUILD PROGRESS

> **This file is the running state of the project. It is updated at every phase boundary.**
> Last updated: 2026-10-08 — **BUILD 3 IS DONE. The evidence is now verified by something other
> than the harness that wrote it.** 40 verified / 0 refuted / 3 honestly unproven offline, and
> **41 / 0 / 1 with `--live`**, where the strongest claim — that the key from the vault opens the
> committed content — was re-performed for real. 66 tests.

**Repo:** https://github.com/Temmygabriel/LicenseVault
**Local:** `C:\Users\USER\Documents\HACKATHONS BUILDS\BLI_LEGALTECH_HACK\LICENSEVAULT`
**Contracts read:** `LICENSEVAULT_BUILD_SPEC.md` (2005 lines) + `LICENSEVAULT_DEEPSEEK_MASTER_PROMPT.md` (1620 lines)

---

---

## 🟢 BUILD 3 — THE EVIDENCE IS INDEPENDENTLY VERIFIED (2026-10-08)

**The problem this phase exists to solve:** `tools/spike/build-vault.ts` writes its own evidence.
A harness that grades its own homework proves only that it agrees with itself. So
`tools/verify-canonical-run.ts` re-derives every claim from something the harness does not
control — the chain, the published ABIs, and the bytes in the repository.

```bash
npm run verify:run              # offline: free, read-only, no key needed
npm run verify:run -- --live    # also performs a FRESH read and re-decrypts (costs a little gas)
```

Exit code is **0 only when nothing was refuted**. A `NOT VERIFIABLE` gap does not fail the build —
an honest gap is not a lie — but it is always counted and printed, never hidden.

### What it checks, and where the answer comes from

| § | Claim re-derived | Source — not the artifact |
|---|---|---|
| 1 | we are on chain 1315 | live `eth_chainId` |
| 2 | every named tx exists, succeeded, and is **attributable to the contract the evidence names** | `eth_getTransactionReceipt`, plus the receipt's own logs |
| 3 | the vault's read gate is the LicenseReadCondition, bound to **this** IP asset and the real LicenseToken; write gate names the owner; `updatable = false`; payload ≤ 1024 bytes | `vaults(uint32)` read through the ABI **published in `@piplabs/cdr-contracts`**, then decoded from scratch |
| 4 | `ownerOf(73227)` is the reader; the denial caller holds **zero** licences; PIL terms 2183 exist and are attached | LicenseToken, LicenseRegistry, PILicenseTemplate |
| 5 | holder → `true`; a NON-holder presenting that **same real token id** → `false` | `checkReadCondition`, re-asked now |
| 6 | the committed blob is 832 bytes = 804 plaintext + 12 IV + 16 tag; the size matches the manifest written **at seal time**; five artifacts agree on one plaintext hash | the file on disk, measured here |
| 7 | **the key from the vault actually decrypts the committed content** | a fresh authorized read + `decryptContent`, `--live` only |
| 8 | no key-shaped literal sits unlabelled anywhere in the evidence | every JSON artifact walked, not grepped |

### Two things this phase caught in its own first draft

Both were the *verifier* being wrong, and both would have been reported as refutations of sound
evidence. They are recorded because the same trap is easy to fall into again:

1. **`contract` ≠ `receipt.to`.** `ip-asset.json` records the SPG collection address for the
   creation transaction — which is the address the call **produced**, not the factory it
   **called** (`0xbe39E1C7…`). The first draft compared the two and refuted a correct artifact.
   Fixed properly rather than loosened: the check now also accepts the recorded address
   appearing as a **log emitter** in the receipt, which is genuine independent evidence that the
   transaction created it — and it says which of the two held.
2. **A 32-byte ABI blob is key-shaped.** `abi.encode(address)` is 12 zero bytes + an address =
   exactly 64 hex characters, the same length as a private key. The secret scan now distinguishes
   a declared tx hash, a field the artifact names as a hash, and a named condition blob — and
   says which category each match fell into, so the exclusion is visible rather than silent.

### The claim that could only be settled by spending

The single strongest claim — *"the key recovered from the vault decrypts this content"* — needs
the data key, and the harness **destroys** that key after a successful run, by design. Offline,
the verifier therefore reports it `NOT VERIFIABLE` and says why, rather than dressing up the
weaker consistency checks as if they settled it.

`--live` re-performs an authorized read with the reader's key and decrypts the committed bytes:

```
[VERIFIED ] the key recovered from the vault actually decrypts the committed content
            a NEW read returned a key, which decrypted the committed blob to sha256
            46cab4a8232e4eea2265… — byte-for-byte the value recorded at 2026-10-08T16:48:27.309Z.
```

**Result: 41 verified · 0 refuted · 1 not verifiable.** Offline the same run is
40 / 0 / 3 — the extra unproven one is the plaintext hash, which live mode settles. The single
gap that survives even `--live` is structural and stated out loud: `ip-asset.json` names the
target of the registration transaction by *description* ("Story IPAssetRegistry via
LicenseAttachmentWorkflows") rather than by address, so no receipt can confirm it. The verifier
prints the receipt's actual `to` beside it and leaves the judgement to a reader.

The report is written to `evidence/<run>/verification-report.json` — including the mode it ran in
and every unproven claim, so an offline report can never be mistaken for a live one.

### CI now checks the evidence on every push

`ci.yml` gained a third job, `evidence-verification`, running `npm run verify:run` in offline mode.
It needs **no secret**, spends nothing, and is deliberately a **separate job** so a transient RPC
outage cannot mask a real build failure.

---

## 🟢 BUILD 2 — EXECUTED END TO END ON LIVE AENEID (2026-10-07)

**The spike is no longer "written". It ran, on the real chain, and every check passed.**

```
ALL CHECKS PASSED
  The mechanism is demonstrated end to end:
    a real license gate refused a real read, a real license changed the
    answer, and the recovered key opened the real content.
```

The two wallets were funded from the faucet (each `0x0` → exactly `1 IP`, so the balance is
provably the drip and nothing else). Run `licensevault-aeneid-001`, chain 1315.

| Step | What happened | Evidence |
|---|---|---|
| 1 environment | chain 1315, both wallets 1 IP, DKG round 45, threshold 3-of-5 | `environment.json` |
| 2 asset | IP asset `0x6C6046f0…fdd8`, PIL **Commercial Use**, terms id **2183**, minting fee 0 | `ip-asset.json` |
| 3 vault | CDR vault **uuid 11062** allocated and written, gated on LicenseReadCondition | `vault.json` |
| 4 gate (free probes) | 4/4 — see the probe table below | `gate-probes.json` |
| 5 denied (pre-mint) | reader with no licence gets no data key | `unauthorized-read.json` |
| 6 mint | licence token **73227** minted **to the reader** | `license-token.json` |
| 6b denied-licensed | **the attributable denial** — a wallet holding no licence, presenting the *real* token id, is refused | `denied-licensed.json` |
| 7 read | licensed reader receives the 32-byte data key. Read tx `0xaaec7f41…cdea9` | `authorized-read.json` |
| 8 unlock | key decrypts the content **byte for byte**; manifest reads "Commercial Brand Asset Pack"; key hash matches the read; data key destroyed | `decrypted-resource.json` |

**Every transaction hash was re-verified against the chain after the run** — each returns
`status 0x1` from `eth_getTransactionReceipt`, and each `to` is the contract it claims to be:

| Tx | Block | `to` | Meaning |
|---|---|---|---|
| `0x914a1460…40dc` | 24623222 | `0xbe39E1C7…` registrationWorkflows | created the SPG NFT collection |
| `0xf66ca349…96d3` | 24623301 | `0x04fbd8a2…` licensingModule | minted licence token 73227 |
| `0xaaec7f41…cdea9` | 24623473 | `0xCCCcCC…05` the CDR contract | the authorised read |

This is the check the build contract demands before any Explorer link is shown: the links in
`ip-asset.json` / `license-token.json` / `authorized-read.json` point at transactions that
exist. Had any hash come back `NOT FOUND`, no link would have been published.

### The ordering argument, now demonstrated rather than asserted

`denied-licensed` is the step that actually proves the product's claim. Everything about the
request is valid — well-formed auxiliary data naming licence token **73227**, which really
exists — and the only thing wrong is that **the caller does not own it**. The condition
contract evaluates authorization and returns `false`; the real read path honours that and
refuses. That is the gate being bound to the caller's licence, end to end, in one run.

The pre-mint denial alone could **not** have shown this, and the first draft of the harness
wrongly implied it did. See finding 2.

### Two protocol findings — both were the harness being wrong, not the chain

**Finding 1 — `PILFlavor.commercialUse` refuses a zero `royaltyPolicy`.**

The first funded run died at step 2 with *"Royalty policy is required when commercial use is
enabled."* The note previously in this project said the opposite — that a free licence should
zero both `currency` and `royaltyPolicy`. That was wrong, and it cost a run. The SDK's
`validateLicenseTerms` requires a **non-zero** policy whenever `commercialUse` is true, and the
protocol then requires a non-zero currency to go with it (*"Royalty policy requires currency
token"*). A free licence still has to name both.

Resolved by reading the SDK, then **verifying against the live chain** rather than trusting the
addresses it ships:
- `wrappedIp[1315]` = `0x15140000…0000` → live `name()` "Wrapped IP", `symbol()` "WIP",
  `decimals()` 18, and `isWhitelistedRoyaltyToken()` **true**
- `royaltyPolicyLap[1315]` = `0xBe54FB16…390E` → bytecode present, and
  `isWhitelistedRoyaltyPolicy()` **true**

Both are now pinned in `lib/protocol/constants.ts` with the evidence in the doc comment.

**Finding 2 — a "no" from the read condition is not always `false`; sometimes it is a revert.**

This one matters more, because it was a **fake-success risk in our own harness.**

The first funded run "passed" its denial step by matching the error message against
`/revert|license|denied/i` — which any revert satisfies. But the denial was being attempted
with **empty** auxiliary data, and the condition contract reverts on that *before it evaluates
authorization at all*. A wallet that held a valid licence and sent empty aux data would have
been refused identically. So the step proved the read was refused, and nothing whatsoever about
licensing. Four checks failed; three of the four were the harness's expectations being wrong.

Measured behaviour of `checkReadCondition` on live Aeneid:

| Request | Result | Attributable to licensing? |
|---|---|---|
| empty aux data | **reverts**, no decodable reason (`abi.decode` fails first) | ❌ no — it is the *request* that is bad |
| names a token id never minted | **reverts** `ERC721NonexistentToken(uint256)` = `0x7e273289` — the condition calls `ownerOf()` and OpenZeppelin's ERC-721 reverts | ❌ no — the token does not exist |
| names a **real** token id, caller is **not** its owner | returns **`false`** | ✅ **yes** — the only clean denial shape |
| names a real token id, caller **is** the owner | returns **`true`** | ✅ yes |

The fix was not to loosen the assertion. It was to make the harness distinguish a *decodable
verdict* from an *opaque failure*, to label each probe with `provesLicensing`, and to add step
6b so the attributable denial is actually performed rather than assumed. `unauthorized-read.json`
now carries `provesLicensing: false` and a `limitation` field saying so in plain words.

**This is a product-relevant fact, not just a harness detail:** an integrator who maps "the read
failed" to `NO_LICENSE` will mislabel a malformed request as a licensing decision. The read path
must decode what it got.

### Cost

The whole run cost roughly **0.00006 IP** across both wallets, against a 1 IP drip. Protocol
fees (`allocateFee`, `writeFee`, `readFee`) are **0** right now — measured live, never assumed.

### One honest loose end

The very first failed run created an SPG NFT collection at `0x6AA566C2…F2FD` (tx
`0x6b6b86f8…e04`) before dying on finding 1. That collection is a real, orphaned on-chain
object — nothing references it. It is recorded here rather than quietly dropped.

---

## CI — VERIFIED GREEN 2026-10-05 12:47 UTC

**Run [37311937901](https://github.com/Temmygabriel/LicenseVault/actions/runs/37311937901) — `success` (38s) on commit `a39e860`.**

| Job | Result | Steps that ran |
|---|---|---|
| `secret scan` | ✅ 4s | scan |
| `install → lint → typecheck → test → build` | ✅ 34s | Install (lockfile-strict) · Lint · Typecheck · Unit tests · **Build** |

Two firsts worth noting:

- **`next build` has now actually run.** The production build had never been proven
  before this run; BUILD 0's gate only claimed install + lint + typecheck.
- **`npm ci` accepted the lockfile.** This is the first lockfile the strict install step
  has not rejected, confirming the real-`npm install` regeneration was the correct fix.

The two prior runs (`37306908020`, `37307775085`) failed on the ESLint-10 peer conflict and
on the secret-scan false positive + inconsistent lockfile respectively. Both causes are now
fixed and covered, not merely passed over.

---

## LOCAL GATE — re-measured 2026-10-07 (after the funded run)

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | ✅ clean (0 errors, 0 warnings) |
| Typecheck | `npm run typecheck` | ✅ clean |
| Tests | `npm test` | ✅ **66 passed / 66** (4 files) |
| Network check | `npm run spike:check` | ✅ 12/12 PASS against live Aeneid |
| **BUILD 2 spike** | `npm run spike:vault` | ✅ **ALL CHECKS PASSED** — full lock/unlock on live Aeneid |
| Lockfile sync | `npm ci --dry-run` | ✅ 408 packages, no mismatch |

Previous measurement (2026-10-05, pre-funding) was 58 tests; the count rose to 66 with the
faucet-correction tests and the PIL-address pins.

CI re-runs the same gate plus `next build`; its result is authoritative because the local
machine is 8 GB and the build step is deliberately not run here.


---

## PHASE STATUS

| Phase | Name | Status |
|---|---|---|
| BUILD 0 | Repo + environment | ✅ PASS — CI green (run `37311937901`) |
| BUILD 1 | Protocol discovery | ✅ PASS — all core facts verified |
| BUILD 2 | Minimal protocol spike | ✅ **PASS — executed end to end on live Aeneid 2026-10-07; ALL CHECKS PASSED** |
| BUILD 3 | Evidence + verifier | ✅ **PASS — `tools/verify-canonical-run.ts`; 41 verified / 0 refuted / 1 unproven with `--live`, 2026-10-08** |
| BUILD 4 | Protocol adapter | ⬜ NOT STARTED |
| BUILD 5 | Product UI (four surfaces) | ⬜ NOT STARTED |
| BUILD 6 | Visual system | ⬜ NOT STARTED |
| BUILD 7 | Security / adversarial | ⬜ NOT STARTED |
| BUILD 8 | Deployment (Vercel) | ⬜ NOT STARTED |
| BUILD 9 | Submission | ⬜ NOT STARTED |

Legend: ⬜ not started · ⏳ in progress · ✅ PASS · 🚫 BLOCKED · ❌ FAILED

### Phase reports

**BUILD 0 — Repo + environment — PASS**
Commit `d53df0e`. Files: `package.json`, `package-lock.json`, `tsconfig.json`,
`next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`,
`app/*`, `.github/workflows/ci.yml`, `README.md`.
Dependencies: next 16.3.8, react 19.3.0, viem 2.57.3, @piplabs/cdr-sdk 0.2.2,
@story-protocol/core-sdk 1.4.4, typescript 5.9.3, vitest 5.0.3.
Gate (`install + lint + typecheck`): runs in GitHub Actions, not locally (8 GB machine).
**Finding 1 — ESLint 10 is incompatible with `eslint-config-next@16.3.8`.** The plugins it
depends on (`eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react`) all
peer-require `eslint ^9`. Pinned eslint to `9.39.5`, the version npm itself resolved.
**Finding 2 — `FlatCompat` was the wrong bridge and crashed ESLint entirely.**
`TypeError: Converting circular structure to JSON` from
`@eslint/eslintrc/lib/shared/config-validator.js`. `eslint-config-next` 16 ships ESLint
**flat config natively** (`dist/core-web-vitals.js` and `dist/typescript.js` both export
config arrays), so the config now spreads those arrays directly and the unused
`@eslint/eslintrc` dependency was removed. This class of failure only appears when ESLint
is actually executed — `npm ci` succeeding proves nothing about it.
**Finding 3 — `npm install --package-lock-only` produces a lockfile `npm ci` rejects.**
It skips the optional/peer resolution a real install performs, so the committed lockfile
was internally inconsistent (`multiformats@9.9.0` vs `14.0.5`, `zod@4.6.5` vs `3.25.76`).
The lockfile is now generated by a real `npm install` and verified with `npm ci --dry-run`.
**Rule adopted:** a lockfile is only trustworthy once `npm ci --dry-run` has passed on it.

**BUILD 1 — Protocol discovery — PASS**
Files: `docs/PROTOCOL_DISCOVERY.md`, `docs/PROTOCOL_DECISION.md`, `docs/CLAIM_STATUS.md`.
Gate ("all core protocol facts verified"): met — see the table below. Three items are
recorded as UNVERIFIED rather than guessed (explorer URL, faucet route, Vercel→Story-API
reachability); none of them is required for BUILD 2.
**Finding:** a genuine source conflict — `client.license.mintLicenseToken` is documented on
cdr-sdk `main` but absent from the published 0.2.2 package. Recorded and resolved in
`docs/PROTOCOL_DECISION.md` rather than silently worked around.

### Test suite — what it actually proves (66 tests, 4 files)

| File | Tests | Proves |
|---|---|---|
| `tests/conditions.test.ts` | 13 | ABI encoding matches the documented condition formats byte-for-byte; malformed addresses, bad EIP-55 checksums, empty token lists and negative ids are all **refused** rather than encoded |
| `tests/state.test.ts` | 18 | The access state machine cannot be talked into `UNLOCKED`; only an authorization refusal reaches `NO_LICENSE`; timeouts and unknown errors never do |
| `tests/constants.test.ts` | 26 | Every protocol address is a valid EIP-55 address; the docs' invalid CDR checksum is pinned; the live-read license token metadata and the 1024-byte vault cap are recorded as assertions, not comments; **the PIL royalty policy and currency can never be re-zeroed**, and the faucet can never silently revert to the mainnet-gated QuickNode route |
| `tests/content.test.ts` | 9 | Protected content round-trips byte for byte, and a **wrong key, a tampered ciphertext, or a truncated blob all THROW** rather than returning bytes |

Three properties are worth calling out because they are structural, not stylistic:

1. **`UNLOCKED` is reachable from exactly one (phase, event) pair.** The test enumerates
   all 7 phases × all 7 events and asserts the only combination producing `UNLOCKED` is
   `ACCESSING + PLAINTEXT_RECOVERED`. A matching count guards against a phase silently
   being dropped from the enumeration.
2. **A bad EIP-55 checksum is rejected at encode time.** viem validates mixed-case
   addresses. This is desirable here rather than pedantic: `conditionData` is written once
   at allocation and is **immutable**, so a transposed character would permanently gate the
   vault to the wrong writer with no recovery path.
3. **A wrong key never yields content.** The AEAD auth tag is the project's integrity
   backstop: the CDR read path trusts a remote keeper, so a misrouted partial would produce
   a wrong key. `decryptContent` throws on tag mismatch, which is what makes "ACCESS
   GRANTED" mean something. The test suite asserts that failure, because a silent
   fallback there would turn the whole product claim into theatre.

---

## BUILD 2 — STEP 1 EXECUTED AND GREEN (2026-10-05)

`npm run spike:check` (`tools/spike/check-network.ts`) now runs against live Aeneid and passes
**12/12 checks**. It needs no wallet and sends no transaction. This is the first time any code
in this repo has executed against the real protocol.

```
[PASS] chain id                chain 1315 — matches expected Story Aeneid 1315
[PASS] rpc liveness            head block 24526722
[PASS] DKG contract            0xCcCcCC…04 — deployed (1177 bytes)
[PASS] CDR contract            0xCCCcCC…05 — deployed (1177 bytes)
[PASS] LicenseReadCondition    0xC0640A…f7a3 — deployed (1407 bytes)
[PASS] OwnerWriteCondition     0x4C9bFC…c34B — deployed (332 bytes)
[PASS] LicenseToken            0xFe3838…C6bC — deployed (176 bytes)
[PASS] CDR allocateFee()       0
[PASS] CDR writeFee()          0
[PASS] CDR readFee()           0
[PASS] CDR maxEncryptedDataSize()  1024
[PASS] LicenseToken identity   name()="Programmable IP License Token" symbol()="PILicenseToken"
NETWORK: PASS   CONTRACTS: PASS   FINAL RESULT: PASS
```

### What running it revealed (three findings, not just a green tick)

**1. The license token is now PROVEN, not inferred.** BUILD 1 rated
`0xFe3838BF…C6bC` MEDIUM-HIGH on the basis that *bytecode exists and the docs use this
address*. That is weak: it is a 176-byte EIP-1967 proxy, and a proxy's bytecode says nothing
about what it proxies to. So the harness now asks the contract what it is — `name()` returns
"Programmable IP License Token", `symbol()` returns "PILicenseToken", `totalSupply()` is
68582. Combined with the implementation slot present in the bytecode, that is direct evidence
this is Story's PILE license token. **Confidence: MEDIUM-HIGH → HIGH.** The identity is
re-asserted on every harness run, so a proxy upgrade or a wrong address fails loudly at the
harness instead of confusingly at mint time.

**2. The vault payload cap is 1024 bytes — and that decides the architecture.**
`maxEncryptedDataSize()` = 1024. A vault cannot hold a real file. This independently confirms
the decision already taken for cost reasons: the vault protects the **data key** (32 bytes),
and content encryption is performed by us with that key. Two separate reasons — the size cap
and avoiding a paid `StorageProvider` — now point at the same design, which is the good kind
of agreement.

**3. All three protocol fees are currently 0.** `allocateFee` = `writeFee` = `readFee` = 0, so
today the CDR flow costs gas only. Recorded as a **measurement, not a constant**: the values
are mutable by the protocol, the SDK queries them live, and the contract requires `msg.value`
to match exactly. Hard-coding a 0 would break the day the protocol sets a fee. No fee value
appears anywhere in the codebase.

Two guessed getter names were rejected and recorded as reverts rather than worked around:
`maxEncodedDataSize()` (the real name is `maxEncryptedDataSize`) and `operationalThreshold()`
(exposed under some other name, or read via the Observer). Neither is needed for BUILD 2.

### BUILD 2 status

| Step | Status |
|---|---|
| 1. Verify network + deployment (no wallet) | ✅ **DONE — 12/12 PASS** (`npm run spike:check`) |
| 2. Allocate a vault | ✅ **EXECUTED** — uuid 11062, chain 1315 |
| 3. Write encrypted data key | ✅ **EXECUTED** — 2 transactions |
| 4. Ask the gate directly (free `eth_call` probes) | ✅ **EXECUTED — 4/4**, and the probe set was corrected after the chain contradicted it |
| 5. Prove unauthorized read is rejected | ✅ **EXECUTED** — and re-labelled, because as first written it overclaimed |
| 6. Mint a license token | ✅ **EXECUTED** — token 73227, to the reader |
| 6b. Attributable denial (added 2026-10-07) | ✅ **EXECUTED** — the step that actually proves the claim |
| 7. Prove authorized read succeeds | ✅ **EXECUTED** — read tx `0xaaec7f41…cdea9` |
| 8. Recover plaintext + save evidence | ✅ **EXECUTED** — plaintext sha256 matches byte for byte |

**Everything in this table has now happened on the live chain**, and every transaction hash was
re-verified with `eth_getTransactionReceipt` after the fact. See the "BUILD 2 — EXECUTED" section
at the top of this file for the full record.

**Test count: 46 → 49 → 58 → 66.** Lint clean, typecheck clean, `check-network` 12/12,
`spike:vault` **ALL CHECKS PASSED**.

Step 6b did not exist in the original plan. It was added because the first funded run exposed
that step 5, as written, could not prove what it claimed — the detail is worth reading, because
it is the one place in this project where the harness itself was the thing that lied.

### What the BUILD 2 harness does, and how it refuses to lie

`tools/spike/build-vault.ts` runs eight steps in an order that is itself the proof:

```
environment → asset → vault → gate → denied → mint → gate → read → unlock
```

**The ordering is the argument.** `denied` and `read` are the *same call from the same wallet*.
The only thing that changes between them is whether a license token exists. That is what makes
this a demonstration of the mechanism rather than of two different code paths.

Four deliberate refusals to over-claim:

1. **The gate is read back off the chain.** After allocation, the harness compares the vault's
   stored `readConditionData` with the bytes it encoded. If they differ it STOPS — because a
   denial against a differently-gated vault would prove nothing.
2. **The condition contract is asked directly**, four times, with free `eth_call`s: no aux data;
   a fabricated token id; the real token id; and — the one that matters — the real token id
   presented by a *non-holder*. A revert here is recorded as a **failure**, never as a denial,
   since an unreadable gate and a closed gate are not the same thing.
3. **A denial must be authorization-shaped.** The assertion is not "the error said X". It is: no
   data key returned AND the failure looks like an authorization refusal. A timeout, an RPC
   error or an empty vault all also return no data key, and any of them passing as a
   "successful denial" would be a false result.
4. **`dataKeySha256` and `plaintextSha256` are fingerprints, not the secrets.** The data key is
   never written into `evidence/` — publishing it would let anyone decrypt the asset without a
   license and make the whole demonstration meaningless. The plaintext hash is computed *before*
   any unlock is claimed and compared *after*, so it cannot be back-filled.

The harness also destroys the key when the run completes: no copy of it exists on disk
afterwards. `tests/content.test.ts` holds the other half of that promise — a wrong key, a
tampered ciphertext, or a truncated blob all **throw**, so a false unlock is not reachable.

### Secrets handling for the funded run

Two fresh disposable wallets were generated locally; the private keys live only in
`secrets/*.key` (gitignored — `git check-ignore` confirms) and in GitHub Actions repository
secrets. Neither key has ever been written to a repo file, a log line, or a command argument.

| Wallet | Address | Balance |
|---|---|---|
| owner (asset, vault, license mint) | `0x75D900D18866D8aA416CCEFD9e85D2C61dB0aCa9` | `0x0` |
| reader (the refused-then-allowed reader) | `0x226e01730F6991C1BD11f58d1204638bee89A863` | `0x0` |

`.github/workflows/spike.yml` runs the harness on a GitHub runner so the 8 GB dev machine does
not have to. It is `workflow_dispatch`-only — a job holding a key must never run on a push — and
it has `permissions: contents: read` on purpose, so it *cannot* push. Evidence is uploaded as an
artifact (including from failed runs, which is when it matters most) and committed deliberately
after review.

---

## BUILD 1 RE-VERIFICATION PASS — 2026-10-05 (afternoon)

BUILD 1 was re-run rather than trusted. It found that the protocol's documentation had moved,
closed both previously-UNVERIFIED items, and produced three corrections. Recorded here in full
because two of them change what the code does.

### Closed: the two UNVERIFIED items

| Item | Was | Now |
|---|---|---|
| Aeneid explorer | UNVERIFIED | **VERIFIED** `https://aeneid.datanetscan.io` |
| Aeneid faucet route | UNVERIFIED | **VERIFIED** `https://faucet.quicknode.com/story` (amount still UNVERIFIED) |

The explorer was confirmed two independent ways: its block feed reported height **24525035**
while the Aeneid RPC returned `eth_blockNumber` = `0x17638eb` = **24525035** (same height →
same chain), and `GET /tx/<real hash>` returned HTTP 200 with the hash present on the rendered
page while `eth_getTransactionByHash` confirmed the same transaction. The faucet was confirmed
by HTTP 200 plus the page's own structured data declaring "Story Aeneid" (17×) and chain 1315.

**Deliberately still UNVERIFIED: the faucet drip amount.** Third-party sources contradict each
other and the faucet's own copy (5 IP/24h vs a base drip on a 12-hour cooldown vs 0.1 IP/day).
Rather than pick the most plausible-sounding number, it is recorded as unknown — and it does
not matter, because the harness reads `allocateFee()`/`writeFee()`/`readFee()` from chain.

### Correction 1 — the SDK surface list was incomplete (changes the code)

`createVault` / `readVault` / `createFileVault` / `readFileVault` / `downloadFile` /
`getRegisteredValidators` **do exist in published 0.2.2** — verified by grepping the shipped
`dist`, not by trusting the docs. They are declared aliases (`Uploader.createVault =
uploadCDR`, etc.). The earlier BUILD 1 note implied the whole high-level surface was
unreleased; only `mintLicenseToken` is, and that conclusion is unchanged.

**Consequence:** `uploadFile`/`downloadFile` **require a `StorageProvider`** (Helia /
Storacha / Synapse). Choosing the file API would put a third-party storage network on the
critical path. The core path therefore uses `uploadCDR`/`accessCDR` — the vault protects the
**data key**, content encryption is ours, and **no storage service is involved at all**.
This decides the $0 path and is recorded in `docs/COST_MATRIX.md`.

### Correction 2 — the official docs contain an invalid checksum (changes the code)

The Data Foundation's CDR runtime-configuration page prints the CDR address as
`0xCcCcCC0000000000000000000000000000000005`. **That casing is not a valid EIP-55 checksum** —
viem's `isAddress` rejects it. The correct checksum, computed from the lowercase form, is
`0xCCCcCC0000000000000000000000000000000005`. The DKG address in the same table *is* correct.

The address bytes are identical either way — EIP-55 casing is error detection, not data — so
this is a documentation typo rather than a different contract. But a copy-paste of the docs'
form into any strict tool fails, so `constants.ts` uses the computed-correct casing and
`tests/constants.test.ts` pins **both** facts: that ours validates, and that the docs' does
not. That test stops a future contributor "fixing" our constant back to the broken form.

Worth noting *how* this was caught: the same validation that earlier rejected our own test
fixture (a hand-typed address with a bad checksum) is what rejected the official
documentation. Strict validation earned its keep twice.

### Correction 3 — the protocol rebranded, and its docs host is broken

- `story.foundation` and `www.story.foundation` now **HTTP 308 → `https://www.datafdn.org/`**
  ("The Data Foundation"). Story Protocol is being presented as the Data Foundation / Data
  Network, consistent with the IP → DATA token rename.
- `docs.story.foundation` **serves an expired TLS certificate** — valid 2026-05-26 →
  **expired 2026-08-24**, i.e. roughly six weeks stale as of today. The CDR documentation has
  moved to `https://docs.datafdn.org` (Mintlify; every page also available as `.md`, plus an
  `llms.txt` index).

**No on-chain value changed.** The Aeneid RPC still returns chain id 1315 (`0x523`), and every
contract address in `constants.ts` remains live. This is a naming and documentation-location
change, not a protocol change.

### The §7 endpoint risk — characterised, and its severity revised DOWN

The current docs **reconfirm** `apiUrl = http://172.192.41.96:1317`, still plain HTTP on a raw
IP, still the only Aeneid value, now explicitly labelled *"Plain HTTP. May change between
deployments."*, with the recommendation to point `apiUrl` at your own node for production. So
the risk is **confirmed and still open** — not resolved.

But the SDK docs also state the trust model outright: partials come from `/dkg/cdr_partials`,
the keeper verifies validator signatures on ingress and drops them, and **"the SDK trusts the
keeper at the same level as any other authoritative chain RPC read."** Working that through:

| Property | Holds? |
|---|---|
| Confidentiality of the data key | ✅ partials are ECIES-encrypted to the reader's ephemeral key |
| Integrity of recovered content | ✅ a forged partial fails the AES-GCM auth check — **fails closed** |
| Availability of a read | ❌ an attacker, or a moved/down endpoint, can time the read out |
| Authorization deniability | ✅ the gate is evaluated on chain, before any partial is served |

**The exposure is availability, not confidentiality.** That is materially less severe than
"plain HTTP leaks the key", and `docs/SECURITY.md` §5 has been revised accordingly (medium →
low–medium). The concrete consequence encoded in the build: a failure on this path is
`INFRASTRUCTURE_FAILURE` and must **never** become `NO_LICENSE` — a dropped partial is not a
missing licence.

### Also confirmed

- `conditions.custom({ address, conditionData })` is the exact plug-in point for our
  `LicenseReadCondition`: the SDK forwards pre-encoded bytes and never needs to know what a
  licence is. Our `encodeLicenseReadConditionData()` output feeds it directly.
- The SDK still ships **no built-in licence condition helper**, confirming our decision to own
  that encoding.
- `createVault` exposes `skipConditionValidation` (default `false`). Validation stays **ON** —
  a condition address without the expected interface should fail loudly at allocation, not
  silently at read time.

### Files changed by this pass

`lib/protocol/constants.ts` (explorer verified, `explorerTxUrl()`, corrected CDR checksum,
`CDR_API_URL_AENEID`, `AENEID_FAUCET_URL`) · `tests/constants.test.ts` (new, 15 tests) ·
`.env.example` · `docs/PROTOCOL_DISCOVERY.md` · `docs/SECURITY.md` §5 · `docs/COST_MATRIX.md`
(Notes A and A2, not-used table) · `docs/CLAIM_STATUS.md` (claims 9, 10a–10d, 15).

**Test count: 31 → 46.** Lint, typecheck and tests all clean locally.

---

## VERIFIED PROTOCOL FACTS (verified 2026-10-05)


All verified against **live chain state** and the **published npm package** — not guessed.

### Network — Story Aeneid
| Fact | Value | How verified |
|---|---|---|
| Chain ID | `1315` | Live `eth_chainId` → `0x523` **and** `net_version` → `1315` |
| EVM RPC | `https://aeneid.storyrpc.io` | Live call returned HTTP 200 + valid JSON-RPC |
| CDR SDK packages | `0.2.2` (all four) | npm registry `latest` dist-tag |

### CDR contracts (Aeneid)
| Contract | Address | How verified |
|---|---|---|
| DKG | `0xcccccc0000000000000000000000000000000004` | `eth_getCode` → deployed (ERC1967 proxy) |
| CDR | `0xcccccc0000000000000000000000000000000005` | `eth_getCode` → deployed (ERC1967 proxy) |

### Condition contracts (Aeneid)
| Contract | Address | How verified |
|---|---|---|
| LicenseReadCondition | `0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3` | `eth_getCode` → deployed, selector `0x8db3eb17` |
| OwnerWriteCondition | `0x4C9bFC96d7092b590D497A191826C3dA2277c34B` | `eth_getCode` → deployed, selector `0x5645dbbf` |
| LicenseToken (Aeneid) | `0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC` | `eth_getCode` → deployed (ERC1967 proxy) |

### SDK API surface (verified by reading the published 0.2.2 tarball)
- `new CDRClient({ network, publicClient, walletClient, apiUrl, minThresholdRatio?, logger? })`
  - `network` is `"mainnet" | "testnet"` — **not** a chain ID. RPC is supplied by the caller via a viem client.
  - `apiUrl` is **required** and **configurable** ✅ (answers build-spec §7 Q3)
- `client.uploader.uploadCDR(...)` → `{ uuid, ciphertext, txHashes: { allocate, write } }`
- `client.consumer.accessCDR(...)` → `{ dataKey, txHash }`
- `client.observer.getGlobalPubKey()`, `getVault(uuid)`, `getThresholdAt(round)`
- Condition helpers shipped: `open / ownerOnly / tokenGate / merkle / custom` — **no built-in `licenseRead` helper**

### Condition interface (from `docs/CONDITIONS.md`)
```solidity
function checkReadCondition(uint32 uuid, bytes calldata accessAuxData,
                            bytes calldata conditionData, address caller)
    external view returns (bool);
```
- `conditionData` is set **once at allocation**; `accessAuxData` is supplied **per read**.

**LicenseReadCondition encoding (verified from official docs):**
```ts
// at allocation time — static config
readConditionData = encodeAbiParameters(
  [{ type: "address" }, { type: "address" }],
  [ LICENSE_TOKEN_CONTRACT, IP_ID ],
);
// at read time — per caller
accessAuxData = encodeAbiParameters([{ type: "uint256[]" }], [[ BigInt(licenseTokenId) ]]);
```

**OwnerWriteCondition encoding:**
```ts
writeConditionData = encodeAbiParameters([{ type: "address" }], [uploaderAddress]);
```

---

## ⚠️ SOURCE CONFLICT — RESOLVED

`docs/CONDITIONS.md` on GitHub `main` documents:
```ts
client.license.mintLicenseToken({ licensorIpId, licenseTermsId })
```
**This does NOT exist in the published `@piplabs/cdr-sdk@0.2.2`.**

Evidence:
- npm has only `0.2.0`, `0.2.1`, `0.2.2` published (0.2.2 on 2026-07-15). No prerelease.
- `packages/sdk/src/license.ts` + `license-contracts.ts` exist on **main** but are absent from the published tarball.
- `index.d.ts` of 0.2.2 exports no license module.

**Resolution (per build-spec §10 source-of-truth order — published official SDK outranks repo docs):**
the license-minting feature is **unreleased**. LicenseVault will therefore:
1. use **`@piplabs/cdr-sdk@0.2.2`** for the protected vault (allocate / write / read / decrypt), and
2. mint the Story license token via Story's own official **`@story-protocol/core-sdk`** (npm `1.4.4`).

This keeps the dependency set published + stable, follows the spec's protocol-adapter architecture,
and avoids depending on unreleased `main`-branch code.

---

## 🚩 OPEN RISK — CDR Story-API endpoint (build-spec §7)

| Item | Finding |
|---|---|
| Documented `apiUrl` | `http://172.192.41.96:1317` |
| Protocol | **plain HTTP** (not TLS) |
| Host | raw public IP, no DNS name |
| Reachability | reachable — HTTP 404 on the probe path (host up) |
| SDK override | ✅ `apiUrl` is a constructor param — swappable without patching the SDK |
| Vercel viability | ❓ **UNVERIFIED** — a raw HTTP IP is fragile and insecure from serverless |

**Status: NOT yet a blocker.** Mitigations available: proxy server-side, or run our own
`story` node's `:1317` gateway. Must be resolved before BUILD 9 (deployment).

---

## DECISIONS MADE

1. **Package manager: npm** — pnpm is not installed locally and the spec says keep the toolchain small on an 8 GB machine. npm ships with Node 24.
2. **License minting via `@story-protocol/core-sdk`, not CDR SDK** — see conflict above.
3. **Heavy work goes to GitHub Actions** — local machine is 8 GB with limited data (master prompt §6/§7).
4. **`gh` CLI located** at `C:\Users\USER\AppData\Local\gh-install\bin\gh.exe` (not on PATH; authenticated as `Temmygabriel`, `repo` scope).
5. **eslint pinned to `9.39.5`**, and `eslint-config-next`'s native flat config is spread in directly — no `FlatCompat`, no `@eslint/eslintrc`.
6. **A lockfile is only accepted once `npm ci --dry-run` passes on it.** `--package-lock-only` output is treated as untrusted.
7. **Strict address validation is kept, not relaxed.** viem's EIP-55 checksum check is a feature; test fixtures were changed to suit it rather than the reverse.

---

## NEXT ACTIONS

1. ~~Scaffold BUILD 0~~ ✅
2. ~~Write `docs/PROTOCOL_DISCOVERY.md` + `docs/PROTOCOL_DECISION.md`~~ ✅
3. ~~Add GitHub Actions CI (install → lint → typecheck → test → build)~~ ✅
4. ~~Add `docs/CLAIM_STATUS.md`, `docs/SECURITY.md`, `docs/COST_MATRIX.md`~~ ✅ — plus `ARCHITECTURE.md`, `LIMITATIONS.md`, `EVIDENCE.md`, `ASSET_PROVENANCE.md`, `UX_TEST.md`
5. ~~Commit + push this batch, then confirm the CI run is green.~~ ✅
6. ~~**BUILD 2** — smallest real protected vault on Aeneid (CLI harness, no UI)~~ ✅ **DONE
   2026-10-07** — executed end to end, all checks passed, every tx hash re-verified on chain.
7. ~~**BUILD 3 — the independent verifier**, `tools/verify-canonical-run.ts`~~ ✅ **DONE
   2026-10-08** — 41 verified / 0 refuted / 1 unproven with `--live`. It re-derives every
   claim from the chain, the published ABIs and the bytes on disk, and is wired into CI as a
   separate job. Report: `evidence/licensevault-aeneid-001/verification-report.json`.
8. **BUILD 4 — protocol adapter**, lifting `tools/spike/*` into `lib/protocol/*` so the UI and
   the harness share one implementation. The known product-relevant fact to carry across:
   a read failure must be *decoded* before it is labelled, because a malformed request and a
   missing licence are not the same refusal (finding 2).
9. **BUILD 8 — Vercel.** User has offered to issue a token so deployment can be driven the same
   way GitHub is. Not needed until the UI exists; raise it when BUILD 5 lands.

---

## WHAT IS *NOT* BUILT YET (stated plainly, so it is never mistaken for done)

- ~~No vault has been allocated. No license has been minted. **No read has been attempted**~~ —
  **all three have now happened on live Aeneid** (run `licensevault-aeneid-001`): vault uuid
  11062, licence token 73227, an authorized read that returned a key, a refused read from an
  unlicensed wallet, and content decrypted byte for byte. The mechanism **is** demonstrated end
  to end at the protocol level.
- What is still not built: the shared adapter (BUILD 4) and **every user-facing surface**
  (BUILD 5+). The demonstration above is a CLI harness writing JSON — a judge cannot click it
  yet. The verifier (BUILD 3) now exists and re-checks that JSON from the chain.
- The interface (`app/page.tsx`) is a single deliberate non-final surface: it renders the
  Access Docket in `RESTRICTED` with a **disabled** "Check Access" button. It does not
  pretend to verify anything.
- `docs/UX_TEST.md` has been written but **the test has not been run** — no human has been
  tested. The results table is deliberately blank.

---

## BLOCKERS

**None. BUILD 2 and BUILD 3 are unblocked and complete.**

The wallets were funded on 2026-10-07 and the run executed. Both went from `0x0` to exactly
`1 IP`, so the balance is provably the faucet drip:

| Wallet | Address | Purpose | Balance |
|---|---|---|---|
| owner | `0x75D900D18866D8aA416CCEFD9e85D2C61dB0aCa9` | creates the IP asset + terms, allocates and writes the vault, mints the license | 1 IP (≈0.99994 after gas) |
| reader | `0x226e01730F6991C1BD11f58d1204638bee89A863` | the wallet refused a read *before* the mint and allowed *after* it | 1 IP |

**Funding route — CORRECTED 2026-10-07.** The previously-recorded
`https://faucet.quicknode.com/story` returns HTTP 200 but is **gated on holding ETH on
mainnet**, which makes it unusable from a standing start — reachable is not the same as
workable. The route the first-party docs name, and the one that actually worked, is:

> **`https://aeneid.faucet.datafdn.org/`** — documented amount **10 IP**
> (source: `https://docs.datafdn.org/network/connect/aeneid.md`)

`AENEID_FAUCET_URL` has been corrected and pinned by a test. Two fallbacks are recorded in
`AENEID_FAUCET_ALTERNATES` because funding is the project's single hardest dependency.
Honest caveat: the faucet sits behind a Cloudflare bot challenge, so its contents were never
observed by us directly — the URL and the 10 IP figure come from the docs page.

Remaining dependencies, none of them blocking:

- **BUILD 3 is complete**; the verifier re-checks the evidence independently on every push.
  What is not yet done is the shared adapter (BUILD 4) and every surface a judge can click
  (BUILD 5+).
- The Story-API endpoint risk (§7) is confirmed open but characterised: **availability, not
  confidentiality**. It does not block BUILD 2–8 and must be resolved before BUILD 9.

Funding is a **manual, human step**. This project never automates a claim and never asks for a
seed phrase or private key. The keys were generated locally by the project itself and are held
only in gitignored files and in GitHub Actions repository secrets.


---

## GUARDRAILS (restated so they are never lost)

- Never guess a protocol fact. Unknown = `UNVERIFIED`.
- Never mock a failed protocol operation and call it real.
- Never fabricate tx hashes or explorer links.
- Never show `ACCESS GRANTED` unless the real protected read succeeded.
- A timeout must **never** resolve to `NO LICENSE`.
- A local flag must **never** resolve to `UNLOCKED`.
- The protocol proves the access. The UI explains the access.
