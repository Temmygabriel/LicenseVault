import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CANONICAL_VAULT } from "@/lib/protocol/canonical-vault";

/**
 * WHY THESE ASSERTIONS EXIST AT ALL
 *
 * `lib/protocol/canonical-vault.ts` pins the identifiers the verification route asks the chain
 * about. Those identifiers are also in the committed evidence. Two copies of one fact is one
 * copy too many, so this test re-derives every pinned value from the JSON on every run: if the
 * evidence is regenerated and the constant is not updated, the build fails here rather than
 * quietly checking a vault nobody can see the evidence for.
 *
 * The failure this prevents is specific and bad: a `LICENSE VERIFIED` from a live `eth_call`
 * that answers about the wrong vault is a true statement about the wrong thing, and it would
 * look exactly like success.
 */

const RUN_DIR = join(process.cwd(), "evidence", "licensevault-aeneid-001");

function readArtifact(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(RUN_DIR, file), "utf8")) as Record<string, unknown>;
}

describe("the pinned canonical vault matches the committed evidence", () => {
  it("takes its uuid and read condition from vault.json", () => {
    const vault = readArtifact("vault.json");
    const condition = vault["readCondition"] as Record<string, unknown>;
    const decoded = condition["decoded"] as Record<string, unknown>;

    expect(vault["uuid"]).toBe(CANONICAL_VAULT.uuid);
    expect(vault["chainId"]).toBe(CANONICAL_VAULT.chainId);
    expect(condition["address"]).toBe(CANONICAL_VAULT.readConditionAddress);
    expect(condition["conditionData"]).toBe(CANONICAL_VAULT.conditionData);
    expect(decoded["ipId"]).toBe(CANONICAL_VAULT.ipId);
    expect(decoded["licenseTokenAddress"]).toBe(CANONICAL_VAULT.licenseTokenAddress);
  });

  it("takes its license token, terms and holder from license-token.json", () => {
    const token = readArtifact("license-token.json");

    expect(token["licenseTokenId"]).toBe(String(CANONICAL_VAULT.licenseTokenId));
    expect(token["licenseTokenContract"]).toBe(CANONICAL_VAULT.licenseTokenAddress);
    expect(token["licensorIpId"]).toBe(CANONICAL_VAULT.ipId);
    expect(token["licenseTermsId"]).toBe(String(CANONICAL_VAULT.licenseTermsId));
    expect(token["holder"]).toBe(CANONICAL_VAULT.licenseHolder);
  });

  it("keeps the conditionData consistent with the addresses it encodes", () => {
    // The condition data is `abi.encode(address, address)` and is immutable once written. Its
    // two halves must still decode to the licence contract and the IP asset, or the gate the
    // route asks about is not the gate the evidence describes.
    const body = CANONICAL_VAULT.conditionData.slice(2);
    expect(body).toHaveLength(128);

    const first = `0x${body.slice(24, 64)}`;
    const second = `0x${body.slice(88, 128)}`;

    expect(first.toLowerCase()).toBe(CANONICAL_VAULT.licenseTokenAddress.toLowerCase());
    expect(second.toLowerCase()).toBe(CANONICAL_VAULT.ipId.toLowerCase());
  });

  it("names an evidence directory that exists", () => {
    expect(CANONICAL_VAULT.runId).toBe("licensevault-aeneid-001");
    expect(() => readArtifact("vault.json")).not.toThrow();
  });
});
