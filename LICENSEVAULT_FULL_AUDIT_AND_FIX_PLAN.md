# LicenseVault — Full Build Audit and Prioritized Fix Plan

**Prepared:** 13 October 2026  
**Repository:** https://github.com/Temmygabriel/LicenseVault  
**Live app:** https://licensevault.vercel.app  
**Hackathon:** BLI Legal Tech Hackathon 2 — https://dorahacks.io/hackathon/legal-hack-2026/detail  
**Primary acceptance contract:** `LICENSEVAULT_BUILD_SPEC.md` (the uploaded 2,005-line build spec; also present in the repository)  
**Audience:** DeepSeek / coding assistant implementing fixes.  
**Objective:** Move LicenseVault from a credible protocol prototype plus a strong presentation surface to a clear, reproducible, judge-ready product without fabricating protocol success, adding unnecessary features, or silently changing networks.

---

## 0. Executive verdict

### The verdict

**LicenseVault is not ready to be treated as a finished, competitive submission yet. The visual system is substantially on target; the live user journey is still incomplete.**

The repository contains meaningful engineering work: the deployed app performs a real read-only `eth_call` against the Aeneid license condition; the code validates addresses and checks the RPC chain ID; it distinguishes a genuine authorization refusal from infrastructure errors; it includes a recorded end-to-end CDR run, evidence artifacts and a verifier; and the visual system is coherent rather than generic AI-generated SaaS. The checked-in screenshots show a deliberate editorial/archival design rather than a stock crypto dashboard.

However, the live website does not currently complete the product's defining action. A visitor can ask whether an address satisfies the license condition, but cannot obtain the required license through the interface, execute the protected CDR read with their own wallet, recover/decrypt the protected content in the browser, and then inspect the newly opened content. The website itself explains that it stops at `LICENSE VERIFIED`; `ACCESS GRANTED` cannot be reached from the live UI. This is an honest limitation, but it leaves the product's central promise unfulfilled in the actual deployed user journey.

The second serious issue is repository coherence. `README.md`, `docs/CLAIM_STATUS.md`, `docs/LIMITATIONS.md`, `docs/PROTOCOL_DECISION.md`, and `docs/UX_TEST.md` contain older build states that contradict the latest `PROGRESS.md`, committed evidence and current app. Judges often start with the README; this contradiction can make real work look unfinished, careless or unverifiable.

A third issue is now strategic, not only technical: The DATA Foundation announced on **12 October 2026** that DATA Network will move to a native Sui protocol and that its independent chain will be retired. The existing chain is expected to continue until its upgrade is complete, but the announcement does not yet give a detailed migration timeline. LicenseVault is built against the old Story/DATA EVM network and Aeneid, so the project must verify the chain's expected availability over the hackathon's judging window. This does **not** mean to immediately rewrite the project for Sui; the equivalent license-gated read path has to be proven first.

### My independent UI assessment

This is a source-and-screenshot review, not a fresh live-browser or on-chain execution performed by this reviewer. I inspected the current GitHub source, the recorded proof artifacts, the repository's QA report and committed screenshots. The automated browser tool could not directly load the live Vercel site, so the screenshot judgement is based on the committed production captures.

| Category from the build spec | Independent score | Assessment |
|---|---:|---|
| Product clarity | 2/2 | The headline, protected resource, required license, state and action are easy to identify. |
| Product-specific identity | 2/2 | The docket, paper surfaces, thin rules, type pairing and copper accent feel designed for LicenseVault. |
| Mechanism visibility | 2/2 | The page explains a license-gated read and separates the protocol verdict from a UI flag. |
| Hierarchy | 2/2 | The proposition and dominant docket have a clear desktop relationship. |
| Typography | 2/2 | Newsreader, IBM Plex Sans and IBM Plex Mono match the locked system. |
| Spacing and density | 2/2 | Desktop is restrained and measured; the docket is information-dense without becoming a card grid. |
| Signature interaction | 1/2 | The license check is real, but the signature interaction stops before the promised protected-content opening. |
| State coverage | 1/2 | Locked, checking, verified, no-license and error states exist; the browser cannot reach the protected-read/decryption states. |
| Motion | 1/2 | Reduced motion is respected, but no meaningful verify-to-open transition exists yet. |
| Mobile | 1/2 | No horizontal overflow is documented, but the 320 px header is 87 px and the primary action is below the initial viewport in the checked mobile capture. |
| Technical honesty | 2/2 | The UI does not claim that a license probe has decrypted content. |
| Judge proof | 2/2 | The proof receipt exposes identifiers and transaction links, and keeps an unverified claim visible. |
| **Total** | **20/24** | **Meets the numeric visual target, but does not pass the overall product acceptance gate.** |

A 20/24 visual score does not overrule the spec's no-go conditions. A beautiful, honest page can still be an incomplete product.

### How close is it to winning?

There is no reliable way to predict a win from the available public information, and this report does not invent odds. The work has a real technical story and stronger proof discipline than many prototypes. Its current weakness is that the live product does not demonstrate the highest-value outcome. In a judging session, showing a real on-chain denial and a real license-gated decryption in one understandable flow is likely much more valuable than adding extra pages or redesigning the current hero.

**Priority:** protect the proven work, resolve the network/dependency gates, complete or honestly scope the live access journey, synchronize the repository, and then do a focused final UI pass.

---

## 1. Important product and wallet findings

### 1.1 What the live application does today

The current page at `app/page.tsx` composes the proposition, `AccessPanel`, `AccessDocket`, explanation and proof receipt. The interactive form in `components/AccessPanel.tsx` accepts an EVM address. When submitted, `components/AccessProvider.tsx` calls `/api/verify-license`; `app/api/verify-license/route.ts` makes a real read-only call to the Aeneid condition contract and returns its result. That means:

- A pasted address can be checked without any wallet connection.
- If an EIP-1193 injected browser wallet is detected, the page has a **“Use my wallet”** control that requests account access and checks the returned address.
- The check itself uses no transaction, no user signature and no gas, because it is a read-only condition probe.
- An `ALLOWED` result can produce `LICENSE VERIFIED` only. It cannot itself produce `ACCESS GRANTED`.
- The “Use the recorded license holder” shortcut makes it easy for a judge to reproduce the known successful check, but it is a demonstration shortcut, not the visitor's identity and not a user onboarding flow.

