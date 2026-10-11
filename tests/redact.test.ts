import { describe, expect, it } from "vitest";

import { redactInfrastructureDetail } from "@/lib/access/redact";

/**
 * The redaction that keeps an RPC credential off the wire.
 *
 * These tests exist because BUILD 7 found the leak in a code path that only runs *after*
 * something else has already failed. A comment on that path is not a control: nobody reads the
 * error branch while changing the success branch, and the leak would come back the first time
 * someone "improved" the message for debuggability.
 *
 * The real message below is the one this route produced on live Aeneid against a deliberately
 * unreachable RPC, with an API key placed in the URL to make the risk concrete.
 */

/** Exactly what viem returned, with a credential in the endpoint — the case that was leaking. */
const REAL_VIEM_MESSAGE = [
  "HTTP request failed.",
  "",
  "Status: 404",
  "URL: https://aeneid.storyrpc.io/v3/SUPER_SECRET_API_KEY",
  'Request body: {"method":"eth_chainId"}',
  "",
  "Details: Not Found",
  "Version: viem@2.57.3",
].join("\n");

describe("an infrastructure error cannot carry a credential out of the server", () => {
  it("removes the endpoint a hosted RPC provider keeps its API key in", () => {
    const safe = redactInfrastructureDetail(REAL_VIEM_MESSAGE);

    expect(safe).not.toContain("SUPER_SECRET_API_KEY");
    expect(safe).not.toContain("aeneid.storyrpc.io");
    expect(safe).toContain("[endpoint redacted]");
  });

  it("keeps what makes the failure actionable", () => {
    // Redaction that destroys the diagnostic is its own failure — the unreachable-RPC screenshot
    // in `qa-screens/` depends on this text being legible.
    const safe = redactInfrastructureDetail(REAL_VIEM_MESSAGE);

    expect(safe).toContain("HTTP request failed");
    expect(safe).toContain("Status: 404");
    expect(safe).toContain("viem@2.57.3");
  });

  it("says so when it changed the text, rather than silently rewriting it", () => {
    expect(redactInfrastructureDetail(REAL_VIEM_MESSAGE)).toContain("redacted");
    // Nothing to redact => no claim that anything was redacted.
    expect(redactInfrastructureDetail("the read condition did not answer within 8000ms")).toBe(
      "the read condition did not answer within 8000ms",
    );
  });

  it("removes a bare long token with no URL around it", () => {
    const safe = redactInfrastructureDetail("Unauthorized: bearer 9f8c1d2e3a4b5c6d7e8f90a1b2c3d4e5");
    expect(safe).not.toContain("9f8c1d2e3a4b5c6d7e8f90a1b2c3d4e5");
  });

  it("catches a scheme-relative and a query-string credential too", () => {
    expect(redactInfrastructureDetail("failed at //rpc.example.com/key")).not.toContain("example.com");
    expect(redactInfrastructureDetail("GET https://rpc.example.com?apikey=abc123def456")).not.toContain(
      "abc123def456",
    );
  });

  it("bounds the length, so a caller cannot be handed a wall of text", () => {
    const safe = redactInfrastructureDetail("x".repeat(5_000));
    expect(safe.length).toBeLessThanOrEqual(400);
  });

  /**
   * The one that matters most: a *successful-looking* short message must survive untouched, so
   * the route's ordinary timeout text is not mangled by the protection.
   */
  it("does not mangle an ordinary message", () => {
    const safe = redactInfrastructureDetail("the read condition did not answer within 8000ms");
    expect(safe).toBe("the read condition did not answer within 8000ms");
  });
});
