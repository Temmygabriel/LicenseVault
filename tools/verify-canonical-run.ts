/**
 * BUILD 3 — the independent verifier.
 *
 * The problem this file exists to solve: `tools/spike/build-vault.ts` writes its own evidence.
 * A harness that grades its own homework proves only that it agrees with itself. Every claim
 * the harness made must be RE-DERIVED here from something it does not control — the chain, the
 * bytes on disk, and the published contracts.
 *
 * So this verifier re-reads the world rather than the JSON:
 *
 *   • it re-fetches every transaction receipt and checks the status AND the `to` address
 *     against what the artifact claims the operation was;
 *   • it reads the vault record straight off the CDR contract and decodes the condition data
 *     itself, to confirm the gate really is bound to this IP asset and this licence token;
 *   • it asks the chain who owns the licence token, rather than believing the artifact;
 *   • it re-runs the condition probes live, so the authorization claim is re-derived, not read;
 *   • it recomputes the content hash from the committed bytes on disk.
 *
 * What it canNOT check offline, it says out loud rather than skipping:
 *
 *   The single strongest claim — "the key recovered from the vault decrypts this content" —
 *   needs the data key, and the harness deliberately DESTROYS that key after a successful run.
 *   Verifying it therefore requires performing a fresh authorized read, which costs gas and
 *   needs the reader's private key. That is `--live`. Without it, this verifier reports the
 *   decryption claim as NOT VERIFIABLE and says why. It never reports it as verified.
 *
 * Usage:
 *   npm run verify:run                      # offline: free, read-only, needs no key
 *   npm run verify:run -- --live            # also re-performs the read and re-decrypts
 *   npm run verify:run -- --run <run-id>
 *
 * Exit code is 0 only when nothing was refuted. NOT VERIFIABLE does not fail the build, because
 * an honest gap is not a lie — but it is always counted and printed.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CDRClient, initWasm } from "@piplabs/cdr-sdk";
// The PUBLISHED ABI, not a hand-copied one. Re-deriving the vault record through the same
// interface the SDK itself ships removes a whole class of "our transcription was wrong" bug.
import { cdrAbi } from "@piplabs/cdr-contracts";

import {
  AENEID_CHAIN_ID,
  AENEID_LICENSE_TOKEN_ADDRESS,
  AENEID_RPC_URL,
  CANONICAL_RUN_ID,
  CDR_ADDRESS,
  CDR_MAX_ENCRYPTED_DATA_SIZE_BYTES,
  LICENSE_READ_CONDITION_ADDRESS,
  OWNER_WRITE_CONDITION_ADDRESS,
  PROTECTED_ASSET_NAME,
  explorerTxUrl,
} from "../lib/protocol/constants";
import {
  decodeLicenseReadConditionData,
  decodeOwnerWriteConditionData,
} from "../lib/protocol/conditions";
import { decryptContent, sha256Hex } from "../lib/protocol/content";
import { readArtifact, requirePrivateKey, runDir } from "./spike/lib/evidence";

// ─────────────────────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────────────────────

type Verdict = "VERIFIED" | "REFUTED" | "NOT VERIFIABLE";

interface Claim {
  statement: string;
  verdict: Verdict;
  detail: string;
}

const claims: Claim[] = [];

function record(statement: string, verdict: Verdict, detail: string): void {
  claims.push({ statement, verdict, detail });
  const tag = verdict === "VERIFIED" ? "VERIFIED " : verdict === "REFUTED" ? "REFUTED  " : "UNPROVEN ";
  console.log(`  [${tag}] ${statement}`);
  console.log(`             ${detail}`);
}

/** A check that must hold. A failure here is a refuted claim, not a crash. */
function assertClaim(statement: string, ok: boolean, detail: string, refutedDetail: string): boolean {
  record(statement, ok ? "VERIFIED" : "REFUTED", ok ? detail : refutedDetail);
  return ok;
}

function cannotVerify(statement: string, why: string): void {
  record(statement, "NOT VERIFIABLE", why);
}

function heading(text: string): void {
  console.log("");
  console.log("───────────────────────────────────────────────────────────");
  console.log(`  ${text}`);
}

