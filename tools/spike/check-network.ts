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
  AENEID_LICENSE_TOKEN_ADDRESS,
  AENEID_LICENSE_TOKEN_NAME,
  AENEID_LICENSE_TOKEN_SYMBOL,
  CDR_ADDRESS,
  CDR_DKG_ADDRESS,
  LICENSE_READ_CONDITION_ADDRESS,
  OWNER_WRITE_CONDITION_ADDRESS,
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

  // ── 4. CDR fee + size getters are readable (proves the CDR ABI is current) ──
  // If these selectors no longer exist, the CDR ABI has changed and the build
  // contract requires us to stop rather than guess a new one.
  const cdrGetters: Array<[string, string, boolean]> = [
    // [label, signature, required]
    ["allocateFee()", "allocateFee()", true],
    ["writeFee()", "writeFee()", true],
    ["readFee()", "readFee()", true],
    ["maxEncryptedDataSize()", "maxEncryptedDataSize()", true],
  ];

  for (const [label, signature, required] of cdrGetters) {
    try {
      const value = await client.readContract({
        address: getAddress(CDR_ADDRESS),
        abi: [
          {
            name: signature.replace("()", ""),
            type: "function",
            stateMutability: "view",
            inputs: [],
            outputs: [{ type: "uint256" }],
          },
        ] as const,
        functionName: signature.replace("()", "") as "allocateFee",
      });
      record(
        `CDR ${label}`,
        true,
        `${value} — live value, never hard-coded` +
          (label === "maxEncryptedDataSize()"
            ? " (hard cap on a vault payload; the vault holds the KEY, not the content)"
            : " wei"),
      );
    } catch (error) {
      record(
        label,
        !required,
        `could not read ${label}: ${error instanceof Error ? error.message : String(error)}. ` +
          "If this fails, the CDR ABI has changed — re-verify before proceeding.",
      );
    }
  }

  // ── 5. The license token at our recorded address is really Story's ────────
  // BUILD 1 rated this address MEDIUM-HIGH and said to re-read it before relying on
  // it. This does exactly that: it asks the contract what it is, rather than trusting
  // that the address is still the token we recorded. A proxy upgrade or a wrong
  // address would show up here instead of failing later at mint time.
  try {
    const [name, symbol] = await Promise.all([
      client.readContract({
        address: getAddress(AENEID_LICENSE_TOKEN_ADDRESS),
        abi: [
          { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
        ] as const,
        functionName: "name",
      }),
      client.readContract({
        address: getAddress(AENEID_LICENSE_TOKEN_ADDRESS),
        abi: [
          { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
        ] as const,
        functionName: "symbol",
      }),
    ]);

    const matches =
      name === AENEID_LICENSE_TOKEN_NAME && symbol === AENEID_LICENSE_TOKEN_SYMBOL;
    record(
      "LicenseToken identity",
      matches,
      matches
        ? `name()="${name}" symbol()="${symbol}" — matches the recorded PILE token`
        : `MISMATCH — expected name()="${AENEID_LICENSE_TOKEN_NAME}" symbol()="${AENEID_LICENSE_TOKEN_SYMBOL}", ` +
          `got name()="${name}" symbol()="${symbol}". STOP: this address is not the license token we recorded.`,
    );
  } catch (error) {
    record(
      "LicenseToken identity",
      false,
      `could not read name()/symbol(): ${error instanceof Error ? error.message : String(error)}`,
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
