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
  "0xCcCcCC0000000000000000000000000000000004" as const;

/**
 * CDR contract (Aeneid). Verified: published @piplabs/cdr-contracts@0.2.2 + live bytecode.
 *
 * NOTE the casing. The official runtime-configuration page prints this address as
 * `0xCcCcCC…05`, which is an INVALID EIP-55 checksum — viem's `isAddress` rejects it.
 * The address bytes are the same either way (checksum casing is error detection, not
 * data), so this is a documentation typo rather than a different contract, but a
 * copy-paste of the docs' form into any strict tool fails. `0xCCCcCC…05` is the
 * verified-correct checksum, computed with viem's `getAddress` from the lowercase form.
 * `tests/constants.test.ts` pins both addresses so this cannot silently regress.
 */
export const CDR_ADDRESS =
  "0xCCCcCC0000000000000000000000000000000005" as const;

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
 * VERIFIED 2026-10-05. Two independent checks:
 *   1. Its block feed reported height 24525035, matching `eth_blockNumber` on the
 *      Aeneid RPC (`0x17638eb` = 24525035) at the same moment.
 *   2. `GET /tx/<hash>` returned HTTP 200 for a real transaction, the rendered page
 *      contained that hash, and `eth_getTransactionByHash` confirmed the same tx.
 *
 * Note: the older `aeneid.storyscan.io` host still appears in third-party config
 * blobs but is NXDOMAIN — Story's docs and explorer moved to the Data Foundation
 * domains. Do not reintroduce it.
 */
export const AENEID_EXPLORER_URL = "https://aeneid.datanetscan.io" as const;

/**
 * Build an explorer link for a transaction hash.
 *
 * Only call this for a hash that actually exists on chain. Every hash that reaches
 * the UI must come from a real protocol result — never a placeholder.
 */
export function explorerTxUrl(txHash: string): string {
  return `${AENEID_EXPLORER_URL}/tx/${txHash}`;
}

/**
 * DATA Foundation API REST endpoint — the `apiUrl` the CDRClient requires.
 *
 * This is the network's *documented* shared endpoint, and it is **plain HTTP on a raw
 * IP**. The official docs describe it as possibly changing between deployments and
 * recommend pointing `apiUrl` at your own node's REST gateway for production.
 *
 * It is therefore a DEFAULT, not a contract. Read it from the environment at runtime
 * (`CDR_API_URL`) so it can be swapped without a code change, and treat any failure of
 * this host as INFRASTRUCTURE_FAILURE — never as "no license".
 *
 * See `docs/SECURITY.md` §5 for the trust analysis: reads over this endpoint are
 * integrity-protected by AEAD, so the exposure is availability (a read may time out),
 * not confidentiality.
 */
export const CDR_API_URL_AENEID = "http://172.192.41.96:1317" as const;

/**
 * Aeneid testnet faucet.
 *
 * VERIFIED 2026-10-05: HTTP 200, and the page itself declares "Story Aeneid" and
 * chain ID 1315, with the meta description "Claim your IP testnet tokens for free —
 * one drip per network every 12 hours."
 *
 * Documented only. This project never automates a claim and never asks for a seed
 * phrase; a human funds a disposable testnet wallet.
 */
export const AENEID_FAUCET_URL = "https://faucet.quicknode.com/story" as const;

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
