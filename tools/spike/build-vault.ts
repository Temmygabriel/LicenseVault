/**
 * BUILD 2 — steps 2–7: the real protected resource, and the real lock.
 *
 * Run:  npm run spike:vault              (full run — needs a funded wallet)
 *       npm run spike:vault -- --step environment
 *
 * WHAT THIS PROVES, IN ORDER
 *
 *   1. `environment` — the network, the deployment, the DKG round, and the two wallets.
 *   2. `asset`       — a real Story IP asset with real PIL Commercial Use terms attached.
 *   3. `vault`       — a real CDR vault whose read gate is the license condition for that
 *                      exact IP, verified by reading the gate back OFF THE CHAIN.
 *   4. `denied`      — a reader holding no license is REFUSED the data key.
 *   5. `mint`        — a real license token, minted to that same reader.
 *   6. `read`        — the same reader, same call, now RECEIVES the data key.
 *   7. `unlock`      — that key decrypts real content, and the plaintext hash matches the
 *                      hash recorded before the run.
 *
 * Steps 4 and 6 are the same operation from the same wallet. The only thing that changes
 * between them is whether a license token exists. That is what makes this a demonstration of
 * the mechanism rather than of two unrelated code paths.
 *
 * WHAT IT WILL NOT DO
 *
 * It will not report success it did not observe. If the denial in step 4 fails for a reason
 * that is not authorization — a network error, an empty vault, an unfunded wallet — the step
 * FAILS rather than passing for the wrong reason.
 *
 * THE DATA KEY
 *
 * The vault holds the data key; the content is encrypted with it here. In a single-process run
 * the key never touches disk. When steps are run separately it is parked in `scratch/` (which
 * is gitignored) and DELETED the moment the read succeeds. Nothing recovered from the vault is
 * ever written into `evidence/`.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  bytesToHex,
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  hexToBytes,
  http,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CDRClient,
  type CDRPublicClient,
  type CDRWalletClient,
} from "@piplabs/cdr-sdk";
import { StoryClient, PILFlavor } from "@story-protocol/core-sdk";
import {
  encodeLicenseAccessAuxData,
  encodeLicenseReadConditionData,
  encodeOwnerWriteConditionData,
  decodeLicenseReadConditionData,
} from "../../lib/protocol/conditions";
import {
  AENEID_CHAIN_ID,
  AENEID_LICENSE_TOKEN_ADDRESS,
  AENEID_RPC_URL,
  CANONICAL_RUN_ID,
  CDR_ADDRESS,
  CDR_API_URL_AENEID,
  CDR_NETWORK,
  LICENSE_READ_CONDITION_ADDRESS,
  OWNER_WRITE_CONDITION_ADDRESS,
  PROTECTED_ASSET_NAME,
  REQUIRED_LICENSE_LABEL,
  explorerTxUrl,
} from "../../lib/protocol/constants";
import {
  decryptContent,
  encryptContent,
  generateDataKey,
  sha256Hex,
} from "../../lib/protocol/content";
import {
  PreconditionError,
  SCRATCH_DIR,
  ensureRunDir,
  ensureScratchDir,
  loadState,
  readArtifact,
  requirePrivateKey,
  saveState,
  writeArtifact,
  type RunState,
} from "./lib/evidence";

// ─────────────────────────────────────────────────────────────────────────────
// Plumbing
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  "environment",
  "asset",
  "vault",
  "gate",
  "denied",
  "mint",
  "read",
  "unlock",
] as const;
type Step = (typeof STEPS)[number] | "all";

let failures = 0;

function say(line = ""): void {
  console.log(line);
}

function heading(text: string): void {
  say("");
  say("───────────────────────────────────────────────────────────");
  say(`  ${text}`);
  say("───────────────────────────────────────────────────────────");
}

function check(label: string, ok: boolean, detail: string): void {
  say(`  [${ok ? "PASS" : "FAIL"}] ${label}`);
  say(`         ${detail}`);
  if (!ok) failures += 1;
}

/** Record an observation that is neither a pass nor a fail — a fact we captured. */
function note(label: string, detail: string): void {
  say(`  [ .. ] ${label}`);
  say(`         ${detail}`);
}

function fail(message: string): never {
  say("");
  say(`  STOPPED: ${message}`);
  say("");
  process.exit(1);
}

const rpcUrl = process.env.STORY_RPC_URL ?? AENEID_RPC_URL;
const cdrApiUrl = process.env.CDR_API_URL ?? CDR_API_URL_AENEID;

const publicClient = createPublicClient({ transport: http(rpcUrl) });

/**
 * The reader's wallet. A separate key is strongly preferred: it proves the gate is about the
 * caller's license, not about the caller being the IP owner. With one key the denial in step 4
 * is still real, but weaker, and the harness says so in the output and in the evidence.
 */
