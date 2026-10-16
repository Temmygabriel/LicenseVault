/**
 * Public Aeneid RPC client helpers.
 *
 * Kept in a small module with no Story/CDR SDK imports so API routes that only
 * need a read-only viem client do not evaluate the CDR SDK during Next.js build.
 */
import { createPublicClient, http, type PublicClient } from "viem";
import { AENEID_RPC_URL, AENEID_CHAIN_ID } from "./constants";

/** Runtime override for public RPC experiments; no wallet or private key is involved. */
export function rpcUrl(): string {
  return process.env.STORY_RPC_URL?.trim() || AENEID_RPC_URL;
}

export function createAeneidPublicClient(url: string = rpcUrl()): PublicClient {
  return createPublicClient({ transport: http(url) });
}

export const EXPECTED_CHAIN_ID: number = AENEID_CHAIN_ID;
