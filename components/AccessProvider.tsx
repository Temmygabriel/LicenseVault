"use client";

/**
 * One wallet/session controller for LicenseVault.
 *
 * Every positive access state comes from the existing typed state machine. The browser never
 * stores a private key; the visitor's wallet signs transactions and the ephemeral CDR key is
 * cleared in a finally block after the real decrypted bytes have been checked.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  formatEther,
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";

import {
  INITIAL_ACCESS_STATE,
  reduceAccess,
  classifyThrownError,
  type AccessEvent,
  type AccessPhase,
  type AccessState,
  type Failure,
  type RejectionEvidence,
  type VerificationEvidence,
} from "@/lib/access/state";
import { CANONICAL_VAULT } from "@/lib/protocol/canonical-vault";
import {
  AENEID_CHAIN_ID,
  AENEID_FAUCET_URL,
  AENEID_RPC_URL,
  CDR_ADDRESS,
  PROTECTED_ASSET_NAME,
} from "@/lib/protocol/constants";
import { encodeLicenseAccessAuxData } from "@/lib/protocol/conditions";
import {
  createBrowserCdrClient,
  createBrowserPublicClient,
  getInjectedChainId,
  mintDemoLicenseForWallet,
} from "@/lib/protocol/browser-clients";
import {
  BrowserContentDecryptionError,
  decryptContentInBrowser,
  EXPECTED_PLAINTEXT_SHA256,
  fetchSealedContent,
  sha256HexInBrowser,
} from "@/lib/protocol/content-browser";
import { requestDataKey, type AccessAttempt } from "@/lib/protocol/access";
import { probeReadCondition, type ProbeVerdict } from "@/lib/protocol/gate";
import { cdrAbi } from "@piplabs/cdr-contracts";
import type { LicenseVaultEip1193Provider } from "@/types/eip1193";

export type AccessOperation = "idle" | "connecting" | "checking" | "minting" | "reading";

export interface ProtectedManifestFile {
  file: string;
  bytes: number;
  format: string;
}

export interface ProtectedManifest {
  asset: string;
  license: string;
  released: string;
  contents: ProtectedManifestFile[];
  ipId: string;
  licenseTokenId: string;
  deliveredBy: string;
}

interface AccessContextValue {
  state: AccessState;
  walletAddress: Address | null;
  walletChainId: number | null;
  operation: AccessOperation;
  busy: boolean;
  problem: string | null;
  technicalDetail: string | null;
  mintedTokenId: bigint | null;
  selectedTokenId: bigint;
  licenseTokenIdInput: string;
  licenseTokenIdInputValid: boolean;
  setLicenseTokenIdInput: (value: string) => void;
  mintTxHash: Hex | null;
  readTxHash: Hex | null;
  deniedReadTxHash: Hex | null;
  manifest: ProtectedManifest | null;
  manifestJson: string | null;
  plaintextHash: string | null;
  nativeBalance: string | null;
  protocolReadFee: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchToAeneid: () => Promise<void>;
  verifyLicense: () => Promise<void>;
  mintDemoLicense: () => Promise<void>;
  tryLockedRead: () => Promise<void>;
  unlockProtectedContent: () => Promise<void>;
  retry: () => Promise<void>;
  downloadRecoveredManifest: () => void;
  resetFlow: () => void;
}

const AccessContext = createContext<AccessContextValue | null>(null);

export function useAccess(): AccessContextValue {
  const value = useContext(AccessContext);
  if (value === null) throw new Error("useAccess must be used inside <AccessProvider />.");
  return value;
}

function getProvider(): LicenseVaultEip1193Provider {
  if (typeof window === "undefined" || window.ethereum?.request === undefined) {
    throw new Error("No EVM browser wallet was found. Install or enable a wallet and try again.");
  }
  return window.ethereum;
}

function parseChainId(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number.parseInt(value.slice(2), 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function evidenceForWallet(wallet: Address, tokenId: bigint, checkedAt = new Date().toISOString()): VerificationEvidence {
  return {
    wallet,
    chainId: AENEID_CHAIN_ID,
    ipId: CANONICAL_VAULT.ipId,
    licenseTermsId: CANONICAL_VAULT.licenseTermsId,
    licenseTokenIds: [tokenId],
    checkedAt,
  };
}

function userFacingFailure(failure: Failure, detail: string): string {
  const lower = detail.toLowerCase();
  if (failure.kind === "WRONG_NETWORK") {
    return "Your wallet is not on Aeneid Testnet. Switch networks before continuing.";
  }
  if (failure.kind === "USER_CANCELLED") {
    return "The wallet request was cancelled. Nothing was unlocked and no license decision was invented.";
  }
  if (lower.includes("insufficient funds") || lower.includes("zero aeneid testnet")) {
    return "Your wallet does not have enough testnet tokens to pay transaction gas. Get testnet tokens, then retry.";
  }
  if (failure.kind === "TRANSACTION_FAILED") {
    return "The wallet or chain rejected the transaction. No content was unlocked.";
  }
  if (failure.kind === "DECRYPTION_FAILED") {
    return "The protected read did not produce verified plaintext. Access stays closed.";
  }
  return "The network could not establish a reliable result. This is not a licensing decision; try again later.";
}


function isManifest(value: unknown): value is ProtectedManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    item["asset"] === PROTECTED_ASSET_NAME &&
    typeof item["license"] === "string" &&
    typeof item["released"] === "string" &&
    typeof item["ipId"] === "string" &&
    typeof item["licenseTokenId"] === "string" &&
    typeof item["deliveredBy"] === "string" &&
    Array.isArray(item["contents"]) &&
    item["contents"].every((file) => {
      if (typeof file !== "object" || file === null || Array.isArray(file)) return false;
      const record = file as Record<string, unknown>;
      return (
        typeof record["file"] === "string" &&
        typeof record["bytes"] === "number" &&
        typeof record["format"] === "string"
      );
    })
  );
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [state, reactDispatch] = useReducer(reduceAccess, INITIAL_ACCESS_STATE);
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [operation, setOperation] = useState<AccessOperation>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [technicalDetail, setTechnicalDetail] = useState<string | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<bigint | null>(null);
  const [licenseTokenIdInput, setLicenseTokenIdInputState] = useState(String(CANONICAL_VAULT.licenseTokenId));
  const [mintTxHash, setMintTxHash] = useState<Hex | null>(null);
  const [readTxHash, setReadTxHash] = useState<Hex | null>(null);
  const [deniedReadTxHash, setDeniedReadTxHash] = useState<Hex | null>(null);
  const [manifest, setManifest] = useState<ProtectedManifest | null>(null);
  const [manifestJson, setManifestJson] = useState<string | null>(null);
  const [plaintextHash, setPlaintextHash] = useState<string | null>(null);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [protocolReadFee, setProtocolReadFee] = useState<string | null>(null);
  const inFlight = useRef(false);
  const phaseRef = useRef<AccessPhase>(INITIAL_ACCESS_STATE.phase);
  const stateRef = useRef<AccessState>(INITIAL_ACCESS_STATE);
  const gateWasDeniedRef = useRef(false);
  const dispatch = useCallback((event: AccessEvent) => {
    // Keep the synchronous guard state aligned with React's queued reducer transitions. This
    // avoids duplicate or illegal transitions when a wallet callback fires before a rerender.
    const nextState = reduceAccess(stateRef.current, event);
    stateRef.current = nextState;
    phaseRef.current = nextState.phase;
    reactDispatch(event);
  }, []);
  useEffect(() => {
    stateRef.current = state;
    phaseRef.current = state.phase;
  }, [state]);

  const parsedInputTokenId =
    /^(0|[1-9][0-9]*)$/.test(licenseTokenIdInput) && licenseTokenIdInput.length <= 78
      ? BigInt(licenseTokenIdInput)
      : null;
  const licenseTokenIdInputValid = parsedInputTokenId !== null && parsedInputTokenId < (1n << 256n);
  const selectedTokenId = mintedTokenId ?? (licenseTokenIdInputValid ? parsedInputTokenId : CANONICAL_VAULT.licenseTokenId);
  const busy = operation !== "idle";

  const handleLicenseTokenIdInputChange = useCallback((value: string) => {
    setLicenseTokenIdInputState(value);
    setMintedTokenId(null);
    setMintTxHash(null);
    setProblem(null);
    setTechnicalDetail(null);
    setReadTxHash(null);
    setDeniedReadTxHash(null);
    setManifest(null);
    setManifestJson(null);
    setPlaintextHash(null);
    if (!inFlight.current) dispatch({ type: "RESET" });
  }, [dispatch]);

  const clearProofSession = useCallback(() => {
    setMintedTokenId(null);
    setMintTxHash(null);
    setReadTxHash(null);
    setDeniedReadTxHash(null);
    setManifest(null);
    setManifestJson(null);
    setPlaintextHash(null);
    setNativeBalance(null);
    setProtocolReadFee(null);
    setProblem(null);
    setTechnicalDetail(null);
  }, []);

  const failActiveFlow = useCallback(
    (error: unknown, explicitDetail?: string) => {
      const failure: Failure =
        error instanceof BrowserContentDecryptionError
          ? {
              kind: "DECRYPTION_FAILED",
              detail: error.message,
              cause: error,
            }
          : classifyThrownError(error);
      const detail = explicitDetail ?? (error instanceof Error ? error.message : String(error));
      const phase = phaseRef.current;

      // The reducer deliberately permits failure events only in CHECKING or ACCESSING.
      // Establish the proper state transition first rather than bypassing the state machine.
      if (phase !== "CHECKING" && phase !== "ACCESSING") {
        if (phase !== "LOCKED") dispatch({ type: "RESET" });
        dispatch({ type: "VERIFY_REQUESTED" });
      }
      dispatch({ type: "VERIFICATION_FAILED", failure });
      setProblem(userFacingFailure(failure, detail));
      // Keep raw errors out of ordinary UI text. This safe label helps support triage without
      // leaking RPC URLs, wallet internals, or SDK response bodies into a screenshot.
      setTechnicalDetail(failure.kind);
    },
    [],
  );

  const currentWalletOnAeneid = useCallback(async (): Promise<Address> => {
    if (walletAddress === null) {
      throw new Error("Connect a wallet before continuing.");
    }
    const liveWalletChain = await getInjectedChainId();
    setWalletChainId(liveWalletChain);
    const publicClient = createBrowserPublicClient();
    const rpcChain = await publicClient.getChainId();
    if (liveWalletChain !== AENEID_CHAIN_ID || rpcChain !== AENEID_CHAIN_ID) {
      throw Object.assign(
        new Error(`Wallet chain ${liveWalletChain}; Aeneid RPC chain ${rpcChain}.`),
        { name: "WrongNetworkError" },
      );
    }
    return walletAddress;
  }, [walletAddress]);

  const connectWallet = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setOperation("connecting");
    setProblem(null);
    setTechnicalDetail(null);
    try {
      const provider = getProvider();
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof first !== "string" || !isAddress(first)) {
        throw new Error("The wallet returned no valid EVM account.");
      }
      const address = getAddress(first);
      const chainId = await getInjectedChainId();
      if (walletAddress !== null && address !== walletAddress) {
        dispatch({ type: "RESET" });
        clearProofSession();
      }
      setWalletAddress(address);
      setWalletChainId(chainId);
      // Connecting does not sign a transaction or automatically request a license/read.
      if (chainId !== AENEID_CHAIN_ID) {
        setProblem("Wallet connected. Switch to Aeneid Testnet before checking or opening this resource.");
      }
    } catch (error) {
      const failure = classifyThrownError(error);
      setProblem(userFacingFailure(failure, error instanceof Error ? error.message : String(error)));
      setTechnicalDetail(failure.kind);
    } finally {
      setOperation("idle");
      inFlight.current = false;
    }
  }, [clearProofSession, walletAddress]);

  const disconnectWallet = useCallback(() => {
    // EIP-1193 wallets do not expose a standard site-disconnect method. This resets LicenseVault's
    // local session only; it does not pretend to revoke the wallet's permission globally.
    dispatch({ type: "RESET" });
    setWalletAddress(null);
    setWalletChainId(null);
    clearProofSession();
  }, [clearProofSession]);

  const switchToAeneid = useCallback(async () => {
    if (inFlight.current) return;
    setProblem(null);
    try {
      const provider = getProvider();
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x523" }],
      });
      const newChainId = await getInjectedChainId();
      setWalletChainId(newChainId);
      if (newChainId !== AENEID_CHAIN_ID) {
        setProblem("The wallet did not switch to Aeneid Testnet. Check the selected network in your wallet.");
        return;
      }
      dispatch({ type: "RESET" });
      setProblem(null);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: unknown }).code
          : undefined;
      if (code === 4902) {
        try {
          const provider = getProvider();
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x523",
              chainName: "Story Aeneid Testnet",
              nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
              rpcUrls: [AENEID_RPC_URL],
              blockExplorerUrls: ["https://aeneid.datanetscan.io"],
            }],
          });
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x523" }],
          });
          const newChainId = await getInjectedChainId();
          setWalletChainId(newChainId);
          if (newChainId !== AENEID_CHAIN_ID) {
            setProblem("Aeneid was added, but the wallet did not switch to it. Select Story Aeneid Testnet and retry.");
            return;
          }
          dispatch({ type: "RESET" });
          setProblem(null);
        } catch (addError) {
          setProblem(addError instanceof Error ? addError.message : "The wallet could not add Aeneid Testnet.");
          setTechnicalDetail("NETWORK_CONFIGURATION");
        }
      } else {
        const failure = classifyThrownError(error);
        setProblem(userFacingFailure(failure, error instanceof Error ? error.message : String(error)));
        setTechnicalDetail(failure.kind);
      }
    }
  }, []);

  const verifyLicenseInternal = useCallback(
    async (tokenId: bigint) => {
      setOperation("checking");
      setProblem(null);
      setTechnicalDetail(null);
      if (phaseRef.current !== "LOCKED") dispatch({ type: "RESET" });
      dispatch({ type: "VERIFY_REQUESTED" });
      try {
        const wallet = await currentWalletOnAeneid();
        const publicClient = createBrowserPublicClient();
        const result: ProbeVerdict = await probeReadCondition({
          publicClient,
          uuid: CANONICAL_VAULT.uuid,
          accessAuxData: encodeLicenseAccessAuxData([tokenId]),
          conditionData: CANONICAL_VAULT.conditionData,
          caller: wallet,
          conditionAddress: CANONICAL_VAULT.readConditionAddress,
        });

        const checkedAt = new Date().toISOString();
        if (result.kind === "ALLOWED") {
          dispatch({ type: "LICENSE_CONFIRMED", evidence: evidenceForWallet(wallet, tokenId, checkedAt) });
          return;
        }
        if (result.kind === "DENIED") {
          dispatch({
            type: "LICENSE_ABSENT",
            evidence: {
              wallet,
              chainId: AENEID_CHAIN_ID,
              vaultUuid: CANONICAL_VAULT.uuid,
              basis: result.basis,
              checkedAt,
            },
          });
          return;
        }
        throw new Error(
          result.kind === "UNKNOWN"
            ? result.basis
            : `The contract rejected the verification request before deciding access: ${result.basis}`,
        );
      } catch (error) {
        failActiveFlow(error);
      } finally {
        setOperation("idle");
      }
    },
    [currentWalletOnAeneid, failActiveFlow],
  );

  const verifyLicense = useCallback(async () => {
    if (inFlight.current) return;
    if (!licenseTokenIdInputValid && mintedTokenId === null) {
      setProblem("Enter a valid non-negative decimal license token ID.");
      return;
    }
    inFlight.current = true;
    try {
      await verifyLicenseInternal(selectedTokenId);
    } finally {
      inFlight.current = false;
    }
  }, [licenseTokenIdInputValid, mintedTokenId, selectedTokenId, verifyLicenseInternal]);

  const mintDemoLicense = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setOperation("minting");
    setProblem(null);
    setTechnicalDetail(null);
    try {
      const wallet = await currentWalletOnAeneid();
      const result = await mintDemoLicenseForWallet(wallet);
      // The token ID and transaction are read from the actual SDK response and verified on chain.
      setMintedTokenId(result.tokenId);
      setLicenseTokenIdInputState(String(result.tokenId));
      setMintTxHash(result.txHash);
      await verifyLicenseInternal(result.tokenId);
    } catch (error) {
      const failure = classifyThrownError(error);
      setProblem(userFacingFailure(failure, error instanceof Error ? error.message : String(error)));
      setTechnicalDetail(failure.kind);
    } finally {
      setOperation("idle");
      inFlight.current = false;
    }
  }, [currentWalletOnAeneid, verifyLicenseInternal]);

  const preflightRead = useCallback(async (wallet: Address) => {
    const publicClient = createBrowserPublicClient();
    const [chainId, balance, fee] = await Promise.all([
      publicClient.getChainId(),
      publicClient.getBalance({ address: wallet }),
      publicClient.readContract({
        address: CDR_ADDRESS,
        abi: cdrAbi,
        functionName: "readFee",
      }),
    ]);
    if (chainId !== AENEID_CHAIN_ID) {
      throw Object.assign(
        new Error(`The RPC answered chain ${chainId}; expected Aeneid (${AENEID_CHAIN_ID}).`),
        { name: "WrongNetworkError" },
      );
    }
    setNativeBalance(formatEther(balance));
    setProtocolReadFee(formatEther(fee));
    if (balance === 0n) {
      throw new Error(
        `Insufficient funds: your wallet has zero Aeneid testnet token. Get testnet gas from ${AENEID_FAUCET_URL} and try again.`,
      );
    }
  }, []);

  const finishWithRecoveredContent = useCallback(
    async (wallet: Address, attempt: Extract<AccessAttempt, { kind: "GRANTED" }>) => {
      setReadTxHash(attempt.txHash);
      const dataKey = attempt.dataKey
      try {
        const sealed = await fetchSealedContent();
        const plaintext = await decryptContentInBrowser(sealed, dataKey);
        const actualHash = await sha256HexInBrowser(plaintext);
        if (actualHash !== EXPECTED_PLAINTEXT_SHA256) {
          throw new BrowserContentDecryptionError(
            "The decrypted content hash does not match the hash recorded before the content was sealed.",
          );
        }

        const decoded = new TextDecoder().decode(plaintext);
        let parsed: unknown;
        try {
          parsed = JSON.parse(decoded);
        } catch {
          throw new BrowserContentDecryptionError("The decrypted resource was not a valid JSON manifest.");
        }
        if (!isManifest(parsed) || parsed.ipId.toLowerCase() !== CANONICAL_VAULT.ipId.toLowerCase()) {
          throw new BrowserContentDecryptionError(
            "The decrypted bytes were validly opened but do not describe the canonical protected asset.",
          );
        }

        const activePhase = phaseRef.current;
        if (activePhase !== "ACCESSING") {
          throw new Error("The access state changed during decryption. Nothing was marked as unlocked.");
        }
        setManifest(parsed);
        setManifestJson(decoded);
        setPlaintextHash(actualHash);
        dispatch({
          type: "PLAINTEXT_RECOVERED",
          evidence: {
            wallet,
            chainId: AENEID_CHAIN_ID,
            vaultUuid: CANONICAL_VAULT.uuid,
            readTxHash: attempt.txHash,
            dataKeyBytes: dataKey.byteLength,
            plaintextBytes: plaintext.byteLength,
            recoveredAt: new Date().toISOString(),
          },
        });
      } finally {
        // The ephemeral CDR data key is not put into React state, localStorage, logs or evidence.
        dataKey.fill(0);
      }
    },
    [],
  );

  const performRead = useCallback(
    async (lockedGateTest: boolean) => {
      if (inFlight.current) return;
      if (!licenseTokenIdInputValid && mintedTokenId === null) {
        setProblem("Enter a valid non-negative decimal license token ID before testing access.");
        return;
      }
      inFlight.current = true;
      setOperation("reading");
      setProblem(null);
      setTechnicalDetail(null);
      setDeniedReadTxHash(null);

      let wallet: Address | null = null;
      let tokenId = selectedTokenId;
      try {
        wallet = await currentWalletOnAeneid();
        await preflightRead(wallet);

        const publicClient = createBrowserPublicClient();
        if (lockedGateTest) {
          if (phaseRef.current !== "LOCKED") dispatch({ type: "RESET" });
          dispatch({ type: "VERIFY_REQUESTED" });
          const gate = await probeReadCondition({
            publicClient,
            uuid: CANONICAL_VAULT.uuid,
            accessAuxData: encodeLicenseAccessAuxData([tokenId]),
            conditionData: CANONICAL_VAULT.conditionData,
            caller: wallet,
            conditionAddress: CANONICAL_VAULT.readConditionAddress,
          });
          if (gate.kind !== "ALLOWED" && gate.kind !== "DENIED") {
            throw new Error(
              gate.kind === "UNKNOWN"
                ? gate.basis
                : `The gate rejected the request format instead of evaluating license ownership: ${gate.basis}`,
            );
          }
          gateWasDeniedRef.current = gate.kind === "DENIED";
          if (gate.kind === "ALLOWED") {
            dispatch({ type: "LICENSE_CONFIRMED", evidence: evidenceForWallet(wallet, tokenId) });
            dispatch({ type: "READ_REQUESTED" });
          }
          // If the real contract returned DENIED, deliberately submit the read only because the
          // visitor asked to test the locked gate. This costs testnet gas and should never happen
          // automatically when the page loads.
        } else {
          if (phaseRef.current !== "LICENSE_VERIFIED") {
            throw new Error("Verify the license before signing the protected read.");
          }
          const verified = stateRef.current;
          if (verified.phase !== "LICENSE_VERIFIED" || verified.evidence.wallet !== wallet) {
            throw new Error("The verified license belongs to a different wallet. Check access again.");
          }
          tokenId = verified.evidence.licenseTokenIds[0] ?? selectedTokenId;
          dispatch({ type: "READ_REQUESTED" });
        }

        const client = await createBrowserCdrClient(wallet);
        const attempt = await requestDataKey({
          client,
          uuid: CANONICAL_VAULT.uuid,
          accessAuxData: encodeLicenseAccessAuxData([tokenId]),
          timeoutMs: 120_000,
        });

        if (attempt.kind === "REFUSED") {
          if (attempt.txHash !== undefined) setDeniedReadTxHash(attempt.txHash);
          const evidence: RejectionEvidence = {
            wallet,
            chainId: AENEID_CHAIN_ID,
            vaultUuid: CANONICAL_VAULT.uuid,
            basis: attempt.basis,
            ...(attempt.txHash === undefined ? {} : { readTxHash: attempt.txHash }),
            checkedAt: new Date().toISOString(),
          };
          dispatch({ type: "READ_REFUSED", evidence });
          setProblem("The live CDR read was refused by the license condition. The protected content remains sealed.");
          return;
        }

        if (attempt.kind === "MALFORMED_REQUEST") {
          failActiveFlow(new Error(attempt.basis));
          return;
        }
        if (attempt.kind === "INFRASTRUCTURE_FAILURE") {
          failActiveFlow(attempt.cause ?? new Error(attempt.detail), attempt.detail);
          return;
        }

        // If a read returns a key after the gate probe said DENIED, treat the inconsistency as an
        // error and discard the key. A contradictory result must not reveal the payload.
        if (lockedGateTest && gateWasDeniedRef.current) {
          attempt.dataKey.fill(0);
          failActiveFlow(new Error("The license gate and CDR read returned conflicting results."));
          return;
        }

        await finishWithRecoveredContent(wallet, attempt);
      } catch (error) {
        failActiveFlow(error);
      } finally {
        gateWasDeniedRef.current = false;
        setOperation("idle");
        inFlight.current = false;
      }
    },
    [finishWithRecoveredContent, failActiveFlow, preflightRead, selectedTokenId, currentWalletOnAeneid, licenseTokenIdInputValid, mintedTokenId],
  );

  const tryLockedRead = useCallback(async () => {
    await performRead(true);
  }, [performRead]);

  const unlockProtectedContent = useCallback(async () => {
    await performRead(false);
  }, [performRead]);

  const retry = useCallback(async () => {
    if (walletAddress === null) return connectWallet();
    if (walletChainId !== AENEID_CHAIN_ID) return switchToAeneid();
    return verifyLicense();
  }, [connectWallet, switchToAeneid, verifyLicense, walletAddress, walletChainId]);

  const resetFlow = useCallback(() => {
    if (busy) return;
    dispatch({ type: "RESET" });
    setProblem(null);
    setTechnicalDetail(null);
    setManifest(null);
    setManifestJson(null);
    setPlaintextHash(null);
    setReadTxHash(null);
    setDeniedReadTxHash(null);
  }, [busy]);

  const downloadRecoveredManifest = useCallback(() => {
    if (state.phase !== "UNLOCKED" || manifestJson === null) {
      setProblem("The manifest is not available to download because no verified unlock exists.");
      return;
    }
    const blob = new Blob([manifestJson], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "commercial-brand-asset-pack-manifest.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [manifestJson, state.phase]);

  // Restore only an already-authorised account silently. eth_accounts does not open a wallet
  // prompt; connecting/signing remains an explicit user action.
  useEffect(() => {
    const provider = window.ethereum;
    if (provider?.request === undefined) return;
    void provider.request({ method: "eth_accounts" }).then((accounts) => {
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof first === "string" && isAddress(first)) setWalletAddress(getAddress(first));
    }).catch(() => undefined);
    void provider.request({ method: "eth_chainId" }).then((chain) => {
      setWalletChainId(parseChainId(chain));
    }).catch(() => undefined);

    const onAccountsChanged = (accounts: unknown) => {
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      dispatch({ type: "RESET" });
      clearProofSession();
      if (typeof first === "string" && isAddress(first)) {
        setWalletAddress(getAddress(first));
      } else {
        setWalletAddress(null);
      }
    };
    const onChainChanged = (chain: unknown) => {
      setWalletChainId(parseChainId(chain));
      dispatch({ type: "RESET" });
      setManifest(null);
      setManifestJson(null);
      setPlaintextHash(null);
      setProblem(null);
      setReadTxHash(null);
      setDeniedReadTxHash(null);
    };
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, [clearProofSession]);

  const value = useMemo<AccessContextValue>(
    () => ({
      state,
      walletAddress,
      walletChainId,
      operation,
      busy,
      problem,
      technicalDetail,
      mintedTokenId,
      selectedTokenId,
      licenseTokenIdInput,
      licenseTokenIdInputValid,
      setLicenseTokenIdInput: handleLicenseTokenIdInputChange,
      mintTxHash,
      readTxHash,
      deniedReadTxHash,
      manifest,
      manifestJson,
      plaintextHash,
      nativeBalance,
      protocolReadFee,
      connectWallet,
      disconnectWallet,
      switchToAeneid,
      verifyLicense,
      mintDemoLicense,
      tryLockedRead,
      unlockProtectedContent,
      retry,
      downloadRecoveredManifest,
      resetFlow,
    }),
    [
      state, walletAddress, walletChainId, operation, busy, problem, technicalDetail,
      mintedTokenId, selectedTokenId, licenseTokenIdInput, licenseTokenIdInputValid, handleLicenseTokenIdInputChange, mintTxHash, readTxHash, deniedReadTxHash,
      manifest, manifestJson, plaintextHash, nativeBalance, protocolReadFee,
      connectWallet, disconnectWallet, switchToAeneid, verifyLicense, mintDemoLicense,
      tryLockedRead, unlockProtectedContent, retry, downloadRecoveredManifest, resetFlow,
    ],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
