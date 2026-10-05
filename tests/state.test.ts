import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import {
  INITIAL_ACCESS_STATE,
  IllegalTransitionError,
  classifyThrownError,
  isErrored,
  isRejected,
  isUnlocked,
  phaseForFailure,
  phaseLabel,
  reduceAccess,
  type AccessEvent,
  type AccessState,
  type UnlockEvidence,
  type VerificationEvidence,
} from "@/lib/access/state";

const WALLET = "0x7F000000000000000000000000000000000091C2" as Address;
const IP_ID = "0x3Aa560C9072E0D4A1443CD192745C24A176b4925" as Address;
const TX_HASH = `0x${"ab".repeat(32)}` as Hex;

const verification: VerificationEvidence = {
  wallet: WALLET,
  chainId: 1315,
  ipId: IP_ID,
  licenseTermsId: 2645n,
  licenseTokenIds: [1n],
  checkedAt: new Date("2026-10-05T00:00:00Z").toISOString(),
};

const unlock: UnlockEvidence = {
  wallet: WALLET,
  chainId: 1315,
  vaultUuid: 42,
  readTxHash: TX_HASH,
  dataKeyBytes: 32,
  plaintextBytes: 2048,
  recoveredAt: new Date("2026-10-05T00:00:00Z").toISOString(),
};

/** Drive the machine from LOCKED to UNLOCKED through the full honest path. */
function reachUnlocked(): AccessState {
  let s = reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" });
  s = reduceAccess(s, { type: "LICENSE_CONFIRMED", evidence: verification });
  s = reduceAccess(s, { type: "READ_REQUESTED" });
  s = reduceAccess(s, { type: "PLAINTEXT_RECOVERED", evidence: unlock });
  return s;
}

describe("the honest happy path", () => {
  it("LOCKED → CHECKING → LICENSE VERIFIED → ACCESSING → UNLOCKED", () => {
    let s = INITIAL_ACCESS_STATE;
    expect(s.phase).toBe("LOCKED");

    s = reduceAccess(s, { type: "VERIFY_REQUESTED" });
    expect(s.phase).toBe("CHECKING");

    s = reduceAccess(s, { type: "LICENSE_CONFIRMED", evidence: verification });
    expect(s.phase).toBe("LICENSE_VERIFIED");

    s = reduceAccess(s, { type: "READ_REQUESTED" });
    expect(s.phase).toBe("ACCESSING");

    s = reduceAccess(s, { type: "PLAINTEXT_RECOVERED", evidence: unlock });
    expect(s.phase).toBe("UNLOCKED");
    expect(isUnlocked(s)).toBe(true);

    if (isUnlocked(s)) {
      // The unlock carries the real read tx hash, not a flag.
      expect(s.unlock.readTxHash).toBe(TX_HASH);
      expect(s.verification.ipId).toBe(IP_ID);
    }
  });
});

