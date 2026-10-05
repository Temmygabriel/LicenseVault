import { describe, expect, it } from "vitest";
import {
  EmptyLicenseTokenListError,
  InvalidAddressError,
  decodeLicenseAccessAuxData,
  decodeLicenseReadConditionData,
  encodeLicenseAccessAuxData,
  encodeLicenseReadConditionData,
  encodeOwnerWriteConditionData,
  decodeOwnerWriteConditionData,
} from "@/lib/protocol/conditions";

// Values from docs/PROTOCOL_DISCOVERY.md — verified, not invented.
const LICENSE_TOKEN = "0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC" as const;
const IP_ID = "0x3Aa560C9072E0D4A1443CD192745C24A176b4925" as const;
const WRITER = "0x7F000000000000000000000000000000000091C2" as const;

/** Left-pad a 20-byte address into a 32-byte ABI word. */
function word(address: string): string {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

describe("encodeLicenseReadConditionData", () => {
  it("ABI-encodes (address licenseToken, address ipId) — the documented condition format", () => {
    const encoded = encodeLicenseReadConditionData({
      licenseTokenAddress: LICENSE_TOKEN,
      ipId: IP_ID,
    });

    // Two static address words, no length prefix, no offset.
    expect(encoded).toBe(`0x${word(LICENSE_TOKEN)}${word(IP_ID)}`);
    expect(encoded).toHaveLength(2 + 64 * 2);
  });

  it("round-trips through the decoder", () => {
    const encoded = encodeLicenseReadConditionData({
      licenseTokenAddress: LICENSE_TOKEN,
      ipId: IP_ID,
    });

    const decoded = decodeLicenseReadConditionData(encoded);

    expect(decoded.licenseTokenAddress.toLowerCase()).toBe(LICENSE_TOKEN.toLowerCase());
    expect(decoded.ipId.toLowerCase()).toBe(IP_ID.toLowerCase());
  });

  it("rejects a malformed IP id rather than encoding garbage", () => {
    expect(() =>
      encodeLicenseReadConditionData({
        licenseTokenAddress: LICENSE_TOKEN,
        ipId: "0xnot-an-address",
      }),
    ).toThrow(InvalidAddressError);
  });

  it("rejects a malformed license token address", () => {
    expect(() =>
      encodeLicenseReadConditionData({
        licenseTokenAddress: "",
        ipId: IP_ID,
      }),
    ).toThrow(InvalidAddressError);
  });
});

describe("encodeOwnerWriteConditionData", () => {
  it("ABI-encodes a single address", () => {
    const encoded = encodeOwnerWriteConditionData(WRITER);
    expect(encoded).toBe(`0x${word(WRITER)}`);
  });

  it("round-trips through the decoder", () => {
    const decoded = decodeOwnerWriteConditionData(
      encodeOwnerWriteConditionData(WRITER),
    );
    expect(decoded.writer.toLowerCase()).toBe(WRITER.toLowerCase());
  });
});

describe("encodeLicenseAccessAuxData", () => {
  it("ABI-encodes uint256[] in the documented per-read format", () => {
    const encoded = encodeLicenseAccessAuxData([2645n, 7n]);

    // Dynamic array: offset word (0x20), length word (2), then two element words.
    const offset = "20".padStart(64, "0");
    const length = "02".padStart(64, "0");
    const first = (2645n).toString(16).padStart(64, "0");
    const second = (7n).toString(16).padStart(64, "0");

    expect(encoded).toBe(`0x${offset}${length}${first}${second}`);
  });

  it("encodes a single-token proof (the common demo case)", () => {
    const encoded = encodeLicenseAccessAuxData([1n]);
    const decoded = decodeLicenseAccessAuxData(encoded);
    expect(decoded.licenseTokenIds).toEqual([1n]);
  });

  it("REFUSES an empty token list — an empty list is not a license proof", () => {
    expect(() => encodeLicenseAccessAuxData([])).toThrow(EmptyLicenseTokenListError);
  });

  it("refuses a negative token id", () => {
    expect(() => encodeLicenseAccessAuxData([-1n])).toThrow();
  });

  it("round-trips large token ids without precision loss", () => {
    const huge = 2n ** 255n + 12345n;
    const decoded = decodeLicenseAccessAuxData(encodeLicenseAccessAuxData([huge]));
    expect(decoded.licenseTokenIds).toEqual([huge]);
  });
});
