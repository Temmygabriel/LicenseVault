/**
 * The read adapter: turning one attempt to open a CDR vault into an outcome the product is
 * allowed to display.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS MEASURED, AND WHY IT SHAPES THIS FILE
 *
 * `tools/spike/build-vault.ts` performed both refusals on live Aeneid on 2026-10-07, and they
 * look nothing like each other:
 *
 *   • a request naming a licence that really exists, presented by a wallet that does not
 *     own it  →  `execution reverted: CDR: Read condition not met`
 *   • a request with EMPTY auxiliary data  →  `Execution reverted for an unknown reason`
 *
 * Only the first is a statement about the caller's rights. The second is a statement about
 * our request. Both arrive as "the read failed", and mapping them to the same word is exactly
 * the mislabelling this project forbids — one tells a licensee they have no licence, the
 * other tells them nothing at all.
 *
 * So this module returns four outcomes, not two, and the ONE that can become `NO_LICENSE` is
 * the one the protocol actually decided.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import type { CDRClient } from "@piplabs/cdr-sdk";
import { cdrAbi } from "@piplabs/cdr-contracts";

import { CDR_ADDRESS, CDR_MAX_ENCRYPTED_DATA_SIZE_BYTES } from "./constants";
import type { Failure, FailureKind } from "../access/state";

/** The CDR contract's own revert reason when the read condition refused the caller. */
export const READ_CONDITION_NOT_MET = "CDR: Read condition not met" as const;

/**
 * The result of one attempt to obtain a data key.
 *
 * A discriminated union rather than `{ ok: boolean, error?: string }`, because "no" and
 * "we don't know" must not be expressible as the same value.
 */
export type AccessAttempt =
  /** The vault returned a data key. The ONLY shape that may be shown as granted. */
  | { kind: "GRANTED"; dataKey: Uint8Array; txHash: Hex }
  /** The protocol evaluated the caller's licence and refused. Safe to display as restricted. */
  | { kind: "REFUSED"; basis: string }
  /** The request was not well-formed, so the protocol never judged the caller. Never a denial. */
  | { kind: "MALFORMED_REQUEST"; basis: string }
  /** We could not establish a trustworthy result. Never a denial, never a grant. */
  | { kind: "INFRASTRUCTURE_FAILURE"; detail: string; cause?: unknown };

/**
 * Classify a thrown error from the read path.
 *
 * Pure, so the rules are testable without a chain — which matters, because every one of them
 * is a rule whose failure mode is a wrong word on a screen rather than a crash.
 */
export function classifyReadFailure(error: unknown): AccessAttempt {
  const detail = error instanceof Error ? error.message : String(error);
  const lower = detail.toLowerCase();

  // The protocol reached the condition contract and it said no. This is the single
  // authorization signal, and it is quoted from the contract's own revert reason.
  if (lower.includes(READ_CONDITION_NOT_MET.toLowerCase())) {
    return {
      kind: "REFUSED",
      basis:
        "read() reverted with the CDR contract's own reason, \"" + READ_CONDITION_NOT_MET +
        "\" — the read condition evaluated the caller's licence and refused.",
    };
  }

  // A timeout is an absence of an answer, not an answer. Build-spec §11 forbids mapping it
  // to NO_LICENSE, and this branch is where that rule is enforced.
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted")) {
    return { kind: "INFRASTRUCTURE_FAILURE", detail, cause: error };
  }

  // A bare revert with no reason is what a malformed request produces on this contract. It
  // says nothing about the caller, so it must never reach the user as "no licence".
  if (lower.includes("execution reverted")) {
    return {
      kind: "MALFORMED_REQUEST",
      basis:
        "read() reverted without a decodable reason. On this contract that is the shape of a " +
        "request the protocol could not evaluate (for example empty accessAuxData), not a " +
        "refusal of the caller.",
    };
  }

  return { kind: "INFRASTRUCTURE_FAILURE", detail, cause: error };
}

/**
 * Map an attempt onto the state machine's failure taxonomy.
 *
 * `null` means the attempt produced a usable answer (granted or refused) and there is no
 * failure to report. Note which kinds are absent: `AUTHORIZATION_FAILURE` is reachable from
 * exactly one place — a decoded `REFUSED` — and from nowhere else.
 */
