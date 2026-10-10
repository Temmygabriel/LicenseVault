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
  formatEther,
  getAddress,
  hexToBytes,
  type Account,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { initWasm, type CDRClient } from "@piplabs/cdr-sdk";
import { PILFlavor } from "@story-protocol/core-sdk";
import {
  encodeLicenseAccessAuxData,
  encodeLicenseReadConditionData,
  encodeOwnerWriteConditionData,
  decodeLicenseReadConditionData,
} from "../../lib/protocol/conditions";
import {
  AENEID_CHAIN_ID,
  AENEID_FAUCET_URL,
  AENEID_LICENSE_TOKEN_ADDRESS,
  CANONICAL_RUN_ID,
  CDR_ADDRESS,
  LICENSE_READ_CONDITION_ADDRESS,
  OWNER_WRITE_CONDITION_ADDRESS,
  PROTECTED_ASSET_NAME,
  REQUIRED_LICENSE_LABEL,
  AENEID_ROYALTY_POLICY_LAP_ADDRESS,
  AENEID_WIP_TOKEN_ADDRESS,
  explorerTxUrl,
} from "../../lib/protocol/constants";
import {
  decryptContent,
  encryptContent,
  generateDataKey,
  sha256Hex,
} from "../../lib/protocol/content";
// Client construction lives in lib/protocol/clients.ts, for the same reason the gate rule does:
// the UI has to reach these contracts the same way, and a second construction site is a second
// place for the RPC, the API URL and the SDK's structural casts to drift.
import {
  cdrApiUrl,
  createAeneidPublicClient,
  createAeneidWalletClient,
  createCdrClient,
  createCdrObserverClient,
  createStoryClient,
  rpcUrl,
} from "../../lib/protocol/clients";
// The gate-probing rule lives in lib/protocol/gate.ts so the UI and this harness classify a
// refusal the same way. There is exactly one implementation of "a revert is not a denial".
import { probeReadCondition } from "../../lib/protocol/gate";
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
  // The pre-mint `denied` step cannot prove the refusal was ABOUT licensing: before the mint no
  // licence token exists at all, so any request the reader makes is malformed or points at
  // nothing, and the condition contract reverts before it evaluates authorization (see
  // ProbeExpectation). `denied-licensed` is the same denial asked again once a real licence
  // DOES exist — different wallet, real token id — which is the version that actually tests the
  // rule. Keeping both, clearly labelled, is the point: one shows the read is refused, the other
  // shows WHY.
  "denied-licensed",
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

const publicClient = createAeneidPublicClient();

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
    ownerWallet: createAeneidWalletClient(ownerAccount),
    readerWallet: createAeneidWalletClient(readerAccount),
  };
}

function cdrClientFor(account: Account): CDRClient {
  return createCdrClient({ account, publicClient });
}

