/**
 * POST /api/verify-license — ask the read condition, on chain, for free.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS ROUTE DOES, AND WHAT IT DELIBERATELY DOES NOT DO
 *
 * It performs ONE `eth_call` to the vault's read condition contract:
 *
 *   checkReadCondition(uuid, accessAuxData, conditionData, caller)
 *
 * That is a `view` call — no transaction, no gas, no signature, no key. The answer is the
 * protocol's own verdict on whether the given address may read this vault, which is precisely
 * the gate the product is about. It is reachable from any visitor's browser and from a
 * deployed server, because it needs nothing but the public Aeneid RPC.
 *
 * It does NOT perform the protected read, and it does NOT decrypt anything. Decrypting
 * requires the license holder's key and the CDR keeper network, so this route can never
 * produce `ACCESS GRANTED` — and the UI must not claim it. The states it can produce are
 * LICENSE VERIFIED, NO LICENSE, and VERIFICATION ERROR.
 *
 * It holds no key read from anywhere, and the address it asks about is the caller's input,
 * not an identity it asserts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";

import { CANONICAL_VAULT } from "@/lib/protocol/canonical-vault";
import { EXPECTED_CHAIN_ID, createAeneidPublicClient } from "@/lib/protocol/clients";
import { encodeLicenseAccessAuxData } from "@/lib/protocol/conditions";
import { probeReadCondition } from "@/lib/protocol/gate";
import { redactInfrastructureDetail } from "@/lib/access/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A JSON response with the two headers a per-caller verdict needs.
 *
 * `no-store` is not boilerplate here. The body is a statement about one address, and a cached copy
 * served to a different address would be a verdict about the wrong wallet — the exact failure this
 * product exists to prevent, arriving by way of an intermediary rather than a bug.
 */
function respond(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}

/** The budget of a single probe, so a stalled RPC surfaces as an error instead of a hang. */
const PROBE_TIMEOUT_MS = 8_000;

/**
 * Bound a promise so a silent RPC becomes a reported failure.
 *
 * Without this, an RPC that accepts the connection and then never answers leaves the docket in
 * `CHECKING` indefinitely — and a spinner that never resolves is indistinguishable from a
 * product that is broken. A timeout is an infrastructure failure and is reported as one.
 */
function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A small per-client limiter.
//
// This endpoint makes an outbound RPC call on every request, which makes it a way to spend
// somebody else's rate limit. The call itself cannot be redirected — the contract address is
// fixed in `canonical-vault.ts` and the caller supplies only a wallet address — so this is
// about availability, not about reach.
//
// ⚠️ THIS IS NOT A SECURITY BOUNDARY, AND MUST NOT BE DESCRIBED AS ONE (BUILD 7).
//
// The per-client key comes from `x-forwarded-for`, which a caller can set to anything when the
// app is not behind a proxy that overwrites it. Vary the header and the per-client budget is
// bypassed entirely. That is tolerable only because nothing is being protected by it — the
// product's authorization decision is made by the chain, not by this counter — and because the
// process-wide cap below still bounds the total outbound calls regardless of what any caller
// claims about itself. A real per-client limit belongs at the edge; see `docs/SECURITY.md`.
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

/**
 * A ceiling on the whole process, not on one claimed client.
 *
 * This is the part spoofing cannot get around: however many `x-forwarded-for` values a caller
 * invents, the instance will not exceed this many outbound probes per window. It exists so that
 * the honest-looking per-client brake cannot be turned into an unbounded one by lying.
 */
const MAX_GLOBAL_PER_WINDOW = 240;

/** Header values are attacker-controlled, so the map key is bounded rather than trusted. */
const MAX_KEY_LENGTH = 64;

const attempts = new Map<string, number[]>();
const globalAttempts: number[] = [];

function prune(times: number[], now: number): number[] {
  return times.filter((at) => now - at < WINDOW_MS);
}

