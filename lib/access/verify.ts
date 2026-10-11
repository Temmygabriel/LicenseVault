/**
 * Turning one probe of the read condition into a state-machine event.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE THIS FILE EXISTS TO KEEP, RESTATED WHERE IT IS APPLIED
 *
 * `lib/protocol/gate.ts` establishes that the condition contract does not answer every "no"
 * with `false`. This module is where that fact either survives contact with the product or
 * dies: it is the only place a probe verdict becomes something a user reads.
 *
 *   ALLOWED            → LICENSE_CONFIRMED   (the contract evaluated authorization and allowed)
 *   DENIED             → LICENSE_ABSENT      (the contract evaluated authorization and refused)
 *   REJECTED_REQUEST   → VERIFICATION_FAILED (OUR request was malformed; says nothing about
 *                                             the caller's rights, and must never read as a
 *                                             licensing decision)
 *   UNKNOWN            → VERIFICATION_FAILED (the contract changed, or we could not tell)
 *
 * `REJECTED_REQUEST` is classified `INFRASTRUCTURE_FAILURE`, not `AUTHORIZATION_FAILURE`.
 * `AUTHORIZATION_FAILURE` is the only kind that reaches `NO_LICENSE`, and a malformed request
 * reaching `NO_LICENSE` would tell a paying licensee they have no rights because of a bug on
 * our side. That assertion has its own test, labelled as the most important one in the file.
 *
 * Pure on purpose: no client, no network, no clock. `checkedAt` is passed in.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Address } from "viem";

import type { AccessEvent, Failure } from "./state";
import type { ProbeVerdict } from "@/lib/protocol/gate";

export interface VerdictContext {
  /** The address whose rights were asked about. */
  wallet: Address;
  /** The chain the answer came from — asserted against Aeneid by the caller, not assumed here. */
  chainId: number;
  vaultUuid: number;
  ipId: Address;
  licenseTermsId: bigint;
  licenseTokenIds: readonly bigint[];
  /** ISO-8601. Supplied by the caller so this function stays pure. */
  checkedAt: string;
}

/**
 * The failure a probe that never reached an authorization decision produces.
 *
 * Exported so the reason is visible at the call site rather than buried in a branch: this is
 * deliberately NOT `AUTHORIZATION_FAILURE`.
 */
export function failureForVerdict(verdict: ProbeVerdict): Failure | null {
  switch (verdict.kind) {
    case "ALLOWED":
    case "DENIED":
      return null;
    case "REJECTED_REQUEST":
      return {
        kind: "INFRASTRUCTURE_FAILURE",
        detail: verdict.basis,
      };
    case "UNKNOWN":
      return {
        kind: "INFRASTRUCTURE_FAILURE",
        detail: verdict.basis,
      };
  }
}

/** Map a probe verdict onto the event the state machine should receive. */
export function eventForVerdict(params: {
  verdict: ProbeVerdict;
  context: VerdictContext;
}): AccessEvent {
  const { verdict, context } = params;

  switch (verdict.kind) {
    case "ALLOWED":
      return {
        type: "LICENSE_CONFIRMED",
        evidence: {
          wallet: context.wallet,
          chainId: context.chainId,
          ipId: context.ipId,
          licenseTermsId: context.licenseTermsId,
          licenseTokenIds: context.licenseTokenIds,
          checkedAt: context.checkedAt,
        },
      };

    case "DENIED":
      return {
        type: "LICENSE_ABSENT",
        evidence: {
          wallet: context.wallet,
          chainId: context.chainId,
          vaultUuid: context.vaultUuid,
          basis: verdict.basis,
          checkedAt: context.checkedAt,
        },
      };

    case "REJECTED_REQUEST":
    case "UNKNOWN": {
      const failure = failureForVerdict(verdict);
      // `failureForVerdict` is total over these two kinds; the guard keeps that true if a
      // future variant is added to `ProbeVerdict` and this switch is not updated.
      if (failure === null) {
        return {
          type: "VERIFICATION_FAILED",
          failure: {
            kind: "INFRASTRUCTURE_FAILURE",
            detail: `unclassified probe verdict: ${verdict.kind}`,
          },
        };
      }
      return { type: "VERIFICATION_FAILED", failure };
    }
  }
}

/**
 * Validate a verdict that arrived over the wire.
 *
 * The route's response is untrusted input like any other: it crosses a process boundary that a
 * proxy, a stale deploy or a bug could put something else on the end of. A shape check is
 * cheaper than a verdict nobody can attribute.
 */
export function isProbeVerdict(value: unknown): value is ProbeVerdict {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const kind = record["kind"];

  switch (kind) {
    case "ALLOWED":
      return true;
    case "DENIED":
      return typeof record["basis"] === "string";
    case "REJECTED_REQUEST":
    case "UNKNOWN":
      return (
        typeof record["basis"] === "string" &&
        (typeof record["selector"] === "string" || record["selector"] === null) &&
        typeof record["message"] === "string"
      );
    default:
      return false;
  }
}
