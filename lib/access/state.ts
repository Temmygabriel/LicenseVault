/**
 * LicenseVault access state machine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CENTRAL RULE OF THIS FILE
 *
 * The successful states cannot be reached without evidence, and the evidence types
 * below make that structurally true rather than merely conventional:
 *
 *   • `UNLOCKED` requires `UnlockEvidence`, which requires a real read transaction
 *     hash AND a measured plaintext length. There is no constructor that produces
 *     `UNLOCKED` from a boolean.
 *   • `LICENSE_VERIFIED` requires `VerificationEvidence` naming the IP, the terms,
 *     the token IDs and the chain it was read from.
 *   • `NO_LICENSE` requires `RejectionEvidence` — proof that the protocol actually
 *     refused. A timeout or an RPC error cannot produce it.
 *
 * Build-spec §11: "Never map a network timeout to NO LICENSE."
 * Build-spec §33: claiming ACCESS GRANTED from local state alone is a NO-GO condition.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Address, Hex } from "viem";

/** The seven states of build-spec §11. */
export type AccessPhase =
  | "LOCKED"
  | "CHECKING"
  | "NO_LICENSE"
  | "LICENSE_VERIFIED"
  | "ACCESSING"
  | "UNLOCKED"
  | "VERIFICATION_ERROR";

/**
 * Failure classification (build-spec §17).
 *
 * These must stay distinct. Collapsing them into "something went wrong" is explicitly
 * forbidden, because it hides the difference between "you are not allowed" and
 * "we could not find out" — which is the difference the whole product is about.
 */
export type FailureKind =
  /** The protocol says the caller is not allowed. The ONLY kind that yields NO_LICENSE. */
  | "AUTHORIZATION_FAILURE"
  /** We could not establish a trustworthy result (RPC down, timeout, bad response). */
  | "INFRASTRUCTURE_FAILURE"
  /** The user rejected the wallet action. */
  | "USER_CANCELLED"
  /** The chain rejected the transaction (revert, out of gas, nonce). */
  | "TRANSACTION_FAILED"
  /** The authorized read completed but plaintext was not recovered. */
  | "DECRYPTION_FAILED"
  /** The wallet is not on Story Aeneid. */
  | "WRONG_NETWORK";

export interface Failure {
  kind: FailureKind;
  /** Operator-facing detail. Safe to log. Must never contain secrets. */
  detail: string;
  /** Underlying error, if any. */
  cause?: unknown;
}

/** Evidence that a real license relationship was established. */
export interface VerificationEvidence {
  wallet: Address;
  /** Chain the evidence was read from. Must be Aeneid. */
  chainId: number;
  ipId: Address;
  licenseTermsId: bigint;
  licenseTokenIds: readonly bigint[];
  /** ISO-8601 timestamp of the check. State is revalidated, never cached indefinitely. */
  checkedAt: string;
}

/** Evidence that the protocol actively refused an unauthorized read. */
export interface RejectionEvidence {
  wallet: Address;
  chainId: number;
  vaultUuid: number;
  /**
   * Why we are confident this is an authorization refusal and not an outage.
   * e.g. "read() reverted in the condition contract" / "simulateContract reverted
   * with ConditionNotMet".
   */
  basis: string;
  checkedAt: string;
}

/** Evidence that protected plaintext was genuinely recovered through a real read. */
export interface UnlockEvidence {
  wallet: Address;
  chainId: number;
  vaultUuid: number;
  /** Hash of the on-chain `read()` transaction that produced the partials. */
  readTxHash: Hex;
  /** Number of bytes of data key recovered. The key itself is NEVER stored here. */
  dataKeyBytes: number;
  /** Number of bytes of protected content recovered. The content is NEVER stored here. */
  plaintextBytes: number;
  recoveredAt: string;
}

/** The access state. A discriminated union so impossible states are unrepresentable. */
export type AccessState =
  | { phase: "LOCKED" }
  | { phase: "CHECKING"; startedAt: string }
  | { phase: "NO_LICENSE"; evidence: RejectionEvidence }
  | { phase: "LICENSE_VERIFIED"; evidence: VerificationEvidence }
  | { phase: "ACCESSING"; evidence: VerificationEvidence; startedAt: string }
  | { phase: "UNLOCKED"; verification: VerificationEvidence; unlock: UnlockEvidence }
  | { phase: "VERIFICATION_ERROR"; failure: Failure };

export type AccessEvent =
  | { type: "VERIFY_REQUESTED" }
  | { type: "LICENSE_CONFIRMED"; evidence: VerificationEvidence }
  | { type: "LICENSE_ABSENT"; evidence: RejectionEvidence }
  | { type: "VERIFICATION_FAILED"; failure: Failure }
  | { type: "READ_REQUESTED" }
  | { type: "PLAINTEXT_RECOVERED"; evidence: UnlockEvidence }
  | { type: "RESET" };

export const INITIAL_ACCESS_STATE: AccessState = { phase: "LOCKED" };

