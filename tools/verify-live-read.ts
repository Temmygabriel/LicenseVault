/**
 * A real, live, license-gated CDR read — performed through the DEPLOYED proxy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TOOL EXISTS, AND WHAT IT SETTLES
 *
 * Phase 1 of the build order says, verbatim: *"The current probe of `/dkg/cdr_partials` returned
 * an HTTP 500 validation error. Do not describe that as proof that partial retrieval works. The
 * actual SDK-generated partial request must succeed through the deployed proxy."*
 *
 * That is a fair demand and it cannot be met by probing with a hand-made query string. A fresh
 * ephemeral key has no partials, so the keeper answers `partial decryption submission not found`
 * — an answer that says "nothing here for you", not "this endpoint works". The only way to see
 * this endpoint return real partials is to make real partials exist, which means performing an
 * actual authorized read from a wallet that actually holds the license.
 *
 * So this tool does exactly that, and deliberately supplies its OWN ephemeral keypair rather than
 * letting the SDK generate one it never reveals. That single choice is what makes the endpoint
 * checkable: the requester public key is known, so `/dkg/cdr_partials` can be asked for that
 * exact key and its answer observed while the read is in flight.
 *
 * What a PASS means, precisely:
 *   • the reader wallet holds license token 73227 for the canonical vault;
 *   • `read()` was submitted from that wallet and mined;
 *   • validators produced partial decryptions for THIS run's requester key;
 *   • `/dkg/cdr_partials` answered **HTTP 200 with real submissions** through the deployed
 *     proxy — the claim Phase 1 says must not be assumed;
 *   • the recovered data key decrypted the committed ciphertext to the recorded plaintext hash.
 *
 * What it does NOT mean: that a browser can do it. That is Phase 2, and it is proven separately.
 *
 * Run:  npm run verify:read
 *       npm run verify:read -- http://localhost:4180/api/cdr
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cdrAbi } from "@piplabs/cdr-contracts";
import {
  CDRClient,
  generateEphemeralKeyPair,
  initWasm,
  queryCDRPartials,
} from "@piplabs/cdr-sdk";
import { createPublicClient, createWalletClient, encodeAbiParameters, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { AENEID_RPC_URL, CDR_ADDRESS } from "../lib/protocol/constants";
import { CANONICAL_VAULT } from "../lib/protocol/canonical-vault";
import { decryptContent, sha256Hex } from "../lib/protocol/content";

const RUN_DIR = join("evidence", CANONICAL_VAULT.runId);
const BLOB_PATH = join(RUN_DIR, "protected-content.bin");
const RESOURCE_PATH = join(RUN_DIR, "decrypted-resource.json");

const base = (process.argv[2] ?? "https://licensevault.vercel.app/api/cdr").replace(/\/+$/, "");

/**
 * The reader key, from the environment or the gitignored local file.
 *
 * Never printed, never passed as an argument, never written anywhere. A live 64-hex literal in a
 * command line ends up in shell history and in the process table; this reads a file instead.
 */
function readerKey(): `0x${string}` {
  const fromEnv = process.env.AENEID_READER_PRIVATE_KEY?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv as `0x${string}`;

  const path = join("secrets", "aeneid-reader.key");
  if (!existsSync(path)) {
    throw new Error(
      `No reader key. Set AENEID_READER_PRIVATE_KEY, or place the disposable Aeneid reader key ` +
        `at ${path} (gitignored). This tool will not run without a wallet that holds the license.`,
    );
  }
  return readFileSync(path, "utf8").trim() as `0x${string}`;
}

interface PartialObservation {
  /** The first raw HTTP status the proxy returned for a partials request. */
  firstStatus: number | null;
  /** The largest submission count seen in any single answer. */
  maxSubmissions: number;
  /** The round those submissions belonged to. */
  round: number | null;
  /** How many polls were made in total. */
  polls: number;
}

