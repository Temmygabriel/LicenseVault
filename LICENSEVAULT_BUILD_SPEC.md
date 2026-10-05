# LICENSEVAULT BUILD SPEC
## BLI Legal Tech Hackathon 2 — Full Build Contract

**Project:** LicenseVault  
**Status:** Build-ready master specification  
**Date:** 2026-10-05  
**Primary technical path:** Story Protocol IP licensing + Confidential Data Rails (CDR)  
**Development network:** Story Aeneid testnet  

---

# 0. READ THIS FIRST

This document is the source-of-truth build contract for LicenseVault.

The product thesis is simple:

> **A license should not merely exist as a record. For protected digital content, the license should determine whether the content can be read.**

The MVP must prove one complete real flow:

```text
PROTECTED RESOURCE
      ↓
LICENSE REQUIRED
      ↓
WALLET WITHOUT LICENSE
      ↓
READ REJECTED
      ↓
OBTAIN CORRECT LICENSE
      ↓
READ AGAIN
      ↓
READ ALLOWED
      ↓
PROTECTED CONTENT RECOVERED
      ↓
VERIFIABLE PROOF
```

The blockchain/protocol state is the source of truth. React state, database rows, screenshots, animations, logs, and success messages are not proof.

**Do not build the polished frontend before the real protocol spike passes.**

---

# 1. NON-NEGOTIABLE BUILD RULES

1. Never guess protocol addresses, contract ABIs, SDK APIs, network IDs, RPC URLs, token IDs, IP IDs, license IDs, explorer URLs, or transaction hashes.
2. Re-check current official sources before implementing any protocol fact that may have changed.
3. Unknown = `UNVERIFIED`, never “probably.”
4. If a core protocol fact is unverified, stop that phase and report the blocker.
5. Never replace a failed protocol operation with a mock and call it real.
6. Never fabricate blockchain evidence.
7. Never display `ACCESS GRANTED` unless the actual protected-read/decryption operation succeeds.
8. Never display an Explorer link unless the transaction actually exists.
9. Never put private keys, seed phrases, API credentials, or wallet secrets in Git.
10. Never request a user's seed phrase or private key.
11. Never expose a server private key through `NEXT_PUBLIC_*` environment variables.
12. Never depend on Story's IP Portal as a runtime dependency.
13. Development uses Story Aeneid/testnet only unless an official requirement later says otherwise.
14. No paid service may be mandatory for the core demo without explicit approval.
15. Do not add AI, tokenomics, marketplace, social, analytics, admin, or unrelated features to the MVP.
16. The application must distinguish `NO LICENSE`, `VERIFICATION ERROR`, `LICENSE VERIFIED`, and `ACCESS GRANTED`.
17. Legal claims must describe exactly what the software proves and no more.
18. The user-facing product must remain understandable without blockchain expertise.
19. A local database must never become the authorization source of truth.
20. Every completed phase must have a gate and evidence.

---

# 2. PRODUCT DEFINITION

## Name

**LicenseVault**

Keep this as the working product name. Do not spend implementation time searching for a replacement unless a real legal/trademark conflict or user decision requires it.

## Category

Licensed access to protected digital content.

## One-line

> **LicenseVault turns an onchain IP license into a real access permission for protected digital content.**

## Plain-English explanation

> **A protected digital asset stays locked until the connected wallet has the license required to read it.**

## Core differentiator

We are not claiming to invent IP licensing.

The differentiating product behavior is:

> **the licensing state is connected to the protected-read operation itself.**

That gives us a visible state transition:

`LOCKED → LICENSED → UNLOCKED`

---

# 3. TARGET USER / DEMO USER

The demo user is a creator, licensor, rights holder, or licensed collaborator who needs to distribute a digital resource only to parties with the correct license.

The first demonstration uses:

**COMMERCIAL BRAND ASSET PACK**

This is a fictional demonstration resource, not a marketplace.

The content should be tiny enough for reliable testnet demonstration.

Example protected payload:
- a small image;
- a small PDF;
- or a short text/JSON asset.

Do not expose the plaintext before the authorized read succeeds.

---

# 4. TECHNICAL THESIS

The intended protocol relationship is:

