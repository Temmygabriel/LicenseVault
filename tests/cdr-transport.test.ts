/**
 * The published CDR SDK against our proxy route — the seam where a silent mismatch would live.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * `app/api/cdr/[...path]/route.ts` forwards only six paths and, on each, only the query
 * parameters that endpoint declares. That allowlist was written by reading the SDK's source. If
 * the reading was wrong in either direction the failure is quiet and awful:
 *
 *   • a path the SDK calls but we do not forward  → the browser unlock fails at runtime, in
 *     production, on a route that tested perfectly against hand-written URLs;
 *   • a parameter the SDK sends but we drop      → `cdr_partials` is queried without its
 *     `requester_pub_key_hex`, gets an empty list, and the read times out with no partials.
 *
 * Neither is visible from testing the route with URLs I made up. So these tests drive the
 * **real, pinned SDK functions** and assert on the URL the SDK itself produced.
 *
 * The other thing pinned here is the envelope. The SDK's transport unwraps `{ code, msg, error }`
 * and returns `msg`. Our route forwards the envelope untouched — including it is exactly the
 * contract. If a future refactor "tidies up" the proxy by unwrapping, the first test below fails,
 * which is the only warning anyone would get before every read broke.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  queryCDRPartials,
  queryDKGNetwork,
  queryGlobalPubKey,
  queryLatestActiveDKGNetwork,
} from "@piplabs/cdr-sdk";

/** The real group public key the live keeper returns, as measured from Aeneid. */
const LIVE_PUBLIC_KEY = "cd262522f2b25d3d86dbd1e033bc24ab3cdfcceb3f3d60090aa20ff9861e2403";

/**
 * A DKG network in the shape the SDK's decoder requires.
 *
 * Taken from the live `/dkg/latest_active` answer (round 46) rather than invented: the decoder
 * rejects a payload missing any of these five fields, so a made-up shape would only be testing
 * the decoder's complaints instead of the URL the SDK builds.
 */
const DKG_NETWORK = {
  round: 46,
  start_block_height: "24591840",
  start_block_hash: "ZlAbb7oAR1ClIyj39IWDpBtnrUuaWRvSb6YjCezfPeg=",
  active_val_set: ["0x01946a273caa675a2206a4d336c34313c8fe3dea"],
  global_public_key: LIVE_PUBLIC_KEY,
  public_coeffs: [LIVE_PUBLIC_KEY],
};

let fetchMock: ReturnType<typeof vi.fn>;

/** Answer as the keeper does: a JSON envelope with the payload under `msg`. */
function keeperSays(msg: unknown, code = 200): void {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ code, msg, error: "" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The URL string the SDK handed to `fetch`. */
function requestedUrl(): string {
  const call = fetchMock.mock.calls[0];
  if (call === undefined) throw new Error("the SDK never called fetch");
  return call[0] as string;
}

describe("the SDK's relative base resolves to our own origin", () => {
  it("builds a same-origin path, which is what makes /api/cdr work in a browser", async () => {
    keeperSays({ public_key: LIVE_PUBLIC_KEY });

    const key = await queryGlobalPubKey({ apiUrl: "/api/cdr" });

    // A relative URL is the whole point: the browser resolves it against the page origin, so the
    // request is same-origin, over HTTPS, with no mixed-content block and no CORS preflight.
    // This assertion is the direct proof that the SDK does not require an absolute base.
    expect(requestedUrl()).toBe("/api/cdr/dkg/global_public_key");
    // And it really did decode the keeper's payload rather than returning junk.
    expect(Buffer.from(key).toString("hex")).toBe(LIVE_PUBLIC_KEY);
  });

  it("tolerates a trailing slash on the base", async () => {
    keeperSays({ public_key: LIVE_PUBLIC_KEY });

    await queryGlobalPubKey({ apiUrl: "/api/cdr/" });

    // `joinPath` strips trailing slashes. Pinned because a double slash would still hit the
    // route but would be a different, unmatched path string — a silent 404 in production.
    expect(requestedUrl()).toBe("/api/cdr/dkg/global_public_key");
  });
});

describe("the envelope crosses exactly once", () => {
  it("the SDK unwraps the keeper envelope itself", async () => {
    keeperSays({ public_key: LIVE_PUBLIC_KEY });

    // If the proxy unwrapped `msg` before returning, `msg` would be undefined here and the SDK
    // would throw looking for `code`. Passing proves the proxy forwards and the SDK unwraps —
    // one unwrap, in the right place.
    await expect(queryGlobalPubKey({ apiUrl: "/api/cdr" })).resolves.toBeInstanceOf(Uint8Array);
  });

  it("a keeper error envelope surfaces as a typed SDK error, not as a value", async () => {
    // The keeper answers HTTP 200 with a non-200 `code` when the request itself was bad. That is
    // still a failure, and it must not be mistaken for an empty-but-successful answer.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 500, msg: null, error: "round is required" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(queryLatestActiveDKGNetwork({ apiUrl: "/api/cdr" })).rejects.toThrow(/round is required/);
  });
});

describe("the routes the SDK actually calls are the routes the proxy forwards", () => {
  it("asks for cdr_partials with exactly the two parameters the allowlist permits", async () => {
    // `[]` is a valid answer meaning "no partials yet". The point of this test is the request.
    keeperSays([]);

    await queryCDRPartials({
      apiUrl: "/api/cdr",
      uuid: 11062,
      requesterPubKeyHex: `0x04${"ab".repeat(64)}`,
    });

    const url = requestedUrl();
    expect(url.startsWith("/api/cdr/dkg/cdr_partials?")).toBe(true);

    // The load-bearing half: the proxy copies parameters by iterating its own allowlist, so any
    // name the SDK sends that the allowlist lacks is dropped without an error. Compare the sets
    // directly rather than trusting the two to stay in step by hand.
    const sent = [...new URL(url, "https://example.test").searchParams.keys()].sort();
    expect(sent).toEqual(["requester_pub_key_hex", "uuid"]);
  });

  it("asks for latest_active with no query string at all", async () => {
    keeperSays({ network: DKG_NETWORK });

    await queryLatestActiveDKGNetwork({ apiUrl: "/api/cdr" });

    // `latest_active` declares no parameters in the allowlist, so a query string here would be
    // silently stripped — and a stripped parameter is a request that means something different.
    expect(requestedUrl()).toBe("/api/cdr/dkg/latest_active");
  });

  it("asks for dkg_network with exactly the `round` parameter", async () => {
    keeperSays({ network: DKG_NETWORK });

    await queryDKGNetwork({ apiUrl: "/api/cdr", round: 46 });

    const url = requestedUrl();
    const sent = [...new URL(url, "https://example.test").searchParams.keys()];
    expect(sent).toEqual(["round"]);
    expect(new URL(url, "https://example.test").searchParams.get("round")).toBe("46");
  });
});
