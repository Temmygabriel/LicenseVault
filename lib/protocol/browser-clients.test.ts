import { describe, expect, it } from "vitest";

import { parsePredictedMintingFee } from "./browser-clients";

describe("parsePredictedMintingFee", () => {
  it("reads the documented Story SDK tokenAmount field", () => {
    expect(parsePredictedMintingFee({ currencyToken: "0x0000000000000000000000000000000000000000", tokenAmount: 0n })).toBe(0n);
    expect(parsePredictedMintingFee({ currencyToken: "0x0000000000000000000000000000000000000000", tokenAmount: "125" })).toBe(125n);
  });

  it("supports the legacy tokenMintingFee response field", () => {
    expect(parsePredictedMintingFee({ tokenMintingFee: "0" })).toBe(0n);
  });

  it("fails closed when the fee is missing or malformed", () => {
    expect(() => parsePredictedMintingFee({ currencyToken: "0x0000000000000000000000000000000000000000" })).toThrow(/fee could not be verified/i);
    expect(() => parsePredictedMintingFee({ tokenAmount: "not-a-number" })).toThrow(/fee could not be verified/i);
    expect(() => parsePredictedMintingFee({ tokenAmount: "-1" })).toThrow(/fee could not be verified/i);
  });
});