Therefore the concern “there is no wallet connect” is **partly right, but not quite the whole problem**. The app does have an injected-wallet action inside the docket; it does not have a conventional persistent wallet connection control in the header, account/chain change handling, a disconnect/forget action, or a browser transaction flow. A wallet connection alone will not solve the product gap. The actual missing feature is wallet-authorized license acquisition and protected reading/decryption.

### 1.2 What a judge cannot do on the live page

A visitor cannot currently:

1. Connect a wallet as the primary entry action and see the connected account/network as live state.
2. Review/accept the actual license terms and mint a license token from the UI.
3. Initiate the CDR read transaction using the license holder as caller.
4. Recover the data key and decrypt the protected content in the user experience.
5. See the actual recovered resource after the protocol operation completes.
6. Review a proof receipt that is explicitly tied to the live action just performed, rather than a separate committed canonical run.

When a wallet is not licensed, the main action becomes **Try Again**. That checks the same question again; it does not help the person obtain the license. After a positive check, the main action becomes **Check another address**, not “Open Protected Asset,” because the decryption path is not wired to the web app yet.

This is a material acceptance gap against the build spec's workflow:

`PROTECTED RESOURCE → LICENSE REQUIRED → UNLICENSED READ REJECTED → LICENSE OBTAINED → AUTHORIZED READ → CONTENT RECOVERED → VERIFIABLE PROOF`

The current web journey is closer to:

`PROTECTED RESOURCE → ADDRESS SUBMITTED → CONDITION CHECKED → LICENSE VERIFIED / NO LICENSE → HISTORICAL PROOF RECEIPT`

Both are useful, but they are not the same product.

### 1.3 The correct wallet model

Do **not** add a wallet connection simply for visual decoration. Make the wallet the primary action because the real read and any license mint must be performed by the actual license holder.

Minimum implementation direction:

- Add a clear `CONNECT WALLET` control in the header/docket. Use the existing EIP-1193 injected-provider path first. Do not add a paid dependency or make WalletConnect mandatory just to meet a UI convention.
- Listen for `accountsChanged` and `chainChanged`. Reset stale verification when the active account changes. Do not display a result for account A as if it belongs to account B.
- Add a clear `DISCONNECT`/`FORGET WALLET` action in the app. Be precise: injected-wallet providers do not always support programmatic disconnection, so this action may clear LicenseVault's selected account and state rather than revoking the provider's permission.
- For address-only verification, make it clear that this is a read-only check of the entered address on **Aeneid**. The wallet can be on another chain and still own a token on Aeneid, so a wallet-network check is not a substitute for checking the target chain.
- Before a transaction-based action, explicitly require Aeneid (chain `1315`), offer a network-switch request where supported, and report user rejection as cancellation—not `NO LICENSE`.
- Keep the manual-address pathway as a secondary “Check an address” feature for read-only verification. Never make a manually entered third-party address look like the connected user's own identity.
- Keep the recorded-license-holder shortcut for judge/demo use only, under a visibly labeled `DEMO SHORTCUTS` or `Use sample address` disclosure. It must not be the main action in the real user journey.
- Never ask for a seed phrase or private key. Never place a wallet key or operator key behind `NEXT_PUBLIC_*`.

### 1.4 Do not turn `LICENSE VERIFIED` into `ACCESS GRANTED`

The current state machine and frontend make this distinction correctly. Preserve it.

A successful call to `checkReadCondition` means that the condition reports the address may read. It is **not** proof that a complete CDR read transaction succeeded or that the expected plaintext was recovered. The only allowed path to `UNLOCKED` remains a real authorized CDR read followed by successful content decryption, with real evidence for the read transaction and the recovered content.

Likewise, do not infer `NO LICENSE` from a timeout, malformed response, disconnected RPC or CDR API failure. The existing failure classification is one of the project's strongest engineering decisions and needs to remain intact while the full read is added.

---

## 2. Highest-priority fixes

### P0-1 — Resolve the DATA Network / Sui transition gate before deciding the long-term target

**Why it matters:** The project is built on the former Story EVM chain. The Data Foundation's official rebrand announcement says the network was renamed, and its 12 October 2026 Sui announcement says the independent DATA chain will be retired once the upgrade to a native Sui protocol is complete. It says the existing chain continues until the upgrade is complete, but did not publish a detailed upgrade date in that announcement.

**Required actions:**

1. Recheck the official DATA Foundation documentation, Aeneid RPC, explorer and current CDR SDK/repository release notes immediately before the next protocol change.
2. Determine whether the current Aeneid contracts, RPC and CDR read path will remain usable through the BLI judging window, which the current BLI page places from 5 November to 5 December 2026.
3. Save the source URL, access date, source version/commit and a short determination in `docs/PROTOCOL_DISCOVERY.md` and `docs/PROTOCOL_DECISION.md`.
4. Do not say “migrated to Sui” as a current implementation fact until the Sui equivalent is actually implemented and independently tested.
5. Do not claim that the live Aeneid app is long-term production infrastructure. Label it a testnet proof-of-concept on the legacy EVM network if that is still its reality.
6. Do not attempt a rushed Sui port unless the team can identify and prove the equivalent: IP/license identity, license-holder authorization, protected storage/key release, denied unauthorized read, authorized recovery, and independent evidence. A chain switch is not an equivalent product feature by itself.

**Pass condition:** The target network decision is evidence-based and explicitly states whether Aeneid is acceptable for the judging period. Unknown transition timing must remain `UNVERIFIED`, not an invented date.

### P0-2 — Make the browser product perform the protected read, or clearly block that phase

**Why it matters:** This is the main product acceptance gate. The canonical CLI evidence shows the underlying flow has been run, but the deployed website is still a condition-verification UI rather than an end-to-end access product.

**Implementation sequence:**

