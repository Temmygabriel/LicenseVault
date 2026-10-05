/**
 * Verified Story Aeneid / CDR protocol constants.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY VALUE IN THIS FILE WAS VERIFIED, NOT GUESSED.
 * See `docs/PROTOCOL_DISCOVERY.md` for the evidence behind each one.
 * If you change a value here, you must re-verify it and update that document.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Story Aeneid testnet chain ID. Verified live: eth_chainId → 0x523 = 1315. */
export const AENEID_CHAIN_ID = 1315 as const;

/** Story Aeneid EVM JSON-RPC endpoint. Verified live (HTTP 200, valid JSON-RPC). */
export const AENEID_RPC_URL = "https://aeneid.storyrpc.io" as const;

/** CDR network selector understood by the SDK. Note: a label, NOT a chain id. */
export const CDR_NETWORK = "testnet" as const;

/** DKG contract (Aeneid). Verified: published @piplabs/cdr-contracts@0.2.2 + live bytecode. */
export const CDR_DKG_ADDRESS =
  "0xcccccc0000000000000000000000000000000004" as const;

/** CDR contract (Aeneid). Verified: published @piplabs/cdr-contracts@0.2.2 + live bytecode. */
export const CDR_ADDRESS =
  "0xcccccc0000000000000000000000000000000005" as const;

/**
 * LicenseReadCondition (Aeneid).
 * On-chain gate: only holders of a Story Protocol license token for the encoded IP
 * may read. Verified: documented in cdr-sdk docs/CONDITIONS.md + live bytecode.
 */
export const LICENSE_READ_CONDITION_ADDRESS =
  "0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3" as const;

/**
 * OwnerWriteCondition (Aeneid).
 * On-chain gate: only the single address encoded in conditionData may write.
 */
export const OWNER_WRITE_CONDITION_ADDRESS =
  "0x4C9bFC96d7092b590D497A191826C3dA2277c34B" as const;

/**
 * Story LicenseToken contract on Aeneid.
 * Confidence MEDIUM-HIGH: live bytecode present, and used verbatim in the official
 * CONDITIONS.md example. Re-read at mint time before relying on it.
 */
export const AENEID_LICENSE_TOKEN_ADDRESS =
  "0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC" as const;

/**
 * Aeneid block explorer.
 *
 * UNVERIFIED — deliberately left empty.
 * Build-spec §1.8 forbids rendering an explorer link that is not real, and §23 forbids
 * manufacturing one from a guessed hash. Until an explorer URL is confirmed, the Proof
 * surface must show identifiers WITHOUT links.
 */
export const AENEID_EXPLORER_URL: string | null = null;

/** The condition interface version this adapter encodes for. */
export const CONDITION_INTERFACE = {
  checkReadCondition:
    "checkReadCondition(uint32,bytes,bytes,address) returns (bool)",
  checkWriteCondition:
    "checkWriteCondition(uint32,bytes,bytes,address) returns (bool)",
} as const;

/**
 * Canonical evidence run name (build-spec §23).
 * Used for the evidence directory and the verifier's output.
 */
export const CANONICAL_RUN_ID = "licensevault-aeneid-001" as const;

/** Human-facing name of the single demo protected resource. */
export const PROTECTED_ASSET_NAME = "Commercial Brand Asset Pack" as const;

/** The license right the demo asset requires. */
export const REQUIRED_LICENSE_LABEL = "Commercial Use" as const;