describe("success cannot be faked", () => {
  it("REFUSES to unlock directly from LOCKED", () => {
    expect(() =>
      reduceAccess(INITIAL_ACCESS_STATE, { type: "PLAINTEXT_RECOVERED", evidence: unlock }),
    ).toThrow(IllegalTransitionError);
  });

  it("REFUSES to unlock straight from LICENSE_VERIFIED (no read was performed)", () => {
    let s = reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" });
    s = reduceAccess(s, { type: "LICENSE_CONFIRMED", evidence: verification });

    expect(() =>
      reduceAccess(s, { type: "PLAINTEXT_RECOVERED", evidence: unlock }),
    ).toThrow(IllegalTransitionError);
  });

  it("REFUSES to verify a license without going through CHECKING", () => {
    expect(() =>
      reduceAccess(INITIAL_ACCESS_STATE, { type: "LICENSE_CONFIRMED", evidence: verification }),
    ).toThrow(IllegalTransitionError);
  });

  it("REFUSES a zero-byte recovery — an empty payload is not an unlock", () => {
    let s = reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" });
    s = reduceAccess(s, { type: "LICENSE_CONFIRMED", evidence: verification });
    s = reduceAccess(s, { type: "READ_REQUESTED" });

    expect(() =>
      reduceAccess(s, {
        type: "PLAINTEXT_RECOVERED",
        evidence: { ...unlock, plaintextBytes: 0 },
      }),
    ).toThrow(/positive recovered byte count/);
  });

  it("REFUSES to start a read before the license is verified", () => {
    expect(() =>
      reduceAccess(INITIAL_ACCESS_STATE, { type: "READ_REQUESTED" }),
    ).toThrow(IllegalTransitionError);
  });

  it("reaches UNLOCKED from exactly one (phase, event) pair — exhaustively", () => {
    // The strongest available statement: enumerate every phase and every event, and
    // assert the ONLY combination that yields UNLOCKED is (ACCESSING, PLAINTEXT_RECOVERED).
    // A transition the machine refuses throws, which is itself proof it did not unlock.
    const states: AccessState[] = [
      INITIAL_ACCESS_STATE,
      reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" }),
      reduceAccess(reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" }), {
        type: "LICENSE_ABSENT",
        evidence: {
          wallet: WALLET,
          chainId: 1315,
          vaultUuid: 42,
          basis: "read() reverted in LicenseReadCondition",
          checkedAt: new Date("2026-10-05T00:00:00Z").toISOString(),
        },
      }),
      reduceAccess(reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" }), {
        type: "LICENSE_CONFIRMED",
        evidence: verification,
      }),
      reduceAccess(
        reduceAccess(reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" }), {
          type: "LICENSE_CONFIRMED",
          evidence: verification,
        }),
        { type: "READ_REQUESTED" },
      ),
      reachUnlocked(),
      { phase: "VERIFICATION_ERROR", failure: { kind: "INFRASTRUCTURE_FAILURE", detail: "x" } },
    ];

    // Every phase of build-spec §11 is represented — otherwise this proves nothing.
    expect(new Set(states.map((s) => s.phase)).size).toBe(7);

    const events: AccessEvent[] = [
      { type: "VERIFY_REQUESTED" },
      { type: "LICENSE_CONFIRMED", evidence: verification },
      {
        type: "LICENSE_ABSENT",
        evidence: {
          wallet: WALLET,
          chainId: 1315,
          vaultUuid: 42,
          basis: "simulateContract reverted with ConditionNotMet",
          checkedAt: new Date("2026-10-05T00:00:00Z").toISOString(),
        },
      },
      { type: "VERIFICATION_FAILED", failure: { kind: "INFRASTRUCTURE_FAILURE", detail: "x" } },
      { type: "READ_REQUESTED" },
      { type: "PLAINTEXT_RECOVERED", evidence: unlock },
      { type: "RESET" },
    ];

    const unlockedBy: string[] = [];

    for (const state of states) {
      for (const event of events) {
        let next: AccessState;
        try {
          next = reduceAccess(state, event);
        } catch (error) {
          // A refused transition cannot be an unlock. Anything other than the two
          // documented refusals is a real bug worth surfacing.
          expect(error).toBeInstanceOf(IllegalTransitionError);
          continue;
        }
        if (next.phase === "UNLOCKED") {
          unlockedBy.push(`${state.phase} + ${event.type}`);
        }
      }
    }

    expect(unlockedBy).toEqual(["ACCESSING + PLAINTEXT_RECOVERED"]);
  });
});