1. In a protocol-only spike, verify the currently published CDR SDK and Story SDK APIs from official sources; do not assume the local package docs and GitHub `main` branch match the pinned npm package.
2. Prove the authorized read/decryption can operate in the actual intended deployment environment, including the browser/wallet flow and the CDR API dependency. Test the API from Vercel, not only from the developer's local computer.
3. Determine the correct architecture for user-signed CDR reads. The read must execute as a caller whose license is being tested. Do not have an unrelated server operator account sign a read and then claim that it proves the visitor has permission.
4. Use the connected user's wallet client/provider for transactions requiring that user's authority. Keep key material inside the wallet. The decryption operation should recover the key/content for the authorized reader; do not expose a server-held plaintext file or use a front-end boolean as authorization.
5. Keep the initial creation of the IP asset and protected vault as a one-time licensor/setup action if that is the smallest reliable MVP. Do not add a marketplace or unrelated administrative application.
6. Build the user journey around the real sequence: inspect requirement → connect wallet → check license → obtain/accept license if absent → perform protected read → decrypt → reveal payload → proof.
7. Show honest waiting during transactions and partial collection; don't use invented percentage progress or fake confirmation states.
8. On decryption failure, leave the content sealed and show a specific error state.

**Important protocol/API blocker:** The repository's own security notes identify the Aeneid CDR Story-API URL as plain HTTP. The build spec explicitly requires confirming whether an official TLS endpoint exists, whether the SDK can be configured safely, and whether deployment can reach the endpoint. Do not silently ship around that requirement. If a secure, viable endpoint cannot be established, mark the full browser unlock `BLOCKED`, document the evidence, and use the honest recorded-run fallback described in P0-3 rather than faking a live unlock.

**Pass condition:** From the deployed site, a judge can follow a real supported path to a content recovery result, or the deployment clearly states that live unlock is blocked and shows an identified, genuinely recorded run. `ACCESS GRANTED` must never be produced from the `eth_call` result alone.

### P0-3 — Preserve a truthful end-to-end demo fallback if the deployed read remains blocked

A technical dependency may not be fixable before the submission date. The answer is not to misrepresent what the site does.

If the browser read is blocked by an unresolvable CDR endpoint/deployment issue:

- Keep the live address check live and explicitly describe it as a read-only license-condition check.
- Show a real recorded canonical run with the creation, license mint, denied read, authorized read, decryption and transaction proof.
- Label the history as a **recorded successful Aeneid run** and show when it occurred. Never imply that the current button caused the old transactions.
- Add a short real screen recording of that run to the judge package. The user spec expressly permits a recorded real run when timing/infrastructure prevents a live demonstration, provided it is identified honestly.
- Show the missing hosted unlock as a known limitation. Do not show a synthetic decrypted file, invented transaction hash, simulated wallet, fake progress, or fake `ACCESS GRANTED` state.

This is a fallback that protects credibility, not a substitute for completing the main product flow. The full spec's preferred gate remains a live canonical flow.

### P0-4 — Fix the stale, contradictory documentation before submission

A judge should not have to decide which of multiple conflicting project status statements is true. Synchronize these files against the current commit and real evidence:

| File | Current problem | Required correction |
|---|---|---|
| `README.md` | The status table says the real vault is still the next phase and the main action is disabled, even though the repo contains a real canonical run and the live site performs a license check. | Rewrite the status summary for the current build. State separately what the CLI/evidence proves and what the live web UI actually does not yet do. |
| `docs/CLAIM_STATUS.md` | The last-updated date is 5 October and LicenseVault's own gated read/authorized result are listed as unverified despite the later verifier report and evidence artifacts. | Reconcile every claim against current evidence. Do not blindly mark all claims proven: distinguish historic canonical-run proof, live website probe, hosted end-to-end unlock, and the remaining unverified contract-target claim. |
| `docs/LIMITATIONS.md` | It says the gated read had not yet been demonstrated and contains older statements about explorer/faucet/dependency status. | Update the dated status and current findings while preserving real limitations: testnet only, fictional asset, not universal DRM, not legal advice, and license-terms precision limitation. |
| `docs/PROTOCOL_DECISION.md` | Its unresolved-items table and some “not yet run” context predate the completed CLI evidence. | Update choices/status only where later evidence supports doing so. Retain open API transport/deployment limitations until actually resolved. |
| `docs/UX_TEST.md` | It says the UI/product surfaces do not exist, even though a deployed UI and screenshots now exist. The stranger test result table is blank. | Update the test setup for the actual current UI. Conduct the real stranger test and write the tester's actual responses, or leave the result explicitly `NOT RUN` without saying the product surfaces do not exist. |
| `docs/VISUAL_QA.md` | The 22/24 report is detailed and helpful but does not include the missing unlocked screenshot because the web flow cannot reach it. | Keep the missing screenshot declared absent until the real unlock exists. Re-score the final browser UI after implementation rather than adding a fake screenshot. |
| `PROGRESS.md` | This is the most current status, but its phase labels do not map cleanly onto the numeric phase gates in the master spec and older sections remain in the file. | Add a concise current status at the top and a mapping table from repository work phases to the exact master-spec BUILD gates. Make the oldest phase narratives explicitly historical. |
| `docs/SECURITY.md` | The CDR HTTP endpoint issue is still open and hosted reachability is not verified end-to-end. | Keep it open until a TLS/self-hosted solution and hosted path are genuinely tested. Do not mark it resolved based on local reachability alone. |
| `docs/EVIDENCE.md` | It describes evidence and current limits, but the proof receipt has one `NOT VERIFIABLE` assertion. | Make the outstanding assertion and its reason explicit. If evidence metadata can be improved through a source-verified contract target, update the artifact and re-run the verifier. If not, retain the `NOT VERIFIABLE` result. |

**Do not delete historical notes to hide mistakes.** Keep them if useful, but label them as dated history and point to the current status near the top. Do not claim that all 42-ish checks pass if one remains unverifiable. Preserve the exact verifier counts output by the current run.

**Pass condition:** The README, progress summary, claim register, limitations and UX-test status no longer contradict each other. Every statement about a feature being “live”, “verified” or “complete” points to the appropriate evidence.

### P0-5 — Prove the relevant license semantics and scope the claim precisely