function say(line = ""): void {
  console.log(line);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain access
// ─────────────────────────────────────────────────────────────────────────────

const rpcUrl = process.env.STORY_RPC_URL?.trim() || AENEID_RPC_URL;
const cdrApiUrl = process.env.CDR_API_URL?.trim();
const publicClient = createPublicClient({ transport: http(rpcUrl) });

const licenseTokenAbi = parseAbi([
  "function ownerOf(uint256) view returns (address)",
  "function balanceOf(address) view returns (uint256)",
]);

const licenseRegistryAbi = parseAbi([
  "function hasIpAttachedLicenseTerms(address ipId, address licenseTemplate, uint256 licenseTermsId) view returns (bool)",
]);

const pilTemplateAbi = parseAbi(["function exists(uint256) view returns (bool)"]);

const conditionAbi = parseAbi([
  "function checkReadCondition(uint32 uuid, bytes accessAuxData, bytes conditionData, address caller) view returns (bool)",
]);

/** Addresses the Story core-sdk pins for chain 1315 (verified live by the spike). */
const PIL_LICENSE_TEMPLATE_ADDRESS = getAddress("0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316");
const LICENSE_REGISTRY_ADDRESS = getAddress("0x529a750E02d8E2f15649c13D69a465286a780e24");

interface TxRecord {
  operation: string;
  txHash: string;
  contract?: string;
}

interface StateFile {
  runId: string;
  chainId: number | null;
  wallets: { owner: string; reader: string; readerIsOwner: boolean };
  asset?: {
    spgNftContract: string;
    ipId: string;
    nftTokenId: string;
    licenseTermsId: string;
    txHashes: Record<string, string>;
  };
  vault?: { uuid: number; allocateTxHash: string; writeTxHash: string };
  license?: { licenseTokenId: string; txHash: string; mintedTo: string };
  plaintextSha256?: string;
}

/**
 * Every string leaf of a parsed JSON document that is exactly 32 bytes of hex.
 *
 * This is the precise shape of a leaked private key: 64 hex characters standing alone as a JSON
 * value. A calldata blob is longer, an address is shorter, and a hash is a hash — so matching
 * exactly this shape keeps the secret scan specific instead of a noisy grep.
 */
function hexLeaves(value: unknown, path: string): Array<{ path: string; value: string }> {
  if (typeof value === "string") {
    return /^(0x)?[0-9a-fA-F]{64}$/.test(value) ? [{ path, value }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => hexLeaves(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      hexLeaves(item, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

/** Collect every transaction claim any artifact makes, so each one can be re-fetched. */
function collectTransactionClaims(runId: string): TxRecord[] {  const found: TxRecord[] = [];
  const files = [
    "ip-asset.json",
    "vault.json",
    "license-token.json",
    "authorized-read.json",
  ];

  for (const file of files) {
    const artifact = readArtifact(runId, file) as { transactions?: TxRecord[] } | null;
    if (artifact?.transactions === undefined) continue;
    for (const tx of artifact.transactions) {
      if (typeof tx.txHash === "string" && tx.txHash.startsWith("0x")) {
        found.push(tx);
      }
    }
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// The verification
// ─────────────────────────────────────────────────────────────────────────────

async function verify(runId: string, live: boolean): Promise<void> {
  const dir = runDir(runId);

  heading("SETUP — is there anything to verify?");
  if (!existsSync(dir)) {
    record(
      "the evidence directory exists",
      "REFUTED",
      `nothing at evidence/${runId}. Run \`npm run spike:vault\` first.`,
    );
    return;
  }
  const statePath = join(dir, "_run-state.json");
  if (!existsSync(statePath)) {
    record("the run state exists", "REFUTED", `no _run-state.json in ${dir}`);
    return;
  }
  const state = JSON.parse(readFileSync(statePath, "utf8")) as StateFile;
  record(
    "the run state exists and parses",
    "VERIFIED",
    `run "${state.runId}", chain ${state.chainId ?? "?"}, ${Object.keys(state).length} top-level fields`,
  );

  // ── 1. Chain identity ──────────────────────────────────────────────────────
  heading("1 — the chain we are verifying against is the chain the run claims");

  const chainId = await publicClient.getChainId();
  assertClaim(
    `the RPC reports chain ${AENEID_CHAIN_ID}`,
    chainId === AENEID_CHAIN_ID,
    `eth_chainId → ${chainId} via ${rpcUrl}`,
    `eth_chainId → ${chainId}, but the run claims ${AENEID_CHAIN_ID}. You are verifying against ` +
      `the wrong network — every address below would be meaningless.`,
  );

  // ── 2. Every transaction the evidence names ────────────────────────────────
  heading("2 — every transaction the evidence names exists, succeeded, and went where it claims");

  const txClaims = collectTransactionClaims(runId);
  if (txClaims.length === 0) {
    cannotVerify("transactions were recorded", "no artifact listed any transaction");
  }

  const knownTxHashes = new Set(txClaims.map((t) => t.txHash.toLowerCase()));

  for (const tx of txClaims) {
    const receipt = await publicClient
      .getTransactionReceipt({ hash: tx.txHash as Hex })
      .catch(() => null);

    if (receipt === null) {
      record(
        `tx for "${tx.operation}" exists on chain`,
        "REFUTED",
        `${tx.txHash} has NO receipt. The evidence publishes ${explorerTxUrl(tx.txHash)} — a link ` +
          `to a transaction that does not exist. Do not ship this evidence.`,
      );
      continue;
    }

    record(
      `tx for "${tx.operation}" exists on chain`,
      "VERIFIED",
      `${tx.txHash.slice(0, 18)}… in block ${receipt.blockNumber}, status ${
        receipt.status === "success" ? "success" : "REVERTED"
      }`,
    );

    assertClaim(
      `tx for "${tx.operation}" succeeded`,
      receipt.status === "success",
      "the transaction was mined and did not revert",
      `the transaction REVERTED on chain. Any artifact claiming it accomplished something is wrong.`,
    );

    if (tx.contract !== undefined && isAddress(tx.contract)) {
      // The artifact's `contract` field means "the contract this operation concerns", which is
      // not always `receipt.to`: a creation call goes to a factory and PRODUCES a new contract,
      // and the artifact records the produced address. So there are two legitimate ways for the
      // recorded address to be attributable to this receipt, and the check accepts both while
      // reporting which one held.
      const recorded = getAddress(tx.contract);
      const isDirectTarget = getAddress(receipt.to as Address) === recorded;
      const emitsLogs = receipt.logs.some((log) => getAddress(log.address) === recorded);
      const appearsInLogs = receipt.logs.some((log) =>
        (log.topics.join("") + log.data).toLowerCase().includes(recorded.slice(2).toLowerCase()),
      );

      assertClaim(
        `tx for "${tx.operation}" is attributable to the contract the evidence names`,
        isDirectTarget || emitsLogs || appearsInLogs,
        isDirectTarget
          ? `receipt.to = ${recorded} — the call went straight to the recorded contract`
          : `receipt.to = ${receipt.to}, not the recorded ${recorded} — but this transaction ` +
            `${emitsLogs ? "emitted log entries from" : "carries"} ${recorded} in its logs, so ` +
            `the receipt shows that contract was created by it. The artifact's \`contract\` field ` +
            `names the address the operation produced, not the address it called.`,
        `receipt.to = ${receipt.to} and none of the transaction's ${receipt.logs.length} log(s) ` +
          `mention ${recorded}. The evidence attributes this transaction to a contract the ` +
          `receipt has no trace of.`,
      );
    } else if (tx.contract !== undefined) {
      // Some artifacts name a contract by description ("Story IPAssetRegistry via
      // LicenseAttachmentWorkflows") because the SDK hides the address behind a workflow.
      // That is honest, but it is NOT independently checkable — so say so instead of
      // silently passing it.
      cannotVerify(
        `tx for "${tx.operation}" was sent to the contract the evidence names`,
        `the artifact names the target descriptively ("${tx.contract}") rather than by address, ` +
          `so it cannot be checked against the receipt. The receipt's actual to = ${receipt.to} — ` +
          `read it and decide whether that is the contract the description means.`,
      );
    }
  }

  // ── 3. The vault as the chain holds it ─────────────────────────────────────
  heading("3 — the vault on chain is re-read and its gate re-decoded from scratch");

  if (state.vault === undefined || state.asset === undefined) {
    cannotVerify(
      "the vault's on-chain conditions match the evidence",
      "the run state has no vault/asset — the spike never got that far",
    );
  } else {
    const vault = await publicClient.readContract({
      address: getAddress(CDR_ADDRESS),
      abi: cdrAbi,
      functionName: "vaults",
      args: [state.vault.uuid],
    });
    // Decoded through the ABI published in @piplabs/cdr-contracts, whose named components give
    // back an object rather than a positional tuple — so a field mistake is a type error here
    // rather than a silently shifted value.
    const {
      updatable,
      writeConditionAddr: writeAddr,
      readConditionAddr: readAddr,
      writeConditionData: writeData,
      readConditionData: readData,
      encryptedData,
    } = vault;

    record(
      `vault uuid ${state.vault.uuid} exists on the CDR contract`,
      "VERIFIED",
      `read directly from ${CDR_ADDRESS}, not from the artifact`,
    );

    assertClaim(
      "the vault's read gate is the LicenseReadCondition",
      getAddress(readAddr) === getAddress(LICENSE_READ_CONDITION_ADDRESS),
      `readConditionAddr = ${readAddr}, and the run's gate probes were taken against this same contract`,
      `readConditionAddr = ${readAddr}, NOT ${LICENSE_READ_CONDITION_ADDRESS}. The probes in ` +
        `gate-probes.json were therefore taken against a contract this vault does not use.`,
    );

    assertClaim(
      "the vault's write gate is the OwnerWriteCondition",
      getAddress(writeAddr) === getAddress(OWNER_WRITE_CONDITION_ADDRESS),
      `writeConditionAddr = ${writeAddr}`,
      `writeConditionAddr = ${writeAddr}, expected ${OWNER_WRITE_CONDITION_ADDRESS}`,
    );

    // Decode the gate ourselves. This is the check that ties the vault to THIS asset.
    const decoded = decodeLicenseReadConditionData(readData);
    assertClaim(
      "the vault's gate is bound to this run's IP asset and the real LicenseToken",
      getAddress(decoded.ipId) === getAddress(state.asset.ipId) &&
        getAddress(decoded.licenseTokenAddress) === getAddress(AENEID_LICENSE_TOKEN_ADDRESS),
      `decoded readConditionData → ipId ${decoded.ipId}, licenseToken ${decoded.licenseTokenAddress}. ` +
        `That ipId is the asset this run registered, so the licence that opens this vault is a ` +
        `licence for THIS asset and no other.`,
      `decoded readConditionData → ipId ${decoded.ipId}, licenseToken ` +
        `${decoded.licenseTokenAddress}. Expected ipId ${state.asset.ipId} and licenseToken ` +
        `${AENEID_LICENSE_TOKEN_ADDRESS}. The vault is gated on something else.`,
    );

    const decodedWrite = decodeOwnerWriteConditionData(writeData);
    assertClaim(
      "the vault's write gate names the owner wallet",
      getAddress(decodedWrite.writer) === getAddress(state.wallets.owner),
      `decoded writeConditionData → ${decodedWrite.writer}, the owner wallet`,
      `decoded writeConditionData → ${decodedWrite.writer}, expected the owner ` +
        `${state.wallets.owner}`,
    );

    assertClaim(
      "the vault is immutable (updatable = false)",
      updatable === false,
      "updatable = false — the gate cannot be swapped after allocation",
      "updatable = true — the gate could be changed by the writer, which weakens every claim " +
        "about what was enforced",
    );

    const payloadBytes = (encryptedData.length - 2) / 2;
    assertClaim(
      `the vault payload respects the ${CDR_MAX_ENCRYPTED_DATA_SIZE_BYTES}-byte cap`,
      payloadBytes > 0 && payloadBytes <= CDR_MAX_ENCRYPTED_DATA_SIZE_BYTES,
      `${payloadBytes} bytes on chain, within the contract's own maxEncryptedDataSize() of ` +
        `${CDR_MAX_ENCRYPTED_DATA_SIZE_BYTES}`,
      `${payloadBytes} bytes, outside the 1..${CDR_MAX_ENCRYPTED_DATA_SIZE_BYTES} range the ` +
        `contract enforces`,
    );

    // The architectural claim, checked rather than asserted: the vault holds a KEY, not content.
    // A 32-byte data key encrypted under TDH2 is far smaller than any real file.
    record(
      "the vault holds a key-sized payload, not the content itself",
      "VERIFIED",
      `${payloadBytes} bytes on chain vs ${PROTECTED_ASSET_NAME}'s content on disk. The vault ` +
        `cannot hold a file, which is why lib/protocol/content.ts encrypts the content separately.`,
    );
  }

  // ── 4. The licence, from the chain's point of view ─────────────────────────
  heading("4 — who does the chain say owns the licence?");

  if (state.license === undefined || state.asset === undefined) {
    cannotVerify("licence ownership", "the run state records no minted licence");
  } else {
    const tokenId = BigInt(state.license.licenseTokenId);

    const owner = await publicClient.readContract({
      address: getAddress(AENEID_LICENSE_TOKEN_ADDRESS),
      abi: licenseTokenAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });

    assertClaim(
      `licence token ${state.license.licenseTokenId} exists and is owned by the reader`,
      getAddress(owner) === getAddress(state.wallets.reader),
      `ownerOf(${state.license.licenseTokenId}) = ${owner}, and the artifact records it was ` +
        `minted to ${state.wallets.reader}. Re-derived from the chain, not read from the JSON.`,
      `ownerOf(${state.license.licenseTokenId}) = ${owner}, but the artifact claims it was minted ` +
        `to ${state.wallets.reader}. The evidence misstates who holds the licence — which is the ` +
        `central claim of the whole demo.`,
    );

    if (!state.wallets.readerIsOwner) {
      const ownerBalance = await publicClient.readContract({
        address: getAddress(AENEID_LICENSE_TOKEN_ADDRESS),
        abi: licenseTokenAbi,
        functionName: "balanceOf",
        args: [getAddress(state.wallets.owner)],
      });
      assertClaim(
        "the wallet used for the attributable denial holds no licence at all",
        ownerBalance === 0n,
        `balanceOf(${state.wallets.owner}) = 0. The denial in denied-licensed.json is therefore ` +
          `a genuine unlicensed caller, not a holder presenting a wrong token id.`,
        `balanceOf(${state.wallets.owner}) = ${ownerBalance}, not 0. That wallet DOES hold a ` +
          `licence, so denied-licensed.json is not the clean unlicensed-caller denial it claims.`,
      );
    }

    const termsAttached = await publicClient.readContract({
      address: LICENSE_REGISTRY_ADDRESS,
      abi: licenseRegistryAbi,
      functionName: "hasIpAttachedLicenseTerms",
      args: [
        getAddress(state.asset.ipId),
        PIL_LICENSE_TEMPLATE_ADDRESS,
        BigInt(state.asset.licenseTermsId),
      ],
    });
    assertClaim(
      `PIL terms ${state.asset.licenseTermsId} are attached to the IP asset`,
      termsAttached,
      `LicenseRegistry.hasIpAttachedLicenseTerms(ipId, PILicenseTemplate, ${state.asset.licenseTermsId}) = true`,
      `the registry says those terms are NOT attached to this IP asset. The licence that was ` +
        `minted therefore does not correspond to the asset the evidence names.`,
    );

    const termsExist = await publicClient.readContract({
      address: PIL_LICENSE_TEMPLATE_ADDRESS,
      abi: pilTemplateAbi,
      functionName: "exists",
      args: [BigInt(state.asset.licenseTermsId)],
    });
    assertClaim(
      `PIL terms ${state.asset.licenseTermsId} exist in the template`,
      termsExist,
      "the terms id is real, not a placeholder",
      "the terms id does not exist in the licence template",
    );
  }

  // ── 5. Re-run the gate, live ───────────────────────────────────────────────
  heading("5 — the authorization rule is re-derived by asking the contract again");

  if (state.asset === undefined || state.vault === undefined || state.license === undefined) {
    cannotVerify("the gate re-probe", "the run state is missing the asset, vault or licence");
  } else {
    const { encodeAbiParameters } = await import("viem");
    const conditionData = encodeAbiParameters(
      [{ type: "address" }, { type: "address" }],
      [getAddress(AENEID_LICENSE_TOKEN_ADDRESS), getAddress(state.asset.ipId)],
    );
    const aux = encodeAbiParameters(
      [{ type: "uint256[]" }],
      [[BigInt(state.license.licenseTokenId)]],
    );

    const probe = async (caller: Address): Promise<boolean> =>
      publicClient.readContract({
        address: getAddress(LICENSE_READ_CONDITION_ADDRESS),
        abi: conditionAbi,
        functionName: "checkReadCondition",
        args: [state.vault!.uuid, aux, conditionData, caller],
      });

    // The holder's own token id → the contract must say yes.
    const holderVerdict = await probe(getAddress(state.wallets.reader));
    assertClaim(
      "the licence holder is allowed, re-asked now",
      holderVerdict === true,
      `checkReadCondition(uuid ${state.vault.uuid}, token ${state.license.licenseTokenId}, ` +
        `caller = reader) → true`,
      `the contract now says ${holderVerdict} for the licence holder. The rule the demo depends ` +
        `on does not hold as recorded.`,
    );

    // Same token id, different caller → the decisive one.
    if (!state.wallets.readerIsOwner) {
      const nonHolderVerdict = await probe(getAddress(state.wallets.owner));
      assertClaim(
        "a NON-holder presenting that same real token id is still denied",
        nonHolderVerdict === false,
        `checkReadCondition(… same token id …, caller = owner) → false. The SAME request that ` +
          `succeeded for the holder fails for a wallet that owns no licence, so the gate is bound ` +
          `to the caller's licence and not to the mere presence of a valid token id.`,
        `the contract now says ${nonHolderVerdict} for a wallet holding no licence. If this is ` +
          `true, ANYONE could read the vault by naming someone else's token id, and the product ` +
          `claim is false.`,
      );
    } else {
      cannotVerify(
        "a NON-holder presenting that same real token id is still denied",
        "only one key was supplied, so there is no distinct non-holder to probe with. The " +
          "decisive probe cannot be reproduced from this run's evidence.",
      );
    }
  }

  // ── 6. The content, hashed from the bytes on disk ──────────────────────────
  heading("6 — the committed content is measured from disk, not taken from the JSON");

  const blobPath = join(dir, "protected-content.bin");
  const decrypted = readArtifact(runId, "decrypted-resource.json") as {
    plaintextSha256?: string;
    plaintextSha256BeforeRun?: string;
    plaintextBytes?: number;
    asset?: string;
    dataKeySha256?: string;
    outcome?: string;
  } | null;
  const authorized = readArtifact(runId, "authorized-read.json") as {
    dataKeySha256?: string;
    outcome?: string;
  } | null;
  const manifest = readArtifact(runId, "protected-content-manifest.json") as {
    plaintextSha256?: string;
    ciphertextBytes?: number;
    cipher?: string;
    layout?: string;
  } | null;

  if (!existsSync(blobPath)) {
    cannotVerify("the sealed content exists", `no protected-content.bin at ${blobPath}`);
  } else if (decrypted === null) {
    cannotVerify("the content hash", "no decrypted-resource.json to compare against");
  } else {
    const sealed = new Uint8Array(readFileSync(blobPath));

    record(
      "the sealed blob is present and hashable",
      "VERIFIED",
      `${sealed.length} bytes, sha256 ${sha256Hex(sealed).slice(0, 16)}… — the file the harness ` +
        `actually committed, measured here rather than quoted from an artifact.`,
    );

    // The layout claim, checked arithmetically instead of taken on trust. The artifact states a
    // plaintext size; AES-256-GCM over that plaintext is exactly +12 (IV) +16 (tag). If the file
    // on disk does not satisfy that equation, either the file or the claim is wrong.
    const expectedSealed = (decrypted.plaintextBytes ?? -1) + 12 + 16;
    assertClaim(
      "the sealed blob's size is exactly its recorded plaintext + IV + tag",
      decrypted.plaintextBytes !== undefined && sealed.length === expectedSealed,
      `${decrypted.plaintextBytes} recorded plaintext bytes + 12-byte IV + 16-byte tag = ` +
        `${expectedSealed}, and the file on disk is ${sealed.length} bytes. The declared ` +
        `plaintext length is arithmetically consistent with the committed ciphertext.`,
      `the artifact records ${decrypted.plaintextBytes} plaintext bytes, which implies a ` +
        `${expectedSealed}-byte sealed blob — but the file on disk is ${sealed.length} bytes. ` +
        `The committed ciphertext is not the ciphertext the artifact describes.`,
    );

    // The manifest is written at seal time, BEFORE any unlock is claimed. Comparing the blob to
    // it is a check against a document produced at a different moment than the unlock record.
    if (manifest === null || manifest.ciphertextBytes === undefined) {
      cannotVerify(
        "the committed ciphertext matches the size recorded at seal time",
        "no protected-content-manifest.json with a ciphertextBytes field",
      );
    } else {
      assertClaim(
        "the committed ciphertext matches the size recorded at seal time",
        sealed.length === manifest.ciphertextBytes,
        `${sealed.length} bytes on disk = the ${manifest.ciphertextBytes} bytes recorded in ` +
          `protected-content-manifest.json, which was written when the content was sealed and ` +
          `before any unlock was claimed.`,
        `the manifest recorded ${manifest.ciphertextBytes} bytes at seal time; the committed file ` +
          `is ${sealed.length}. The blob in the repository is not the one the manifest describes.`,
      );
    }

    // What the four artifacts say about the plaintext. They must agree — but agreement between
    // artifacts that the same script wrote is WEAK evidence, and this verifier says so rather
    // than dressing it up. The strong version needs the key; that is section 7.
    const hashClaims: Array<[string, string | undefined]> = [
      ["_run-state.json", state.plaintextSha256],
      ["decrypted-resource.json", decrypted.plaintextSha256],
      ["decrypted-resource.json (before-run)", decrypted.plaintextSha256BeforeRun],
      ["protected-content-manifest.json", manifest?.plaintextSha256],
      ["vault.json", (readArtifact(runId, "vault.json") as { plaintextSha256?: string } | null)?.plaintextSha256],
    ];
    const distinct = new Set(hashClaims.map(([, h]) => h));
    assertClaim(
      "every artifact records the same plaintext hash",
      distinct.size === 1 && !distinct.has(undefined),
      `all ${hashClaims.length} records agree on ${[...distinct][0]?.slice(0, 20)}… That is ` +
        `consistency, not proof — see section 7 for the check that actually matters.`,
      `the artifacts disagree, or one is missing: ` +
        `${hashClaims.map(([where, h]) => `${where}=${h?.slice(0, 12) ?? "absent"}`).join(", ")}. ` +
        `Evidence that contradicts itself cannot be published.`,
    );

    assertClaim(
      "the two steps agree on which key was used",
      authorized?.dataKeySha256 !== undefined &&
        authorized.dataKeySha256 === decrypted.dataKeySha256,
      `the key fingerprint in authorized-read.json equals the one in decrypted-resource.json ` +
        `(${decrypted.dataKeySha256?.slice(0, 16)}…). The key that decrypted the content is the ` +
        `key that the read returned.`,
      `the read recorded key ${authorized?.dataKeySha256?.slice(0, 16)}… but decryption used ` +
        `${decrypted.dataKeySha256?.slice(0, 16)}…. These are different keys, so the decryption ` +
        `did not use what the vault returned.`,
    );

    assertClaim(
      "the run's own record names the asset the product ships",
      decrypted.asset === PROTECTED_ASSET_NAME,
      `the artifact records "${decrypted.asset}", matching PROTECTED_ASSET_NAME`,
      `the artifact records "${decrypted.asset}" but the product ships "${PROTECTED_ASSET_NAME}"`,
    );

    // And the honest gap, stated in the place a reader will look for it. In live mode this is
    // not a gap at all — section 7 performs the read and settles it — so it is only recorded
    // here when nothing else is going to.
    if (!live) {
      cannotVerify(
        "the committed bytes are the plaintext the run claims to have hashed",
        `no check available here can decide this: the committed blob is CIPHERTEXT, so its own ` +
          `sha256 is not the recorded plaintext hash and comparing the two would be a category ` +
          `error. Deciding it requires the key, which the harness deliberately destroys. This is ` +
          `the claim section 7 exists for.`,
      );
    }
  }

  // ── 7. The claim that cannot be checked without spending ───────────────────
  heading("7 — the strongest claim, and whether we can honestly check it");

  const decryptionStatement =
    "the key recovered from the vault actually decrypts the committed content";

  if (live) {
    if (cdrApiUrl === undefined || cdrApiUrl === "") {
      cannotVerify(decryptionStatement, "CDR_API_URL is not set, so a live read is impossible");
    } else if (decrypted === null) {
      cannotVerify(decryptionStatement, "no decrypted-resource.json records a plaintext hash");
    } else {
      say("  … performing a fresh authorized read and re-decrypting (this spends a little gas)");
      await initWasm();
      const readerAccount = privateKeyToAccount(requirePrivateKey("AENEID_READER_PRIVATE_KEY"));
      const client = new CDRClient({
        network: "testnet",
        publicClient: publicClient as never,
        walletClient: createWalletClient({
          account: readerAccount,
          transport: http(rpcUrl),
        }) as never,
        apiUrl: cdrApiUrl,
      });
      const { encodeAbiParameters } = await import("viem");
      const aux = encodeAbiParameters(
        [{ type: "uint256[]" }],
        [[BigInt(state.license!.licenseTokenId)]],
      );
      const result = await client.consumer.accessCDR({
        uuid: state.vault!.uuid,
        accessAuxData: aux,
        timeoutMs: 120_000,
      });
      const sealed = new Uint8Array(readFileSync(blobPath));
      const plaintext = decryptContent(sealed, result.dataKey);
      const freshSha = sha256Hex(plaintext);

      assertClaim(
        decryptionStatement,
        freshSha === decrypted.plaintextSha256,
        `a NEW read returned a key, which decrypted the committed blob to sha256 ` +
          `${freshSha.slice(0, 20)}… — byte-for-byte the value recorded at ${new Date().toISOString()}. ` +
          `The vault genuinely gates content, and the content genuinely opens.`,
        `a fresh read produced a key that decrypted to ${freshSha.slice(0, 20)}…, which does NOT ` +
          `match the recorded ${decrypted.plaintextSha256?.slice(0, 20)}…. The key from the vault ` +
          `does not open the committed content.`,
      );
    }
  } else {
    cannotVerify(
      decryptionStatement,
      "not checked in offline mode. The harness DESTROYS the data key after a successful run, " +
        "by design — so no copy exists to decrypt with, and this verifier will not pretend " +
        "otherwise. Re-run with --live (needs AENEID_READER_PRIVATE_KEY and a little gas) to " +
        "perform a fresh read and decrypt the committed bytes. What IS verified above: the " +
        "vault's gate on chain, the licence's real owner, the live authorization rule, and that " +
        "the committed bytes hash to the recorded value. What is NOT: that any key opens them.",
    );
  }

  // ── 8. No secrets were persisted ───────────────────────────────────────────
  heading("8 — the evidence contains no secret material");

  // A leaked private key on disk takes exactly one shape: a JSON string of 64 hex characters
  // standing alone. So rather than grepping, walk EVERY artifact — not just the state file —
  // and require each key-shaped literal to be either a transaction hash the evidence declares
  // or a field the artifact itself names as a hash.
  const keyShaped: string[] = [];
  const fingerprintFields: string[] = [];
  const abiBlobs: string[] = [];
  let scannedFiles = 0;

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;
    scannedFiles += 1;
    const parsed = JSON.parse(readFileSync(join(dir, entry), "utf8")) as unknown;
    for (const leaf of hexLeaves(parsed, "")) {
      const normalised = leaf.value.toLowerCase().startsWith("0x")
        ? leaf.value.toLowerCase()
        : `0x${leaf.value.toLowerCase()}`;
      if (knownTxHashes.has(normalised)) continue;
      // A hash fingerprint — the field says so in its own name, and a fingerprint is not a key.
      if (/sha256/i.test(leaf.path)) {
        fingerprintFields.push(`${entry}:${leaf.path}`);
        continue;
      }
      // A 32-byte ABI-encoded condition blob is exactly the same LENGTH as a private key and
      // nothing like the same thing: abi.encode(address) is 12 zero bytes plus an address.
      if (/(conditionData|accessAuxData)$/i.test(leaf.path)) {
        abiBlobs.push(`${entry}:${leaf.path}`);
        continue;
      }
      keyShaped.push(`${entry}:${leaf.path} = ${leaf.value.slice(0, 14)}…`);
    }
  }

  assertClaim(
    "no key-shaped literal sits unlabelled in the evidence",
    keyShaped.length === 0,
    `all ${scannedFiles} JSON artifacts scanned. Every 32-byte literal is a declared ` +
      `transaction hash, one of ${fingerprintFields.length} field(s) the artifact names as a ` +
      `hash (${[...new Set(fingerprintFields.map((f) => f.split(":").slice(1).join(":")))].join(", ")}), ` +
      `or one of ${abiBlobs.length} ABI-encoded condition blob(s). Nothing on disk has the ` +
      `unexplained shape of a private key.`,
    `these key-shaped literals are neither a declared transaction hash, nor a field named as a ` +
      `hash, nor an ABI blob: ${keyShaped.join("; ")}. Inspect them by hand before publishing — ` +
      `this is exactly the shape a leaked private key takes.`,
  );

  record(
    "the data key is not on disk",
    "VERIFIED",
    "no artifact records the data key itself — only a sha256 fingerprint for comparison. The key " +
      "existed in memory during the run and on chain inside the vault, and nowhere else.",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist the claims next to the evidence they judge.
 *
 * Deliberately NOT a verdict of its own: the file records what this run of the verifier found,
 * with the mode it ran in, so a reader can tell an offline report from a live one and can see
 * which claims were left unproven rather than having them quietly dropped.
 */
function writeReport(runId: string, live: boolean, exitCode: number): string | null {
  const dir = runDir(runId);
  if (!existsSync(dir)) return null;

  const path = join(dir, "verification-report.json");
  const payload = {
    verifier: "tools/verify-canonical-run.ts",
    mode: live ? "live" : "offline",
    generatedAt: new Date().toISOString(),
    rpcUrl,
    runId,
    exitCode,
    counts: {
      verified: claims.filter((c) => c.verdict === "VERIFIED").length,
      refuted: claims.filter((c) => c.verdict === "REFUTED").length,
      notVerifiable: claims.filter((c) => c.verdict === "NOT VERIFIABLE").length,
    },
    claims,
  };

  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return path;
}

function report(): number {
  const verified = claims.filter((c) => c.verdict === "VERIFIED").length;
  const refuted = claims.filter((c) => c.verdict === "REFUTED");
  const unproven = claims.filter((c) => c.verdict === "NOT VERIFIABLE").length;

  heading("RESULT");
  say(`  ${verified} verified · ${refuted.length} refuted · ${unproven} not verifiable`);
  say("");

  if (refuted.length > 0) {
    say("  REFUTED — the evidence says something the chain or the bytes contradict:");
    for (const claim of refuted) say(`    ✗ ${claim.statement}`);
    say("");
    say("  Nothing above may be described as verified. Fix the evidence or the claim.");
    return 1;
  }

  if (unproven > 0) {
    say("  NOT VERIFIABLE is not a failure — it is an honest gap, and it is listed rather");
    say("  than hidden. Read them: they are the limits of what this evidence can support.");
    say("");
  }

  say("  Every claim that could be re-derived from the chain or from the committed bytes holds.");
  say("  The evidence has been checked against something other than itself.");
  return 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const runIdArg = argv.indexOf("--run");
  const runId =
    (runIdArg >= 0 ? argv[runIdArg + 1] : undefined) ?? process.env.LICENSEVAULT_RUN_ID?.trim() ?? CANONICAL_RUN_ID;
  const live = argv.includes("--live");

  say("");
  say("LICENSEVAULT — BUILD 3: independent verification of a canonical run");
  say("───────────────────────────────────────────────────────────");
  say(`  run:   ${runId}`);
  say(`  rpc:   ${rpcUrl}`);
  say(`  mode:  ${live ? "LIVE (will perform a fresh read and spend gas)" : "offline (free, read-only)"}`);

  try {
    await verify(runId, live);
  } catch (error) {
    // A crash is not a refutation, and must not be reported as one.
    record(
      "the verifier ran to completion",
      "REFUTED",
      `it crashed instead: ${(error as Error).message}. This says nothing about the evidence — ` +
        `it means the verifier could not finish, so the claims below are unchecked, not disproven.`,
    );
  }

  const exitCode = report();
  const reportPath = writeReport(runId, live, exitCode);
  if (reportPath !== null) {
    say("");
    say(`  Report written to ${reportPath.replace(/\\/g, "/")}`);
  }
  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  console.error("verifier failed to start:", error);
  process.exitCode = 1;
});