```text
Story IP Asset
     +
Story License Terms
     +
Story License Token
     ↓
LicenseReadCondition
     ↓
CDR Protected Resource
     ↓
Unauthorized wallet → READ REJECTED
Authorized wallet   → READ ALLOWED
     ↓
Protected data recovered
```

The current CDR SDK repository is the primary implementation reference:

`https://github.com/piplabs/cdr-sdk`

The current known SDK behavior includes an Aeneid integration flow where a read without the required license fails and a read after obtaining the license succeeds.

**This behavior must be independently reproduced, not merely cited.**

---

# 5. CURRENT PROTOCOL FACTS — VERIFY BEFORE USE

These are reference facts observed during research. They are NOT permission to skip current-source verification.

## Story Aeneid

Known current testnet:
- chain ID: `1315`
- RPC observed: `https://aeneid.storyrpc.io`

## CDR SDK

Repository:
`https://github.com/piplabs/cdr-sdk`

Package observed:
`@piplabs/cdr-sdk`

Package version observed during research:
`0.2.2`

## CDR contracts observed

DKG:
`0xcccccc0000000000000000000000000000000004`

CDR:
`0xcccccc0000000000000000000000000000000005`

## Aeneid conditions observed

LicenseReadCondition:
`0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3`

OwnerWriteCondition:
`0x4C9bFC96d7092b590D497A191826C3dA2277c34B`

## Aeneid LicenseToken fixture observed

`0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC`

Before a real transaction, the coding agent MUST verify these against current SDK source/docs and live network state.

If any value changed, update the build implementation and documentation rather than forcing the old value.

---

# 6. PROTOCOL DISCOVERY REQUIREMENTS

Before application coding, the coding agent must answer in `docs/PROTOCOL_DISCOVERY.md`:

### Network
- current Aeneid chain ID;
- current official RPC;
- current explorer;
- current faucet/test asset route.

### CDR
- current SDK version;
- current CDR contract;
- current DKG contract;
- current LicenseReadCondition;
- current OwnerWriteCondition;
- current allocation/read/write methods;
- current condition configuration format.

### Story licensing
- current IP identifier format;
- current license terms format;
- current license token contract/interface;
- current mint flow;
- current token-ID representation;
- current relationship between IP, terms, and token.

### CDR API
- current DKG/Story API endpoint;
- whether it supports the required Aeneid operation;
- whether it is HTTP or HTTPS;
- whether it can safely be called from server-side infrastructure;
- timeout behavior.

Every fact must include:

```text
FACT:
SOURCE:
URL:
VERIFIED DATE:
NETWORK:
VERSION/COMMIT:
CONFIDENCE:
IMPLEMENTATION IMPACT:
```

---

# 7. CDR API RISK

Research identified a current CDR SDK reference to a plain-HTTP Aeneid Story API endpoint.

This must NOT be blindly embedded in browser code.

The implementation must first verify:

1. whether that endpoint is still current;
2. whether an official TLS endpoint exists;
3. whether the SDK permits a configurable endpoint;
4. whether Vercel can reach it;
5. whether the response is safe for the intended server-side flow.

If the only viable endpoint is unreliable or unsafe for the required deployment, report `BLOCKED` rather than silently inventing a workaround.

---

# 8. ARCHITECTURE

Preferred architecture:

```text
                 ┌─────────────────────┐
                 │       Browser       │
                 │ Wallet + License UI│
                 └──────────┬──────────┘
                            │
                            ↓
                 ┌─────────────────────┐
                 │ LicenseVault Next.js│
                 │     application     │
                 └──────────┬──────────┘
                            │
                  protocol adapter
                            │
                            ↓
                 ┌─────────────────────┐
                 │ Story / CDR SDK     │
                 └──────────┬──────────┘
                            │
                ┌───────────┴───────────┐
                ↓                       ↓
          Story RPC              CDR Story API
                │                       │
                └───────────┬───────────┘
                            ↓
                  Story / CDR contracts
```

The browser may ask the wallet to sign a user transaction when required.

Server-only credentials, if any, remain server-side.

Never put a private key in frontend code.

---

# 9. WALLET MODEL

The preferred user path is an EVM-compatible wallet.

User signs only actions that genuinely require user authorization.

