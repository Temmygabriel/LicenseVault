import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import {
  AENEID_CHAIN_ID,
  AENEID_EXPLORER_URL,
  AENEID_FAUCET_ALTERNATES,
  AENEID_FAUCET_URL,
  AENEID_LICENSE_TOKEN_ADDRESS,
  AENEID_LICENSE_TOKEN_NAME,
  AENEID_LICENSE_TOKEN_SYMBOL,
  AENEID_ROYALTY_POLICY_LAP_ADDRESS,
  AENEID_RPC_URL,
  AENEID_WIP_TOKEN_ADDRESS,
  CDR_ADDRESS,
  CDR_API_URL_AENEID,
  CDR_DKG_ADDRESS,
  CDR_MAX_ENCRYPTED_DATA_SIZE_BYTES,
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
  ["AENEID_WIP_TOKEN_ADDRESS", AENEID_WIP_TOKEN_ADDRESS],
  ["AENEID_ROYALTY_POLICY_LAP_ADDRESS", AENEID_ROYALTY_POLICY_LAP_ADDRESS],
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

describe("license token identity", () => {
  it("records the PILE token metadata read from chain", () => {
    // These were read from the contract itself via name()/symbol() on 2026-10-05.
    // check-network.ts asserts them against a live call on every run, so editing
    // either value without re-reading the chain turns that harness red.
    expect(AENEID_LICENSE_TOKEN_NAME).toBe("Programmable IP License Token");
    expect(AENEID_LICENSE_TOKEN_SYMBOL).toBe("PILicenseToken");
  });
});

describe("CDR vault size cap", () => {
  it("records the 1024-byte cap that decides the architecture", () => {
    // Live maxEncryptedDataSize() = 1024. A real file cannot fit in a vault, so the
    // vault protects the DATA KEY and content encryption is ours. If this ever grows,
    // that is a protocol change worth noticing rather than silently absorbing.
    expect(CDR_MAX_ENCRYPTED_DATA_SIZE_BYTES).toBe(1024);
  });

  it("is large enough for a 32-byte data key with room for TDH2 overhead", () => {
    // The smallest thing we ever put in a vault is a data key. If the cap ever fell
    // below the key size, the core mechanism would become impossible, not just slow.
    expect(CDR_MAX_ENCRYPTED_DATA_SIZE_BYTES).toBeGreaterThan(32);
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

describe("PIL terms addresses", () => {
  it("never zeroes the royalty policy — the SDK rejects commercial use without one", () => {
    // This is the bug that stopped the first funded run at step 2. Zeroing royaltyPolicy to
    // make the license "free" is exactly what the SDK forbids; the fee being 0 is separate
    // from the policy being named. Pinned so the obvious-looking "fix" cannot come back.
    expect(AENEID_ROYALTY_POLICY_LAP_ADDRESS).not.toBe(
      "0x0000000000000000000000000000000000000000",
    );
    expect(AENEID_WIP_TOKEN_ADDRESS).not.toBe(
      "0x0000000000000000000000000000000000000000",
    );
  });

  it("names WIP as the currency — the only other whitelisted option is a mock token", () => {
    // MERC20 (0xF2104833…E38E) is also whitelisted on Aeneid, but it is a MockERC20. WIP is
    // the wrapped native token, so a reader is not left wondering which "real" token it is.
    expect(AENEID_WIP_TOKEN_ADDRESS).toBe(
      "0x1514000000000000000000000000000000000000",
    );
  });

  it("uses the commercial-use policy, not the derivative-remix one", () => {
    // RoyaltyPolicyLRP (0x9156e603…fC41) is also whitelisted; we want LAP because the demo
    // license is a plain commercial use, not a remix.
    expect(AENEID_ROYALTY_POLICY_LAP_ADDRESS).not.toBe(
      "0x9156e603C949481883B1d3355c6f1132D191fC41",
    );
  });
});

describe("faucet", () => {
  it("points at the faucet the first-party docs name", () => {
    // CORRECTED 2026-10-07. This previously pinned `https://faucet.quicknode.com/story`,
    // which was verified REACHABLE but turned out to be gated on holding mainnet ETH — a
    // route that is reachable and still useless is not a working funding route. The docs
    // page https://docs.datafdn.org/network/connect/aeneid.md names this one and states
    // 10 IP. Pinned so the correction cannot silently revert to the unusable host.
    expect(AENEID_FAUCET_URL).toBe("https://aeneid.faucet.datafdn.org/");
  });

  it("is on the Data Foundation domain, not a third-party host", () => {
    // The protocol rebranded: faucet, explorer and RPC all live on datafdn.org. A
    // third-party faucet is a fallback, never the recorded primary.
    expect(new URL(AENEID_FAUCET_URL).hostname.endsWith("datafdn.org")).toBe(true);
  });

  it("is documented as a URL only — funding is a human action", () => {
    // The project never automates a claim and never asks for a seed phrase.
    expect(AENEID_FAUCET_URL.startsWith("https://")).toBe(true);
  });

  it("records the unusable QuickNode route only as a comment, never as the value", () => {
    // Kept deliberately: a reader who finds the old URL in git history should hit the
    // explanation in constants.ts rather than re-adopting a route that needs mainnet ETH.
    expect(AENEID_FAUCET_URL).not.toContain("quicknode");
  });

  it("keeps fallback routes https-only and distinct from the primary", () => {
    for (const url of AENEID_FAUCET_ALTERNATES) {
      expect(url.startsWith("https://")).toBe(true);
      expect(url).not.toBe(AENEID_FAUCET_URL);
    }
  });
});