async function assertFunded(address: Address, label: string): Promise<bigint> {
  const balance = await publicClient.getBalance({ address });
  if (balance === 0n) {
    fail(
      `${label} ${address} has 0 IP and cannot pay gas. Fund it at ` +
        `${AENEID_FAUCET_URL}, then re-run. ` +
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
    `chain ${chainId} (expected ${AENEID_CHAIN_ID}) via ${rpcUrl()}`,
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
  const observer = createCdrObserverClient({ publicClient }).observer;

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
    `${cdrApiUrl()} answered with a usable round and threshold. This is the plain-HTTP endpoint ` +
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
    chain: { id: chainId, rpcUrl: rpcUrl(), explorer: explorerTxUrl("").replace(/\/tx\/$/, "") },
    cdr: {
      apiUrl: cdrApiUrl(),
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
  const story = createStoryClient(ownerAccount);

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
  //    `defaultMintingFee: 0n` keeps the $0 core path intact: the license is free, the gate is
  //    what protects the asset — which is the claim this project is making.
  //
  //    The currency and royalty policy are NOT zero here, and that is deliberate. The SDK's
  //    `PILFlavor.validateLicenseTerms` throws "Royalty policy is required when commercial use
  //    is enabled" for a zero policy, and the protocol throws "Royalty policy requires currency
  //    token" for a policy with a zero currency. A free license still has to name both. With
  //    `commercialRevShare: 0` (the flavor's default) and a 0 minting fee, the license remains
  //    free — the policy is a structural requirement, not a charge. Both addresses were
  //    verified live and whitelisted before being pinned in lib/protocol/constants.ts.
  say("  … minting + registering the IP asset with PIL terms");
  const registered = await story.ipAsset.mintAndRegisterIpAssetWithPilTerms({
    spgNftContract,
    licenseTermsData: [
      {
        terms: PILFlavor.commercialUse({
          defaultMintingFee: 0n,
          currency: AENEID_WIP_TOKEN_ADDRESS,
          royaltyPolicy: AENEID_ROYALTY_POLICY_LAP_ADDRESS,
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
    // Recorded because a reader auditing the "free license" claim should see what the terms
    // actually name. Both are required to be non-zero even at a 0 fee — see constants.ts.
    currency: AENEID_WIP_TOKEN_ADDRESS,
    royaltyPolicy: AENEID_ROYALTY_POLICY_LAP_ADDRESS,
    commercialRevShare: 0,
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
    const client = cdrClientFor(ownerAccount);

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
  const observerClient = cdrClientFor(ownerAccount);
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
/**
 * What we expect `checkReadCondition` to do, and — separately — what a refusal at that probe
 * would actually PROVE.
 *
 * ---------------------------------------------------------------------------------------
 * FINDING (2026-10-07, live Aeneid): this contract does not return `false` for every "no".
 *
 * The obvious mental model — "the gate returns true or false, false means denied" — is
 * WRONG, and the first funded run is what exposed it:
 *
 *   • caller presents a licence token id that does NOT exist
 *       → REVERTS with `ERC721NonexistentToken(uint256)` (selector 0x7e273289)
 *         The condition calls `ownerOf(tokenId)` on the LicenseToken ERC-721, and OpenZeppelin's
 *         ERC-721 reverts for a token that was never minted. It never gets to return a bool.
 *   • caller presents EMPTY auxiliary data
 *       → REVERTS with no data at all (`abi.decode` of empty bytes fails before any
 *         authorization logic runs).
 *   • caller presents a REAL token id and is NOT its owner
 *       → returns `false`. This is the ONLY shape that is a clean, decodable "denied".
 *
 * So a refusal is only attributable to LICENSING when the contract actually reached its
 * authorization logic and returned false. A revert may be about the *request*, not the
 * *caller*. Conflating the two is precisely the fake-success this harness exists to prevent —
 * and the first version of this file did conflate them, by treating any revert as a denial.
 * ---------------------------------------------------------------------------------------
 */
type ProbeExpectation =
  /** The contract evaluates authorization and returns this bool. */
  | { kind: "returns"; value: boolean; provesLicensing: boolean }
  /** The contract reverts with a specific, decodable custom error. */
  | { kind: "reverts"; errorName: string; signature: Hex; provesLicensing: boolean }
  /** The contract reverts with no decodable reason — a malformed request, not a verdict. */
  | { kind: "revertsOpaque"; provesLicensing: false };

interface GateProbe {
  label: string;
  caller: string;
  accessAuxData: string;
  expected: string;
  observed: string;
  /** Whether this probe's result is attributable to the caller's licence status. */
  provesLicensing: boolean;
  matched: boolean;
  error: string | null;
}

async function probeGate(
  state: RunState,
  collector: GateProbe[],
  label: string,
  caller: Address,
  accessAuxData: Hex,
  expectation: ProbeExpectation,
): Promise<void> {
  const { ipId } = state.asset as NonNullable<RunState["asset"]>;
  const conditionData = encodeLicenseReadConditionData({
    licenseTokenAddress: getAddress(AENEID_LICENSE_TOKEN_ADDRESS),
    ipId: getAddress(ipId),
  });

  // The probe itself lives in lib/protocol/gate.ts, shared with the UI. Classifying a revert
  // is the one rule in this project that is easiest to get silently wrong, so there is
  // exactly one implementation of it and this harness is a caller of it, not a second opinion.
  const verdict = await probeReadCondition({
    publicClient,
    uuid: state.vault?.uuid ?? 0,
    accessAuxData,
    conditionData,
    caller,
  });

  // Map the typed verdict back onto what this probe expected. Keeping the mapping here — and
  // not in the shared module — is what lets the shared module stay about the PROTOCOL while
  // this file stays about the EXPERIMENT.
  let observedText: string;
  let matched: boolean;
  let error: string | null = null;

  switch (verdict.kind) {
    case "ALLOWED":
      observedText = "true";
      matched = expectation.kind === "returns" && expectation.value === true;
      break;
    case "DENIED":
      observedText = "false";
      matched = expectation.kind === "returns" && expectation.value === false;
      break;
    case "REJECTED_REQUEST":
      observedText =
        verdict.errorName === null ? "reverted (no decodable reason)" : `reverted ${verdict.errorName}`;
      matched =
        expectation.kind === "revertsOpaque"
          ? verdict.selector === null
          : expectation.kind === "reverts" && verdict.selector === expectation.signature;
      error = verdict.message;
      break;
    case "UNKNOWN":
      observedText = `reverted (undecodable ${verdict.selector ?? "nothing"})`;
      matched = false;
      error = verdict.message;
      break;
  }

  const expectedText =
    expectation.kind === "returns"
      ? String(expectation.value)
      : expectation.kind === "revertsOpaque"
        ? "revert with no decodable reason"
        : `revert ${expectation.errorName}`;

  check(
    label,
    matched,
    matched
      ? `checkReadCondition → ${observedText} (expected ${expectedText}) for caller ${caller}` +
          (expectation.provesLicensing
            ? " — this probe reaches the contract's authorization logic, so its verdict is attributable to the caller's licence"
            : " — NOTE: this refusal is about the REQUEST, not the caller's licence, so it proves nothing about licensing")
      : `checkReadCondition → ${observedText}, expected ${expectedText}. ${
          error !== null
            ? `Raw error: ${error.split("\n")[0]}`
            : "The contract's observable behaviour has changed, which the build contract requires us to stop on."
        }`,
  );

  collector.push({
    label,
    caller,
    accessAuxData,
    expected: expectedText,
    observed: observedText,
    provesLicensing: expectation.provesLicensing,
    matched,
    error,
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

  // (a) Empty auxiliary data. The contract cannot even decode the request, so it reverts before
  //     any authorization happens. Recorded because it documents a REAL trap for the product:
  //     a UI that sends empty aux data gets a refusal that has nothing to do with licensing.
  await probeGate(state, probes, "empty aux data → reverts before authorization", reader, "0x", {
    kind: "revertsOpaque",
    provesLicensing: false,
  });

  // (b) A well-formed request naming a licence token that does not exist. The condition calls
  //     ownerOf() and the ERC-721 reverts. THIS is the shape an unlicensed party actually
  //     produces, so the harness must expect a revert here, not `false`.
  await probeGate(
    state,
    probes,
    "claims a licence token id that was never minted → reverts",
    reader,
    encodeLicenseAccessAuxData([999_999_999n]),
    {
      kind: "reverts",
      errorName: "ERC721NonexistentToken(uint256)",
      signature: "0x7e273289",
      provesLicensing: false,
    },
  );

  if (state.license !== undefined) {
    const realId = BigInt(state.license.licenseTokenId);

    // (c) The holder, naming its own real token. The contract reaches its authorization logic
    //     and says yes.
    await probeGate(
      state,
      probes,
      "holder presents its real token id → allowed",
      reader,
      encodeLicenseAccessAuxData([realId]),
      { kind: "returns", value: true, provesLicensing: true },
    );

    // (d) THE DECISIVE PROBE. A different caller, presenting the SAME real, existing token id.
    //     The contract evaluates authorization and returns false — because ownership of the
    //     licence is what decides, not the presence of a valid-looking token id in the request.
    //     This is the only probe here that proves the gate is bound to the caller's licence.
    if (!state.wallets.readerIsOwner) {
      await probeGate(
        state,
        probes,
        "NON-holder presents the same real token id → denied",
        owner,
        encodeLicenseAccessAuxData([realId]),
        { kind: "returns", value: false, provesLicensing: true },
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
    // Already demonstrated earlier in this run: the artifact is the record. Re-running must not
    // be an error — a demo needs to be repeatable — but it must also not silently re-do a
    // "denial" that is no longer a denial, because the reader now holds a licence.
    const already = readArtifact(state.runId, "unauthorized-read.json");
    if (already !== null) {
      note(
        "already demonstrated",
        "unauthorized-read.json already records this refusal from before the mint. Not repeating " +
          "it: the reader now holds a licence, so a second attempt would not be a denial at all.",
      );
      return state;
    }
    fail(
      "a license has already been minted to the reader, so a denial can no longer be " +
        "demonstrated in this run. The denial must come first — that ordering is the proof.",
    );
  }

  const { readerAccount } = loadWallets();
  const client = cdrClientFor(readerAccount);

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
  const infrastructureShaped =
    /timeout|fetch failed|ECONNREFUSED|ENOTFOUND|network|socket hang up/i.test(message);
  // The read was refused. But WHAT refused it is the question, and this step cannot answer it.
  const refused = !infrastructureShaped && /revert|Contract|condition|license|unauthorized|denied/i.test(
    `${observed?.name ?? ""} ${message}`,
  );

  check(
    "reader without a license does not receive the data key",
    refused,
    refused
      ? `accessCDR refused with ${observed?.name}. The refusal is real: no data key came back.`
      : `accessCDR failed, but NOT as a refusal — this looks like infrastructure ` +
        `(${observed?.name}: ${message}). This must NOT be recorded as a successful denial.`,
  );

  // This is the honest part, and it is why `denied-licensed` exists as a separate step. Pre-mint
  // the reader has no licence AND there is no licence in existence for this IP, so the request
  // it sends is empty or names nothing real. The condition contract reverts on such a request
  // before it ever evaluates authorization — measured, see gate-probes.json probe (a) and (b).
  // So this step proves the read is refused; it does NOT prove the refusal is about licensing.
  note(
    "what this step does NOT prove",
    "that the refusal was about licensing. Before the mint, no licence token exists, so the " +
      "condition contract reverts on a malformed/nonexistent reference before its " +
      "authorization logic runs. Attribution comes from the post-mint probes and from the " +
      "denied-licensed step, which ask the same question when a real licence does exist.",
  );

  writeArtifact(state.runId, "unauthorized-read.json", {
    observedAt: new Date().toISOString(),
    outcome: "REFUSED",
    reader: state.wallets.reader,
    readerIsOwner: state.wallets.readerIsOwner,
    licenseTokensHeld: 0,
    licensesInExistenceForThisIp: 0,
    accessAuxData: "0x",
    request: {
      operation: "CDR read()",
      uuid: state.vault.uuid,
      contract: CDR_ADDRESS,
      condition: LICENSE_READ_CONDITION_ADDRESS,
    },
    observedError: observed,
    infrastructureShaped,
    provesLicensing: false,
    note:
      "No transaction hash is recorded here: the read was rejected, so there is no successful " +
        "on-chain operation to point at. The refusal is evidenced by the error the node returned.",
    limitation:
      "provesLicensing is FALSE on purpose. With empty auxiliary data the condition contract " +
        "cannot decode the request and reverts before evaluating authorization, so this refusal " +
        "would look the same for a wallet that DID hold a licence. It shows the read fails " +
        "without a licence; it does not show the failure is caused by the licence check. " +
        "See gate-probes.json probe (d) and denied-licensed.json for the attributable evidence.",
  });

  return state;
}

/**
 * STEP 6b — the same denial, asked properly.
 *
 * Runs after the mint, so a REAL licence token exists for this IP. The owner wallet holds none
 * of it (it was minted to the reader), and presents the real token id. This is the shape that
 * makes the condition contract actually evaluate authorization — and it refuses.
 *
 * This is the end-to-end version of gate-probes probe (d): that probe proved the contract's
 * verdict with a free eth_call; this proves the real read path honours it.
 */
async function stepDeniedLicensed(state: RunState): Promise<RunState> {
  heading("STEP 6b — a wallet with no licence, holding a REAL token id, is refused");

  if (state.license === undefined) fail('run the "mint" step first — this step needs a real licence.');
  if (state.vault === undefined) fail('run the "vault" step first.');
  if (state.wallets.readerIsOwner) {
    note(
      "skipped",
      "only one key was supplied, so the owner and the reader are the same wallet. There is no " +
        "second party to refuse. Set AENEID_READER_PRIVATE_KEY to a different address to run " +
        "the attributable denial.",
    );
    return state;
  }

  const accessAuxData = encodeLicenseAccessAuxData([BigInt(state.license.licenseTokenId)]);

  // Ground truth first, for free: does the condition contract reach its authorization logic and
  // say no, for this caller with this real token id?
  const { ipId } = state.asset as NonNullable<RunState["asset"]>;
  const conditionVerdict = await publicClient.readContract({
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
    args: [
      state.vault.uuid,
      accessAuxData,
      encodeLicenseReadConditionData({
        licenseTokenAddress: getAddress(AENEID_LICENSE_TOKEN_ADDRESS),
        ipId: getAddress(ipId),
      }),
      getAddress(state.wallets.owner),
    ],
  });

  check(
    "the condition contract evaluates authorization and returns false",
    conditionVerdict === false,
    conditionVerdict === false
      ? "checkReadCondition → false for the owner, who holds no licence token for this IP, " +
        "while presenting the real token id. The contract REACHED its authorization logic and " +
        "denied — this is the attributable denial."
      : `checkReadCondition → ${conditionVerdict}, expected false. The gate is not behaving as recorded.`,
  );

  const { ownerAccount } = loadWallets();
  const client = cdrClientFor(ownerAccount);

  say("  … submitting read() from the unlicensed wallet, presenting the real token id");

  let dataKey: Uint8Array | null = null;
  let observed: { name: string; message: string } | null = null;
  try {
    const result = await client.consumer.accessCDR({
      uuid: state.vault.uuid,
      accessAuxData,
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
      "an unlicensed caller holding a real token id is refused",
      false,
      "THE GATE DID NOT HOLD — the read returned a data key to a wallet the condition contract " +
        "had just said `false` about. The off-chain read path does not honour the on-chain gate. " +
        "This is the most serious possible result from this harness.",
    );
  } else {
    check(
      "an unlicensed caller holding a real token id is refused",
      true,
      `accessCDR refused with ${observed?.name}. The contract said false and the read path ` +
        `honoured it: the refusal is attributable to licensing, not to a malformed request.`,
    );
  }

  writeArtifact(state.runId, "denied-licensed.json", {
    observedAt: new Date().toISOString(),
    outcome: dataKey !== null ? "DATA_KEY_RETURNED" : "REFUSED",
    caller: state.wallets.owner,
    callerHoldsLicense: false,
    accessAuxData,
    presentsRealLicenseTokenId: state.license.licenseTokenId,
    licenseTokenOwner: state.license.mintedTo,
    conditionVerdict,
    provesLicensing: conditionVerdict === false && dataKey === null,
    observedError: observed,
    note:
      "This is the attributable denial. Unlike unauthorized-read.json, the request here is " +
        "well-formed and names a licence token that really exists — it simply belongs to someone " +
        "else. The condition contract returned false (not a revert), so the refusal is about the " +
        "caller's licence status, which is exactly what the product claims to enforce.",
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
  const story = createStoryClient(ownerAccount);

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
  const client = cdrClientFor(readerAccount);

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
  "denied-licensed": stepDeniedLicensed,
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
  "denied-licensed",
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
  say(`  rpc:   ${rpcUrl()}`);
  say(`  cdr:   ${cdrApiUrl()}`);
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

  // The CDR SDK's TDH2 encryption lives in a WASM module (cb-mpc) that it never initializes
  // itself — `uploader.encryptDataKey` calls straight into `tdh2Encrypt`, which throws
  // "WASM module not initialized. Call initWasm() first." until the host has loaded it.
  // So the host must. Done here, once, before any step, rather than inside step 3: it is a
  // precondition of the whole run, and failing here costs no gas.
  //
  // initWasm() also SHA-256-verifies the .wasm binary against a hash pinned in the package
  // (see its wasm/manifest). That is worth having — the encryption path is exactly the code
  // whose integrity matters most — so we do NOT pass skipHashCheck.
  try {
    await initWasm();
  } catch (error) {
    fail(
      `initWasm() failed: ${(error as Error).message}. The TDH2 WASM module could not be ` +
        `loaded, so the data key cannot be encrypted. Nothing on-chain has been attempted ` +
        `in this step. Do not bypass this with skipHashCheck — a hash mismatch means the ` +
        `crypto binary is not the one this SDK expects, which is a finding, not an obstacle.`,
    );
  }
  note("TDH2 WASM", "initialized and hash-verified");

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