describe("failure semantics (build-spec §17 and §11)", () => {
  it("maps ONLY an authorization failure to NO_LICENSE", () => {
    expect(phaseForFailure("AUTHORIZATION_FAILURE")).toBe("NO_LICENSE");

    for (const kind of [
      "INFRASTRUCTURE_FAILURE",
      "USER_CANCELLED",
      "TRANSACTION_FAILED",
      "DECRYPTION_FAILED",
      "WRONG_NETWORK",
    ] as const) {
      expect(phaseForFailure(kind)).toBe("VERIFICATION_ERROR");
    }
  });

  it("REFUSES to route a non-authorization failure into NO_LICENSE", () => {
    const s = reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" });

    expect(() =>
      reduceAccess(s, {
        type: "VERIFICATION_FAILED",
        failure: { kind: "AUTHORIZATION_FAILURE", detail: "guessed" },
      }),
    ).toThrow(IllegalTransitionError);
  });

  it("put a timeout in VERIFICATION_ERROR — never in NO_LICENSE", () => {
    const failure = classifyThrownError(new Error("Request timed out after 30000ms"));
    expect(failure.kind).toBe("INFRASTRUCTURE_FAILURE");

    const s = reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" });
    const next = reduceAccess(s, { type: "VERIFICATION_FAILED", failure });

    expect(next.phase).toBe("VERIFICATION_ERROR");
    expect(isRejected(next)).toBe(false);
    expect(isErrored(next)).toBe(true);
  });

  it("classifies a wallet rejection as USER_CANCELLED, not as a missing license", () => {
    const err = new Error("User rejected the request.");
    err.name = "UserRejectedRequestError";
    expect(classifyThrownError(err).kind).toBe("USER_CANCELLED");
  });

  it("classifies an RPC outage as an infrastructure failure", () => {
    expect(classifyThrownError(new Error("fetch failed")).kind).toBe(
      "INFRASTRUCTURE_FAILURE",
    );
  });

  it("classifies a chain revert as TRANSACTION_FAILED", () => {
    expect(
      classifyThrownError(new Error("execution reverted: ConditionNotMet")).kind,
    ).toBe("TRANSACTION_FAILED");
  });

  it("classifies a partial-decryption shortfall as DECRYPTION_FAILED", () => {
    const err = new Error("not enough partials");
    err.name = "InsufficientPartialsError";
    expect(classifyThrownError(err).kind).toBe("DECRYPTION_FAILED");
  });

  it("classifies a wrong network as WRONG_NETWORK", () => {
    const err = new Error("Wrong network");
    err.name = "WrongNetworkError";
    expect(classifyThrownError(err).kind).toBe("WRONG_NETWORK");
  });

  it("never classifies a bare unknown error as an authorization failure", () => {
    expect(classifyThrownError(new Error("???")).kind).not.toBe(
      "AUTHORIZATION_FAILURE",
    );
    expect(classifyThrownError(undefined).kind).not.toBe("AUTHORIZATION_FAILURE");
  });
});

describe("NO_LICENSE requires evidence", () => {
  it("only accepts a rejection that names its basis", () => {
    const s = reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" });

    const next = reduceAccess(s, {
      type: "LICENSE_ABSENT",
      evidence: {
        wallet: WALLET,
        chainId: 1315,
        vaultUuid: 42,
        basis: "read() reverted in LicenseReadCondition",
        checkedAt: new Date().toISOString(),
      },
    });

    expect(next.phase).toBe("NO_LICENSE");
    expect(isRejected(next)).toBe(true);
    if (isRejected(next)) {
      // The basis is mandatory — a rejection must be able to say why.
      expect(next.evidence.basis).toContain("reverted");
    }
  });
});

describe("reset and re-validation", () => {
  it("RESET returns to LOCKED from any phase, so a refresh re-verifies", () => {
    const unlocked = reachUnlocked();
    expect(reduceAccess(unlocked, { type: "RESET" }).phase).toBe("LOCKED");
    expect(
      reduceAccess({ phase: "VERIFICATION_ERROR", failure: { kind: "INFRASTRUCTURE_FAILURE", detail: "x" } }, {
        type: "RESET",
      }).phase,
    ).toBe("LOCKED");
  });
});

describe("phase labels", () => {
  it("uses the exact product microcopy and never claims success weakly", () => {
    expect(phaseLabel("UNLOCKED")).toBe("ACCESS GRANTED");
    expect(phaseLabel("LICENSE_VERIFIED")).toBe("LICENSE VERIFIED");
    expect(phaseLabel("NO_LICENSE")).toBe("ACCESS RESTRICTED");
    expect(phaseLabel("VERIFICATION_ERROR")).toBe("LICENSE COULD NOT BE VERIFIED");
  });
});
