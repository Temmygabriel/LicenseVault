/**
 * Client construction, shared by the CLI harness and the UI.
 *
 * Before this module existed, `tools/spike/build-vault.ts` built its own viem, Story and CDR
 * clients inline. That is fine for a spike and wrong for a product: the UI has to reach the
 * same contracts the same way, and two construction sites are two places for the network,
 * the API URL or the SDK's structural casts to drift apart.
 *
 * Nothing here reads a private key. The account is always supplied by the caller — from an
 * environment variable in the harness, from the connected wallet in the UI — so there is no
 * code path in this file that could embed a key.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  CDRClient,
  type CDRPublicClient,
  type CDRWalletClient,
} from "@piplabs/cdr-sdk";
import { StoryClient } from "@story-protocol/core-sdk";

import {
  AENEID_CHAIN_ID,
  AENEID_RPC_URL,
  CDR_API_URL_AENEID,
  CDR_NETWORK,
} from "./constants";

/** The RPC the project reads from, with an environment override for local experiments. */
export function rpcUrl(): string {
  return process.env.STORY_RPC_URL?.trim() || AENEID_RPC_URL;
}

/**
 * The CDR threshold network's keeper API.
 *
 * The published default is plain HTTP on a raw IP address, which is a real risk and is
 * documented as such (see `docs/SECURITY.md` §5 and `docs/PROTOCOL_DISCOVERY.md` §7). The
 * failure it can cause is an AVAILABILITY failure — a forged partial fails the AES-GCM tag
 * check — so a failure here must surface as `INFRASTRUCTURE_FAILURE` and never as a licensing
 * decision. `lib/protocol/access.ts` enforces that; this function only names the endpoint.
 */
export function cdrApiUrl(): string {
  return process.env.CDR_API_URL?.trim() || CDR_API_URL_AENEID;
}

export function createAeneidPublicClient(url: string = rpcUrl()): PublicClient {
  return createPublicClient({ transport: http(url) });
}

/** A wallet client for an account the caller owns. Never constructs an account from a key. */
export function createAeneidWalletClient(
  account: Account,
  url: string = rpcUrl(),
): WalletClient {
  return createWalletClient({ account, transport: http(url) });
}

/** A Story Protocol client bound to Aeneid. */
export function createStoryClient(account: Account, url: string = rpcUrl()): StoryClient {
  return StoryClient.newClient({
    account,
    transport: http(url),
    chainId: AENEID_CHAIN_ID,
  });
}

/**
 * A CDR client for the given account.
 *
 * The two casts are the seam the CDR SDK documents: it publishes structural client types so
 * a viem client can be passed without a version-matching dance. They are confined to this
 * one function so no other file has to know about them.
 */
export function createCdrClient(params: {
  account: Account;
  publicClient?: PublicClient;
  url?: string;
  apiUrl?: string;
}): CDRClient {
  const url = params.url ?? rpcUrl();
  const publicClient = params.publicClient ?? createAeneidPublicClient(url);

  return new CDRClient({
    network: CDR_NETWORK,
    apiUrl: params.apiUrl ?? cdrApiUrl(),
    publicClient: publicClient as unknown as CDRPublicClient,
    walletClient: createAeneidWalletClient(params.account, url) as unknown as CDRWalletClient,
  });
}

/**
 * A CDR client with no wallet at all — enough to ask the network public questions.
 *
 * The observer reads the DKG round, threshold and global public key. Those are properties of the
 * network, not of an account, so requiring a key to ask them would mean a key on the read-only
 * path for no reason. This is the constructor the UI's public pages use.
 */
export function createCdrObserverClient(params: {
  publicClient?: PublicClient;
  url?: string;
  apiUrl?: string;
} = {}): CDRClient {
  const publicClient = params.publicClient ?? createAeneidPublicClient(params.url ?? rpcUrl());

  return new CDRClient({
    network: CDR_NETWORK,
    apiUrl: params.apiUrl ?? cdrApiUrl(),
    publicClient: publicClient as unknown as CDRPublicClient,
  });
}

/** The chain this build targets, re-exported so callers do not import constants directly. */
export const EXPECTED_CHAIN_ID: number = AENEID_CHAIN_ID;


/** A short display form of an address for UI copy: 0x1234…abcd. */
export function shortAddress(address: Address | string): string {
  const value = String(address);
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}