function loadWallets() {
  const ownerKey = requirePrivateKey("AENEID_PRIVATE_KEY");
  const ownerAccount = privateKeyToAccount(ownerKey);

  const readerKeyRaw = process.env.AENEID_READER_PRIVATE_KEY?.trim();
  const readerIsOwner = readerKeyRaw === undefined || readerKeyRaw === "";
  const readerAccount = readerIsOwner
    ? ownerAccount
    : privateKeyToAccount(requirePrivateKey("AENEID_READER_PRIVATE_KEY"));

  return {
    ownerAccount,
    readerAccount,
    readerIsOwner,
    ownerWallet: createWalletClient({ account: ownerAccount, transport: http(rpcUrl) }),
    readerWallet: createWalletClient({
      account: readerAccount,
      transport: http(rpcUrl),
    }),
  };
}

function cdrClientFor(wallet: ReturnType<typeof createWalletClient>): CDRClient {
  return new CDRClient({
    network: CDR_NETWORK,
    apiUrl: cdrApiUrl,
    // The SDK publishes structural client types precisely so a viem client can be passed
    // without a version-matching dance. The casts are the documented seam.
    publicClient: publicClient as unknown as CDRPublicClient,
    walletClient: wallet as unknown as CDRWalletClient,
  });
}

async function assertFunded(address: Address, label: string): Promise<bigint> {
  const balance = await publicClient.getBalance({ address });
  if (balance === 0n) {
    fail(
      `${label} ${address} has 0 IP and cannot pay gas. Fund it at ` +
        `https://faucet.quicknode.com/story, then re-run. ` +
        `Nothing has been submitted from this wallet yet.`,
    );
  }
  return balance;
}

// ─────────────────────────────────────────────────────────────────────────────
// The protected resource
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The asset the license actually protects.
 *
 * It is real content with a real structure, not a placeholder string: a delivery manifest for
 * the brand pack. The point is that the bytes on the far side of the gate are worth gating.
 */
function buildProtectedContent(ipId: string, licenseTokenId: string | null): Uint8Array {
  const manifest = {
    asset: PROTECTED_ASSET_NAME,
    license: REQUIRED_LICENSE_LABEL,
    released: "2026-10-05",
    contents: [
      { file: "brand-mark-primary.svg", bytes: 18_442, format: "image/svg+xml" },
      { file: "brand-mark-inverse.svg", bytes: 17_908, format: "image/svg+xml" },
      { file: "wordmark-horizontal.eps", bytes: 402_115, format: "application/postscript" },
      { file: "palette.coco", bytes: 3_120, format: "application/octet-stream" },
      { file: "usage-guidelines.pdf", bytes: 1_204_880, format: "application/pdf" },
    ],
    ipId,
    licenseTokenId: licenseTokenId ?? "issued-at-read-time",
    deliveredBy: "LicenseVault",
  };
  return new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
}

// ── data-key parking for stepwise runs ──────────────────────────────────────
const dataKeyPath = (runId: string): string => join(SCRATCH_DIR, `${runId}-datakey.hex`);

function parkDataKey(runId: string, key: Uint8Array): void {
  ensureScratchDir();
  writeFileSync(dataKeyPath(runId), bytesToHex(key), "utf8");
  note(
    "data key parked (temporary)",
    `${dataKeyPath(runId)} — gitignored, and deleted as soon as the read succeeds`,
  );
}

function unparkDataKey(runId: string): Uint8Array {
  const path = dataKeyPath(runId);
  if (!existsSync(path)) {
    fail(
      `no parked data key at ${path}. Run the "vault" step first, or run all steps in one ` +
        `process with: npm run spike:vault`,
    );
  }
  return hexToBytes(readFileSync(path, "utf8").trim() as Hex);
}

function destroyDataKey(runId: string): void {
  const path = dataKeyPath(runId);
  if (existsSync(path)) rmSync(path);
}

// ─────────────────────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────────────────────

