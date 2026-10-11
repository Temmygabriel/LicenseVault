import { describe, expect, it } from "vitest";
import type { Address } from "viem";

import { eventForVerdict, failureForVerdict, isProbeVerdict } from "@/lib/access/verify";
import { reduceAccess, INITIAL_ACCESS_STATE, type AccessState } from "@/lib/access/state";
import type { ProbeVerdict } from "@/lib/protocol/gate";

/**
 * The mapping from a chain answer to something a person reads.
 *
 * Everything the browser can reach goes through `eventForVerdict`, so these tests are the last
 * place a mislabelling could be caught before it is on a screen. They are built from the four
 * shapes `checkReadCondition` was MEASURED to produce on live Aeneid (see the table in
 * `lib/protocol/gate.ts`), not from an imagined contract.
 */

const WALLET = "0x226e01730F6991C1BD11f58d1204638bee89A863" as Address;

const CONTEXT = {
  wallet: WALLET,
  chainId: 1315,
  vaultUuid: 11062,
  ipId: "0x6C6046f021093c54F43663Fad93037E6556Bfdd8" as Address,
  licenseTermsId: 2183n,
  licenseTokenIds: [73227n],
  checkedAt: "2026-10-11T00:00:00.000Z",
} as const;

const ALLOWED: ProbeVerdict = { kind: "ALLOWED" };
const DENIED: ProbeVerdict = {
  kind: "DENIED",
  basis: "the condition contract evaluated the caller's license and returned false",
};
const REJECTED: ProbeVerdict = {
  kind: "REJECTED_REQUEST",
  basis: "reverted with no decodable reason",
  selector: null,
  errorName: null,
  message: "Execution reverted for an unknown reason",
};
const UNKNOWN: ProbeVerdict = {
  kind: "UNKNOWN",
  basis: "reverted with an unrecognised custom error",
  selector: "0xdeadbeef",
  message: "reverted with 0xdeadbeef",
};

/** Run an event through the machine from CHECKING, which is where a probe always lands. */
function phaseAfter(verdict: ProbeVerdict): AccessState {
  const checking = reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" });
  return reduceAccess(checking, eventForVerdict({ verdict, context: CONTEXT }));
}

describe("a probe verdict becomes the right state", () => {
  it("ALLOWED reaches LICENSE_VERIFIED with evidence naming the licence", () => {
    const state = phaseAfter(ALLOWED);
    expect(state.phase).toBe("LICENSE_VERIFIED");
    if (state.phase !== "LICENSE_VERIFIED") return;
    expect(state.evidence.wallet).toBe(WALLET);
    expect(state.evidence.chainId).toBe(1315);
    expect(state.evidence.licenseTokenIds).toEqual([73227n]);
    expect(state.evidence.checkedAt).toBe(CONTEXT.checkedAt);
  });

  it("DENIED reaches NO_LICENSE, and the only clean denial shape is what got there", () => {
    const state = phaseAfter(DENIED);
    expect(state.phase).toBe("NO_LICENSE");
    if (state.phase !== "NO_LICENSE") return;
    expect(state.evidence.basis).toContain("returned false");
    expect(state.evidence.vaultUuid).toBe(11062);
  });

  /**
   * THE MOST IMPORTANT ASSERTION IN THIS FILE.
   *
   * A malformed request is our defect. If it surfaced as NO_LICENSE, this product would tell a
   * paying licensee they hold no rights because of a bug on our side of the wire. The state
   * machine makes that unreachable — AUTHORIZATION_FAILURE is the only kind that maps to
   * NO_LICENSE — and this pins the classifier that feeds it.
   */
  it("REJECTED_REQUEST is an infrastructure failure and NEVER a licensing decision", () => {
    const failure = failureForVerdict(REJECTED);
    expect(failure).not.toBeNull();
    expect(failure?.kind).toBe("INFRASTRUCTURE_FAILURE");
    expect(failure?.kind).not.toBe("AUTHORIZATION_FAILURE");

    const state = phaseAfter(REJECTED);
    expect(state.phase).toBe("VERIFICATION_ERROR");
    expect(state.phase).not.toBe("NO_LICENSE");
  });

  it("an unrecognised revert is UNKNOWN, and also never a licensing decision", () => {
    const failure = failureForVerdict(UNKNOWN);
    expect(failure?.kind).toBe("INFRASTRUCTURE_FAILURE");
    expect(phaseAfter(UNKNOWN).phase).toBe("VERIFICATION_ERROR");
  });

  it("never produces UNLOCKED from any verdict", () => {
    for (const verdict of [ALLOWED, DENIED, REJECTED, UNKNOWN]) {
      expect(phaseAfter(verdict).phase).not.toBe("UNLOCKED");
    }
  });
});

describe("verdicts arriving over the wire are checked before they are trusted", () => {
  it("accepts the four real shapes", () => {
    for (const verdict of [ALLOWED, DENIED, REJECTED, UNKNOWN]) {
      expect(isProbeVerdict(JSON.parse(JSON.stringify(verdict)))).toBe(true);
    }
  });

  it("rejects anything that is not one of them", () => {
    const rejects: unknown[] = [
      null,
      undefined,
      "ALLOWED",
      42,
      {},
      { kind: "ALLOWED_ISH" },
      { kind: "DENIED" },
      { kind: "DENIED", basis: 7 },
      { kind: "REJECTED_REQUEST", basis: "x" },
      { kind: "UNKNOWN", basis: "x", selector: 1, message: "y" },
    ];
    for (const value of rejects) {
      expect(isProbeVerdict(value)).toBe(false);
    }
  });

  it("does not accept a payload that merely looks like success", () => {
    // A response shaped like a product result rather than a probe verdict must not pass. The
    // route never sends this, which is exactly why a proxy or a stale deploy might.
    expect(isProbeVerdict({ ok: true, access: "GRANTED" })).toBe(false);
    expect(isProbeVerdict({ phase: "UNLOCKED" })).toBe(false);
  });
});
