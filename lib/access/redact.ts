/**
 * Redaction for infrastructure detail that is about to leave the server.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FINDING THIS FILE EXISTS TO CLOSE
 *
 * The verification route reports infrastructure failures honestly, and the viem error message is
 * genuinely useful — it is how the unreachable-RPC screenshot in `qa-screens/` is legible. But the
 * message embeds the endpoint it failed to reach, and the route was returning it verbatim:
 *
 *   URL: https://aeneid.storyrpc.io/v3/SUPER_SECRET_API_KEY
 *
 * Most hosted RPC providers — Alchemy, QuickNode, Infura — put the credential **in the URL path**.
 * So an anonymous caller could POST a malformed address, make the RPC fail, and read back the
 * operator's RPC API key. For this deployment the default endpoint is public and keyless, which is
 * exactly why it would have gone unnoticed until someone configured a private one.
 *
 * The build contract forbids exposing RPC secrets, so this is not a hardening nicety; it is the
 * contract. And note *why* a comment was not enough: the leak was in a code path that only runs
 * when something else has already gone wrong.
 *
 * WHAT IS KEPT
 *
 * The failure class and the HTTP status — "HTTP request failed / Status: 404" — because those are
 * what make the error actionable without naming the endpoint. The full, unredacted message is
 * written to the server log, where it belongs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Matches a URL with or without a scheme, and stops at whitespace or a quote. */
const URL_LIKE = /(?:https?:\/\/|\/\/)[^\s"'`)\]]+/gi;

/**
 * Matches a long opaque token: 24+ characters of hex, base64 or URL-safe base64.
 *
 * The RPC key in the case above is caught by the URL rule, but a provider may also report it in a
 * separate line ("API key: …"), and some error strings carry a bearer token with no URL around it.
 */
const TOKEN_LIKE = /\b[A-Za-z0-9_\-]{24,}\b/g;

/** Longest detail that is ever returned. The useful part is always at the front. */
const MAX_DETAIL = 300;

/**
 * Strip anything that could carry a credential out of an infrastructure error message.
 *
 * Returns a string safe to hand to an anonymous caller. It is deliberately lossy: when redaction
 * changes the text it says so, because a silently altered error message is its own kind of lie.
 */
export function redactInfrastructureDetail(message: string): string {
  let redacted = message.replace(URL_LIKE, "[endpoint redacted]");
  redacted = redacted.replace(TOKEN_LIKE, "[redacted]");

  const collapsed = redacted.replace(/\s+/g, " ").trim();
  const truncated =
    collapsed.length > MAX_DETAIL ? `${collapsed.slice(0, MAX_DETAIL)}… (truncated)` : collapsed;

  if (truncated !== message) {
    return `${truncated} — endpoints and long tokens are redacted before this leaves the server.`;
  }
  return truncated;
}
