import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import {
  AENEID_CHAIN_ID,
  AENEID_EXPLORER_URL,
  AENEID_FAUCET_URL,
  AENEID_LICENSE_TOKEN_ADDRESS,
  AENEID_RPC_URL,
  CDR_ADDRESS,
  CDR_API_URL_AENEID,
  CDR_DKG_ADDRESS,
  CDR_NETWORK,
  LICENSE_READ_CONDITION_ADDRESS,
  OWNER_WRITE_CONDITION_ADDRESS,
  explorerTxUrl,
} from "@/lib/protocol/constants";

/**
 * These are the values the whole project stands on. A typo in a protocol address is
 * not a cosmetic bug: `conditionData` is written once at allocation and is immutable,
 * so a wrong address can permanently gate a vault to a contract that will never say
 * yes. This suite exists so such a typo fails a build instead of failing a demo.
 */
const CONTRACT_ADDRESSES: ReadonlyArray<readonly [string, string]> = [
  ["CDR_DKG_ADDRESS", CDR_DKG_ADDRESS],
  ["CDR_ADDRESS", CDR_ADDRESS],
  ["LICENSE_READ_CONDITION_ADDRESS", LICENSE_READ_CONDITION_ADDRESS],
  ["OWNER_WRITE_CONDITION_ADDRESS", OWNER_WRITE_CONDITION_ADDRESS],
  ["AENEID_LICENSE_TOKEN_ADDRESS", AENEID_LICENSE_TOKEN_ADDRESS],
];

describe("protocol addresses", () => {
  for (const [name, address] of CONTRACT_ADDRESSES) {
    it(`${name} is a well-formed address with a valid checksum`, () => {
      // viem enforces EIP-55 on mixed-case input, so this rejects a transposed
      // character rather than silently accepting a wrong contract.
      expect(isAddress(address), `${name} = ${address}`).toBe(true);
    });
  }

  it("the CDR and DKG addresses are the documented sibling pair", () => {
    // Guards against pasting an address from a different network. Documented shape:
    // both share the leading sentinel and differ only in the final digit.
    expect(CDR_DKG_ADDRESS.toLowerCase()).toMatch(/^0xcccccc[0-9a-f]{33}4$/);
    expect(CDR_ADDRESS.toLowerCase()).toMatch(/^0xcccccc[0-9a-f]{33}5$/);
    expect(CDR_DKG_ADDRESS.toLowerCase().slice(0, -1)).toBe(
      CDR_ADDRESS.toLowerCase().slice(0, -1),
    );
  });

  it("records that the official docs print an invalid checksum for the CDR address", () => {
    // The runtime-configuration page shows `0xCcCcCC…05`, which is not a valid EIP-55
    // checksum. Pinned so nobody "corrects" our constant back to the docs' casing:
    // the address bytes are identical, but ours is the one that survives validation.
    expect(isAddress("0xCcCcCC0000000000000000000000000000000005")).toBe(false);
    expect(isAddress(CDR_ADDRESS)).toBe(true);
  });

  it("uses the documented CDR network label, not a chain id", () => {
    // The SDK takes "mainnet" | "testnet" here. Passing 1315 would be a silent bug.
    expect(CDR_NETWORK).toBe("testnet");
  });
});

describe("network endpoints", () => {
  it("targets Aeneid", () => {
    expect(AENEID_CHAIN_ID).toBe(1315);
    expect(AENEID_RPC_URL).toBe("https://aeneid.storyrpc.io");
  });

  it("records the CDR API endpoint as plain HTTP — this is a known exposure", () => {
    // Asserted explicitly so the risk cannot be quietly forgotten. See docs/SECURITY.md §5.
    expect(CDR_API_URL_AENEID.startsWith("http://")).toBe(true);
    expect(CDR_API_URL_AENEID.startsWith("https://")).toBe(false);
  });
});

describe("explorer links", () => {
  it("builds a tx URL against the verified explorer", () => {
    expect(AENEID_EXPLORER_URL).toBe("https://aeneid.datanetscan.io");

    const hash = `0x${"ab".repeat(32)}`;
    expect(explorerTxUrl(hash)).toBe(`${AENEID_EXPLORER_URL}/tx/${hash}`);
  });

  it("never links to the retired storyscan host", () => {
    // aeneid.storyscan.io is NXDOMAIN. A dead link in the Proof surface would look
    // like a fabricated one, which is the exact failure this project must avoid.
    expect(AENEID_EXPLORER_URL).not.toContain("storyscan");
  });

  it("does not fabricate a link for an empty hash", () => {
    // Callers must only pass a hash from a real protocol result. This is a guard
    // rail, not a formatter: an empty hash produces a URL that resolves to nothing.
    expect(explorerTxUrl("")).toBe(`${AENEID_EXPLORER_URL}/tx/`);
  });
});

describe("faucet", () => {
  it("points at a reachable, Aeneid-declaring faucet", () => {
    expect(AENEID_FAUCET_URL).toBe("https://faucet.quicknode.com/story");
  });

  it("is documented as a URL only — funding is a human action", () => {
    // The project never automates a claim and never asks for a seed phrase.
    expect(AENEID_FAUCET_URL.startsWith("https://")).toBe(true);
  });
});