The current `docs/LIMITATIONS.md` is candid about a real design limit: the read condition is configured around a Story license token contract and IP identifier; it does not distinguish multiple different license-term sets attached to the same IP asset. In the canonical run, the IP asset has a single relevant Commercial Use term set, so the narrow demonstration can be valid. It does not prove general term-level policy enforcement across multiple term sets.

Required actions:

1. Keep the MVP to **one IP asset, one license-term set and one gated resource** unless a term-aware condition has been verified and implemented.
2. Describe the displayed `Commercial Use` label as the configured license terms for this demo. Do not claim the current condition evaluates arbitrary legal clauses or guarantees that a user's real-world use complies with them.
3. Keep the token ID, IP ID, term ID and vault identifier visible in the proof receipt and explain the relationship in plain language.
4. Add a test/report that explicitly states the limitation. If the team later adds another terms set to the same IP, do not assume the current read condition discriminates between terms.
5. Do not deploy a custom contract or invent a licensing primitive merely to close the gap. The build spec explicitly excludes a custom Story replacement contract. If exact term-level authorization is a hard requirement, verify whether the supported protocol primitives suffice; otherwise keep the MVP scope narrow and disclose it.

**Pass condition:** The live claim is no broader than the protocol condition actually enforces.

---

## 3. Detailed UI/UX recommendations

### 3.1 Keep the current art direction; do not restart the design

The checked-in 1440×900 screenshot is directionally strong against the brief:

- Warm paper canvas and subtle inner surface.
- Large Newsreader headline, readable sans-serif UI, monospace wallet/IDs.
- A single dominant Access Docket rather than a wall of generic cards.
- Thin rules, square-ish corners, restrained copper for action and quiet red/green state treatment.
- An original sealed-record drawing that does not rely on copied screenshots or stock crypto art.
- Clear display of the asset, required license, holder, status and target network.

This is not the rejected purple/blue crypto-dashboard direction. DeepSeek should **refine this identity, not replace it with gradients, giant rounded cards, a feature-grid template, tokenomics, fake analytics or a new illustration system**.

### 3.2 Make the docket tell the truth about current state and next action

The Access Docket is the right primary object. Preserve its order and label hierarchy, but make the action truly state-specific:

| State | Required user-facing meaning | Appropriate next action |
|---|---|---|
| Disconnected / locked | No identity is selected yet; the resource is sealed. | `CONNECT WALLET` (primary). A secondary `CHECK AN ADDRESS` can stay available. |
| Connected, checking | The actual Aeneid condition or read is being checked. | Disable duplicate execution and show honest progress text. |
| No license | A genuine on-chain authorization refusal occurred. Do not use this for timeout or RPC failure. | `VIEW LICENSE TERMS` and, if the supported mint path is implemented, `OBTAIN LICENSE`. |
| License verified | The chain confirmed that the connected address satisfies the defined license condition; the content has not necessarily been opened. | `OPEN PROTECTED ASSET` only when an actual CDR read is wired. Otherwise use `VIEW RECORDED RUN` / `READ-ONLY CHECK COMPLETE`, not a button implying it can unlock. |
| Accessing | A real CDR transaction / partial-collection / decryption step is in progress. | Show the actual step underway; no fake percentage. Prevent double-submit. |
| Unlocked | The actual protected content was recovered and decryption succeeded. | Render the real recovered asset, `VIEW PROOF`, and optionally `DOWNLOAD RECOVERED FILE`. |
| Verification error | The system could not establish the answer. | `TRY AGAIN` and `VIEW DETAILS`. Never change this to “No license.” |
| User cancelled | The user rejected a wallet request or transaction. | `TRY AGAIN` / `CANCELLED`; do not call the user unlicensed. |
| Transaction failed | Chain transaction failed or reverted. | Show a transaction failure and real explorer link if verified. |
| Decryption failed | Authorization/read may have succeeded, but plaintext recovery failed. | Keep content concealed and provide `TRY AGAIN` / technical details. |

Do not add a new page for each state. State transitions should happen in the same core product surface, as the current information architecture intends.

### 3.3 Replace the current “retry loop” with a real next-step path

The current no-license state changes the button to `TRY AGAIN`. A retry is useful after a transient failure, but it does not solve the user's actual problem when the address simply lacks a license.

After an authenticated `NO LICENSE` result:

1. Keep the asset and the exact license requirement visible.
2. Explain: “This wallet does not hold a license for this demo asset.”
3. Provide `VIEW LICENSE TERMS` before asking the user to sign anything.
4. If the supported license-mint route is implemented, show `OBTAIN LICENSE`, the actual on-chain terms, any fee and gas expectation, and an explicit acceptance step. The user should deliberately choose to accept/mint; do not create a license without informed user action.
5. After the mint transaction succeeds, re-check ownership from the chain, then allow a protected read. A successful toast or local state is not enough.

If a transaction-based mint path cannot be made safe and reliable before submission, keep it out of the active UI rather than faking it. The current sample-holder shortcut can demonstrate the positive condition check, but it must be called a demo shortcut, not a license acquisition flow.

### 3.4 The unlocked state must reveal the actual recovered content

The current sealed-record illustration is suitable as a locked-state metaphor. It cannot be the entire content reveal.

When the real authorized read is implemented:

- Render the actual resource that was encrypted and recovered, or show a truthful preview/manifest of the decrypted payload.
- Prefer the same Commercial Brand Asset Pack used by the canonical run, not a fictional collection of invented thumbnails.
- If the protected plaintext is a JSON delivery manifest, render the relevant data as the actual manifest and allow the recovered file to be downloaded. Do not describe a JSON manifest as a full image pack unless the recovered bytes really are that pack.
- Keep the recovered content client-side where practical. Do not add a server endpoint that serves plaintext independently of the authorization gate.
- Transition the access state in the same docket: `RESTRICTED → LICENSE VERIFIED → ACCESSING → ACCESS GRANTED`, but only as each real operation completes.
- Keep proof available without making the success treatment overpower the recovered asset.

A successful state must be a consequence of successful decryption and recovered content, not animation or copy.

### 3.5 Wallet-control improvements

`components/WalletChip.tsx` is a status display, not a wallet-control component. `components/AccessPanel.tsx` offers `Use my wallet` only when an injected provider exists. Improve it without adding an unnecessary UI kit:

