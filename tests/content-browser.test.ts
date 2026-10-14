import { describe, expect, it } from "vitest";
import {
  BrowserContentDecryptionError,
  decryptContentInBrowser,
  sha256HexInBrowser,
} from "@/lib/protocol/content-browser";
import { decryptContent, encryptContent, generateDataKey, sha256Hex } from "@/lib/protocol/content";

const plaintext = new TextEncoder().encode(
  JSON.stringify({ asset: "Commercial Brand Asset Pack", rights: "Commercial Use" }),
);

describe("browser Web Crypto uses the same AES-GCM format as the recorded run", () => {
  it("decrypts IV || ciphertext || tag byte-for-byte", async () => {
    const key = generateDataKey();
    const sealed = encryptContent(plaintext, key);
    const opened = await decryptContentInBrowser(sealed, key);
    expect(Array.from(opened)).toEqual(Array.from(plaintext));
    expect(await sha256HexInBrowser(opened)).toBe(sha256Hex(plaintext));
    expect(decryptContent(sealed, key)).toEqual(opened);
  });

  it("rejects a wrong key instead of returning content", async () => {
    const sealed = encryptContent(plaintext, generateDataKey());
    await expect(decryptContentInBrowser(sealed, generateDataKey())).rejects.toBeInstanceOf(
      BrowserContentDecryptionError,
    );
  });

  it("rejects tampered bytes", async () => {
    const key = generateDataKey();
    const sealed = encryptContent(plaintext, key);
    const tampered = new Uint8Array(sealed);
    tampered[16] = (tampered[16] ?? 0) ^ 1;
    await expect(decryptContentInBrowser(tampered, key)).rejects.toBeInstanceOf(
      BrowserContentDecryptionError,
    );
  });

  it("rejects a malformed key size", async () => {
    await expect(decryptContentInBrowser(new Uint8Array(64), new Uint8Array(16))).rejects.toBeInstanceOf(
      BrowserContentDecryptionError,
    );
  });
});