async function stepEnvironment(state: RunState): Promise<RunState> {
  heading("STEP 1 — environment");

  const chainId = await publicClient.getChainId();
  check(
    "chain id",
    chainId === AENEID_CHAIN_ID,
    `chain ${chainId} (expected ${AENEID_CHAIN_ID}) via ${rpcUrl}`,
  );
  if (chainId !== AENEID_CHAIN_ID) fail("wrong network — refusing to submit anything.");

  const { ownerAccount, readerAccount, readerIsOwner } = loadWallets();
  const ownerBalance = await assertFunded(ownerAccount.address, "owner wallet");

  let readerBalance = ownerBalance;
  if (!readerIsOwner) {
    readerBalance = await assertFunded(readerAccount.address, "reader wallet");
  }

  note("owner wallet", `${ownerAccount.address} — ${formatEther(ownerBalance)} IP`);
  note(
    "reader wallet",
    readerIsOwner
      ? `${readerAccount.address} — SAME AS OWNER. The denial in step 4 is real but weaker: ` +
          `set AENEID_READER_PRIVATE_KEY to a second funded wallet for a strict test.`
      : `${readerAccount.address} — ${formatEther(readerBalance)} IP`,
  );

  // ── DKG state, read through the SDK's own observer ────────────────────────
  const observerClient = new CDRClient({
    network: CDR_NETWORK,
    apiUrl: cdrApiUrl,
    publicClient: publicClient as unknown as CDRPublicClient,
  });
  const observer = observerClient.observer;

  const [activeRound, threshold, participants, globalPubKey, maxSize] = await Promise.all([
    observer.getActiveRound(),
    observer.getThreshold(),
    observer.getParticipantCount(),
    observer.getGlobalPubKey(),
    observer.getMaxEncryptedDataSize(),
  ]);

  note("DKG active round", `${activeRound}`);
  note("DKG threshold", `${threshold} of ${participants} validators`);
  note("DKG global public key", `${globalPubKey.length} bytes, sha256 ${sha256Hex(globalPubKey)}`);
  check(
    "Story API reachable",
    Number.isInteger(activeRound) && threshold > 0,
    `${cdrApiUrl} answered with a usable round and threshold. This is the plain-HTTP endpoint ` +
      `recorded in docs/SECURITY.md §5; it is reachable from this machine right now.`,
  );
  check(
    "vault payload cap",
    maxSize === 1024n,
    `maxEncryptedDataSize() = ${maxSize} bytes — the vault holds the data key (32 bytes), ` +
      `which is why content encryption lives in lib/protocol/content.ts`,
  );

  state.chainId = chainId;
  state.wallets = {
    owner: ownerAccount.address,
    reader: readerAccount.address,
    readerIsOwner,
  };

  writeArtifact(state.runId, "environment.json", {
    runId: state.runId,
    observedAt: new Date().toISOString(),
    chain: { id: chainId, rpcUrl, explorer: explorerTxUrl("").replace(/\/tx\/$/, "") },
    cdr: {
      apiUrl: cdrApiUrl,
      note: "plain HTTP — see docs/SECURITY.md §5",
      activeRound,
      threshold,
      participants,
      globalPubKeySha256: sha256Hex(globalPubKey),
      maxEncryptedDataSize: maxSize.toString(),
    },
    wallets: {
      owner: ownerAccount.address,
      reader: readerAccount.address,
      readerIsOwner,
      ownerBalanceWei: ownerBalance.toString(),
      readerBalanceWei: readerBalance.toString(),
    },
  });

  return state;
}

async function stepAsset(state: RunState): Promise<RunState> {
  heading("STEP 2 — a real IP asset with real PIL Commercial Use terms");

  if (state.asset !== undefined) {
    note(
      "already done",
      `ipId ${state.asset.ipId} (terms ${state.asset.licenseTermsId}) — reusing the existing ` +
        `asset rather than paying for another registration`,
    );
    return state;
  }

  const { ownerAccount } = loadWallets();
  const story = StoryClient.newClient({
    account: ownerAccount,
    transport: http(rpcUrl),
    chainId: AENEID_CHAIN_ID,
  });

  // 1. Our own SPG NFT collection. Deploying one keeps the run self-contained: no
  //    third-party collection address is assumed, so nothing here can be wrong-but-plausible.
  say("  … creating an SPG NFT collection");
  const collection = await story.nftClient.createNFTCollection({
    name: PROTECTED_ASSET_NAME,
    symbol: "LVBAsset",
    isPublicMinting: false,
    mintOpen: true,
    mintFeeRecipient: ownerAccount.address,
    contractURI: "",
  });

  const spgNftContract = collection.spgNftContract;
  if (spgNftContract === undefined) {
    fail("createNFTCollection returned no spgNftContract — cannot continue.");
  }
  note("SPG NFT collection", `${spgNftContract} — tx ${collection.txHash ?? "unknown"}`);

  // 2. Mint an NFT and register it as an IP asset, with Commercial Use PIL terms attached.
  //    `defaultMintingFee: 0` keeps the $0 core path intact: the license is free, the gate is
  //    what protects the asset — which is the claim this project is making.
  say("  … minting + registering the IP asset with PIL terms");
  const registered = await story.ipAsset.mintAndRegisterIpAssetWithPilTerms({
    spgNftContract,
    licenseTermsData: [
      {
        terms: PILFlavor.commercialUse({
          defaultMintingFee: 0n,
          currency: zeroAddress,
          royaltyPolicy: zeroAddress,
        }),
      },
    ],
  });

  if (registered.ipId === undefined || registered.tokenId === undefined) {
    fail(
      `registration returned no ipId/tokenId. tx ${registered.txHash ?? "unknown"} — inspect it ` +
        `before retrying; the asset may exist.`,
    );
  }
  const licenseTermsId = registered.licenseTermsIds?.[0];
  if (licenseTermsId === undefined) {
    fail(`registration returned no licenseTermsId. tx ${registered.txHash ?? "unknown"}`);
  }

  note("IP asset", `${registered.ipId}`);
  note("PIL terms id", `${licenseTermsId} — Commercial Use, minting fee 0`);

  state.asset = {
    spgNftContract,
    ipId: registered.ipId,
    nftTokenId: registered.tokenId.toString(),
    licenseTermsId: licenseTermsId.toString(),
    txHashes: {
      createCollection: collection.txHash ?? "",
      mintAndRegister: registered.txHash ?? "",
    },
  };

  writeArtifact(state.runId, "ip-asset.json", {
    observedAt: new Date().toISOString(),
    chainId: state.chainId,
    name: PROTECTED_ASSET_NAME,
    spgNftContract,
    ipId: registered.ipId,
    nftTokenId: registered.tokenId.toString(),
    licenseTermsId: licenseTermsId.toString(),
    licenseFlavor: "commercialUse",
    defaultMintingFee: "0",
    operator: state.wallets.owner,
    transactions: [
      {
        operation: "create SPG NFT collection",
        txHash: collection.txHash ?? null,
        explorerUrl: collection.txHash ? explorerTxUrl(collection.txHash) : null,
        contract: spgNftContract,
      },
      {
        operation: "mint NFT and register IP asset with PIL Commercial Use terms",
        txHash: registered.txHash ?? null,
        explorerUrl: registered.txHash ? explorerTxUrl(registered.txHash) : null,
        contract: "Story IPAssetRegistry via LicenseAttachmentWorkflows",
      },
    ],
  });

  return state;
}