For development automation, a disposable Aeneid key may be stored in an ignored environment variable if the SDK requires a server signer.

Rules:
- never commit it;
- never print it;
- never put it in client bundles;
- never use a valuable wallet;
- never use Mainnet funds.

The UI should show:
- connected wallet;
- shortened address;
- network;
- disconnect/switch action if required.

---

# 10. SOURCE-OF-TRUTH ORDER

Use this hierarchy whenever sources conflict:

1. live Story/CDR chain state;
2. current official Story/CDR contract implementation;
3. current official SDK source;
4. current official documentation;
5. repository build specification;
6. application memory/state;
7. UI assumptions.

Lower levels may never override higher levels.

---

# 11. CORE STATE MACHINE

```text
                    ┌───────────────┐
                    │    LOCKED     │
                    └───────┬───────┘
                            │
                       VERIFY LICENSE
                            │
                            ↓
                    ┌───────────────┐
                    │   CHECKING    │
                    └───────┬───────┘
                            │
              ┌─────────────┴──────────────┐
              ↓                            ↓
       ┌──────────────┐             ┌───────────────┐
       │  NO LICENSE  │             │LICENSE VERIFIED│
       └──────┬───────┘             └───────┬───────┘
              │                              │
              ↓                              ↓
          LOCKED                        ACCESSING
                                             │
                                             ↓
                                      ┌────────────┐
                                      │  UNLOCKED  │
                                      └────────────┘

CHECKING → VERIFICATION ERROR
```

## State meanings

**LOCKED:** protected content cannot be read.

**CHECKING:** a real verification/read attempt is in progress.

**NO LICENSE:** the real protocol evidence shows the wallet does not satisfy the license condition.

**LICENSE VERIFIED:** the required license relationship has been established.

**ACCESSING:** the real protected-read/decryption operation is underway.

**UNLOCKED:** protected plaintext/content has actually been recovered.

**VERIFICATION ERROR:** a trustworthy result could not be established.

Never map a network timeout to `NO LICENSE`.

Never map an unknown result to `ACCESS GRANTED`.

---

# 12. THE PRODUCT OBJECT — ACCESS DOCKET

The main visual component is the **Access Docket**.

It should feel like a precise license/access record rather than a generic SaaS card.

Example:

```text
┌──────────────────────────────────────────┐
│ LICENSEVAULT                              │
│ ACCESS DOCKET                              │
│──────────────────────────────────────────│
│ PROTECTED ASSET                            │
│ Commercial Brand Asset Pack               │
│                                           │
│ LICENSE REQUIRED                           │
│ Commercial Use                             │
│                                           │
│ LICENSE HOLDER                             │
│ 0x7F...91C2                                │
│                                           │
│ ACCESS                                     │
│ RESTRICTED                                 │
│                                           │
│             [ VERIFY LICENSE ]             │
└──────────────────────────────────────────┘
```

When successful:

```text
┌──────────────────────────────────────────┐
│ LICENSEVAULT                              │
│ ACCESS DOCKET                              │
│──────────────────────────────────────────│
│ PROTECTED ASSET                            │
│ Commercial Brand Asset Pack               │
│                                           │
│ LICENSE                                    │
│ Commercial Use                             │
│                                           │
│ STATUS                                     │
│ ✓ VERIFIED                                 │
│                                           │
│ ACCESS                                     │
│ GRANTED                                    │
│                                           │
│         [ OPEN PROTECTED ASSET ]           │
└──────────────────────────────────────────┘
```

Do not use generic component naming such as `Card`, `DashboardCard`, `InfoCard`, or `StatCard` for the primary product object.

Use product-specific components such as:

- `AccessDocket`
- `ProtectedAsset`
- `LicenseRecord`
- `AccessGate`
- `LicenseStatus`
- `VerificationTrace`
- `ProofReceipt`
- `UnlockAction`

---

# 13. VISUAL SYSTEM

## Product world

**The Licensed Archive**

The visual metaphor is an archival record whose access threshold can open when the correct right is present.

Visual adjectives:

- editorial;
- credible;
- tactile;
- precise;
- restrained.

Do NOT make it:
- cyberpunk;
- futuristic crypto;
- courthouse-themed;
- generic enterprise SaaS;
- AI-themed.

