import { describe, expect, it } from "vitest";
import {
  ContentDecryptionError,
  DATA_KEY_BYTES,
  decryptContent,
  encryptContent,
  generateDataKey,
  sameBytes,
  sha256Hex,
} from "@/lib/protocol/content";

/**
 * These tests exist to hold one line: a wrong key must never produce content.
 *
 * The whole product claim is "the ciphertext is useless without the vault". If
 * `decryptContent` could return bytes for a key it should reject, then reading the raw
 * ciphertext would be as good as holding the license, and every "ACCESS GRANTED" the app
 * ever renders would be theatre. So the failure cases below are the important ones.
 */

const PLAINTEXT = new TextEncoder().encode(
  "Commercial Brand Asset Pack — master logo, 4K, delivered under a Commercial Use license.",
);

describe("content protection", () => {
  it("round-trips real content byte for byte", () => {
    const key = generateDataKey();
    const sealed = encryptContent(PLAINTEXT, key);
    const opened = decryptContent(sealed, key);

    expect(sameBytes(opened, PLAINTEXT)).toBe(true);
    expect(sha256Hex(opened)).toBe(sha256Hex(PLAINTEXT));
  });

  it("produces a blob that does not contain the plaintext", () => {
    // A cheap but real check: if the plaintext were echoed into the blob, the promise that
    // the ciphertext is safe to host in the open would be false.
    const sealed = encryptContent(PLAINTEXT, generateDataKey());
    const haystack = Buffer.from(sealed).toString("latin1");
    expect(haystack).not.toContain("Commercial Brand Asset Pack");
  });

  it("REJECTS a wrong key instead of returning garbage", () => {
    const sealed = encryptContent(PLAINTEXT, generateDataKey());
    const wrongKey = generateDataKey();

    // This is the exact situation a forged or misrouted CDR partial would create.
    expect(() => decryptContent(sealed, wrongKey)).toThrow(ContentDecryptionError);
  });

  it("REJECTS a tampered ciphertext — the AEAD tag is the integrity backstop", () => {
    const key = generateDataKey();
    const sealed = encryptContent(PLAINTEXT, key);

    // Flip one bit in the middle of the ciphertext, leaving IV and tag intact.
    const tampered = new Uint8Array(sealed);
    const bodyIndex = 16; // past the 12-byte IV, inside the ciphertext
    tampered[bodyIndex] = (tampered[bodyIndex] as number) ^ 0x01;

    expect(() => decryptContent(tampered, key)).toThrow(ContentDecryptionError);
  });

  it("REJECTS a truncated blob rather than decrypting a prefix", () => {
    const key = generateDataKey();
    const sealed = encryptContent(PLAINTEXT, key);

    expect(() => decryptContent(sealed.subarray(0, 20), key)).toThrow(
      ContentDecryptionError,
    );
  });

  it("rejects a key of the wrong size instead of coercing it", () => {
    const sealed = encryptContent(PLAINTEXT, generateDataKey());

    // A 16-byte key would be AES-128 — a different cipher, not a lesser one.
    expect(() => decryptContent(sealed, new Uint8Array(16))).toThrow(
      ContentDecryptionError,
    );
  });

  it("uses a fresh IV, so identical content encrypts differently every time", () => {
    // Reusing an IV under the same key is the classic GCM break. Freshness is a property of
    // the implementation, so it is asserted rather than assumed.
    const key = generateDataKey();
    const first = encryptContent(PLAINTEXT, key);
    const second = encryptContent(PLAINTEXT, key);

    expect(sameBytes(first, second)).toBe(false);
    expect(sameBytes(decryptContent(first, key), decryptContent(second, key))).toBe(true);
  });

  it("generates a 256-bit key", () => {
    const key = generateDataKey();
    expect(key.length).toBe(DATA_KEY_BYTES);
    expect(DATA_KEY_BYTES).toBe(32);
    // Not a constant, and not repeated.
    expect(sameBytes(generateDataKey(), generateDataKey())).toBe(false);
  });
});

describe("byte comparison", () => {
  it("does not treat a prefix as a match", () => {
    expect(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
    expect(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });
});