- Make `CONNECT WALLET` discoverable in the first viewport.
- When connected/selected, show the short address and target network state, with an accessible full address.
- Subscribe to injected-provider account changes and chain changes.
- When the selected account changes, clear the old verdict and require a fresh check. Do not preserve a green verified state across account changes.
- Add `FORGET WALLET`/disconnect-from-app. Explain if it only clears app state rather than revoking extension permission.
- On a mobile browser without an injected provider, explain the limitation and provide an address-only read-check route. Do not claim that the address-only path can make transactions or decrypt the file.
- Transaction actions need a funded Aeneid account and testnet gas; explain the faucet/setup route only after verifying the current official route and amount. Do not make the user paste a private key.

### 3.6 Improve mobile without sacrificing the locked system

The QA artifacts already prove an important baseline: no horizontal overflow at multiple widths, and fields shrink rather than forcing the docket wider. Keep that.

Required refinements:

- Fix the 320 px header height from the recorded 87 px toward the spec's 64–72 px target if feasible without horizontal overflow. Keep the wallet action accessible; do not simply hide a necessary action.
- Shorten the mobile-only distance from headline to primary action. The 390×844/320×844 captures show that the docket continues below the initial viewport before the primary button is reached. Compress the decorative resource-art well and vertical row spacing on narrow screens while keeping the asset identity, license requirement and current state clear.
- Ensure the primary action is reachable with minimal scrolling on a common mobile viewport. Do not bury the actual authorization state below extra explanation or proof metadata.
- Keep wallet addresses truncated visually but complete to assistive technology.
- Rerun the measured viewport audit at 1440, 1280, 1024, 768, 390 and 320 widths after any CSS change. Ensure the probe targets the docket action, not the first button on the page.

Do not solve mobile with horizontal scrolling, extremely tiny text, or removing the access state.

### 3.7 Give the success transition a purposeful visual cue

The current page changes its status text in place. After the real operation exists, introduce a restrained `VERIFY → ALIGN → OPEN` transition of roughly 160–320 ms:

- A clear status change when the condition result arrives.
- A separate in-progress state while the CDR transaction / key recovery is happening.
- Reveal the content only after decryption succeeds.
- Respect `prefers-reduced-motion`; all states must remain clear without animation.
- No confetti, neon, particles, blockchain-mining theatre, fake percentage, or crypto sparkle.

The signature interaction is about the actual content threshold opening—not about an elaborate animation.

### 3.8 Proof receipt improvements

`components/ProofReceipt.tsx` is a solid direction: a ruled record instead of an explorer clone. Keep its labeled groups and mono identifiers. Improve it as follows:

- Distinguish the **canonical recorded run** from the visitor's current live result. The historical receipt must not look as though it was created by the last button click.
- Show the run ID and observation time in a prominent enough but restrained location.
- If the current session has performed a live read, add a separate proof entry for that transaction/result; only include a transaction link after the hash and explorer have been verified.
- Keep `verified`, `refuted` and `not verifiable` counts honest. One `NOT VERIFIABLE` claim is not fatal, but it should never be silently removed or presented as a perfect score.
- Label the relationship between IP asset, term ID, token ID, holder and vault UUID in plain English; avoid displaying raw hashes with no causal explanation.
- Consider a concise “Why did access open?” sentence: the same license token exists, it belongs to the checked holder, the vault is bound to this IP asset, and the live condition answered true. Only include each sentence if the supporting check exists.
- Retain a technical details disclosure for auditors without forcing every visitor to parse raw ABI data.

---

## 4. Protocol, security and evidence requirements

### 4.1 CDR API transport and deployment gate

The repository already identifies the Aeneid CDR Story-API endpoint as a plain-HTTP dependency. This issue is not closed merely because the endpoint responds locally. Complete these steps:

1. Re-read the current official CDR SDK `Networks` and user-guide notes, recording the exact installed SDK version/commit and access date.
2. Verify whether an official TLS endpoint exists now. Do not infer that an endpoint exists from a request for one or from a stale README.
3. Verify the SDK can be configured to use the selected endpoint without depending on undocumented internals.
4. Test the read/partial-collection path from the deployed Vercel environment (not only local Node). Store a sanitized result—never the operator's raw RPC URL or credentials—in the progress/evidence record.
5. If HTTPS is not provided, evaluate whether a self-controlled REST gateway is viable under the user's zero-cost constraint. Do not add a paid dependency as a mandatory path without approval.
6. Reassess the transport trust model. The SDK documents the keeper path as an operational dependency; plain HTTP creates availability/integrity risk even if individual partials and final decryption can fail closed.
7. Keep API failures classified as infrastructure failures. They must not turn into a denial-of-license state.

**Pass condition:** The hosted authorized read works through a documented, intentionally accepted transport path, or the phase remains `BLOCKED` with the honest fallback demo.

### 4.2 Never allow the address probe to unlock data

The existing `/api/verify-license` route correctly performs a read-only probe of the condition contract for an arbitrary supplied address. It is suitable for showing an authorization decision. It must not become an API that accepts `{address: ..., vaultUuid: ...}` and responds with plaintext merely because the condition returned `true`.

For the full unlock, the implementation must call the actual supported CDR read/decryption sequence and enforce that the transaction caller is the authorized wallet. Keep user signing in the wallet; keep any setup key server-side and disposable if it is genuinely required for licensor setup. Never serialize keys into state, logs, API responses, client bundles or committed evidence.

### 4.3 Evidence and verifier follow-up

The committed evidence tree includes the Aeneid canonical run `licensevault-aeneid-001`. Its verifier report is generated in live mode on 9 October 2026 and reports **41 verified, 0 refuted and 1 not verifiable**. The artifacts record an IP asset, license terms, license token `73227`, vault UUID `11062`, an authorized read transaction, a denied read and successful content decryption. The report's unverified assertion concerns whether one Story SDK transaction's descriptive target maps to the exact contract address in the receipt; it is not a reason to suppress that result.

Required actions:

