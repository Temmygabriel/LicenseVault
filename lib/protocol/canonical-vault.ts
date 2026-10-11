/**
 * The canonical evidence run's identifiers, pinned as code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * The verification route has to ask the chain about *a specific vault*, and it must ask about
 * the one whose evidence this repository publishes. It could read `evidence/…/vault.json` at
 * request time, but a server bundle's filesystem layout is not part of Next's contract — an
 * artifact that is present in the repo can be absent from a serverless deployment, and a route
 * that silently could not find its own identifiers would be a runtime failure dressed as a
 * verdict.
 *
 * So the identifiers are pinned here, and `tests/canonical-vault.test.ts` re-derives every one
 * of them from the committed JSON on every test run. Drift between this file and the evidence
 * fails the build rather than producing a check about the wrong vault.
 *
 * Every value below was READ OUT OF the artifacts — none was typed from memory:
 *   uuid, conditionData, ipId ............ evidence/licensevault-aeneid-001/vault.json
 *   licenseTokenId, terms, holder ........ evidence/licensevault-aeneid-001/license-token.json
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Address, Hex } from "viem";

export const CANONICAL_VAULT = {
  /** The evidence directory this describes. */
  runId: "licensevault-aeneid-001",

  /** Story Aeneid. Asserted at check time against the RPC, not assumed. */
  chainId: 1315,

  /** The CDR vault allocated in the run. */
  uuid: 11062,

  /** The condition contract that gates the read, and its immutable `conditionData`. */
  readConditionAddress: "0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3" as Address,
  conditionData:
    "0x000000000000000000000000fe3838bfb30b34170f00030b52ea4893d8aac6bc0000000000000000000000006c6046f021093c54f43663fad93037e6556bfdd8" as Hex,

  /** Story IP asset — the licensed thing. */
  ipId: "0x6C6046f021093c54F43663Fad93037E6556Bfdd8" as Address,

  /** The Story PIL license token contract, and the terms attached to the IP asset. */
  licenseTokenAddress: "0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC" as Address,
  licenseTermsId: 2183n,

  /**
   * The one license token the recorded run minted, and the wallet that holds it.
   *
   * The docket asks a single, precise question: *does this address hold the license this
   * vault's condition names?* That is a question about token 73227, because 73227 is the
   * license the evidence demonstrates. It is NOT the general question "does this address hold
   * any license for this IP", and the UI copy says so rather than implying the broader claim.
   */
  licenseTokenId: 73227n,
  licenseHolder: "0x226e01730F6991C1BD11f58d1204638bee89A863" as Address,
} as const;
