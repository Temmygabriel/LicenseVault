/**
 * Small display helpers shared by server and client components.
 *
 * Kept out of `lib/protocol/clients.ts` on purpose: that module imports the Story and CDR SDKs,
 * and a client component importing one string helper from it would drag the whole SDK surface
 * toward the browser bundle. Formatting has no business next to client construction.
 */

/** `0x226e01…A863` — short enough for a chip, with the full value kept alongside it. */
export function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}