## Colors

Starting design tokens, not protocol facts:

- warm paper canvas: `#F4F1E8`
- near-black ink: `#1C1D1B`
- secondary gray: `#686B66`
- rule/border: `#D4D0C5`
- muted copper accent: `#A7613C`
- verified green: `#2E6650`
- error red: `#8C3737`
- information slate: `#526575`

Do not overuse accent colors.

## Typography

Preferred:
- editorial serif display such as Newsreader;
- IBM Plex Sans for interface;
- IBM Plex Mono for addresses/IDs/protocol data.

If an exact font is unavailable, use a verified free replacement and record the substitution.

---

# 14. LANDING PAGE LOCK

The first viewport must contain:

1. LicenseVault name;
2. clear product proposition;
3. Access Docket;
4. protected asset;
5. license requirement;
6. current access state;
7. primary action.

Preferred headline:

> **A license should open the door.**

Preferred supporting line:

> **LicenseVault turns an onchain IP license into a real access permission for protected digital content.**

Primary CTA:

`CHECK ACCESS`

Small technical note may say:

`Built with Story`

ONLY if current sponsor/technical wording is appropriate. Never imply a confirmed 2026 bounty without evidence.

Do not lead with:
- blockchain architecture;
- sponsor logos;
- tokenomics;
- AI;
- statistics;
- generic Web3 artwork.

---

# 15. CORE UI SCREENS

## Screen 1 — Landing

Purpose: explain the product immediately.

Hero:
- headline;
- short explanation;
- Access Docket;
- Check Access.

## Screen 2 — Protected Resource

Show:
- resource preview/thumbnail;
- resource title;
- protected status;
- required license;
- wallet state;
- Verify License.

## Screen 3 — Access Result

Successful:

```text
LICENSE VERIFIED

ACCESS GRANTED

Commercial Brand Asset Pack

[ OPEN PROTECTED ASSET ]
```

Failure:

```text
ACCESS RESTRICTED

No valid license was found for this protected resource.

[ VIEW REQUIREMENT ]
```

## Screen 4 — Proof

Show actual:
- IP asset identifier;
- license terms identifier;
- license token ID;
- wallet;
- network;
- vault identifier;
- relevant transaction identifiers;
- protocol result;
- Explorer links.

Proof should explain the causal chain, not dump raw hashes without labels.

---

# 16. UI STATE DETAILS

## Locked

```text
ACCESS RESTRICTED

This resource requires:
Commercial Use license

[ VERIFY LICENSE ]
```

## Checking

Use operational language:

`VERIFYING LICENSE`

Then only show actual substeps if the implementation performs them:

- `READING LICENSE STATE`
- `CHECKING HOLDER`
- `REQUESTING PROTECTED READ`
- `RECOVERING CONTENT`

No fake progress percentage.

## No license

```text
ACCESS RESTRICTED

No matching active license was found.

[ VIEW LICENSE REQUIREMENT ]
```

## Verification error

```text
LICENSE COULD NOT BE VERIFIED

The current verification request did not produce a confirmed result.

[ TRY AGAIN ]
[ VIEW DETAILS ]
```

## Verified

```text
LICENSE VERIFIED

The required license condition is satisfied.

[ OPEN PROTECTED ASSET ]
```

## Unlocked

```text
ACCESS GRANTED

Protected resource recovered successfully.

[ VIEW PROOF ]
```

---

# 17. ERROR SEMANTICS

Errors must preserve the difference between:

### Authorization failure
The protocol says the user is not allowed.

### Infrastructure failure
The app could not establish the result.

### User cancellation
The wallet/user rejected the transaction.

### Transaction failure
The chain rejected the transaction.

### Decryption failure
The authorized read did not successfully recover plaintext.

Never collapse all of these into:

`Something went wrong.`

---

# 18. SIGNATURE INTERACTION / MOTION

The signature product interaction is:

**VERIFY → ALIGN → OPEN**

Motion should be subtle.

A successful transition can visually change:

`RESTRICTED → VERIFIED → GRANTED`

and reveal the protected content.

No:
- confetti;
- neon glow;
- crypto coin animation;
- particle cloud;
- fake blockchain mining;
- AI sparkle.