- Rerun `npm run verify:run` after changes and save the current output.
- Before submission, if practical, run `npm run verify:run -- --live` again to recheck the active chain and reproduce the protected decrypt. It is a real testnet transaction and needs a testnet-funded account, so do not pretend it is a free read-only check.
- Inspect the single `NOT VERIFIABLE` item. If the transaction can be correctly attributed from current official Story SDK/workflow source, update the artifact schema with a concrete, verifiable contract target and regenerate the report. Do not hardcode an assumed contract solely to make the count zero.
- Keep all keys out of evidence. The evidence should contain fingerprints/hashes, not the recoverable data key.
- Keep explorer links limited to URLs that have been checked against current explorer/RPC data.
- The browser's live condition probe and the historic end-to-end CDR proof are different evidence types; label them as such.

### 4.4 Rate limiting and public-endpoint abuse

The verification endpoint has input validation, a timeout, `no-store`, a per-client limiter and a process-level cap in its implementation. This is a good baseline. In a serverless deployment, in-memory rate limits are not a durable global limit across independent instances. Before exposing the route to substantial traffic, use an available platform-level limit if one can be applied without a paid mandatory service; otherwise document the limitation and keep outbound RPC usage bounded. Never return raw RPC errors that include a secret-bearing endpoint URL.

### 4.5 Required adversarial tests

Run and report at least these cases after the read path is integrated:

- Licensed holder: the actual CDR read succeeds and expected plaintext decrypts.
- Unlicensed wallet: the actual CDR read is refused; the demo uses a real token ID and otherwise valid request so the denial is attributable to licensing.
- Wrong IP / wrong token / malformed auxiliary data: safe refusal, not an unlock.
- Wrong chain: transaction flow is blocked and the message identifies the expected network.
- Wallet account changes during or after verification: stale success clears and the new account is rechecked.
- User rejects connect/sign/mint: cancellation, never “No license.”
- RPC timeout, keeper timeout and wrong response: infrastructure error, never “No license.”
- CDR read transaction fails after the preliminary `eth_call`: no content reveal.
- Decryption fails or returns unexpected bytes: no content reveal.
- Refresh after success: no cached local flag is accepted as authority; revalidate or display historical proof as history.
- Client-side tampering/forged response: cannot produce the unlocked state or recover plaintext.
- Deployed Vercel execution: no API secret leakage, no raw provider credential in error responses, and no unintended caching.

---

## 5. The hackathon itself: current status, fit and caveats

### 5.1 What I could verify

