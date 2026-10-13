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
 * A bracketed IPv6 literal, with or without a port. `[::1]:1317`.
 */
const IPV6_LIKE = /\[[0-9a-fA-F:]{2,45}\](?::\d{1,5})?/g;

/**
 * A dotted host with a port: `keeper.internal:1317`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS RULE WAS ADDED, AND WHY IT WAS MISSING (2026-10-13)
 *
 * The URL rule above was written against viem, whose errors name the endpoint as a URL. Node's
 * socket errors do not. When the CDR keeper proxy cannot reach its upstream, the message is:
 *
 *   fetch failed to http://172.192.41.96:1317: connect ECONNREFUSED 172.192.41.96:1317
 *
 * The first form is a URL and was already caught. **The second is a bare `host:port` and was
 * not** — so the address survived redaction and would have been handed to an anonymous caller.
 * Found by the proxy's own test asserting the host is absent, which is the point of asserting on
 * the output rather than trusting the rule.
 *
 * The negative lookahead keeps a `file.ts:42`-style source reference legible. Redacting those
 * would be noise rather than protection, and noise is what makes people weaken a redactor later.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const HOST_PORT_LIKE =
  /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+(?!(?:ts|tsx|js|jsx|mjs|cjs|go|py|json|md|css|html|yml|yaml|toml|rs|java|rb|sh|sql|txt|map|sol)\b)[a-zA-Z]{2,24}:\d{1,5}\b/g;

/**
 * A bare dotted quad, with or without a port. Catches an internal address reported on its own,
 * which is how a failed connection is usually named when the URL was not echoed back.
 *
 * Four octets exactly, so it cannot match a version string — `viem@2.57.3` is three, and that
 * has to survive redaction.
 */
const IPV4_LIKE = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?\b/g;

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
 * Strip anything that could carry a credential or an internal address out of an infrastructure
 * error message.
 *
 * Returns a string safe to hand to an anonymous caller. It is deliberately lossy: when redaction
 * changes the text it says so, because a silently altered error message is its own kind of lie.
 */
export function redactInfrastructureDetail(message: string): string {
  // Order is load-bearing. A scheme URL contains a host:port inside it, so consuming the whole
  // URL first leaves the narrower rules nothing to chew on and keeps one endpoint from being
  // replaced twice.
  let redacted = message.replace(URL_LIKE, "[endpoint redacted]");
  redacted = redacted.replace(IPV6_LIKE, "[endpoint redacted]");
  redacted = redacted.replace(HOST_PORT_LIKE, "[endpoint redacted]");
  redacted = redacted.replace(IPV4_LIKE, "[endpoint redacted]");
  redacted = redacted.replace(TOKEN_LIKE, "[redacted]");

  const collapsed = redacted.replace(/\s+/g, " ").trim();
  const truncated =
    collapsed.length > MAX_DETAIL ? `${collapsed.slice(0, MAX_DETAIL)}… (truncated)` : collapsed;

  if (truncated !== message) {
    return `${truncated} — endpoints and long tokens are redacted before this leaves the server.`;
  }
  return truncated;
}