Respect reduced-motion preferences.

---

# 19. MOBILE

Mobile must preserve:

1. LicenseVault;
2. headline;
3. protected asset;
4. license requirement;
5. state;
6. primary action;
7. result/proof.

Do not bury the access state below decorative content.

No horizontal scrolling.

Wallet addresses should truncate visually but remain accessible to assistive technology.

---

# 20. ACCESSIBILITY

Required:
- keyboard navigation;
- visible focus;
- semantic buttons;
- semantic headings;
- accessible status announcements;
- sufficient contrast;
- no color-only status communication;
- reduced motion;
- clear disabled states;
- screen-reader-readable transaction/status labels.

Example:
Do not communicate only with a green dot.
Use:
`LICENSE VERIFIED`.

---

# 21. SECURITY MODEL

Document in `docs/SECURITY.md`:

## Trust boundaries
- browser;
- user wallet;
- LicenseVault server;
- Story RPC;
- CDR API;
- Story contracts;
- protected content.

## Threats
- fake client-side authorization;
- wrong license token;
- wrong IP;
- wrong terms;
- replay/retry confusion;
- wrong chain;
- malicious resource metadata;
- leaked server key;
- exposed protected plaintext;
- manipulated proof display;
- stale cached license state.

## Required properties
- protocol result is authoritative;
- private key isolation;
- network validation;
- strict input validation;
- explicit failure states;
- no secret logging;
- no trust in client-reported authorization.

---

# 22. TEST MATRIX

## Unit

Test:
- state transitions;
- error classification;
- license-token input parsing;
- amount/ID formatting;
- proof formatting;
- network validation.

## Protocol integration

Test:
- Aeneid connectivity;
- CDR allocation;
- write condition;
- read condition;
- unauthorized read;
- license mint;
- authorized read;
- decryption.

## Adversarial

At minimum:

| Test | Expected |
|---|---|
| no license | read rejected |
| wrong IP license | read rejected |
| wrong terms/license | read rejected |
| arbitrary token | read rejected |
| malformed auxiliary data | rejected safely |
| wrong chain | blocked |
| user rejects wallet action | clear cancellation |
| tx reverts | failure, not success |
| timeout | unknown/error, not success |
| refresh after success | state revalidated |
| forged client state | cannot grant protected read |

---

# 23. EVIDENCE MODEL

Canonical run name:

`licensevault-aeneid-001`

Suggested evidence tree:

```text
evidence/
└── licensevault-aeneid-001/
    ├── environment.json
    ├── ip-asset.json
    ├── license-terms.json
    ├── license-token.json
    ├── vault.json
    ├── unauthorized-read.json
    ├── license-mint.json
    ├── authorized-read.json
    ├── decrypted-resource.json
    └── verification.json
```

Each artifact should contain only facts actually observed.

Where a transaction exists, record:
- tx hash;
- chain/network;
- block if available;
- operation;
- relevant contract;
- explorer URL if verified.

Never manufacture an explorer URL from a guessed hash.

---

# 24. INDEPENDENT VERIFIER

Create:

`tools/verify-canonical-run.ts`

It should independently check the evidence against live protocol state wherever practical.

Minimum result set:

```text
NETWORK: PASS
IP ASSET: PASS
LICENSE TERMS: PASS
LICENSE TOKEN: PASS
VAULT: PASS
UNAUTHORIZED READ: PASS
AUTHORIZED READ: PASS
DECRYPTION: PASS
FINAL RESULT: PASS
```

If the verifier cannot independently confirm a claim, report `UNVERIFIED` rather than PASS.

---

# 25. CLAIM REGISTER

Create:

`docs/CLAIM_STATUS.md`

Initial table:

| Claim | Status |
|---|---|
| Story supports programmable IP licensing | PROVEN |
| Story Aeneid is available | PROVEN |
| CDR is available on Aeneid | PROVEN/REVERIFY |
| LicenseReadCondition is deployed | PROVEN/REVERIFY |
| SDK integration demonstrates license-gated read | OBSERVED |
| LicenseVault reproduces the gated read | UNVERIFIED |
| Unauthorized wallet is blocked | UNVERIFIED |
| Authorized wallet succeeds | UNVERIFIED |
| Story is a 2026 BLI bounty | UNVERIFIED |
| LicenseVault prevents all copying/piracy | UNSUPPORTED |

