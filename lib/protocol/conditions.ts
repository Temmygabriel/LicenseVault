/**
 * Condition encoding / decoding for CDR vault access gates.
 *
 * This module is the entire wire-format surface between LicenseVault and the CDR
 * condition contracts. It is intentionally small, pure and unit-tested, so a reader
 * can see exactly how the gate is built without following protocol calls through UI code.
 *
 * Encodings are taken verbatim from the official CDR documentation:
 *   https://github.com/piplabs/cdr-sdk/blob/main/docs/CONDITIONS.md
 *
 *   conditionData  (set ONCE at vault allocation, stored on-chain)
 *     LicenseReadCondition : abi.encode(address licenseTokenContract, address ipId)
 *     OwnerWriteCondition  : abi.encode(address writer)
 *
 *   accessAuxData  (supplied BY THE CALLER on each read)
 *     LicenseReadCondition : abi.encode(uint256[] licenseTokenIds)
 */

import {
  decodeAbiParameters,
  encodeAbiParameters,
  isAddress,
  type Address,
  type Hex,
} from "viem";

/** Thrown when a caller tries to build an access proof with no license tokens. */
export class EmptyLicenseTokenListError extends Error {
  constructor() {
    super(
      "A license access proof must contain at least one license token ID. " +
        "An empty list is never a valid proof of a license.",
    );
    this.name = "EmptyLicenseTokenListError";
  }
}

/** Thrown when an address argument is not a well-formed EVM address. */
export class InvalidAddressError extends Error {
  constructor(field: string, value: unknown) {
    super(`Invalid EVM address for "${field}": ${String(value)}`);
    this.name = "InvalidAddressError";
  }
}

function assertAddress(field: string, value: unknown): asserts value is Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new InvalidAddressError(field, value);
  }
}

/**
 * Build the static `conditionData` for a LicenseReadCondition-gated vault.
 *
 * This is written ON-CHAIN at allocation time and cannot be changed afterwards, so it
 * fixes which (LicenseToken contract, IP asset) pair the vault will ever accept.
 *
 * @param params.licenseTokenAddress Story LicenseToken contract (Aeneid: 0xFe38…C6bC)
 * @param params.ipId                 The Story IP asset the reader must hold a license for
 */
export function encodeLicenseReadConditionData(params: {
  licenseTokenAddress: string;
  ipId: string;
}): Hex {
  assertAddress("licenseTokenAddress", params.licenseTokenAddress);
  assertAddress("ipId", params.ipId);

  return encodeAbiParameters(
    [{ type: "address" }, { type: "address" }],
    [params.licenseTokenAddress, params.ipId],
  );
}

/** Build the static `conditionData` for an OwnerWriteCondition-gated vault. */
export function encodeOwnerWriteConditionData(writer: string): Hex {
  assertAddress("writer", writer);

  return encodeAbiParameters([{ type: "address" }], [writer]);
}

/**
 * Build the per-caller `accessAuxData` that proves which license tokens the reader holds.
 *
 * The condition contract checks these token IDs against the caller's balance, so the
 * proof is only meaningful alongside a real on-chain `read()` from the licence-holding
 * wallet. It is NOT a credential the UI can assert on its own.
 *
 * @throws EmptyLicenseTokenListError if no token IDs are supplied
 */
export function encodeLicenseAccessAuxData(
  licenseTokenIds: readonly bigint[],
): Hex {
  if (licenseTokenIds.length === 0) {
    throw new EmptyLicenseTokenListError();
  }

  for (const id of licenseTokenIds) {
    if (typeof id !== "bigint" || id < 0n) {
      throw new Error(
        `License token IDs must be non-negative bigints; received ${String(id)}.`,
      );
    }
  }

  return encodeAbiParameters(
    [{ type: "uint256[]" }],
    [[...licenseTokenIds]],
  );
}

/** Read back a LicenseReadCondition `conditionData` blob (used by the evidence verifier). */
export function decodeLicenseReadConditionData(data: Hex): {
  licenseTokenAddress: Address;
  ipId: Address;
} {
  const [licenseTokenAddress, ipId] = decodeAbiParameters(
    [{ type: "address" }, { type: "address" }],
    data,
  );
  return { licenseTokenAddress, ipId };
}

/** Read back an OwnerWriteCondition `conditionData` blob. */
export function decodeOwnerWriteConditionData(data: Hex): { writer: Address } {
  const [writer] = decodeAbiParameters([{ type: "address" }], data);
  return { writer };
}

/** Read back a license `accessAuxData` blob. */
export function decodeLicenseAccessAuxData(data: Hex): { licenseTokenIds: bigint[] } {
  const [licenseTokenIds] = decodeAbiParameters(
    [{ type: "uint256[]" }],
    data,
  );
  return { licenseTokenIds: [...licenseTokenIds] };
}
