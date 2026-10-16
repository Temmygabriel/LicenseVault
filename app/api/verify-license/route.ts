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
import { EXPECTED_CHAIN_ID, createAeneidPublicClient } from "@/lib/protocol/public-clients";
import { encodeLicenseAccessAuxData } from "@/lib/protocol/conditions";
import { probeReadCondition } from "@/lib/protocol/gate";
import { redactInfrastructureDetail } from "@/lib/access/redact";
import { clientKey, createLimiter } from "@/lib/access/rate-limit";

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
// The outbound-call budget.
// ─────────────────────────────────────────────────────────────────────────────

const limiter = createLimiter({
  windowMs: 60_000,
  maxPerWindow: 12,
  maxGlobalPerWindow: 240,
});

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
  if (!limiter.check(clientKey(request), now).allowed) {
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
    const detail = caught instanceof Error ? caught.message : String(caught);
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
