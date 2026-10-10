/**
 * The read gate: asking a CDR vault's read condition whether a caller may read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS MODULE EXISTS TO ENFORCE
 *
 * "The read failed" is NOT the same statement as "you have no license."
 *
 * That distinction is the whole product. It was measured on live Aeneid on 2026-10-07 —
 * `checkReadCondition` does not answer every "no" with `false`:
 *
 *   | request                                  | actual result                          |
 *   |------------------------------------------|----------------------------------------|
 *   | empty `accessAuxData`                     | REVERTS, nothing decodable — the       |
 *   |                                           | `abi.decode` fails before authorization |
 *   |                                           | is ever evaluated                      |
 *   | a token id that was never minted          | REVERTS `ERC721NonexistentToken(uint256)`|
 *   |                                           | — it calls `ownerOf()` on the ERC-721   |
 *   | a REAL token id, caller is NOT its owner  | returns `false`  ← the ONLY clean denial |
 *   | a real token id, caller IS its owner      | returns `true`                          |
 *
 * So a revert may be about the REQUEST, not the CALLER. Returning `DENIED` for an opaque
 * revert would tell a paying licensee they have no rights because our own request was
 * malformed. This module therefore never returns a denial it cannot attribute.
 *
 * The first draft of `tools/spike/build-vault.ts` got this wrong and reported a fake
 * success; the shapes below are what fixed it, lifted here so the UI and the harness share
 * one implementation rather than two opinions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getAddress, type Address, type Hex, type PublicClient } from "viem";

import { LICENSE_READ_CONDITION_ADDRESS } from "./constants";

/**
 * Custom errors this condition contract is known to revert with, and what each one means.
 *
 * A revert that is NOT in this table, and that carries no decodable selector, is treated as
 * a malformed request — never as a denial.
 */
export const KNOWN_CONDITION_REVERTS: ReadonlyArray<{
  selector: Hex;
  name: string;
  meaning: string;
}> = [
  {
    selector: "0x7e273289",
    name: "ERC721NonexistentToken(uint256)",
    meaning:
      "the license token id in accessAuxData was never minted, so the condition's `ownerOf` " +
      "call reverted inside OpenZeppelin's ERC-721 implementation. The contract never reached " +
      "an authorization decision, so this says nothing about the caller's rights.",
  },
];

/**
 * What the condition contract told us, expressed so that the difference between a verdict
 * and a broken request cannot be lost.
 */
export type ProbeVerdict =
  /** The contract evaluated authorization and allowed the caller. */
  | { kind: "ALLOWED" }
  /** The contract evaluated authorization and refused the caller. The ONLY denial we trust. */
  | { kind: "DENIED"; basis: string }
  /**
   * The contract never reached an authorization decision — the request was malformed.
   *
   * `selector` and `errorName` are carried so a caller can reproduce exactly which refusal
   * shape it observed (`null` means the revert carried no decodable data at all), and show a
   * specific explanation instead of a generic one.
   */
  | {
      kind: "REJECTED_REQUEST";
      basis: string;
      selector: Hex | null;
      errorName: string | null;
      /** The node's raw message, kept for evidence. Never contains a secret. */
      message: string;
    }
  /** We could not tell which of the above happened. Never upgraded to ALLOWED or DENIED. */
  | { kind: "UNKNOWN"; basis: string; selector: Hex | null; message: string };

/** Pull the 4-byte custom-error selector out of a viem/node error message, if present. */
export function revertSelectorFromMessage(message: string): Hex | null {
  const match = /0x[0-9a-fA-F]{8}\b/.exec(message);
  if (match === null) return null;
  return match[0] as Hex;
}

/**
 * Turn one observation of `checkReadCondition` into a verdict.
 *
 * Pure on purpose: no client, no network, no clock. Every rule below is a rule that a
 * mistake in would be invisible at runtime, so they are all unit-tested.
 *
 * @param value the boolean the call returned, or null if it reverted
 * @param error the thrown error, or null if the call returned
 */
export function interpretConditionObservation(
  value: boolean | null,
  error: unknown,
): ProbeVerdict {
  if (error === null || error === undefined) {
    if (value === true) return { kind: "ALLOWED" };
    if (value === false) {
      return {
        kind: "DENIED",
        basis:
          "the condition contract evaluated the caller's license and returned false",
      };
    }
    // Neither a boolean nor an error is not a state the contract can produce; refusing to
    // guess here is the point.
    return {
      kind: "UNKNOWN",
      basis: "the call neither returned a boolean nor threw — the result is not interpretable",
      selector: null,
      message: "",
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const selector = revertSelectorFromMessage(message);
  const known = selector === null
    ? undefined
    : KNOWN_CONDITION_REVERTS.find((entry) => entry.selector === selector);

  if (known !== undefined) {
    return {
      kind: "REJECTED_REQUEST",
      basis: `reverted ${known.name} — ${known.meaning}`,
      selector,
      errorName: known.name,
      message,
    };
  }

  if (selector === null) {
    return {
      kind: "REJECTED_REQUEST",
      basis:
        "reverted with no decodable reason. On this contract that is what a malformed " +
        "request looks like (for example empty accessAuxData), because the decoding of the " +
        "arguments fails before any authorization logic runs.",
      selector: null,
      errorName: null,
      message,
    };
  }

  // A decodable selector we do not recognise is a CHANGE IN THE CONTRACT, not a verdict.
  // The build contract is explicit that an unverified protocol fact stops the phase rather
  // than being interpreted optimistically.
  return {
    kind: "UNKNOWN",
    basis:
      `reverted with an unrecognised custom error ${selector}. This contract's behaviour has ` +
      `changed since it was measured; do not read this as a denial.`,
    selector,
    message,
  };
}

const CONDITION_ABI = [
  {
    name: "checkReadCondition",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "uuid", type: "uint32" },
      { name: "accessAuxData", type: "bytes" },
      { name: "conditionData", type: "bytes" },
      { name: "caller", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/**
 * Ask the read condition directly, with `eth_call`.
 *
 * This is free — no transaction, no gas, no state change — which is why it is safe to run as
 * a preflight before asking the user to sign anything. It is also the only way to attribute a
 * later refusal to licensing rather than to a malformed request, because it returns the
 * contract's own verdict instead of an HTTP-shaped error from somewhere in the stack.
 *
 * @param conditionData the vault's static gate, `encodeLicenseReadConditionData(...)`
 * @param accessAuxData the caller's proof, `encodeLicenseAccessAuxData([tokenId])`
 */
export async function probeReadCondition(params: {
  publicClient: PublicClient;
  uuid: number;
  accessAuxData: Hex;
  conditionData: Hex;
  caller: Address;
  conditionAddress?: Address;
}): Promise<ProbeVerdict> {
  let value: boolean | null = null;
  let error: unknown = null;

  try {
    value = await params.publicClient.readContract({
      address: params.conditionAddress ?? getAddress(LICENSE_READ_CONDITION_ADDRESS),
      abi: CONDITION_ABI,
      functionName: "checkReadCondition",
      args: [params.uuid, params.accessAuxData, params.conditionData, params.caller],
    });
  } catch (caught) {
    error = caught;
  }

  return interpretConditionObservation(value, error);
}
