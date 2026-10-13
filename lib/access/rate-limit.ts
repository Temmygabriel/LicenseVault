/**
 * A small fixed-window limiter, shared by the routes that make an outbound call on every request.
 *
 * ⚠️ THIS IS NOT A SECURITY BOUNDARY, AND MUST NOT BE DESCRIBED AS ONE (BUILD 7).
 *
 * The per-client key comes from `x-forwarded-for` when the app is not behind a proxy that
 * overwrites it, and a caller can set that header to anything. Vary it and the per-client budget
 * is bypassed entirely. That is tolerable only because nothing is being protected by it — the
 * product's authorization decision is made by the chain, not by this counter — and because the
 * process-wide cap below still bounds the total outbound calls regardless of what any caller
 * claims about itself. A real per-client limit belongs at the edge; see `docs/SECURITY.md`.
 */

export type LimiterVerdict = { allowed: true } | { allowed: false; scope: "client" | "process" };

export interface LimiterOptions {
  /** Length of the window, in milliseconds. */
  windowMs: number;
  /** Requests one claimed client may make per window. */
  maxPerWindow: number;
  /**
   * A ceiling on the whole process, not on one claimed client.
   *
   * This is the part spoofing cannot get around: however many `x-forwarded-for` values a caller
   * invents, the instance will not exceed this many outbound calls per window.
   */
  maxGlobalPerWindow: number;
}

export interface Limiter {
  /** Record an attempt for `key` if both budgets allow it. */
  check(key: string, now: number): LimiterVerdict;
}

/** Header values are attacker-controlled, so the map key is bounded rather than trusted. */
const MAX_KEY_LENGTH = 64;

/** Stop the per-client map growing without bound on a long-lived instance. */
const PRUNE_THRESHOLD = 5_000;

function prune(times: number[], now: number, windowMs: number): number[] {
  return times.filter((at) => now - at < windowMs);
}

/**
 * Build one limiter. Each caller gets its own budgets — the verify route's probes and the CDR
 * proxy's fetches are counted separately, which is right: they are different outbound calls to
 * different upstreams, and one being busy should not throttle the other.
 */
export function createLimiter(options: LimiterOptions): Limiter {
  const { windowMs, maxPerWindow, maxGlobalPerWindow } = options;

  const attempts = new Map<string, number[]>();
  const globalAttempts: number[] = [];

  function withinClientBudget(key: string, now: number): boolean {
    const recent = prune(attempts.get(key) ?? [], now, windowMs);
    if (recent.length >= maxPerWindow) {
      attempts.set(key, recent);
      return false;
    }
    recent.push(now);
    attempts.set(key, recent);
    if (attempts.size > PRUNE_THRESHOLD) {
      for (const [candidate, times] of attempts) {
        if (times.every((at) => now - at >= windowMs)) attempts.delete(candidate);
      }
    }
    return true;
  }

  function withinGlobalBudget(now: number): boolean {
    const recent = prune(globalAttempts, now, windowMs);
    if (recent.length >= maxGlobalPerWindow) return false;
    recent.push(now);
    globalAttempts.length = 0;
    globalAttempts.push(...recent);
    return true;
  }

  return {
    check(key, now) {
      if (!withinClientBudget(key, now)) return { allowed: false, scope: "client" };
      if (!withinGlobalBudget(now)) return { allowed: false, scope: "process" };
      return { allowed: true };
    },
  };
}

/**
 * `Request` has no `ip`; the header the platform sets is the only signal available.
 *
 * Exported because both routes must derive the key the same way — two spellings of "who is
 * calling" would mean two different budgets for one caller.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const raw =
    forwarded !== null && forwarded.length > 0
      ? (forwarded.split(",")[0]?.trim() ?? "unknown")
      : (request.headers.get("x-real-ip") ?? "unknown");
  return raw.slice(0, MAX_KEY_LENGTH);
}
