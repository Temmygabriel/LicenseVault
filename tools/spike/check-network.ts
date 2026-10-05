/**
 * BUILD 2 — step 1: verify network + protocol deployment.
 *
 * This is the first half of the BUILD 2 harness. It performs NO transaction and needs NO
 * wallet or private key. It re-runs, as code, the same checks that produced
 * `docs/PROTOCOL_DISCOVERY.md` — so the discovery can be re-verified at any time rather
 * than being trusted once and forgotten.
 *
 * Run:  npm run spike:check
 *
 * It exits non-zero if any check fails, so it is safe to wire into CI later.
 */

import { createPublicClient, http, getAddress } from "viem";
import {
  AENEID_CHAIN_ID,
  AENEID_RPC_URL,
  CDR_ADDRESS,
  CDR_DKG_ADDRESS,
  LICENSE_READ_CONDITION_ADDRESS,
  OWNER_WRITE_CONDITION_ADDRESS,
  AENEID_LICENSE_TOKEN_ADDRESS,
} from "../../lib/protocol/constants";

interface CheckResult {
  name: string;
  status: "PASS" | "FAIL";
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, status: ok ? "PASS" : "FAIL", detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}`);
  console.log(`         ${detail}`);
}

async function main(): Promise<void> {
  const rpcUrl = process.env.STORY_RPC_URL ?? AENEID_RPC_URL;

  console.log("");
  console.log("LICENSEVAULT — BUILD 2 network check");
  console.log("───────────────────────────────────────────────────────────");
  console.log(`  rpc: ${rpcUrl}`);
  console.log("");

  const client = createPublicClient({ transport: http(rpcUrl) });

  // ── 1. Chain identity ──────────────────────────────────────────────────────
  let chainId: number | null = null;
  try {
    chainId = await client.getChainId();
    record(
      "chain id",
      chainId === AENEID_CHAIN_ID,
      chainId === AENEID_CHAIN_ID
        ? `chain ${chainId} — matches expected Story Aeneid ${AENEID_CHAIN_ID}`
        : `chain ${chainId} — MISMATCH, expected ${AENEID_CHAIN_ID}`,
    );
  } catch (error) {
    record(
      "chain id",
      false,
      `could not read chain id: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // ── 2. Block height (proves the RPC is actually serving, not just answering) ─
  try {
    const blockNumber = await client.getBlockNumber();
    record("rpc liveness", blockNumber > 0n, `head block ${blockNumber}`);
  } catch (error) {
    record(
      "rpc liveness",
      false,
      `could not read block number: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // ── 3. Contracts have code at the documented addresses ─────────────────────
  const contracts: Array<[string, string]> = [
    ["DKG contract", CDR_DKG_ADDRESS],
    ["CDR contract", CDR_ADDRESS],
    ["LicenseReadCondition", LICENSE_READ_CONDITION_ADDRESS],
    ["OwnerWriteCondition", OWNER_WRITE_CONDITION_ADDRESS],
    ["LicenseToken", AENEID_LICENSE_TOKEN_ADDRESS],
  ];

  for (const [label, address] of contracts) {
    try {
      const code = await client.getCode({ address: getAddress(address) });
      const deployed = code !== undefined && code !== "0x";
      record(
        label,
        deployed,
        deployed
          ? `${address} — deployed (${(code.length - 2) / 2} bytes)`
          : `${address} — NO CODE AT THIS ADDRESS`,
      );
    } catch (error) {
      record(
        label,
        false,
        `${address} — lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ── 4. CDR allocation fee is readable (proves the CDR ABI is current) ──────
  // If this selector no longer exists, the CDR ABI has changed and the build
  // contract requires us to stop rather than guess a new one.
  try {
    const fee = await client.readContract({
      address: getAddress(CDR_ADDRESS),
      abi: [
        {
          name: "allocateFee",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "uint256" }],
        },
      ] as const,
      functionName: "allocateFee",
    });
    record(
      "CDR allocateFee()",
      true,
      `readable — ${fee} wei (this is a live value; it is never hard-coded)`,
    );
  } catch (error) {
    record(
      "CDR allocateFee()",
      false,
      `could not read allocateFee: ${error instanceof Error ? error.message : String(error)}. ` +
        "If this fails, the CDR ABI has changed — re-verify before proceeding.",
    );
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => r.status === "FAIL");

  console.log("");
  console.log("───────────────────────────────────────────────────────────");
  console.log(`  NETWORK: ${chainId === AENEID_CHAIN_ID ? "PASS" : "FAIL"}`);
  console.log(
    `  CONTRACTS: ${failed.length === 0 ? "PASS" : `FAIL (${failed.length})`}`,
  );
  console.log(`  FINAL RESULT: ${failed.length === 0 ? "PASS" : "FAIL"}`);
  console.log("───────────────────────────────────────────────────────────");
  console.log("");
  console.log(
    "  Note: this checks the network and the deployment only. It performs no",
  );
  console.log(
    "  transaction. The gated read is proven by the next harness, not this one.",
  );
  console.log("");

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("");
  console.error("  Harness crashed:", error);
  console.error("");
  process.exit(1);
});
