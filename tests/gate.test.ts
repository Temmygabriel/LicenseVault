import { describe, expect, it } from "vitest";

import {
  KNOWN_CONDITION_REVERTS,
  interpretConditionObservation,
  revertSelectorFromMessage,
  type ProbeVerdict,
} from "@/lib/protocol/gate";

/**
 * These tests pin the rule that BUILD 2 broke and had to be rebuilt around:
 *
 *   a revert is not a denial.
 *
 * Every case below is a shape that was OBSERVED on live Aeneid on 2026-10-07 (see
 * `evidence/licensevault-aeneid-001/gate-probes.json` for the raw viem messages), so a
 * regression here is a regression against measured protocol behaviour rather than against
 * an assumption.
 */

/** The real message the node returned for a token id that was never minted. */
const NONEXISTENT_TOKEN_MESSAGE = `The contract function "checkReadCondition" reverted with the following signature:
0x7e273289

Unable to decode signature "0x7e273289" as it was not found on the provided ABI.
Details: execution reverted
Version: viem@2.57.3`;

/** The real message the node returned for empty accessAuxData. */
const EMPTY_AUX_MESSAGE = `The contract function "checkReadCondition" reverted.

Contract Call:
  address:   0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3
  function:  checkReadCondition(uint32 uuid, bytes accessAuxData, bytes conditionData, address caller)

Details: execution reverted
Version: viem@2.57.3`;

describe("revertSelectorFromMessage", () => {
  it("finds the 4-byte selector in a viem revert message", () => {
    expect(revertSelectorFromMessage(NONEXISTENT_TOKEN_MESSAGE)).toBe("0x7e273289");
  });

  it("returns null when the node supplied no revert data", () => {
    expect(revertSelectorFromMessage(EMPTY_AUX_MESSAGE)).toBeNull();
  });

  it("ignores a selector-shaped run that is part of a longer hex word", () => {
    // The \b is what prevents matching the first 8 hex chars of a 64-char hash.
    expect(revertSelectorFromMessage(`hash 0x${"a".repeat(64)} reverted`)).toBeNull();
  });
});

describe("interpretConditionObservation", () => {
  it("treats a returned true as ALLOWED", () => {
    expect(interpretConditionObservation(true, null)).toEqual({ kind: "ALLOWED" });
  });

  it("treats a returned false as a DENIAL — the only clean denial shape", () => {
    const verdict: ProbeVerdict = interpretConditionObservation(false, null);
    expect(verdict.kind).toBe("DENIED");
  });

  it("does NOT treat ERC721NonexistentToken as a denial", () => {
    const verdict = interpretConditionObservation(null, new Error(NONEXISTENT_TOKEN_MESSAGE));

    expect(verdict.kind).toBe("REJECTED_REQUEST");
    expect(verdict.kind).not.toBe("DENIED");
    // The reason must be legible, because this is what stops a refused request from being
    // shown to a licensee as "you have no licence".
    if (verdict.kind === "REJECTED_REQUEST") {
      expect(verdict.basis).toContain("ERC721NonexistentToken");
    }
  });

  it("does NOT treat an opaque revert as a denial", () => {
    const verdict = interpretConditionObservation(null, new Error(EMPTY_AUX_MESSAGE));
    expect(verdict.kind).toBe("REJECTED_REQUEST");
  });

  it("refuses to guess when the revert carries an unknown selector", () => {
    // A selector we do not recognise means the contract changed. Reading it as a denial
    // would be inventing a verdict the protocol never gave.
    const verdict = interpretConditionObservation(null, new Error("reverted 0xdeadbeef"));
    expect(verdict.kind).toBe("UNKNOWN");
  });

  it("refuses to guess when there is neither a value nor an error", () => {
    expect(interpretConditionObservation(null, null).kind).toBe("UNKNOWN");
  });

  it("survives a non-Error throw", () => {
    const verdict = interpretConditionObservation(null, "execution reverted");
    expect(verdict.kind).toBe("REJECTED_REQUEST");
  });

  it("never returns ALLOWED from an error path", () => {
    for (const thrown of [
      new Error(NONEXISTENT_TOKEN_MESSAGE),
      new Error(EMPTY_AUX_MESSAGE),
      new Error("reverted 0xdeadbeef"),
      "string throw",
      null,
      undefined,
    ]) {
      expect(interpretConditionObservation(null, thrown).kind).not.toBe("ALLOWED");
    }
  });
});

describe("KNOWN_CONDITION_REVERTS", () => {
  it("documents the one measured custom error and what it means", () => {
    expect(KNOWN_CONDITION_REVERTS).toHaveLength(1);
    const [entry] = KNOWN_CONDITION_REVERTS;
    expect(entry?.selector).toBe("0x7e273289");
    expect(entry?.name).toBe("ERC721NonexistentToken(uint256)");
    // The meaning must say it is about the request, not the caller.
    expect(entry?.meaning).toMatch(/never reached an authorization decision/i);
  });

  it("uses a selector that is real hex and not the empty-selector form", () => {
    for (const entry of KNOWN_CONDITION_REVERTS) {
      expect(entry.selector).toMatch(/^0x[0-9a-fA-F]{8}$/);
      expect(entry.selector).not.toBe("0x00000000");
    }
  });
});
