/**
 * LicenseStatus — the one place a state name becomes words on the page.
 *
 * The mapping below is the product. Every state has its own label, its own tone and its own
 * sentence, and every sentence says only what that state licenses us to say:
 *
 *   • `NO_LICENSE` is the ONLY state allowed to tell someone they lack a licence, and the state
 *     machine will not produce it without `RejectionEvidence` (a real protocol refusal).
 *   • `VERIFICATION_ERROR` never borrows the word "license". A timeout is our problem, not the
 *     visitor's rights.
 *   • `UNLOCKED` is the only state allowed to say the content is open — and its evidence type
 *     requires a real read transaction hash and a positive recovered byte count.
 *   • A disconnected wallet is not a denial, so it never renders as one.
 */

import type { AccessPhase, FailureKind } from "@/lib/access/state";

type Tone = "locked" | "working" | "verified" | "restricted" | "error";

export interface StatusCopy {
  /** The short word shown in the docket's status row. */
  label: string;
  /** The sentence under the status. Explains the state without protocol jargon. */
  sentence: string;
  tone: Tone;
}

const COPY: Record<AccessPhase, StatusCopy> = {
  LOCKED: {
    label: "Locked",
    sentence:
      "The content is sealed on chain. Nothing opens it except a read the license condition allows.",
    tone: "locked",
  },
  CHECKING: {
    label: "Verifying license",
    sentence:
      "Asking the license condition on Story Aeneid whether this wallet holds the required right. Content stays sealed while we ask.",
    tone: "working",
  },
  NO_LICENSE: {
    label: "No license",
    sentence:
      "The license condition refused the read. This is a real answer from the chain, not a guess — access requires a Commercial Use license for this asset.",
    tone: "restricted",
  },
  LICENSE_VERIFIED: {
    label: "License verified",
    sentence:
      "The wallet holds the required license. The content is still sealed until the protected read is performed.",
    tone: "verified",
  },
  ACCESSING: {
    label: "Accessing",
    sentence:
      "Performing the protected read and decrypting the recovered content. Nothing is shown until that actually succeeds.",
    tone: "working",
  },
  UNLOCKED: {
    label: "Access granted",
    sentence:
      "The protected read returned the data key and the content decrypted successfully. Here is the recovered resource.",
    tone: "verified",
  },
  VERIFICATION_ERROR: {
    label: "Verification error",
    sentence:
      "We could not establish whether this wallet holds the license. That is a failure on our side of the wire — it is not a statement about your rights.",
    tone: "error",
  },
};

export function statusCopy(phase: AccessPhase): StatusCopy {
  return COPY[phase];
}

/**
 * A failure-specific line, so "verification error" is never a shrug.
 *
 * These are deliberately distinct: build-spec §17 forbids collapsing them, because the
 * difference between "you may not" and "we could not find out" is the product.
 */
export const FAILURE_COPY: Record<FailureKind, string> = {
  AUTHORIZATION_FAILURE:
    "The license condition refused the read. Access requires a Commercial Use license for this asset.",
  INFRASTRUCTURE_FAILURE:
    "The network did not answer in time. This is an infrastructure problem, not a licensing decision.",
  USER_CANCELLED: "The wallet action was cancelled, so nothing was verified.",
  TRANSACTION_FAILED: "The chain rejected the transaction. Nothing was read.",
  DECRYPTION_FAILED:
    "The read returned, but the recovered key did not decrypt the content. Access stays closed.",
  WRONG_NETWORK: "Your wallet is not on Story Aeneid. Switch networks and try again.",
};

export interface LicenseStatusProps {
  phase: AccessPhase;
  /** Rendered after the status label, as the ruled row's value. */
  compact?: boolean;
}

export function LicenseStatus({ phase, compact = false }: LicenseStatusProps) {
  const copy = statusCopy(phase);

  return (
    <span className={`status status--${copy.tone}`}>
      <span className="status__mark" aria-hidden="true" />
      <span className={compact ? "status__label status__label--compact" : "status__label"}>
        {copy.label}
      </span>
    </span>
  );
}