Allowed statuses:

`PROVEN / OBSERVED / INFERRED / UNVERIFIED / UNSUPPORTED`

---

# 26. DOCUMENTATION REQUIRED

Before final submission, create:

```text
docs/
├── PROTOCOL_DISCOVERY.md
├── PROTOCOL_DECISION.md
├── ARCHITECTURE.md
├── SECURITY.md
├── CLAIM_STATUS.md
├── COST_MATRIX.md
├── LIMITATIONS.md
├── EVIDENCE.md
└── UX_TEST.md
```

## COST_MATRIX.md

For every dependency:
- purpose;
- plan/tier;
- cost;
- quota;
- credential requirement;
- expiry/credit risk;
- official source;
- verified date;
- mandatory/optional.

Gate:
**ZERO-COST CORE PATH PASS**

## LIMITATIONS.md

Include actual limitations such as:
- testnet only;
- fictional demo asset;
- hackathon scale;
- public infrastructure limits;
- protected resource scope;
- no universal DRM claim;
- no legal advice;
- no guarantee of downstream copying prevention.

## UX_TEST.md

Test a stranger:
- can they identify what LicenseVault does in 5 seconds?
- can they explain the license/access relationship in 30 seconds?
- can they identify why access changed?

Do not manufacture positive results.

---

# 27. IMPLEMENTATION PHASES

## BUILD 0 — Repo hygiene

Create/verify:
- Next.js + TypeScript app;
- package manager lockfile;
- `.gitignore`;
- env example;
- README skeleton;
- docs directory;
- test structure.

Gate:
`install + lint + typecheck`

## BUILD 1 — Protocol discovery

Create:
- `docs/PROTOCOL_DISCOVERY.md`
- `docs/PROTOCOL_DECISION.md`

Gate:
All core protocol facts verified.

## BUILD 2 — Minimal protocol spike

No UI required.

Prove:
- Aeneid connection;
- CDR allocation;
- protected resource;
- unauthorized read rejection;
- license acquisition;
- authorized read;
- decrypted content.

Gate:
**REAL LOCK → UNLOCK PASS**

## BUILD 3 — Evidence

Create canonical evidence and verifier.

Gate:
Independent verification passes.

## BUILD 4 — Protocol adapter

Create a clean application boundary around CDR/Story calls.

The UI must not contain raw protocol logic everywhere.

Gate:
Unit + integration tests pass.

## BUILD 5 — Product UI

Implement the four MVP surfaces.

Gate:
Complete real end-to-end flow.

## BUILD 6 — Visual system

Implement the locked Access Docket / Licensed Archive direction.

Gate:
Visual quality >=20/24.

## BUILD 7 — Security / adversarial

Run security matrix and secret scanning.

Gate:
No critical unresolved issue.

## BUILD 8 — Deployment

Prove:

```text
browser
→ hosted LicenseVault
→ wallet
→ Story
→ CDR
→ protected read
→ actual result
```

Gate:
Live canonical flow.

## BUILD 9 — Submission

Produce:
- README;
- live URL;
- demo video;
- proof/evidence;
- architecture;
- limitations;
- submission copy.

Gate:
Independent judge can understand and verify the project.

---

# 28. DEMO CONTRACT

The final 60-second demo should show:

```text
0–05s  LicenseVault + protected asset
05–15s Try without license → REJECTED
15–30s Obtain/activate real license
30–42s Verify again → LICENSE VERIFIED
42–50s Protected resource opens
50–60s Proof / onchain evidence
```

The exact timings may change if real protocol confirmation takes longer.

Never speed up or fake a blockchain operation to fit the timestamp.

If a transaction takes longer, show honest waiting or pre-record a real completed run and clearly identify it as a recorded real run.

---

# 29. JUDGE MESSAGE

Primary message:

> **The license isn't just a record. It opens the door.**

Problem:
A legal license grants a right, but software often needs a concrete mechanism to apply that right to digital access.

Solution:
LicenseVault connects an onchain IP license to a protected read condition.

Why blockchain:
The licensing relationship is represented onchain and can be used as an authorization condition.