async function main(): Promise<void> {
  console.log(`\nLive CDR read through ${base}\n`);
  console.log(
    `  vault uuid ${CANONICAL_VAULT.uuid}  ·  license token ${CANONICAL_VAULT.licenseTokenId}` +
      `  ·  chain ${CANONICAL_VAULT.chainId}\n`,
  );

  const expected = JSON.parse(readFileSync(RESOURCE_PATH, "utf8")) as {
    plaintextSha256: string;
    asset: string;
    plaintextBytes: number;
  };
  const sealed = new Uint8Array(readFileSync(BLOB_PATH));

  const account = privateKeyToAccount(readerKey());
  console.log(`  reader ${account.address}`);

  if (account.address.toLowerCase() !== CANONICAL_VAULT.licenseHolder.toLowerCase()) {
    throw new Error(
      `The configured key is ${account.address}, but the license in the evidence is held by ` +
        `${CANONICAL_VAULT.licenseHolder}. A read from the wrong wallet should be REFUSED — that ` +
        `is the product working — so this tool refuses to pretend otherwise.`,
    );
  }

  const publicClient = createPublicClient({ transport: http(AENEID_RPC_URL) });

  // ── Preflight: never assume a read is free just because it once was ────────
  const [chainId, balance, fee] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBalance({ address: account.address }),
    publicClient
      .readContract({ address: CDR_ADDRESS, abi: cdrAbi, functionName: "readFee" })
      .catch(() => null),
  ]);

  if (chainId !== CANONICAL_VAULT.chainId) {
    throw new Error(`The RPC answered chain ${chainId}, expected ${CANONICAL_VAULT.chainId}.`);
  }

  console.log(
    `  chain ${chainId}  ·  balance ${balance} wei  ·  CDR readFee ` +
      `${fee === null ? "UNREADABLE (the read may still cost gas)" : `${fee} wei`}`,
  );
  console.log(`  ── reading the on-chain fee rather than assuming the read is free ──\n`);

  if (balance === 0n) {
    throw new Error(
      "The reader wallet has no testnet IP. Even a zero protocol fee costs gas, so a read would " +
        "fail for a reason that is not a licensing decision. Fund it first.",
    );
  }

  await initWasm();

  // ── The keypair the SDK would normally hide. We keep the public half. ──────
  const keypair = generateEphemeralKeyPair();
  const requesterPubKeyHex: `0x${string}` =
    `0x${Buffer.from(keypair.publicKey).toString("hex")}`;

  const observation: PartialObservation = { firstStatus: null, maxSubmissions: 0, round: null, polls: 0 };

  /**
   * Poll the partials endpoint the way the real SDK does — through the deployed proxy — while the
   * read is in flight. This is the check Phase 1 demands, running against real partials.
   *
   * A raw `fetch` is used for the FIRST request only, so the literal HTTP status the proxy
   * returned is recorded rather than being abstracted into a thrown error. Everything after that
   * goes through the SDK's own function, which is the request shape that has to work.
   */
  let polling = true;
  const poll = (async () => {
    while (polling) {
      observation.polls += 1;
      try {
        if (observation.firstStatus === null) {
          const raw = await fetch(
            `${base}/dkg/cdr_partials?uuid=${CANONICAL_VAULT.uuid}` +
              `&requester_pub_key_hex=${requesterPubKeyHex.slice(2)}`,
          );
          observation.firstStatus = raw.status;
        }

        const groups = await queryCDRPartials({
          apiUrl: base,
          uuid: CANONICAL_VAULT.uuid,
          requesterPubKeyHex,
        });

        for (const group of groups) {
          if (group.submissions.length > observation.maxSubmissions) {
            observation.maxSubmissions = group.submissions.length;
            observation.round = group.round;
          }
        }
      } catch {
        // Expected before the transaction confirms: the keeper has no partials for a key that has
        // not read yet, and answers with a 500 the SDK's own poll loop swallows. Silence here is
        // not a failure being hidden — `maxSubmissions` is what the report is built from.
      }

      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  })();

  let dataKey: Uint8Array | null = null;
  let readError: unknown = null;

  try {
    const client = new CDRClient({
      network: "testnet",
      publicClient: publicClient as never,
      walletClient: createWalletClient({
        account,
        transport: http(AENEID_RPC_URL),
      }) as never,
      apiUrl: base,
    });

    const accessAuxData = encodeAbiParameters(
      [{ type: "uint256[]" }],
      [[CANONICAL_VAULT.licenseTokenId]],
    );

    console.log("  … submitting the real read() transaction (this spends a little testnet gas)");
    const result = await client.consumer.accessCDR({
      uuid: CANONICAL_VAULT.uuid,
      accessAuxData,
      requesterPubKey: requesterPubKeyHex,
      recipientPrivKey: keypair.privateKey,
      timeoutMs: 180_000,
    });
    dataKey = result.dataKey;
  } catch (error) {
    readError = error;
  } finally {
    polling = false;
    await poll;
    // The SDK's contract, honoured even on the failure path.
    keypair.privateKey.fill(0);
  }

  console.log(
    `\n  partials endpoint through the proxy: first HTTP status ` +
      `${observation.firstStatus ?? "none observed"}, peak ` +
      `${observation.maxSubmissions} submission(s)` +
      `${observation.round === null ? "" : ` in round ${observation.round}`}` +
      `, ${observation.polls} poll(s)\n`,
  );

  if (readError !== null || dataKey === null) {
    console.error(`  READ FAILED: ${String(readError)}`);
    process.exitCode = 1;
    return;
  }

  const plaintext = decryptContent(sealed, dataKey);
  const actualSha = sha256Hex(plaintext);
  const matches = actualSha === expected.plaintextSha256;

  console.log(`  data key     ${dataKey.length} bytes`);
  console.log(`  decrypted    ${plaintext.length} bytes of JSON`);
  console.log(`  sha256       ${actualSha}`);
  console.log(`  expected     ${expected.plaintextSha256}`);
  console.log(`  content      ${matches ? "MATCHES the recorded plaintext" : "DOES NOT MATCH"}`);

  const asset = JSON.parse(new TextDecoder().decode(plaintext)) as { asset?: string };
  console.log(`  reveals      ${asset.asset ?? "(no asset field)"}`);

  if (!matches) process.exitCode = 1;
  if (observation.maxSubmissions === 0) {
    console.error(
      "\n  The read succeeded but no partials were ever observed. That is a contradiction and " +
        "means the observation, not the read, is wrong.",
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("live read crashed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