/** Thrown when a caller attempts a transition the state machine does not allow. */
export class IllegalTransitionError extends Error {
  constructor(from: AccessPhase, event: AccessEvent["type"]) {
    super(`Illegal transition: cannot apply "${event}" while in phase ${from}.`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * Map a classified failure onto the resulting phase.
 *
 * This is deliberately a total function with an exhaustive switch: adding a new
 * FailureKind without deciding its phase becomes a compile error.
 */
export function phaseForFailure(kind: FailureKind): "NO_LICENSE" | "VERIFICATION_ERROR" {
  switch (kind) {
    case "AUTHORIZATION_FAILURE":
      return "NO_LICENSE";
    case "INFRASTRUCTURE_FAILURE":
    case "USER_CANCELLED":
    case "TRANSACTION_FAILED":
    case "DECRYPTION_FAILED":
    case "WRONG_NETWORK":
      return "VERIFICATION_ERROR";
  }
}

/**
 * Classify an unknown thrown value into a FailureKind.
 *
 * Deliberately conservative: anything we cannot confidently attribute to an
 * authorization refusal becomes INFRASTRUCTURE_FAILURE. Guessing "no license" from an
 * ambiguous error would tell a paying licensee they have no rights.
 *
 * NOTE: this function never returns AUTHORIZATION_FAILURE from a timeout or a generic
 * network error. Callers must pass explicit authorization signals instead.
 */
export function classifyThrownError(error: unknown): Failure {
  const detail = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  const lower = detail.toLowerCase();

  // User rejected in wallet (viem / wagmi surface this as UserRejectedRequestError).
  if (
    name === "UserRejectedRequestError" ||
    lower.includes("user rejected") ||
    lower.includes("user denied")
  ) {
    return { kind: "USER_CANCELLED", detail, cause: error };
  }

  // Not on the expected chain.
  if (name === "WrongNetworkError") {
    return { kind: "WRONG_NETWORK", detail, cause: error };
  }

  // Explicit timeout — must NOT become NO_LICENSE (build-spec §11).
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { kind: "INFRASTRUCTURE_FAILURE", detail, cause: error };
  }

  // Chain rejected the transaction.
  if (
    lower.includes("reverted") ||
    lower.includes("insufficient funds") ||
    name === "TransactionExecutionError"
  ) {
    return { kind: "TRANSACTION_FAILED", detail, cause: error };
  }

  // SDK-specific decryption problems.
  if (
    name === "InsufficientPartialsError" ||
    name === "EmptyVaultError" ||
    lower.includes("decrypt")
  ) {
    return { kind: "DECRYPTION_FAILED", detail, cause: error };
  }

  // Anything else is an infrastructure problem until proven otherwise.
  return { kind: "INFRASTRUCTURE_FAILURE", detail, cause: error };
}

/**
 * Apply an event to the state machine.
 *
 * @throws IllegalTransitionError when the event is not valid in the current phase
 */
export function reduceAccess(state: AccessState, event: AccessEvent): AccessState {
  switch (event.type) {
    case "RESET":
      return INITIAL_ACCESS_STATE;

    case "VERIFY_REQUESTED":
      if (state.phase === "CHECKING" || state.phase === "ACCESSING") {
        throw new IllegalTransitionError(state.phase, event.type);
      }
      return { phase: "CHECKING", startedAt: new Date().toISOString() };

    case "LICENSE_CONFIRMED":
      if (state.phase !== "CHECKING") {
        throw new IllegalTransitionError(state.phase, event.type);
      }
      return { phase: "LICENSE_VERIFIED", evidence: event.evidence };

    case "LICENSE_ABSENT":
      if (state.phase !== "CHECKING") {
        throw new IllegalTransitionError(state.phase, event.type);
      }
      return { phase: "NO_LICENSE", evidence: event.evidence };

    case "VERIFICATION_FAILED": {
      if (state.phase !== "CHECKING" && state.phase !== "ACCESSING") {
        throw new IllegalTransitionError(state.phase, event.type);
      }

      const target = phaseForFailure(event.failure.kind);

      // AUTHORIZATION_FAILURE is the only path to NO_LICENSE, and it must carry the
      // evidence that the protocol refused — not merely an error string.
      if (target === "NO_LICENSE") {
        throw new IllegalTransitionError(state.phase, event.type);
      }

      return { phase: "VERIFICATION_ERROR", failure: event.failure };
    }

    case "READ_REQUESTED":
      if (state.phase !== "LICENSE_VERIFIED") {
        throw new IllegalTransitionError(state.phase, event.type);
      }
      return {
        phase: "ACCESSING",
        evidence: state.evidence,
        startedAt: new Date().toISOString(),
      };

    case "PLAINTEXT_RECOVERED":
      if (state.phase !== "ACCESSING") {
        throw new IllegalTransitionError(state.phase, event.type);
      }
      if (event.evidence.plaintextBytes <= 0) {
        throw new Error(
          "PLAINTEXT_RECOVERED requires a positive recovered byte count. " +
            "An empty payload is a decryption failure, not an unlock.",
        );
      }
      return {
        phase: "UNLOCKED",
        verification: state.evidence,
        unlock: event.evidence,
      };
  }
}

/** True only when protected content was genuinely recovered. */
export function isUnlocked(state: AccessState): state is Extract<AccessState, { phase: "UNLOCKED" }> {
  return state.phase === "UNLOCKED";
}

/** True when the protocol was reached and actively refused. */
export function isRejected(state: AccessState): state is Extract<AccessState, { phase: "NO_LICENSE" }> {
  return state.phase === "NO_LICENSE";
}

/** True when we could not establish a trustworthy result. */
export function isErrored(state: AccessState): state is Extract<AccessState, { phase: "VERIFICATION_ERROR" }> {
  return state.phase === "VERIFICATION_ERROR";
}

/** A short, non-technical label for the current phase. */
export function phaseLabel(phase: AccessPhase): string {
  switch (phase) {
    case "LOCKED":
      return "ACCESS RESTRICTED";
    case "CHECKING":
      return "VERIFYING LICENSE";
    case "NO_LICENSE":
      return "ACCESS RESTRICTED";
    case "LICENSE_VERIFIED":
      return "LICENSE VERIFIED";
    case "ACCESSING":
      return "RECOVERING CONTENT";
    case "UNLOCKED":
      return "ACCESS GRANTED";
    case "VERIFICATION_ERROR":
      return "LICENSE COULD NOT BE VERIFIED";
  }
}