Why Story:
Story supplies the IP/licensing primitives used by the access mechanism.

Novelty:
Not “we invented licensing.”

Instead:
> **We turn licensing state into an executable access decision for protected digital content.**

---

# 30. COMPETITIVE BOUNDARY

Do not claim:
- first blockchain licensing platform;
- no competitors;
- universal DRM;
- guaranteed compliance.

Position against adjacent products by emphasizing the specific workflow:

`LICENSE → PROTECTED READ → ACCESS RESULT`

not:
- legal document storage;
- generic compliance dashboard;
- AI legal advice;
- IP marketplace;
- NFT gallery.

---

# 31. WHAT NOT TO BUILD

Do not build in MVP:

- AI legal assistant;
- chatbot;
- token launch;
- marketplace;
- NFT collection;
- exchange;
- DeFi;
- DAO;
- social network;
- generic analytics dashboard;
- enterprise admin portal;
- subscription billing;
- fiat payments;
- camera/hardware integration;
- universal DRM;
- custom Story replacement contract;
- bridge;
- oracle network.

If a feature does not strengthen the real licensed-read flow, it is probably out of scope.

---

# 32. VISUAL QUALITY GATE

Score each 0–2:

1. product clarity;
2. product-specific identity;
3. technical mechanism visibility;
4. hierarchy;
5. typography;
6. spacing/density;
7. signature interaction;
8. state coverage;
9. motion;
10. mobile;
11. technical honesty;
12. judge proof.

Target:
**20/24 minimum**

A zero in:
- clarity;
- identity;
- mechanism;
- honesty

triggers redesign.

---

# 33. FINAL NO-GO CONDITIONS

The project is NO-GO if any of these remain true at submission:

1. The core gated read is simulated.
2. Unauthorized access is not actually rejected.
3. Authorized access is not actually demonstrated.
4. The app claims ACCESS GRANTED from local state only.
5. Fake transaction hashes or explorer links exist.
6. A private key/secret is committed.
7. A critical protocol fact was guessed.
8. The required protocol path is unreproducible.
9. Mandatory paid infrastructure is unverified/unapproved.
10. A critical security issue remains unresolved.
11. Legal claims materially exceed what the system proves.
12. The live demo cannot reproduce or honestly show a real completed run.

---

# 34. PHASE REPORT FORMAT

Every coding phase must finish with:

```text
PHASE:
STATUS: PASS | BLOCKED | FAILED
COMMIT:
FILES CHANGED:
DEPENDENCIES:
TESTS:
LIVE EVIDENCE:
PROTOCOL FACTS:
SECURITY FINDINGS:
KNOWN LIMITATIONS:
BLOCKERS:
NEXT PHASE:
```

Blocked means stop. Do not silently continue with a mock.

---

# 35. FIRST CODING TASK

DeepSeek should NOT begin with the homepage.

Start with a minimal protocol harness.

Exact order:

1. inspect the current official CDR SDK source;
2. verify package/version;
3. verify Aeneid connectivity;
4. verify current CDR/LRT addresses;
5. verify LicenseReadCondition;
6. inspect the current integration test;
7. reproduce the smallest real protected vault;
8. prove read rejection without license;
9. obtain the correct license using the current supported mechanism;
10. prove successful licensed read;
11. recover protected plaintext;
12. save real evidence;
13. report PASS/BLOCKED/FAILED.

Do not begin UI implementation until this gate passes.

---

# 36. FINAL PRINCIPLE

**The protocol proves the access. The UI explains the access.**

LicenseVault succeeds only when the protected resource itself respects the licensing condition.

A beautiful screen saying `LICENSE VERIFIED` is worthless if the resource can still be read without the license.

The first milestone is therefore not a website.

It is this:

```text
STORY AENEID
      ↓
REAL IP / LICENSE
      ↓
REAL CDR PROTECTED RESOURCE
      ↓
NO LICENSE → REAL READ FAILURE
      ↓
CORRECT LICENSE
      ↓
REAL READ SUCCESS
      ↓
REAL PROTECTED DATA
      ↓
INDEPENDENTLY VERIFIABLE EVIDENCE
```

Only after that is LicenseVault ready to become a polished product.
