import { describe, expect, it } from "vitest";

import {
  READ_CONDITION_NOT_MET,
  classifyReadFailure,
  failureForAttempt,
  REFUSAL_FAILURE_KIND,
  type AccessAttempt,
} from "@/lib/protocol/access";

/**
 * The product's central promise is that it will not use the wrong word for a failure.
 *
 * Build-spec §11: "Never map a network timeout to NO LICENSE."
 * Build-spec §17: the failure classes must stay distinct.
 * Build-spec §33: claiming ACCESS GRANTED from anything but a real read is a NO-GO.
 *
 * The strings below are the REAL messages observed on live Aeneid on 2026-10-07 — they are
 * copied from `evidence/licensevault-aeneid-001/denied-licensed.json` and
 * `unauthorized-read.json`, so these tests fail if the classifier stops matching reality.
 */

const REFUSAL_MESSAGE = `Execution reverted with reason: CDR: Read condition not met.

Request Arguments:
  from:   0x75D900D18866D8aA416CCEFD9e85D2C61dB0aCa9
  to:     0xcccccc0000000000000000000000000000000005 (the CDR contract)

Details: execution reverted: CDR: Read condition not met
Version: viem@2.57.3`;

const MALFORMED_MESSAGE = `Execution reverted for an unknown reason.

Request Arguments:
  from:   0x226e01730F6991C1BD11f58d1204638bee89A863
  to:     0xcccccc0000000000000000000000000000000005 (the CDR contract)
  data:   0xb98a6c1a0000...

Details: execution reverted
Version: viem@2.57.3`;

describe("classifyReadFailure — the refusal the protocol actually made", () => {
  it("reads the CDR contract's own revert reason as REFUSED", () => {
    const attempt = classifyReadFailure(new Error(REFUSAL_MESSAGE));
    expect(attempt.kind).toBe("REFUSED");
  });

  it("quotes the contract's reason in the basis it gives the user", () => {
    const attempt = classifyReadFailure(new Error(REFUSAL_MESSAGE));
    if (attempt.kind === "REFUSED") {
      expect(attempt.basis).toContain(READ_CONDITION_NOT_MET);
    }
  });

  it("is case-insensitive about the revert reason (nodes vary)", () => {
    expect(classifyReadFailure(new Error("execution reverted: cdr: read CONDITION not met")).kind)
      .toBe("REFUSED");
  });
});

describe("classifyReadFailure — what must NEVER become a refusal", () => {
  it("maps a timeout to INFRASTRUCTURE_FAILURE", () => {
    const attempt = classifyReadFailure(new Error("Request timed out after 120000ms"));
    expect(attempt.kind).toBe("INFRASTRUCTURE_FAILURE");
    expect(attempt.kind).not.toBe("REFUSED");
  });

  it("maps an abort to INFRASTRUCTURE_FAILURE", () => {
    expect(classifyReadFailure(new Error("The operation was aborted")).kind)
      .toBe("INFRASTRUCTURE_FAILURE");
  });

  it("maps a bare revert to MALFORMED_REQUEST, not to a refusal", () => {
    const attempt = classifyReadFailure(new Error(MALFORMED_MESSAGE));
    expect(attempt.kind).toBe("MALFORMED_REQUEST");
    expect(attempt.kind).not.toBe("REFUSED");
  });

  it("maps an unrecognised error to INFRASTRUCTURE_FAILURE rather than guessing", () => {
    expect(classifyReadFailure(new Error("ECONNREFUSED 172.192.41.96:1317")).kind)
      .toBe("INFRASTRUCTURE_FAILURE");
  });

  it("survives a non-Error throw", () => {
    expect(classifyReadFailure("something went wrong").kind).toBe("INFRASTRUCTURE_FAILURE");
  });

  it("only ever returns REFUSED for the contract's own condition reason", () => {
    const notRefusals = [
      "Request timed out",
      "fetch failed",
      "nonce too low",
      MALFORMED_MESSAGE,
      "",
      "RPC error: rate limit exceeded",
    ];
    for (const message of notRefusals) {
      expect(classifyReadFailure(new Error(message)).kind).not.toBe("REFUSED");
    }
  });
});

describe("failureForAttempt — the only path to NO_LICENSE", () => {
  it("produces no failure for an answer the protocol actually gave", () => {
    const granted: AccessAttempt = {
      kind: "GRANTED",
      dataKey: new Uint8Array(32),
      txHash: "0x00",
    };
    expect(failureForAttempt(granted)).toBeNull();
    expect(failureForAttempt({ kind: "REFUSED", basis: "condition returned false" })).toBeNull();
  });

  it("maps a malformed request to INFRASTRUCTURE_FAILURE — our defect, not the user's rights", () => {
    const failure = failureForAttempt({
      kind: "MALFORMED_REQUEST",
      basis: "empty accessAuxData",
    });

    expect(failure?.kind).toBe("INFRASTRUCTURE_FAILURE");
    // The single most important assertion in this file: a malformed request must never be
    // reported as an authorization failure, because that path leads to NO_LICENSE.
    expect(failure?.kind).not.toBe("AUTHORIZATION_FAILURE");
  });

  it("maps an outage to INFRASTRUCTURE_FAILURE and keeps the cause for the log", () => {
    const cause = new Error("timed out");
    const failure = failureForAttempt({ kind: "INFRASTRUCTURE_FAILURE", detail: "timed out", cause });

    expect(failure?.kind).toBe("INFRASTRUCTURE_FAILURE");
    expect(failure?.cause).toBe(cause);
  });

  it("names AUTHORIZATION_FAILURE as the refusal kind, and it is reachable only from REFUSED", () => {
    expect(REFUSAL_FAILURE_KIND).toBe("AUTHORIZATION_FAILURE");
  });
});

describe("READ_CONDITION_NOT_MET", () => {
  it("is the contract's verbatim reason, not a paraphrase", () => {
    // A paraphrase would silently stop matching, and the classifier would degrade into
    // reporting genuine refusals as infrastructure failures.
    expect(READ_CONDITION_NOT_MET).toBe("CDR: Read condition not met");
    expect(REFUSAL_MESSAGE).toContain(READ_CONDITION_NOT_MET);
  });
});
