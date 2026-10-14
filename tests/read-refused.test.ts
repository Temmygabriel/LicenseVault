import { describe, expect, it } from "vitest";
import {
  INITIAL_ACCESS_STATE,
  reduceAccess,
  type RejectionEvidence,
  type VerificationEvidence,
} from "@/lib/access/state";

const verification: VerificationEvidence = {
  wallet: "0x226e01730F6991C1BD11f58d1204638bee89A863",
  chainId: 1315,
  ipId: "0x6C6046f021093c54F43663Fad93037E6556Bfdd8",
  licenseTermsId: 2183n,
  licenseTokenIds: [73227n],
  checkedAt: "2026-10-14T00:00:00.000Z",
};
const refusal: RejectionEvidence = {
  wallet: verification.wallet,
  chainId: 1315,
  vaultUuid: 11062,
  basis: "The real CDR read reverted because the caller does not own the presented token.",
  readTxHash: "0xaaec7f41637e65d4f6c55ce66d45399e1798b16716c7f7cfb1aa654ee23cdea9",
  checkedAt: "2026-10-14T00:00:00.000Z",
};

describe("a genuine CDR read refusal stays a license denial", () => {
  it("records a refusal when testing a locked read", () => {
    const checking = reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" });
    const denied = reduceAccess(checking, { type: "READ_REFUSED", evidence: refusal });
    expect(denied.phase).toBe("NO_LICENSE");
    if (denied.phase === "NO_LICENSE") expect(denied.evidence.readTxHash).toBe(refusal.readTxHash);
  });

  it("records a refusal during ACCESSING only with protocol evidence", () => {
    const checking = reduceAccess(INITIAL_ACCESS_STATE, { type: "VERIFY_REQUESTED" });
    const licensed = reduceAccess(checking, { type: "LICENSE_CONFIRMED", evidence: verification });
    const accessing = reduceAccess(licensed, { type: "READ_REQUESTED" });
    expect(reduceAccess(accessing, { type: "READ_REFUSED", evidence: refusal }).phase).toBe("NO_LICENSE");
  });

  it("cannot fabricate a refusal from LOCKED", () => {
    expect(() => reduceAccess(INITIAL_ACCESS_STATE, { type: "READ_REFUSED", evidence: refusal })).toThrow();
  });
});
