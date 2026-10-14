/**
 * Browser wallet adapters for the real CDR read and the public demo-license mint.
 * No private key is accepted here; all transactions use the wallet the user connected.
 */
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import type { CDRClient as CDRClientType } from "@piplabs/cdr-sdk";
import type { LicenseVaultEip1193Provider } from "@/types/eip1193";

import { AENEID_CHAIN_ID, AENEID_RPC_URL, CDR_NETWORK } from "./constants";
import { CANONICAL_VAULT } from "./canonical-vault";

export const STORY_AENEID_BROWSER_CHAIN = defineChain({
  id: AENEID_CHAIN_ID,
  name: "Aeneid Testnet",
  // This field is used by viem to describe the legacy EVM testnet only. The UI calls it
  // "testnet token" and never presents an assumed fee as free; on-chain fees are queried live.
  nativeCurrency: { name: "Aeneid testnet token", symbol: "IP", decimals: 18 },
  rpcUrls: { default: { http: [AENEID_RPC_URL] } },
  blockExplorers: {
    default: { name: "Aeneid Explorer", url: "https://aeneid.datanetscan.io" },
  },
  testnet: true,
});

function injectedProvider(): LicenseVaultEip1193Provider {
  if (typeof window === "undefined" || window.ethereum?.request === undefined) {
    throw new Error("No browser wallet was found. Install or enable an EVM wallet, then connect it.");
  }
  return window.ethereum;
}

export function createBrowserPublicClient() {
  return createPublicClient({
    chain: STORY_AENEID_BROWSER_CHAIN,
    transport: http(AENEID_RPC_URL),
  });
}

/** Parse the wallet's own reported chain ID; never infer it from a page setting. */
export async function getInjectedChainId(): Promise<number> {
  const raw = await injectedProvider().request({ method: "eth_chainId" });
  if (typeof raw !== "string" || !/^0x[0-9a-f]+$/i.test(raw)) {
    throw new Error("The wallet did not return a valid hexadecimal chain ID.");
  }
  return Number.parseInt(raw.slice(2), 16);
}

export async function createBrowserCdrClient(address: Address): Promise<CDRClientType> {
  const account = getAddress(address);
  const provider = injectedProvider();
  const { CDRClient, initWasm } = await import("@piplabs/cdr-sdk");

  // TDH2 operations need WASM. The SDK deduplicates concurrent initialisation.
  await initWasm();

  const publicClient = createBrowserPublicClient();
  const walletClient = createWalletClient({
    account,
    chain: STORY_AENEID_BROWSER_CHAIN,
    transport: custom(provider as never),
  });

  // The CDR SDK publishes structural client types; the cast is isolated here at the adapter
  // boundary. The relative API base uses our constrained same-origin HTTPS keeper proxy.
  return new CDRClient({
    network: CDR_NETWORK,
    apiUrl: "/api/cdr",
    publicClient: publicClient as never,
    walletClient: walletClient as never,
  }) as unknown as CDRClientType;
}

const OWNER_OF_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
] as const;

export interface DemoLicenseMint {
  tokenId: bigint;
  txHash: Hex;
}

/**
 * Mint one real token for the already-published demo terms. The IP's recorded public Commercial
 * Use terms have a zero minting fee; the user still signs the transaction and pays network gas.
 * Ownership is checked on-chain before the function returns.
 */
export async function mintDemoLicenseForWallet(address: Address): Promise<DemoLicenseMint> {
  const receiver = getAddress(address);
  const provider = injectedProvider();
  const publicClient = createBrowserPublicClient();

  const [walletChainId, rpcChainId] = await Promise.all([
    getInjectedChainId(),
    publicClient.getChainId(),
  ]);
  if (walletChainId !== AENEID_CHAIN_ID || rpcChainId !== AENEID_CHAIN_ID) {
    throw Object.assign(
      new Error(
        `The wallet/RPC network is not Aeneid (wallet ${walletChainId}, RPC ${rpcChainId}).`,
      ),
      { name: "WrongNetworkError" },
    );
  }

  const { StoryClient } = await import("@story-protocol/core-sdk");
  // StoryClient builds its viem WalletClient around the injected EIP-1193 transport. Passing
  // the address selects the user's connected account without creating or storing a local signer.
  const story = StoryClient.newClient({
    account: receiver,
    transport: custom(provider as never),
    chainId: AENEID_CHAIN_ID,
  });

  const rawResult = await story.license.mintLicenseTokens({
    licensorIpId: CANONICAL_VAULT.ipId,
    licenseTermsId: CANONICAL_VAULT.licenseTermsId.toString(),
    receiver,
    amount: 1,
    maxMintingFee: 0n,
    maxRevenueShare: 100,
  });

  // Keep the protocol response typed at the boundary. SDK response fields are validated before
  // they are used as proof or as an access token ID.
  const result = rawResult as unknown as {
    txHash?: unknown;
    licenseTokenIds?: unknown;
  };
  if (typeof result.txHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(result.txHash)) {
    throw new Error("The licensing SDK returned no verifiable mint transaction hash.");
  }
  const txHash = result.txHash as Hex;

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("The license-mint transaction did not succeed on Aeneid.");
  }

  if (!Array.isArray(result.licenseTokenIds) || result.licenseTokenIds.length === 0) {
    throw new Error("The mint transaction succeeded but returned no license token ID.");
  }
  const tokenId = BigInt(String(result.licenseTokenIds[0]));
  if (tokenId < 0n) throw new Error("The SDK returned an invalid license token ID.");

  const owner = await publicClient.readContract({
    address: CANONICAL_VAULT.licenseTokenAddress,
    abi: OWNER_OF_ABI,
    functionName: "ownerOf",
    args: [tokenId],
  });
  if (getAddress(owner) !== receiver) {
    throw new Error("The minted token's on-chain owner does not match the connected wallet.");
  }

  return { tokenId, txHash };
}
