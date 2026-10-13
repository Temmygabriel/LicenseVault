/**
 * GET /api/cdr/dkg/* — a constrained, TLS-terminating front door for the CDR keeper API.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS ROUTE EXISTS
 *
 * The CDR keeper REST API is served over **plain HTTP** at a public address
 * (`http://172.192.41.96:1317`, pinned in `lib/protocol/constants.ts`). A page served over HTTPS
 * cannot call it: the browser blocks the request as mixed content before it leaves the tab. That
 * is the whole reason the protected read has only ever run from the CLI harness.
 *
 * This route terminates TLS on our own origin and forwards to the keeper over the private hop.
 * The browser then talks to `/api/cdr/...` same-origin, over HTTPS, with no mixed-content block
 * and no CORS preflight.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS NOT AN OPEN PROXY, AND THE DIFFERENCE IS THE ENTIRE DESIGN
 *
 * An open forwarder to an internal address is an SSRF primitive: whoever finds it can reach
 * anything the server can reach, using the server as their source address. So the upstream is
 * **not derived from the request in any way**:
 *
 *   1. The origin is a module constant. No header, query parameter or path segment can change it.
 *   2. Only the six `/dkg/*` paths the CDR SDK actually calls are forwarded, matched against an
 *      exact table — not a prefix test. `../`, percent-encoding and unlisted paths are rejected
 *      before any URL is built, so path traversal has nothing to traverse.
 *   3. Only the query parameters each endpoint takes are forwarded, from a per-path allowlist.
 *      Anything else is dropped rather than passed through.
 *   4. GET only, and no inbound header is forwarded — in particular not `cookie`, `authorization`
 *      or `x-forwarded-*`, so this route cannot be used to launder credentials downstream.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RESPONSE IS PASSED THROUGH BYTE-FOR-BYTE, ON PURPOSE
 *
 * The SDK's own transport (`@piplabs/cdr-sdk/dist/commonjs/story-api/transport.js`) parses the
 * body, checks `envelope.code === 200`, and returns `envelope.msg`. It does the unwrapping. If
 * this route helpfully unwrapped it too, the SDK would look for `code` on a payload that no
 * longer has one and every call would fail. So the keeper's `{ code, msg, error }` envelope
 * crosses unchanged.
 *
 * That also fixes the shape of our own failures: the SDK throws `StoryApiError("non-JSON body")`
 * if it cannot parse what comes back, which would report a proxy fault as a keeper fault. Every
 * exit from this route — including every error — therefore returns JSON in the keeper's own
 * envelope shape.
 */

import { NextResponse } from "next/server";

import { CDR_API_URL_AENEID } from "@/lib/protocol/constants";
import { clientKey, createLimiter } from "@/lib/access/rate-limit";
import { redactInfrastructureDetail } from "@/lib/access/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The upstream, from a constant. `CDR_API_URL` may override it for a non-Aeneid deployment, but
 * it is read once here from configuration — never from the request.
 */
function keeperOrigin(): string {
  const configured = process.env.CDR_API_URL?.trim();
  return (configured !== undefined && configured.length > 0 ? configured : CDR_API_URL_AENEID).replace(
    /\/+$/,
    "",
  );
}

/**
 * The complete set of endpoints the CDR SDK calls, with the exact query parameters each accepts.
 *
 * Derived from `@piplabs/cdr-sdk@0.2.2` `story-api/client.js` — six call sites, nothing else. A
 * request outside this table is a request this product has no reason to make, and it is refused
 * rather than forwarded on the chance that it is harmless.
 */
const ALLOWED_PATHS: ReadonlyMap<string, readonly string[]> = new Map([
  ["/dkg/latest_active", []],
  ["/dkg/global_public_key", []],
  ["/dkg/dkg_network", ["round"]],
  ["/dkg/registrations", ["round"]],
  ["/dkg/registrations/verified", ["round"]],
  ["/dkg/cdr_partials", ["uuid", "requester_pub_key_hex"]],
]);

/** The keeper answered `/dkg/latest_active` in ~0.7s. Ten seconds is a stalled upstream, not a slow one. */
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * The largest body this route will return.
 *
 * `/dkg/latest_active` lists the active validator set and runs to a few KB. The cap exists so a
 * compromised or misbehaving upstream cannot stream an unbounded body through our origin and
 * into a browser tab.
 */
const MAX_RESPONSE_BYTES = 512 * 1024;

/**
 * Bound the outbound fetches. This route reaches a fixed upstream, so the limit is about
 * availability rather than reach — but it is a shared keeper, and this product should not be the
 * reason it falls over. See `lib/access/rate-limit.ts` for what this counter is and is not.
 */
const limiter = createLimiter({
  windowMs: 60_000,
  maxPerWindow: 60,
  maxGlobalPerWindow: 600,
});

/** A failure in the keeper's own envelope shape, so the SDK's parser treats it as a Story-API error. */
function envelopeError(status: number, message: string): NextResponse {
  return NextResponse.json(
    { code: status, msg: null, error: message },
    { status, headers: { "cache-control": "no-store, max-age=0" } },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;

  // Rebuild the path from decoded segments. Next has already split on `/`, so a literal `..`
  // arrives as a segment here — and an exact table lookup below means it simply finds nothing.
  const requested = `/${(path ?? []).join("/")}`;

  const allowedParams = ALLOWED_PATHS.get(requested);
  if (allowedParams === undefined) {
    // Named, because a 404 from an unlisted path is a real distinction from a 404 from the keeper.
    return envelopeError(
      404,
      `This proxy forwards only the CDR keeper endpoints the SDK calls. ` +
        `${requested} is not one of them, so nothing was forwarded.`,
    );
  }

  const verdict = limiter.check(clientKey(request), Date.now());
  if (!verdict.allowed) {
    return envelopeError(
      429,
      `Too many keeper requests in the last minute (${verdict.scope} budget). ` +
        `Nothing was forwarded.`,
    );
  }

  // Copy only the parameters this endpoint actually takes. Iterating the allowlist rather than
  // the request means an unexpected parameter cannot reach the keeper by being unnoticed.
  const incoming = new URL(request.url).searchParams;
  const outgoing = new URLSearchParams();
  for (const name of allowedParams) {
    const value = incoming.get(name);
    if (value !== null) outgoing.set(name, value);
  }

  const query = outgoing.toString();
  const upstreamUrl = `${keeperOrigin()}${requested}${query.length > 0 ? `?${query}` : ""}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      // No inbound header crosses this line. `Accept` is all the keeper needs, and forwarding a
      // caller's `cookie` or `authorization` to a third-party host would be a leak with no upside.
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });

    const body = await upstream.text();

    if (body.length > MAX_RESPONSE_BYTES) {
      return envelopeError(
        502,
        `The keeper returned more than ${MAX_RESPONSE_BYTES} bytes, which is larger than any ` +
          `endpoint here can legitimately produce. Nothing was passed on.`,
      );
    }

    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store, max-age=0",
      },
    });
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught);

    // The operator sees the address; a caller does not. This is the same rule as the verify
    // route, and it matters more here: an unreachable keeper would otherwise let any visitor
    // read the internal host and port out of the error message.
    console.error("[cdr-proxy] keeper unreachable:", detail);

    return envelopeError(
      502,
      `The CDR keeper did not answer, so nothing was read. This is an infrastructure ` +
        `failure, not a licensing decision. (${redactInfrastructureDetail(detail)})`,
    );
  }
}

/** Named rather than a bare 405, and in the envelope shape so the SDK's parser can read it. */
export function POST(): NextResponse {
  return envelopeError(405, "This proxy forwards GET requests only.");
}