function withinBudget(key: string, now: number): boolean {
  const recent = prune(attempts.get(key) ?? [], now);
  if (recent.length >= MAX_PER_WINDOW) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  // Keep the map from growing without bound on a long-lived instance.
  if (attempts.size > 5_000) {
    for (const [candidate, times] of attempts) {
      if (times.every((at) => now - at >= WINDOW_MS)) attempts.delete(candidate);
    }
  }
  return true;
}

function withinGlobalBudget(now: number): boolean {
  const recent = prune(globalAttempts, now);
  if (recent.length >= MAX_GLOBAL_PER_WINDOW) return false;
  recent.push(now);
  globalAttempts.length = 0;
  globalAttempts.push(...recent);
  return true;
}

/** `Request` has no `ip`; the header the platform sets is the only signal available. */
function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const raw =
    forwarded !== null && forwarded.length > 0
      ? (forwarded.split(",")[0]?.trim() ?? "unknown")
      : (request.headers.get("x-real-ip") ?? "unknown");
  return raw.slice(0, MAX_KEY_LENGTH);
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Expected a JSON body." }, 400);
  }

  const addressInput =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["address"]
      : undefined;

  if (typeof addressInput !== "string" || !isAddress(addressInput)) {
    return respond(
      {
        error:
          "That is not a valid EVM address. Nothing was asked of the chain, so nothing was " +
          "decided — this is a rejected input, not a licensing answer.",
      },
      400,
    );
  }

  const wallet = getAddress(addressInput);

  const now = Date.now();
  if (!withinBudget(clientKey(request), now) || !withinGlobalBudget(now)) {
    return respond(
      {
        error:
          "Too many checks in the last minute. The chain was not asked, so this is not a " +
          "licensing answer — wait a moment and try again.",
      },
      429,
    );
  }

  const checkedAt = new Date().toISOString();

  try {
    const publicClient = createAeneidPublicClient();

    // Assert the chain before reading from it. A check that came back from the wrong network
    // would be a verdict about a different world, and the whole point of this route is that
    // the answer is attributable.
    const chainId = await publicClient.getChainId();
    if (chainId !== EXPECTED_CHAIN_ID) {
      return respond(
        {
          error:
            `The RPC answered with chain ${chainId}, not Aeneid (${EXPECTED_CHAIN_ID}). ` +
            `No verdict was reached.`,
        },
        502,
      );
    }

    const verdict = await withTimeout(
      probeReadCondition({
        publicClient,
        uuid: CANONICAL_VAULT.uuid,
        accessAuxData: encodeLicenseAccessAuxData([CANONICAL_VAULT.licenseTokenId]),
        conditionData: CANONICAL_VAULT.conditionData,
        caller: wallet,
      }),
      PROBE_TIMEOUT_MS,
      `the read condition did not answer within ${PROBE_TIMEOUT_MS}ms`,
    );

    // The verdict is the whole answer, and it is fully wire-safe (strings and nulls only), so
    // it crosses as itself. The client turns it into a state-machine event with the same pure
    // mapper the tests exercise — `eventForVerdict` in `lib/access/verify.ts` — which keeps the
    // bigint evidence typed instead of round-tripping integers through JSON.
    return respond(
      {
        verdict,
        checkedAt,
        chainId,
        vaultUuid: CANONICAL_VAULT.uuid,
      },
      200,
    );
  } catch (caught) {
    // An unreachable RPC is not a statement about anyone's rights.
    const detail = caught instanceof Error ? caught.message : String(caught);

    // The operator gets the whole message; the caller gets it with endpoints and long tokens
    // removed. A viem error names the URL it failed to reach, and hosted RPC providers put the
    // API key in that URL — so returning it verbatim would let any anonymous caller read the
    // operator's RPC credential by making the RPC fail. See `lib/access/redact.ts`.
    console.error("[verify-license] infrastructure failure:", detail);

    return respond(
      {
        error:
          "The chain could not be reached, so no verdict was reached. This is an " +
          `infrastructure failure, not a licensing decision. (${redactInfrastructureDetail(detail)})`,
      },
      502,
    );
  }
}

/** A GET on this route is a mistake worth naming rather than a 405 with no explanation. */
export function GET(): NextResponse {
  return respond({ error: "This route verifies by POST with { address }." }, 405);
}
