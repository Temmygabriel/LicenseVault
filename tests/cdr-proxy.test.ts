/**
 * The CDR keeper proxy is the one place this product forwards a request to an address the caller
 * does not choose but the server can reach. That makes it the shape of an SSRF primitive, and the
 * tests that matter are the ones proving it is not one.
 *
 * Every test here asserts on **what was actually sent upstream**, not only on the status code. A
 * route that returns 404 while having already fetched the internal address would pass a
 * status-only test and be exactly the vulnerability this file exists to rule out.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/cdr/[...path]/route";

const ORIGIN = "http://172.192.41.96:1317";

/** A keeper-shaped success body, envelope and all. */
const KEEPER_BODY = JSON.stringify({
  code: 200,
  msg: { public_key: "cd262522f2b25d3d86dbd1e033bc24ab3cdfcceb3f3d60090aa20ff9861e2403" },
  error: "",
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(KEEPER_BODY, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Call the route the way Next does, with decoded path segments. */
function call(
  segments: string[],
  init: { query?: string; headers?: Record<string, string>; client?: string } = {},
): Promise<Response> {
  const query = init.query ?? "";
  const request = new Request(`https://licensevault.vercel.app/api/cdr/${segments.join("/")}${query}`, {
    headers: { "x-forwarded-for": init.client ?? "203.0.113.9", ...init.headers },
  });
  return GET(request, { params: Promise.resolve({ path: segments }) });
}

/** The URL string the route handed to `fetch`, or undefined if it never called it. */
function forwardedUrl(): string | undefined {
  const call = fetchMock.mock.calls[0];
  return call === undefined ? undefined : (call[0] as string);
}

/** The `init` object the route handed to `fetch`, or undefined if it never called it. */
function forwardedInit(): RequestInit | undefined {
  const call = fetchMock.mock.calls[0];
  return call === undefined ? undefined : (call[1] as RequestInit);
}

describe("the proxy forwards the endpoints the SDK actually calls", () => {
  it("sends /dkg/global_public_key to the pinned keeper origin", async () => {
    const response = await call(["dkg", "global_public_key"]);

    expect(response.status).toBe(200);
    expect(forwardedUrl()).toBe(`${ORIGIN}/dkg/global_public_key`);
  });

  it("carries through the query parameters an endpoint declares", async () => {
    await call(["dkg", "cdr_partials"], {
      query: "?uuid=11062&requester_pub_key_hex=0x04ab",
    });

    expect(forwardedUrl()).toBe(
      `${ORIGIN}/dkg/cdr_partials?uuid=11062&requester_pub_key_hex=0x04ab`,
    );
  });
});

describe("it is not an open proxy", () => {
  it.each([
    ["a sibling path", ["dkg", "shutdown"]],
    ["an absolute-looking path", ["etc", "passwd"]],
    ["a traversal out of /dkg", ["dkg", "..", "admin"]],
    ["a traversal to the cloud metadata address", ["..", "..", "latest", "meta-data"]],
    ["a prefix that is not an exact match", ["dkg", "latest_active", "extra"]],
    ["the bare /dkg root", ["dkg"]],
    ["nothing at all", []],
  ])("refuses %s without ever fetching", async (_label, segments) => {
    const response = await call(segments);

    expect(response.status).toBe(404);
    // The load-bearing assertion: refusing after fetching would already have leaked reach.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not forward an undeclared query parameter even on an allowed path", async () => {
    await call(["dkg", "latest_active"], { query: "?redirect=http://169.254.169.254/&round=9" });

    // `/dkg/latest_active` declares no parameters, so the query is empty rather than filtered —
    // building the URL from the allowlist means the hostile value is never a candidate.
    expect(forwardedUrl()).toBe(`${ORIGIN}/dkg/latest_active`);
  });

  it("keeps only the declared parameters when some are undeclared", async () => {
    await call(["dkg", "registrations"], { query: "?round=46&url=http://evil.test/&uuid=1" });

    expect(forwardedUrl()).toBe(`${ORIGIN}/dkg/registrations?round=46`);
  });

  it("answers a POST with 405 rather than forwarding it", async () => {
    const response = POST();

    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("no credential is laundered downstream", () => {
  it("forwards no inbound header to the keeper", async () => {
    await call(["dkg", "latest_active"], {
      headers: {
        cookie: "session=secret",
        authorization: "Bearer secret",
        "x-api-key": "secret",
      },
    });

    const headers = forwardedInit()?.headers as Record<string, string>;
    expect(Object.keys(headers).map((key) => key.toLowerCase())).toEqual(["accept"]);
    expect(JSON.stringify(headers)).not.toContain("secret");
  });
});

describe("the envelope crosses unchanged, because the SDK does the unwrapping", () => {
  it("returns the keeper's { code, msg, error } body verbatim", async () => {
    const response = await call(["dkg", "global_public_key"]);

    // If this route unwrapped `msg`, the SDK would look for `code` on a payload that no longer
    // had one and every call would fail. The bytes are the contract.
    expect(await response.text()).toBe(KEEPER_BODY);
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("passes a keeper 500 through with its status, so the SDK's own retry can see it", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 500, msg: null, error: "boom" }), { status: 500 }),
    );

    const response = await call(["dkg", "cdr_partials"], { query: "?uuid=1" });

    expect(response.status).toBe(500);
    expect(await response.text()).toContain("boom");
  });

  it("never caches a keeper answer", async () => {
    const response = await call(["dkg", "latest_active"]);

    // The DKG round advances. A cached round would make the SDK gather partials for a round that
    // no longer exists, which fails deep inside the decryption rather than at the request.
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });
});

describe("failures keep the keeper's shape and keep the keeper's address", () => {
  it("reports an unreachable keeper as an envelope error and redacts the host", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(
      new Error(`fetch failed to ${ORIGIN}: connect ECONNREFUSED 172.192.41.96:1317`),
    );

    const response = await call(["dkg", "latest_active"]);
    const body = (await response.json()) as { code: number; msg: null; error: string };

    expect(response.status).toBe(502);
    // Shaped as an envelope, so the SDK raises a StoryApiError instead of "non-JSON body" —
    // otherwise a fault on our side would be reported to the user as a faulty keeper.
    expect(body.code).toBe(502);
    expect(body.msg).toBeNull();
    // An anonymous caller must not be able to read our internal host and port out of an error.
    expect(body.error).not.toContain("172.192.41.96");
    expect(body.error).not.toContain("1317");
    expect(body.error).toContain("not a licensing decision");
  });

  it("refuses a body larger than any legitimate endpoint can produce", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 200, msg: "x".repeat(600 * 1024), error: "" })),
    );

    const response = await call(["dkg", "latest_active"]);

    expect(response.status).toBe(502);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining("larger than"),
    });
  });
});

describe("the outbound budget is per claimed client", () => {
  it("answers 429 once one caller exceeds its window", async () => {
    const client = "198.51.100.7";

    for (let i = 0; i < 60; i += 1) {
      const response = await call(["dkg", "latest_active"], { client });
      expect(response.status).toBe(200);
    }

    const exhausted = await call(["dkg", "latest_active"], { client });
    expect(exhausted.status).toBe(429);

    // A different caller is unaffected — the budget is keyed, not global.
    const other = await call(["dkg", "latest_active"], { client: "198.51.100.8" });
    expect(other.status).toBe(200);
  });
});
