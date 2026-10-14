/**
 * Browser-side AES-256-GCM opening for the protected demo payload.
 *
 * The server-only content.ts uses node:crypto and must not enter a Client Component bundle.
 * Decryption therefore uses Web Crypto in the visitor's browser after the CDR SDK returns the key.
 */
export const DATA_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const PROTECTED_CONTENT_URL = "/assets/commercial-brand-pack.sealed";
export const EXPECTED_PLAINTEXT_SHA256 =
  "46cab4a8232e4eea226500b424416a353618c8606008d374dbb15f56bc864cd7";

export class BrowserContentDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserContentDecryptionError";
  }
}

/** The recorded format is [12-byte IV][ciphertext][16-byte AES-GCM authentication tag]. */
export async function decryptContentInBrowser(
  sealed: Uint8Array,
  dataKey: Uint8Array,
): Promise<Uint8Array> {
  if (dataKey.byteLength !== DATA_KEY_BYTES) {
    throw new BrowserContentDecryptionError(
      `The vault returned ${dataKey.byteLength} key bytes; exactly 32 are required.`,
    );
  }
  if (sealed.byteLength < IV_BYTES + TAG_BYTES) {
    throw new BrowserContentDecryptionError("The encrypted payload is too short to be valid.");
  }

  const iv = sealed.slice(0, IV_BYTES);
  // Web Crypto expects ciphertext || tag together (the same layout AES-GCM uses for this blob).
  const ciphertextAndTag = sealed.slice(IV_BYTES);
  try {
    const keyBuffer = dataKey.slice().buffer as ArrayBuffer;
    const ivBuffer = iv.slice().buffer as ArrayBuffer;
    const payloadBuffer = ciphertextAndTag.slice().buffer as ArrayBuffer;
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: TAG_BYTES * 8 },
      key,
      ciphertextAndTag,
    );
    return new Uint8Array(plaintext);
  } catch (error) {
    throw new BrowserContentDecryptionError(
      error instanceof Error ? error.message : "Web Crypto could not authenticate the payload.",
    );
  }
}

export async function sha256HexInBrowser(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function fetchSealedContent(): Promise<Uint8Array> {
  const response = await fetch(PROTECTED_CONTENT_URL, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`The encrypted demo payload could not be loaded (HTTP ${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== 832) {
    throw new Error(
      `The sealed payload has ${bytes.byteLength} bytes; the canonical evidence records 832.`,
    );
  }
  return bytes;
}
