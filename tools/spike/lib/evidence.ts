/**
 * Evidence writing for the BUILD 2 spike.
 *
 * Two rules shape this module:
 *
 * 1. **Only facts actually observed are written.** Every artifact is produced from a real
 *    protocol return value. Nothing is templated, defaulted, or filled in from a docs
 *    example.
 * 2. **A funded run is not repeatable for free.** Aeneid funds come from a faucet with a
 *    drip limit, so every on-chain step persists what it learned. Re-running the harness
 *    after a failure resumes rather than re-allocating a vault or re-minting a license.
 *
 * The state file records identifiers and transaction hashes only. It never records a private
 * key, and it never records the data key — see `tools/spike/build-vault.ts` for where the
 * data key is kept and why it is deleted when the run completes.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { AENEID_FAUCET_URL } from "../../../lib/protocol/constants";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repository root, derived from this file's location so the harness works from any cwd. */
export const REPO_ROOT = join(HERE, "..", "..", "..");

/** Gitignored scratch area. Used only for state that must not be published. */
export const SCRATCH_DIR = join(REPO_ROOT, "scratch");

export interface RunState {
  runId: string;
  startedAt: string;
  chainId: number | null;
  wallets: {
    owner: string;
    reader: string;
    /** True when no separate reader key was supplied — recorded because it weakens the denial. */
    readerIsOwner: boolean;
  };
  asset?: {
    spgNftContract: string;
    ipId: string;
    nftTokenId: string;
    licenseTermsId: string;
    txHashes: Record<string, string>;
  };
  vault?: {
    uuid: number;
    allocateTxHash: string;
    writeTxHash: string;
  };
  license?: {
    licenseTokenId: string;
    txHash: string;
    mintedTo: string;
  };
  /** sha256 of the plaintext, recorded before any unlock is claimed. */
  plaintextSha256?: string;
}

export function runDir(runId: string): string {
  return join(REPO_ROOT, "evidence", runId);
}

export function ensureRunDir(runId: string): string {
  const dir = runDir(runId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureScratchDir(): string {
  mkdirSync(SCRATCH_DIR, { recursive: true });
  return SCRATCH_DIR;
}

/** Write an evidence artifact as pretty JSON. Returns the absolute path written. */
export function writeArtifact(
  runId: string,
  filename: string,
  data: unknown,
): string {
  const dir = ensureRunDir(runId);
  const path = join(dir, filename);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return path;
}

/** Read an evidence artifact, or null when it has not been written yet. */
export function readArtifact<T>(runId: string, filename: string): T | null {
  const path = join(runDir(runId), filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const STATE_FILE = "_run-state.json";

export function loadState(runId: string): RunState | null {
  return readArtifact<RunState>(runId, STATE_FILE);
}

export function saveState(state: RunState): void {
  writeArtifact(state.runId, STATE_FILE, state);
}

/**
 * Raised when the harness cannot start because something it needs is not configured.
 *
 * Distinct from a crash on purpose: a missing environment variable is a normal, expected
 * outcome of running the harness before funding a wallet, and it should read that way rather
 * than as a stack trace.
 */
export class PreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreconditionError";
  }
}

/** Read a PRIVATE KEY from the environment without ever putting its value in a log line. */
export function requirePrivateKey(envVar: string): `0x${string}` {
  const value = process.env[envVar];
  if (value === undefined || value.trim() === "") {
    throw new PreconditionError(
      `${envVar} is not set. This step submits a real transaction on Story Aeneid and needs a ` +
        `funded disposable testnet wallet. Copy .env.example to .env.local, set ${envVar}, and ` +
        `fund the address from ${AENEID_FAUCET_URL}. ` +
        `NEVER use a wallet that holds mainnet funds.`,
    );
  }
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    // Deliberately does not echo the value — only its length, which is enough to diagnose
    // the usual failure (a mnemonic pasted instead of a key, or a missing 0x).
    throw new PreconditionError(
      `${envVar} is not a 32-byte hex private key (got ${trimmed.length} characters). ` +
        "Do not paste a seed phrase into an environment file.",
    );
  }
  return trimmed as `0x${string}`;
}
