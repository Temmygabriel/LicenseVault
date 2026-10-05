/**
 * Protected-content encryption.
 *
 * WHY THIS EXISTS — and why it is the heart of the design:
 *
 * A CDR vault can hold at most `maxEncryptedDataSize()` bytes (1024 on Aeneid), so a real
 * asset cannot live inside the vault. The vault therefore protects the **data key**, and the
 * content is encrypted with that key by us.
 *
 * That split gives the property the whole project claims: the ciphertext can sit anywhere
 * (a CDN, an S3 bucket, a plain file next to this repo) and remain unreadable, because the
 * only thing that releases the key is the on-chain condition check. Reading the bytes is not
 * the same as reading the asset — and this module is what makes that literally true rather
 * than a slogan.
 *
 * The AEAD auth tag is also the project's integrity backstop. The CDR read path trusts a
 * remote keeper to route partial decryptions correctly; a misrouted or forged partial would
 * yield a wrong key. A wrong key never silently decrypts to plausible bytes here — it throws.
 * That is why `decryptContent` MUST NOT degrade to returning whatever it can:
 * "ACCESS GRANTED" is only ever printed after this function returns real plaintext.
 *
 * SERVER-SIDE ONLY. This module uses `node:crypto`; importing it from a Client Component
 * fails the build rather than silently shipping a browser crypto path with different
 * semantics. The browser never needs to encrypt — it only ever displays a result.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/** A 256-bit key. This is the smallest thing we ever place inside a vault. */
export const DATA_KEY_BYTES = 32;

const IV_BYTES = 12; // 96-bit nonce — the size AES-GCM is defined for.
const TAG_BYTES = 16; // 128-bit auth tag — the maximum GCM allows.

/** Thrown when a sealed blob cannot be authenticated. Never swallowed into a success path. */
export class ContentDecryptionError extends Error {
  constructor(reason: string) {
    super(`Protected content could not be decrypted: ${reason}`);
    this.name = "ContentDecryptionError";
  }
}

/** Generate a fresh 256-bit data key from the platform CSPRNG. */
export function generateDataKey(): Uint8Array {
  return new Uint8Array(randomBytes(DATA_KEY_BYTES));
}

/**
 * Encrypt content with AES-256-GCM.
 *
 * Returns one self-contained blob: `[12-byte IV][ciphertext][16-byte auth tag]`. The IV is
 * generated per call and travels with the ciphertext, so the same plaintext and the same key
 * still produce different bytes every time.
 */
export function encryptContent(plaintext: Uint8Array, dataKey: Uint8Array): Uint8Array {
  assertKeySize(dataKey);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return new Uint8Array(Buffer.concat([iv, ciphertext, tag]));
}

/**
 * Decrypt a blob produced by {@link encryptContent}.
 *
 * @throws ContentDecryptionError if the blob is truncated, or if the auth tag does not
 *   verify — which is the case for a wrong key as well as for tampered bytes. Both must be
 *   treated as "we do not have the content", never as partial success.
 */
export function decryptContent(sealed: Uint8Array, dataKey: Uint8Array): Uint8Array {
  assertKeySize(dataKey);

  if (sealed.length < IV_BYTES + TAG_BYTES) {
    throw new ContentDecryptionError(
      `blob is ${sealed.length} bytes, too short to contain an IV and an auth tag`,
    );
  }

  const iv = sealed.subarray(0, IV_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const ciphertext = sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES);

  try {
    const decipher = createDecipheriv("aes-256-gcm", dataKey, iv);
    decipher.setAuthTag(tag);
    return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  } catch (error) {
    // `final()` throws on tag mismatch. Re-thrown as our own type so callers cannot mistake
    // a failed decryption for a transport error and retry it as though it were transient.
    throw new ContentDecryptionError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Content fingerprint, used to prove recovered plaintext is the original byte for byte.
 *
 * This is the evidence an "unlock" is real: the hash of what came out of the gate must equal
 * the hash of what went in. A hash recorded before the run and compared after it cannot be
 * back-filled.
 */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Constant-time-ish equality for fingerprints, so a comparison is never a partial match. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    // Both indices are in range by the length check above.
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

function assertKeySize(dataKey: Uint8Array): void {
  if (dataKey.length !== DATA_KEY_BYTES) {
    throw new ContentDecryptionError(
      `data key must be exactly ${DATA_KEY_BYTES} bytes; received ${dataKey.length}`,
    );
  }
}