- The target event is **BLI Legal Tech Hackathon 2** on DoraHacks, organized by the Blockchain Legal Institute. Its official submission portal is the URL supplied at the top of this document.
- The BLI hackathon page at `https://bli.tools/hackathon/` currently states that judging runs from **5 November through 5 December 2026**, with award announcements on **12 December 2026**. It describes legal, finance and compliance innovation, mentoring, ecosystem/bounty support and decentralized systems. [Official BLI event page](https://bli.tools/hackathon/)
- Public third-party listings describe the DoraHacks event as virtual/global and legal-tech/blockchain oriented. Several currently report a $20,000 DoraHacks pool, while BLI's general page describes bounty tokens in a $1,000–$25,000 range and a separate $5,000 admin grant. Some aggregators report more than $50,000 of overall bounties/support. These numbers appear to describe different scopes or different listing snapshots; do not promise yourself a specific award based on a generalized total. Check the individual bounty amounts shown in the live DoraHacks portal.
- Third-party event records disagree on whether the final submission/end date is **31 October** or **1 November 2026 at 09:01 UTC**. The automated browser was not able to read the DoraHacks detail page directly because it returned a method restriction. Treat the current deadline shown inside the DoraHacks submission form as authoritative; do not rely on the aggregator time.
- BLI's public page gives the judging/award period, but I could not verify a definitive 2026 scoring rubric, full current judge list or a current DATA Foundation/Story bounty from the publicly accessible text. Do not claim a Story/Data Foundation-sponsored track unless the active portal explicitly lists it.

Sources to recheck:

1. [DoraHacks — BLI Legal Tech Hackathon 2](https://dorahacks.io/hackathon/legal-hack-2026/detail) — authoritative submission deadline, current bounties, rules and required submission fields.
2. [BLI — official hackathon information](https://bli.tools/hackathon/) — judging window and award date.
3. [CompeteHub's BLI listing](https://www.competehub.dev/en/competitions/dorahackslegal-hack-2026) — useful secondary reference; not the final authority for prizes/deadline.
4. [Clout event listing](https://clout.best/e/a5b5e4e7-7d5a-43cd-8378-ce79ddb5d2ac) — another secondary snapshot; not the final authority.

**Do not confuse this with the separately named `legal-hackathon.tech` event.** That is a different Legal Tech Hackathon associated with Bangladesh digital legal-aid services and has its own eligibility and September Round 1 deadline. LicenseVault is being assessed against the BLI event on DoraHacks, not that other event.

### 5.2 Product fit against a legal-tech competition

LicenseVault has a legitimate intersection with legal tech: it takes an IP license relationship and uses it to gate a real read of protected digital content. It is stronger than a generic legal-document vault or a front-end license badge because the repository's real run shows an actual condition-based refusal and authorized CDR recovery.

Still, the story must be framed for legal/compliance judges, not only protocol engineers. The strongest use case is a creator or rights holder supplying a digital commercial asset to an agency, contractor or authorized collaborator. The application demonstrates a concrete step the rights holder can enforce technically: the protected file is not released by this gate unless the relevant on-chain license condition permits the read.

The application must never imply that:

- an NFT/token alone proves a court would recognize every claimed license term;
- the software interprets all real-world legal clauses;
- it guarantees compliance or prevents an authorized recipient from copying/re-sharing content;
- it is universal DRM;
- it gives legal advice.

The README/limitations already make several of these distinctions well. Preserve and surface them in the submission narrative, but avoid letting disclaimers overwhelm the main proposition. State the specific engineering problem and what the demo actually proves.

### 5.3 Competition positioning

The BLI event is broad enough that “blockchain + license token” alone is not a sufficient differentiation story. Explain the operational gap:

> A license record by itself does not prevent an unlicensed software client from requesting a protected resource. LicenseVault ties the rights relationship to the protected read so the protocol refuses unauthorized access and permits a true authorized read.

The judge needs to see that one causal chain, not a feature list. Show the denied read, the issued license, the authorized read, recovered content and verification proof.

Before final submission, inspect current BUIDLs and the specific bounty pages in DoraHacks. The live page was not extractable by the automated browser during this audit, so this report does not claim that no competitor has a similar project or that a specific bounty is available. Use competitors' actual submissions to check adjacent implementations rather than claiming “first,” “no competition,” or “no competitors.”

---

## 6. Recommended implementation order

Do not let DeepSeek bounce between generic UI polish and unverified protocol features. Give it this sequential order and require evidence at each gate.

### Phase A — Audit and decisions only (no broad refactor)

1. Read the repository's current build spec and master prompt first.
2. Compare current source, the deployed UI state, committed canonical evidence and the latest official protocol docs.
3. Write/update `docs/PROTOCOL_DISCOVERY.md`, `docs/PROTOCOL_DECISION.md` and the current top section of `PROGRESS.md` with today's findings.
4. Resolve the current Aeneid/Sui migration-risk question as far as official sources allow.
5. Record whether the browser CDR path is `PASS`, `BLOCKED` or `UNVERIFIED`; don't code around it until this is explicit.
6. Make a list of outdated documentation statements and the canonical evidence to use when reconciling them.

**Gate A:** No feature coding begins until the agent reports which network and SDK/API path it is building against, why it is valid, and what is still unverified.

### Phase B — Prove the deployed protocol path

1. Test the selected CDR REST endpoint using the pinned SDK from a real deployed environment.
2. Connect a disposable Aeneid account through the injected wallet and perform the minimum authorized `accessCDR` path, if the SDK supports it in the browser as documented.
3. Verify that an unlicensed caller is refused by the actual protected read, not only by the preliminary condition probe.
4. Verify the authorized reader obtains the key and recovers the expected plaintext byte-for-byte.
5. Check wrong network, user cancellation, timeout and decryption failure states.
6. Capture transaction hashes and verifier output only after the observed run succeeds.

**Gate B:** The end-to-end read is real and repeatable. If transport/security blocks it, stop and document `BLOCKED`; do not implement simulated unlock states.

### Phase C — Wallet-first UX + read flow

1. Add top-level Connect Wallet control and account-state sync.
2. Keep address-only checks secondary.
3. Show the actual license terms and obtain explicit user acceptance before minting, if mint is integrated.
4. Implement the user-authorized real protected read.
5. Reveal the recovered content only after successful decryption.
6. Wire each failure outcome to accurate copy and usable recovery action.
7. Keep sample-holder shortcut identified as a demonstration aid.

**Gate C:** One user journey covers every meaningful state using the real implementation. No happy-path UI branch is reachable from a mocked response.

### Phase D — Visual finish and responsive/accessibility QA

1. Retain existing visual tokens and component language.
2. Add the `VERIFY → ALIGN → OPEN` state transition.
3. Make the actual recovered resource visible after unlock.
4. Tighten the mobile docket/CTA and reduce the 320 px header height if possible.
5. Use the UI audit and capture scripts after CSS changes. If an audit probe fails, throw/report failure rather than returning a plausible empty result.
6. Run keyboard and screen-reader checks for connection, submit, live status changes, errors and proof links.
7. Conduct the three-question stranger test in `docs/UX_TEST.md` with a real person and record their actual answers. Never manufacture a pass.

**Gate D:** Visual score remains at least 20/24, no trigger category scores zero, every state is based on an actual operation, and the UI is usable at the required viewport sizes.

### Phase E — Evidence, documentation and submission package

1. Rerun unit tests, lint, typecheck and production build in GitHub Actions; keep heavy local work off the 8 GB development machine.
2. Rerun the independent verifier and update the report counts accurately.
3. Update README/claim status/limitations/architecture/security/cost/UX/evidence/progress documents as one deliberate documentation pass.
4. Check `.env.example`, `.gitignore`, tracked files and the final diff for secrets. Never print secrets to logs or include them in artifacts.
5. Make a 60-second judge video following the truthful demo sequence: protected resource, denied read, license issuance/activation, authorized read, actual recovered content, proof.
6. If an end-to-end operation cannot be live, use a clearly labeled video of a real completed run and leave the live UI's limit explicit.
7. Confirm the exact current DoraHacks deadline, bounty requirements and submission fields inside the official portal.

**Gate E:** A judge can understand the use case quickly, use the live app, follow the proof, and see no contradiction between UI, README and evidence.

---

## 7. Required verification checklist for DeepSeek

The coding assistant must finish with a factual report using this template, with no vague “100% done” statement:

```text
PHASE:
STATUS: PASS | BLOCKED | FAILED
COMMIT:
FILES CHANGED:
DEPENDENCIES:
TESTS:
LIVE URL CHECKED:
LIVE EVIDENCE:
PROTOCOL FACTS REVERIFIED (SOURCE + DATE):
WALLET TESTS:
SECURITY FINDINGS:
DOCUMENTATION SYNCHRONIZED:
KNOWN LIMITATIONS:
BLOCKERS:
NEXT PHASE:
```

### Acceptance checklist

- [ ] The current DATA Foundation → Sui transition is documented from official sources, with migration timing marked unknown unless an official dated plan is found.
- [ ] Aeneid is verified still usable for the chosen demonstration window.
- [ ] Current SDK APIs, version and endpoint are verified against the pinned package, not guessed from an unreleased GitHub `main` branch.
- [ ] The existing live `eth_call` remains a license probe only; it cannot produce `ACCESS GRANTED` by itself.
- [ ] The app has a discoverable wallet-first path for actions requiring user authority.
- [ ] Account and network changes invalidate stale state.
- [ ] A license acquisition action is present only if real supported minting and explicit terms acceptance work.
- [ ] A real protected read is executed with the correct caller.
- [ ] Unlicensed read denial is attributable to the license condition, not malformed auxiliary data.
- [ ] The authorized reader recovers/decrypts the expected content.
- [ ] The browser reveals the real recovered resource, not the locked-state illustration alone.
- [ ] Every displayed transaction hash and explorer URL exists and is verified.
- [ ] No private key, seed phrase, decrypted key or secret-bearing RPC endpoint is in client code, logs or tracked files.
- [ ] CDR API transport/deployment gate is `PASS` or explicitly `BLOCKED`; no silent workaround exists.
- [ ] All error outcomes remain distinct: no license, infrastructure failure, wrong chain, user cancellation, transaction failure, decryption failure.
- [ ] Mobile CTA/state visibility and the 320 px header are improved and measured.
- [ ] A real stranger test is conducted or explicitly left not run.
- [ ] README, progress, claim register, limitations, protocol decision, evidence and UX docs agree.
- [ ] Unit tests, lint, typecheck, production build and independent verifier have current results.
- [ ] Official DoraHacks deadline and actual bounty terms are checked before submission.

---

## 8. Specific changes DeepSeek should **not** make

1. **Do not redesign the whole homepage.** It already follows the right art direction; improve the missing interaction and mobile density.
2. **Do not add AI, an AI legal assistant, a marketplace, dashboard, analytics, tokenomics, social features or unrelated admin pages.** The master spec excludes these.
3. **Do not add a custom Story replacement contract, bridge or rushed Sui port** without a verified need and a passing protocol spike.
4. **Do not fake an unlock to improve screenshots or the demo video.** The unlocked screen must be produced by actual recovered content.
5. **Do not mistake a condition `eth_call` for a protected CDR read.** It is a useful pre-check, not the final unlock operation.
6. **Do not make a license check depend on local React state or cached green status.** Current chain truth must determine each outcome.
7. **Do not make connection status cosmetic.** A connected wallet must be the account the chain operation actually uses.
8. **Do not require the visitor to give the app a private key, seed phrase, paid RPC key, or paid storage credentials.** Keep the core demonstrator free and avoid mandatory paid services without explicit approval.
9. **Do not overstate legal protection.** The proof is that a defined on-chain condition gates the demo's protected read, not that all forms of piracy, legal noncompliance or copyright disputes are prevented.
10. **Do not silently remove the one unverified verifier result.** Fix the evidence attribution from a verified source or keep the uncertainty visible.

---

## 9. Sources and provenance

### User-provided source of truth

- The uploaded `LICENSEVAULT_BUILD_SPEC.md`, especially the product flow, wallet model, Access Docket, state machine, security model, evidence model, phases, demo contract, limitations and no-go conditions.
- Repository specification and master prompt: [LicenseVault GitHub](https://github.com/Temmygabriel/LicenseVault).

### Repository files reviewed

- `README.md`
- `PROGRESS.md`
- `app/page.tsx`
- `app/page.module.css`
- `app/api/verify-license/route.ts`
- `components/AccessPanel.tsx`
- `components/AccessProvider.tsx`
- `components/AccessDocket.tsx`
- `components/WalletChip.tsx`
- `components/ProofReceipt.tsx`
- `components/ProtectedAsset.tsx`
- `lib/protocol/canonical-vault.ts`
- `lib/protocol/gate.ts`
- `lib/access/verify.ts`
- `lib/access/state.ts`
- `docs/VISUAL_QA.md`
- `docs/UX_TEST.md`
- `docs/SECURITY.md`
- `docs/CLAIM_STATUS.md`
- `docs/LIMITATIONS.md`
- `docs/PROTOCOL_DECISION.md`
- `docs/ARCHITECTURE.md`
- `docs/EVIDENCE.md`
- `docs/COST_MATRIX.md`
- `tools/verify-canonical-run.ts`
- `evidence/licensevault-aeneid-001/verification-report.json`
- `evidence/licensevault-aeneid-001/authorized-read.json`
- Committed QA images including desktop locked/verified/no-license/proof and mobile locked.

### Current external facts researched on 13 October 2026

- [The DATA Foundation — “We're becoming The DATA Foundation” (25 June 2026)](https://www.datafdn.org/blog/were-becoming-the-data-foundation): official rebrand, rationale for moving from broad programmable IP toward rights-cleared AI training data, and statements about the network continuing under its new name.
- [Sui Foundation — “DATA Network joins Sui and Walrus to scale the supply chain for AI training data” (12 October 2026)](https://www.sui.io/blog/data-network-joins-sui-walrus): official announcement that DATA Network is to become a native Sui protocol, that the independent chain will be retired, Walrus becomes the default storage layer for DATA Foundation applications, and the existing chain continues until the upgrade is complete pending a detailed timeline.
- [Blockchain Legal Institute — Hackathon page](https://bli.tools/hackathon/): official public information giving a 5 November–5 December judging window and 12 December award announcement for the 2026 program.
- [DoraHacks — BLI Legal Tech Hackathon 2](https://dorahacks.io/hackathon/legal-hack-2026/detail): official portal supplied by the user; the page did not permit automated full-text access during this audit, so exact deadline, detailed judging rubric, current bounty amounts and current sponsor requirements must be confirmed inside the active portal.
- [CompeteHub — BLI Legal Tech Hackathon 2 listing](https://www.competehub.dev/en/competitions/dorahackslegal-hack-2026): secondary event snapshot; useful for discovery but conflicting deadline/prize descriptions mean it is not authoritative.
- [Clout — BLI Legal Tech Hackathon 2 listing](https://clout.best/e/a5b5e4e7-7d5a-43cd-8378-ce79ddb5d2ac): secondary event snapshot; useful for cross-checking but not the final source of rules or amounts.
- [Piplabs CDR SDK repository](https://github.com/piplabs/cdr-sdk): implementation reference for current CDR calls, condition contracts and network API notes. Verify against the package version actually installed in this app.

---

## Final decision

**Keep the visual identity. Keep the proof discipline. Fix the product journey and the repository truth first.** The project does not need more decoration; it needs the live app to embody the protocol result that makes LicenseVault different. At the same time, the DATA Network retirement announcement means the current Aeneid target should be treated as a time-sensitive testnet decision rather than a permanent architectural assumption.

DeepSeek must not report this project as complete until the acceptance checklist above is passed—or each unpassed item is clearly marked `BLOCKED` with evidence and an honest fallback. The strongest version of LicenseVault is still the one described by the build spec: **the protocol proves the access; the UI explains the access.**
