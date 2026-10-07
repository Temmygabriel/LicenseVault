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
 *
 * PROVEN 2026-10-05 — upgraded from MEDIUM-HIGH. Live `eth_call` returned
 * `name()` = "Programmable IP License Token", `symbol()` = "PILicenseToken", and
 * `totalSupply()` = 68582. That is Story's PILE license token, confirmed by the
 * contract's own metadata rather than by inference from a docs example.
 * `check-network.ts` re-verifies the identity on every run, so a proxy upgrade at
 * this address cannot silently change what we are minting from.
 */
export const AENEID_LICENSE_TOKEN_ADDRESS =
  "0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC" as const;

/** Expected `name()` of the license token — asserted, not trusted. */
export const AENEID_LICENSE_TOKEN_NAME = "Programmable IP License Token" as const;

/** Expected `symbol()` of the license token — asserted, not trusted. */
export const AENEID_LICENSE_TOKEN_SYMBOL = "PILicenseToken" as const;

/**
 * Wrapped IP (WIP) on Aeneid — the currency token named in our PIL terms.
 *
 * VERIFIED 2026-10-07, and it had to be. `PILFlavor.commercialUse` **refuses a zero
 * royaltyPolicy**, and the protocol refuses a royalty policy with a zero currency
 * ("Royalty policy requires currency token"). So a free commercial-use license cannot be
 * built by zeroing both — the currency and the policy must be real, whitelisted addresses
 * even when the minting fee is 0.
 *
 * Live checks: 3210 bytes of code at this address, `name()` = "Wrapped IP",
 * `symbol()` = "WIP", `decimals()` = 18, and `RoyaltyModule.isWhitelistedRoyaltyToken()`
 * returns true. The currency whitelist the SDK enforces for chain 1315 is exactly
 * {WIP, MERC20}; WIP is the natural choice because it is the wrapped native token.
 *
 * Note the vanity address: it encodes chain 1514 (mainnet) but is the live WIP on 1315 too.
 */
export const AENEID_WIP_TOKEN_ADDRESS =
  "0x1514000000000000000000000000000000000000" as const;

/**
 * RoyaltyPolicyLAP (Liquid Absolute Percentage) on Aeneid — the policy our PIL terms name.
 *
 * VERIFIED 2026-10-07. Live checks: bytecode present (176 bytes — an EIP-1967 proxy, so
 * identity was confirmed by behaviour, not size), and
 * `RoyaltyModule.isWhitelistedRoyaltyPolicy()` returns true. The protocol rejects a
 * non-whitelisted policy outright, so this is the check that matters.
 *
 * LAP is the standard policy for commercial use; RoyaltyPolicyLRP
 * (`0x9156e603C949481883B1d3355c6f1132D191fC41`) is also whitelisted and is the
 * derivative-remix policy. We use LAP because our license is a plain commercial use.
 *
 * Our terms set `commercialRevShare: 0` and `defaultMintingFee: 0`, so naming a royalty
 * policy costs nothing and imposes no payment — the license stays free. The policy is
 * required by the protocol's shape, not by our economics.
 */
export const AENEID_ROYALTY_POLICY_LAP_ADDRESS =
  "0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E" as const;

/**
 * Hard cap the CDR contract enforces on a vault's encrypted payload: 1024 bytes.
 * Verified live via `maxEncryptedDataSize()`.
 *
 * This is the constraint that settles the architecture. A file of any real size cannot
 * go in a vault. The vault holds the **data key** (32 bytes); the content is encrypted
 * with that key by us, off-chain. `docs/ARCHITECTURE.md` records the sequence.
 */
export const CDR_MAX_ENCRYPTED_DATA_SIZE_BYTES = 1024 as const;

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
 * CORRECTED 2026-10-07. The faucet recorded here previously was
 * `https://faucet.quicknode.com/story` (VERIFIED reachable 2026-10-05, but its amount was
 * never verified). A user attempting to fund the project's wallets found that route **gated
 * on holding ETH on mainnet**, which is useless to anyone starting from nothing — so the
 * previously-recorded route was not actually usable, only reachable.
 *
 * The first-party docs now name a different faucet:
 * `https://aeneid.faucet.datafdn.org/`, listed with an amount of **10 IP**.
 * Source: https://docs.datafdn.org/network/connect/aeneid.md (fetched 2026-10-07).
 *
 * The host is `datafdn.org`, not `story.foundation` — the same rebrand recorded in
 * docs/PROTOCOL_DISCOVERY.md. Note the distinction we keep having to make: the docs page is
 * authoritative and machine-readable, but the faucet itself sits behind a Cloudflare bot
 * challenge, so its *contents* remain UNVERIFIED from here. The URL and the 10 IP figure are
 * documented; neither was observed by us directly.
 *
 * Documented only. This project never automates a claim and never asks for a seed phrase; a
 * human funds a disposable testnet wallet.
 */
export const AENEID_FAUCET_URL = "https://aeneid.faucet.datafdn.org/" as const;

/**
 * Fallback faucet routes, recorded because funding is the project's single blocking
 * dependency and one route failing should not stall the build.
 *
 * - `story.foundation` — the same official faucet on the pre-rebrand host. Resolves and is
 *   Cloudflare-challenged (HTTP 403 "Just a moment..."), i.e. live but unreadable by machine.
 * - Google Cloud Web3 — serves a `story/aeneid` path and asks for a Google sign-in rather
 *   than a mainnet balance, but the page is a JS app whose static HTML does not enumerate the
 *   networks it supports. **UNVERIFIED** that it lists Aeneid; worth trying, not to be relied on.
 */
export const AENEID_FAUCET_ALTERNATES = [
  "https://aeneid.faucet.story.foundation/",
  "https://cloud.google.com/application/web3/faucet/story/aeneid",
] as const;

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