export function failureForAttempt(attempt: AccessAttempt): Failure | null {
  switch (attempt.kind) {
    case "GRANTED":
    case "REFUSED":
      return null;

    case "MALFORMED_REQUEST":
      // Deliberately INFRASTRUCTURE_FAILURE, not AUTHORIZATION_FAILURE. Our malformed request
      // is our defect; reporting it as the user's lack of a licence would be a lie with a
      // victim, and it is the exact bug BUILD 2 found in the first harness.
      return {
        kind: "INFRASTRUCTURE_FAILURE",
        detail:
          `${attempt.basis} This is a defect in LicenseVault's request, and it is reported as ` +
          `such rather than as a licensing decision.`,
      };

    case "INFRASTRUCTURE_FAILURE":
      return { kind: "INFRASTRUCTURE_FAILURE", detail: attempt.detail, cause: attempt.cause };
  }
}

/** The failure kind a refusal produces — the only path to NO_LICENSE in the whole product. */
export const REFUSAL_FAILURE_KIND: FailureKind = "AUTHORIZATION_FAILURE";

/**
 * Perform the authorized read.
 *
 * A thin wrapper around the SDK's `accessCDR` whose entire value is that it does not let the
 * caller collapse the outcomes: it returns an `AccessAttempt`, and the only way to obtain a
 * data key is `kind === "GRANTED"`.
 *
 * @param accessAuxData the proof, `encodeLicenseAccessAuxData([tokenId])`
 * @param timeoutMs how long to wait for the threshold network before calling it an outage
 */
export async function requestDataKey(params: {
  client: CDRClient;
  uuid: number;
  accessAuxData: Hex;
  timeoutMs?: number;
}): Promise<AccessAttempt> {
  try {
    const result = await params.client.consumer.accessCDR({
      uuid: params.uuid,
      accessAuxData: params.accessAuxData,
      timeoutMs: params.timeoutMs ?? 120_000,
    });

    // The SDK returns whatever the threshold network produced. A "successful" read that
    // yields the wrong number of bytes is not a data key, so it is not a grant.
    if (result.dataKey.length === 0) {
      return {
        kind: "MALFORMED_REQUEST",
        basis: "the read reported success but returned a zero-length data key",
      };
    }

    return { kind: "GRANTED", dataKey: result.dataKey, txHash: result.txHash as Hex };
  } catch (error) {
    return classifyReadFailure(error);
  }
}

/**
 * A vault's record as the CONTRACT holds it — not as the app intended to write it.
 *
 * That difference is worth showing: a vault gated on something unexpected is a vault whose
 * denials prove nothing, so the UI reads the gate back rather than trusting its own request.
 */
export interface VaultRecord {
  uuid: number;
  updatable: boolean;
  readConditionAddress: Address;
  writeConditionAddress: Address;
  readConditionData: Hex;
  writeConditionData: Hex;
  /** Size of the encrypted payload on chain. The data key, not the content — see content.ts. */
  encryptedDataBytes: number;
}

/**
 * Read a vault's record straight off the CDR contract.
 *
 * Uses the ABI published in `@piplabs/cdr-contracts` rather than a hand-copied one, so a
 * field added upstream cannot silently shift the fields we read.
 */
export async function readVaultOnChain(params: {
  publicClient: PublicClient;
  uuid: number;
}): Promise<VaultRecord> {
  const vault = await params.publicClient.readContract({
    address: VAULT_CONTRACT_ADDRESS,
    abi: cdrAbi,
    functionName: "vaults",
    args: [params.uuid],
  });

  return {
    uuid: params.uuid,
    updatable: vault.updatable,
    readConditionAddress: vault.readConditionAddr,
    writeConditionAddress: vault.writeConditionAddr,
    readConditionData: vault.readConditionData,
    writeConditionData: vault.writeConditionData,
    encryptedDataBytes: (vault.encryptedData.length - 2) / 2,
  };
}

/** Convenience re-export so callers do not need to know the CDR address shape. */
export const VAULT_CONTRACT_ADDRESS: Address = getAddress(CDR_ADDRESS);

/** The contract's own payload ceiling, re-exported for UI copy that explains the limit. */
export const VAULT_MAX_PAYLOAD_BYTES = CDR_MAX_ENCRYPTED_DATA_SIZE_BYTES;
