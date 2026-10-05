/**
 * Network validation.
 *
 * Build-spec §21 lists "wrong chain" as a threat, and the adversarial test matrix (§22)
 * requires that a wrong-network wallet is BLOCKED rather than silently treated as
 * unlicensed. The distinction matters: "you are on the wrong network" is an
 * infrastructure/configuration problem, and must never be reported to the user as
 * "you do not hold a license".
 */

import { AENEID_CHAIN_ID } from "./constants";

/** Raised when the connected wallet/RPC is not on the expected Story network. */
export class WrongNetworkError extends Error {
  readonly expected: number;
  readonly actual: number | null;

  constructor(expected: number, actual: number | null) {
    super(
      actual === null
        ? `Could not determine the connected chain. LicenseVault requires chain ${expected} (Story Aeneid).`
        : `Wrong network: connected to chain ${actual}, but LicenseVault requires chain ${expected} (Story Aeneid).`,
    );
    this.name = "WrongNetworkError";
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Assert the chain id matches Aeneid.
 *
 * @param chainId the chain id reported by the RPC or wallet, or null if unavailable
 * @throws WrongNetworkError when the chain does not match
 */
export function assertAeneidChain(chainId: number | null): void {
  if (chainId === null || chainId !== AENEID_CHAIN_ID) {
    throw new WrongNetworkError(AENEID_CHAIN_ID, chainId);
  }
}

/** Non-throwing variant, for places that need to render a state rather than fail. */
export function isAeneidChain(chainId: number | null): boolean {
  return chainId === AENEID_CHAIN_ID;
}