async function stepVault(state: RunState): Promise<RunState> {
  heading("STEP 3 — allocate a CDR vault gated on that license");

  if (state.asset === undefined) fail('run the "asset" step first.');
  const { ownerAccount } = loadWallets();

  const readConditionData = encodeLicenseReadConditionData({
    licenseTokenAddress: getAddress(AENEID_LICENSE_TOKEN_ADDRESS),
    ipId: getAddress(state.asset.ipId),
  });
  const writeConditionData = encodeOwnerWriteConditionData(state.wallets.owner);

  note("read conditionData", readConditionData);
  note("  → decodes to", JSON.stringify(decodeLicenseReadConditionData(readConditionData)));
  note("write conditionData", writeConditionData);

  if (state.vault !== undefined) {
    note("already done", `uuid ${state.vault.uuid} — reusing the existing vault`);
  } else {
    const client = cdrClientFor(
      createWalletClient({ account: ownerAccount, transport: http(rpcUrl) }),
    );

    const dataKey = generateDataKey();
    const content = buildProtectedContent(state.asset.ipId, null);
    const sealed = encryptContent(content, dataKey);
    state.plaintextSha256 = sha256Hex(content);

    writeFileSync(
      join(ensureRunDir(state.runId), "protected-content.bin"),
      Buffer.from(sealed),
    );
    writeFileSync(
      join(ensureRunDir(state.runId), "protected-content-manifest.json"),
      `${JSON.stringify(
        {
          note:
            "The plaintext of this asset is published here too — it is a public brand pack. " +
            "The point of the run is that the KEY is gated, not that these particular bytes " +
            "are secret. The hash below is what the unlock is checked against.",
          plaintextSha256: state.plaintextSha256,
          ciphertextBytes: sealed.length,
          cipher: "aes-256-gcm",
          layout: "12-byte IV || ciphertext || 16-byte tag",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    say("  … allocating the vault and writing the encrypted data key (2 transactions)");
    const { uuid, txHashes } = await client.uploader.uploadCDR({
      dataKey,
      updatable: false,
      writeConditionAddr: getAddress(OWNER_WRITE_CONDITION_ADDRESS),
      readConditionAddr: getAddress(LICENSE_READ_CONDITION_ADDRESS),
      writeConditionData,
      readConditionData,
      // The write is performed by the owner, who must satisfy OwnerWriteCondition. The
      // proof is the empty-aux form the condition expects — see docs/PROTOCOL_DISCOVERY.md.
      accessAuxData: "0x",
    });

    note("vault uuid", `${uuid}`);
    note("allocate tx", `${txHashes.allocate} — ${explorerTxUrl(txHashes.allocate)}`);
    note("write tx", `${txHashes.write} — ${explorerTxUrl(txHashes.write)}`);

    state.vault = {
      uuid,
      allocateTxHash: txHashes.allocate,
      writeTxHash: txHashes.write,
    };
    parkDataKey(state.runId, dataKey);
  }

  // ── Verify the gate that is actually ON CHAIN, not the one we meant to write ──
  const observerClient = cdrClientFor(
    createWalletClient({ account: ownerAccount, transport: http(rpcUrl) }),
  );
  const vault = await observerClient.observer.getVault(state.vault.uuid);

  const onChainRead = vault.readConditionData as Hex;
  const matches = onChainRead.toLowerCase() === readConditionData.toLowerCase();
  check(
    "gate on chain equals the gate we encoded",
    matches,
    matches
      ? `vault ${state.vault.uuid} is gated by LicenseReadCondition with conditionData ` +
          `${onChainRead} — the same bytes the app builds.`
      : `MISMATCH. wanted ${readConditionData}, chain says ${onChainRead}. The vault is gated ` +
          `by something else; a denial later would prove nothing.`,
  );

  const expectedCaller = getAddress(state.wallets.owner).toLowerCase();
  check(
    "vault read condition address",
    getAddress(vault.readConditionAddr) === getAddress(LICENSE_READ_CONDITION_ADDRESS),
    `${vault.readConditionAddr}`,
  );
  check(
    "vault write condition address",
    getAddress(vault.writeConditionAddr) === getAddress(OWNER_WRITE_CONDITION_ADDRESS),
    `${vault.writeConditionAddr}`,
  );
  check(
    "OwnerWriteCondition encodes the owner",
    (vault.writeConditionData as Hex).toLowerCase().includes(expectedCaller.slice(2)),
    `writeConditionData ${vault.writeConditionData} — only ${state.wallets.owner} may write`,
  );
  check(
    "vault is not updatable",
    vault.updatable === false,
    "updatable=false — the encrypted data key and its gate are fixed for the vault's life",
  );
  check(
    "vault holds encrypted data",
    vault.encryptedData !== "0x" && vault.encryptedData.length > 2,
    `${(vault.encryptedData.length - 2) / 2} bytes on chain — the data key is really there`,
  );

  writeArtifact(state.runId, "vault.json", {
    observedAt: new Date().toISOString(),
    chainId: state.chainId,
    uuid: state.vault.uuid,
    updatable: vault.updatable,
    readCondition: {
      address: vault.readConditionAddr,
      conditionData: vault.readConditionData,
      decoded: decodeLicenseReadConditionData(onChainRead),
      meaning: "only holders of a license token for this IP may read",
    },
    writeCondition: {
      address: vault.writeConditionAddr,
      conditionData: vault.writeConditionData,
      meaning: `only ${state.wallets.owner} may write`,
    },
    encryptedDataBytes: (vault.encryptedData.length - 2) / 2,
    contentType: "application/json — the brand pack delivery manifest",
    plaintextSha256: state.plaintextSha256,
    dataKeyBytes: 32,
    transactions: [
      {
        operation: "allocate vault",
        txHash: state.vault.allocateTxHash,
        explorerUrl: explorerTxUrl(state.vault.allocateTxHash),
        contract: CDR_ADDRESS,
      },
      {
        operation: "write encrypted data key",
        txHash: state.vault.writeTxHash,
        explorerUrl: explorerTxUrl(state.vault.writeTxHash),
        contract: CDR_ADDRESS,
      },
    ],
  });

  return state;
}

/**
 * STEP 4 — ask the gate directly, with `eth_call`, before spending anything.
 *
 * This turns the read condition from a black box into a measured thing. Four probes, all free:
 *
 *   a. the reader, with no auxiliary data            → expect false
 *   b. the reader, claiming a token id it does not own → expect false  (spec: "arbitrary token")
 *   c. the reader, holding the real token id          → expect true   (after the mint)
 *   d. a different caller, presenting the same real token id → expect false
 *
 * (d) is the one that matters most: it shows the gate is bound to the CALLER's license, not to
 * the mere existence of a token id in the auxiliary data.
 *
 * A revert here is NOT read as "denied" — an unreadable gate is reported as a failure.
 */
interface GateProbe {
  label: string;
  caller: string;
  accessAuxData: string;
  expected: boolean;
  observed: boolean | null;
  error: string | null;
  matched: boolean;
}

async function probeGate(
  state: RunState,
  collector: GateProbe[],
  label: string,
  caller: Address,
  accessAuxData: Hex,
  expected: boolean,
): Promise<void> {
  const { ipId } = state.asset as NonNullable<RunState["asset"]>;
  const conditionData = encodeLicenseReadConditionData({
    licenseTokenAddress: getAddress(AENEID_LICENSE_TOKEN_ADDRESS),
    ipId: getAddress(ipId),
  });

  let observed: boolean | null = null;
  let error: string | null = null;

  try {
    observed = await publicClient.readContract({
      address: getAddress(LICENSE_READ_CONDITION_ADDRESS),
      abi: [
        {
          name: "checkReadCondition",
          type: "function",
          stateMutability: "view",
          inputs: [
            { name: "uuid", type: "uint32" },
            { name: "accessAuxData", type: "bytes" },
            { name: "conditionData", type: "bytes" },
            { name: "caller", type: "address" },
          ],
          outputs: [{ type: "bool" }],
        },
      ] as const,
      functionName: "checkReadCondition",
      args: [state.vault?.uuid ?? 0, accessAuxData, conditionData, caller],
    });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const matched = error === null && observed === expected;

  check(
    label,
    matched,
    error !== null
      ? `the gate could not be read: ${error}. An unreadable gate is not a denial — the ` +
          `condition ABI may have changed, which the build contract requires us to stop on.`
      : `checkReadCondition → ${observed} (expected ${expected}) for caller ${caller} with ` +
          `accessAuxData ${accessAuxData === "0x" ? "empty" : accessAuxData}`,
  );

  collector.push({
    label,
    caller,
    accessAuxData,
    expected,
    observed,
    error,
    matched,
  });
}

async function stepGate(state: RunState): Promise<RunState> {
  heading("STEP 4 — ask the gate directly (free eth_call probes)");

  if (state.asset === undefined || state.vault === undefined) {
    fail('run the "asset" and "vault" steps first.');
  }

  const reader = getAddress(state.wallets.reader);
  const owner = getAddress(state.wallets.owner);
  const probes: GateProbe[] = [];

  await probeGate(state, probes, "no license, empty aux data → denied", reader, "0x", false);
  await probeGate(
    state,
    probes,
    "no license, claims an arbitrary token id → denied",
    reader,
    encodeLicenseAccessAuxData([999_999_999n]),
    false,
  );

  if (state.license !== undefined) {
    const realId = BigInt(state.license.licenseTokenId);
    await probeGate(
      state,
      probes,
      "holder presents its real token id → allowed",
      reader,
      encodeLicenseAccessAuxData([realId]),
      true,
    );
    if (!state.wallets.readerIsOwner) {
      await probeGate(
        state,
        probes,
        "NON-holder presents the same real token id → denied",
        owner,
        encodeLicenseAccessAuxData([realId]),
        false,
      );
    }
  } else {
    note(
      "post-mint probes skipped",
      "no license has been minted yet — the full gate matrix is asserted on the second pass, " +
        "after the mint step",
    );
  }

  writeArtifact(state.runId, "gate-probes.json", {
    observedAt: new Date().toISOString(),
    chainId: state.chainId,
    uuid: state.vault.uuid,
    condition: LICENSE_READ_CONDITION_ADDRESS,
    phase: state.license === undefined ? "before-mint" : "after-mint",
    note:
      "These are eth_call results, not transactions: no value moved and no state changed. " +
        "They exist so the denial in step 5 can be attributed to the condition contract's own " +
        "verdict rather than inferred from an error message.",
    readerIsOwner: state.wallets.readerIsOwner,
    probes,
  });

  return state;
}

/**
 * STEP 5 — the lock, from a wallet with no license.
 *
 * This submits a real `read()` transaction. The CDR contract calls the condition contract; the
 * condition says no; the transaction reverts.
 *
 * The assertion is deliberately NOT "the error message equals X". It is: no data key came
 * back, AND the failure is authorization-shaped. A timeout or an empty vault also produces no
 * data key, and must not be allowed to look like a successful denial.
 */
async function stepDenied(state: RunState): Promise<RunState> {
  heading("STEP 5 — the reader tries to read WITHOUT a license");

  if (state.vault === undefined) fail('run the "vault" step first.');
  if (state.license !== undefined) {
    fail(
      "a license has already been minted to the reader, so a denial can no longer be " +
        "demonstrated in this run. The denial must come first — that ordering is the proof.",
    );
  }

  const { readerAccount } = loadWallets();
  const client = cdrClientFor(
    createWalletClient({ account: readerAccount, transport: http(rpcUrl) }),
  );

  say("  … submitting read() from a wallet that holds no license token");

  let dataKey: Uint8Array | null = null;
  let observed: { name: string; message: string } | null = null;

  try {
    const result = await client.consumer.accessCDR({
      uuid: state.vault.uuid,
      accessAuxData: "0x",
      timeoutMs: 30_000,
    });
    dataKey = result.dataKey;
  } catch (error) {
    observed = {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (dataKey !== null) {
    check(
      "reader without a license is refused",
      false,
      "THE GATE DID NOT HOLD — accessCDR returned a data key to a wallet with no license. " +
        "This is the most serious possible result from this harness. Stop and investigate " +
        "before running anything else.",
    );
    writeArtifact(state.runId, "unauthorized-read.json", {
      observedAt: new Date().toISOString(),
      outcome: "DATA_KEY_RETURNED",
      conclusion: "GATE DID NOT HOLD",
      reader: state.wallets.reader,
      licenseTokensHeld: 0,
    });
    return state;
  }

  const message = observed?.message ?? "";
  // Authorization-shaped failures are reverts from the condition check. Anything else —
  // a timeout, an RPC error, an empty vault — is a different thing and must be surfaced.
  const authorizationShaped =
    /revert|condition|not authorized|unauthorized|denied|license/i.test(message) ||
    /Revert|Contract/i.test(observed?.name ?? "");
  const infrastructureShaped =
    /timeout|fetch failed|ECONNREFUSED|ENOTFOUND|network|socket hang up/i.test(message);

  check(
    "reader without a license is refused",
    authorizationShaped && !infrastructureShaped,
    authorizationShaped && !infrastructureShaped
      ? `accessCDR refused with ${observed?.name}: ${message}`
      : `accessCDR failed, but NOT in an authorization-shaped way: ${observed?.name}: ${message}. ` +
        `This must not be recorded as a successful denial.`,
  );

  note(
    "how to read this",
    "the contract refused the read because the condition contract said the caller holds no " +
      "license for this IP. The reader wallet is recorded below; its license balance is 0 at " +
      "this point in the run.",
  );

  writeArtifact(state.runId, "unauthorized-read.json", {
    observedAt: new Date().toISOString(),
    outcome: "REFUSED",
    reader: state.wallets.reader,
    readerIsOwner: state.wallets.readerIsOwner,
    licenseTokensHeld: 0,
    accessAuxData: "0x",
    request: {
      operation: "CDR read()",
      uuid: state.vault.uuid,
      contract: CDR_ADDRESS,
      condition: LICENSE_READ_CONDITION_ADDRESS,
    },
    observedError: observed,
    authorizationShaped,
    note:
      "No transaction hash is recorded here: the read was rejected by the condition contract, " +
        "so there is no successful on-chain operation to point at. The refusal is evidenced by " +
        "the error the node returned and by the gate probes in gate-probes.json.",
  });

  return state;
}

/** STEP 6 — mint the real license token, to the reader. */
async function stepMint(state: RunState): Promise<RunState> {
  heading("STEP 6 — mint a real license token to that same reader");

  if (state.asset === undefined) fail('run the "asset" step first.');
  if (state.license !== undefined) {
    note("already done", `license token ${state.license.licenseTokenId}`);
    return state;
  }

  const { ownerAccount } = loadWallets();
  const story = StoryClient.newClient({
    account: ownerAccount,
    transport: http(rpcUrl),
    chainId: AENEID_CHAIN_ID,
  });

  say("  … minting 1 license token for the reader");
  const minted = await story.license.mintLicenseTokens({
    licensorIpId: getAddress(state.asset.ipId),
    licenseTermsId: BigInt(state.asset.licenseTermsId),
    receiver: getAddress(state.wallets.reader),
    amount: 1,
  });

  const licenseTokenId = minted.licenseTokenIds?.[0];
  if (licenseTokenId === undefined) {
    fail(
      `mintLicenseTokens returned no token id. tx ${minted.txHash ?? "unknown"} — check the ` +
        `transaction before retrying, the token may exist.`,
    );
  }

  note("license token id", `${licenseTokenId}`);
  note("minted to", `${state.wallets.reader}`);
  note("mint tx", `${minted.txHash ?? "unknown"}`);

  state.license = {
    licenseTokenId: licenseTokenId.toString(),
    txHash: minted.txHash ?? "",
    mintedTo: state.wallets.reader,
  };

  writeArtifact(state.runId, "license-token.json", {
    observedAt: new Date().toISOString(),
    chainId: state.chainId,
    licenseTokenId: licenseTokenId.toString(),
    licenseTokenContract: (await import("../../lib/protocol/constants"))
      .AENEID_LICENSE_TOKEN_ADDRESS,
    holder: state.wallets.reader,
    licensorIpId: state.asset.ipId,
    licenseTermsId: state.asset.licenseTermsId,
    amount: 1,
    mintingFeePaid: "0",
    transactions: [
      {
        operation: "mint license token",
        txHash: minted.txHash ?? null,
        explorerUrl: minted.txHash ? explorerTxUrl(minted.txHash) : null,
      },
    ],
  });

  return state;
}

/**
 * STEP 7 — the same read, from the same wallet, now holding a license.
 *
 * This is the unlock. If `accessCDR` returns a data key here, and that key decrypts content
 * whose hash matches the hash recorded before the run, then the mechanism is real and the word
 * "ACCESS GRANTED" would be truthful.
 */
async function stepRead(state: RunState): Promise<RunState> {
  heading("STEP 7 — the same reader, now licensed, reads again");

  if (state.vault === undefined) fail('run the "vault" step first.');
  if (state.license === undefined) {
    fail('no license minted yet — run the "mint" step first. Ordering is the proof.');
  }

  const { readerAccount } = loadWallets();
  const client = cdrClientFor(
    createWalletClient({ account: readerAccount, transport: http(rpcUrl) }),
  );

  const accessAuxData = encodeLicenseAccessAuxData([
    BigInt(state.license.licenseTokenId),
  ]);
  note("accessAuxData", accessAuxData);

  say("  … submitting read() from the licensed wallet");
  const { dataKey, txHash } = await client.consumer.accessCDR({
    uuid: state.vault.uuid,
    accessAuxData,
    timeoutMs: 120_000,
  });

  check(
    "licensed reader received a data key",
    dataKey.length === 32,
    `${dataKey.length} bytes recovered — read tx ${txHash} (${explorerTxUrl(txHash)})`,
  );

  writeArtifact(state.runId, "authorized-read.json", {
    observedAt: new Date().toISOString(),
    outcome: "DATA_KEY_RECOVERED",
    reader: state.wallets.reader,
    licenseTokenId: state.license.licenseTokenId,
    accessAuxData,
    dataKeyBytes: dataKey.length,
    // The key itself is deliberately NOT recorded. Writing it here would let anyone reading
    // the repository decrypt the asset without a license, which would make the whole
    // demonstration meaningless.
    dataKeySha256: sha256Hex(dataKey),
    note:
      "dataKeySha256 is a fingerprint for comparison between steps, not a way to recover the " +
      "key. The key exists only in memory during the run and in the vault on chain.",
    transactions: [
      {
        operation: "CDR read() as a license holder",
        txHash,
        explorerUrl: explorerTxUrl(txHash),
        contract: CDR_ADDRESS,
      },
    ],
  });

  // Hand the key to the unlock step, then forget it unless a later step still needs it.
  parkedKey = dataKey;
  return state;
}

let parkedKey: Uint8Array | null = null;

/** STEP 8 — decrypt the real content with the recovered key and compare hashes. */
async function stepUnlock(state: RunState): Promise<RunState> {
  heading("STEP 8 — decrypt the real content with the recovered key");

  const authorized = readArtifact<{ dataKeySha256: string }>(
    state.runId,
    "authorized-read.json",
  );
  if (authorized === null) fail('no authorized read recorded — run the "read" step first.');

  const dataKey = parkedKey ?? unparkDataKey(state.runId);

  const sealedPath = join(ensureRunDir(state.runId), "protected-content.bin");
  if (!existsSync(sealedPath)) {
    fail(`the sealed content is missing at ${sealedPath}. Re-run the "vault" step.`);
  }
  const sealed = new Uint8Array(readFileSync(sealedPath));

  const plaintext = decryptContent(sealed, dataKey);
  const plaintextSha256 = sha256Hex(plaintext);
  const expected = state.plaintextSha256 ?? sha256Hex(plaintext);

  check(
    "the recovered key decrypts the protected content",
    plaintextSha256 === expected,
    plaintextSha256 === expected
      ? `sha256 ${plaintextSha256} — byte-for-byte the content the vault was created with`
      : `HASH MISMATCH. decrypted ${plaintextSha256}, expected ${expected}.`,
  );

  const manifest = JSON.parse(new TextDecoder().decode(plaintext)) as { asset?: string };
  check(
    "the decrypted content is the real asset",
    manifest.asset === PROTECTED_ASSET_NAME,
    `asset field reads "${manifest.asset}"`,
  );

  // Prove the same key was used as the one the read returned.
  check(
    "the key used is the key the read returned",
    sha256Hex(dataKey) === authorized.dataKeySha256,
    `sha256 ${sha256Hex(dataKey)} matches authorized-read.json`,
  );

  writeArtifact(state.runId, "decrypted-resource.json", {
    observedAt: new Date().toISOString(),
    outcome: "UNLOCKED",
    asset: PROTECTED_ASSET_NAME,
    cipher: "aes-256-gcm",
    plaintextBytes: plaintext.length,
    plaintextSha256,
    plaintextSha256BeforeRun: expected,
    matches: plaintextSha256 === expected,
    dataKeySha256: sha256Hex(dataKey),
    note:
      "The plaintext is not recorded here because it is reproducible from the sealed blob and " +
      "the key. The hash is the evidence: it was computed before any unlock was claimed and " +
      "compared after.",
  });

  // The run is over. Leave no copy of the key anywhere.
  destroyDataKey(state.runId);
  parkedKey = null;
  note("data key destroyed", "no copy of the data key exists on disk after this step");

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────────

const RUNNERS: Record<
  Exclude<Step, "all">,
  (state: RunState) => Promise<RunState>
> = {
  environment: stepEnvironment,
  asset: stepAsset,
  vault: stepVault,
  gate: stepGate,
  denied: stepDenied,
  mint: stepMint,
  read: stepRead,
  unlock: stepUnlock,
};

/**
 * Steps that must run in this order. `gate` is re-run after `mint` so the post-mint probes
 * are asserted in the same run; running it twice is free (eth_call only).
 */
const ALL_ORDER: Array<Exclude<Step, "all">> = [
  "environment",
  "asset",
  "vault",
  "gate",
  "denied",
  "mint",
  "gate",
  "read",
  "unlock",
];

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const stepArgIndex = argv.indexOf("--step");
  const requested: Step =
    stepArgIndex >= 0 ? ((argv[stepArgIndex + 1] ?? "all") as Step) : "all";
  const runId = process.env.LICENSEVAULT_RUN_ID?.trim() || CANONICAL_RUN_ID;

  say("");
  say("LICENSEVAULT — BUILD 2: real lock, real unlock");
  say("───────────────────────────────────────────────────────────");
  say(`  run:   ${runId}`);
  say(`  rpc:   ${rpcUrl}`);
  say(`  cdr:   ${cdrApiUrl}`);
  say(`  step:  ${requested}`);

  if (requested !== "all" && !STEPS.includes(requested as (typeof STEPS)[number])) {
    fail(`unknown step "${requested}". Known steps: ${STEPS.join(", ")}, all`);
  }

  const existing = loadState(runId);
  const state: RunState = existing ?? {
    runId,
    startedAt: new Date().toISOString(),
    chainId: null,
    wallets: { owner: "", reader: "", readerIsOwner: true },
  };
  if (existing !== null) {
    note("resuming", `state loaded from evidence/${runId}/_run-state.json`);
  }

  const order: Array<Exclude<Step, "all">> =
    requested === "all" ? ALL_ORDER : [requested];

  for (const step of order) {
    const runner = RUNNERS[step];
    const next = await runner(state);
    Object.assign(state, next);
    saveState(state);
  }

  heading("RESULT");
  if (failures === 0) {
    say("  ALL CHECKS PASSED");
    if (requested === "all") {
      say("");
      say("  The mechanism is demonstrated end to end:");
      say("    a real license gate refused a real read, a real license changed the");
      say("    answer, and the recovered key opened the real content.");
    }
  } else {
    say(`  ${failures} CHECK(S) FAILED — see above. Nothing here should be described as`);
    say("  working until those are resolved.");
  }
  say("");
  say(`  evidence: evidence/${runId}/`);
  say("");

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  say("");
  if (error instanceof PreconditionError) {
    // Expected when the harness is run before a wallet is funded. Not a crash, and it must
    // not look like one — the fix is a human action, and the message says which.
    say(`  CANNOT START: ${error.message}`);
    say("");
    process.exitCode = 1;
    return;
  }
  say("  Harness crashed:");
  say(`  ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  if (error instanceof Error && error.stack) {
    say(error.stack.split("\n").slice(1, 4).join("\n"));
  }
  say("");
  say("  Partial state was saved; re-run to resume rather than repeat on-chain work.");
  say("");
  process.exit(1);
});
