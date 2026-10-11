"use client";

/**
 * The header wallet control.
 *
 * It reports the address the chain was actually asked about — not the draft in the input, and
 * not a connection the page invented. When no check has run it says so plainly instead of
 * implying a wallet is connected.
 *
 * It is a status, not a way in: this build reads an address and asks the chain about it. It
 * never requests a signature and never holds a key, so there is nothing here to "connect" in
 * the sense a wallet normally means.
 */

import { useAccess } from "./AccessProvider";
import { shortAddress } from "@/lib/format";

export interface WalletChipProps {
  /** CSS-Module class names are `string | undefined` under `noUncheckedIndexedAccess`. */
  className?: string | undefined;
  dotClassName?: string | undefined;
  /** Rendered before the state text; hidden on the narrowest screens to keep the header short. */
  longClassName?: string | undefined;
}

export function WalletChip({ className, dotClassName, longClassName }: WalletChipProps) {
  const { checkedAddress, state } = useAccess();

  const working = state.phase === "CHECKING" || state.phase === "ACCESSING";

  if (checkedAddress === null) {
    return (
      <span className={className}>
        <span className={dotClassName} aria-hidden="true" />
        <span className={longClassName}>Wallet </span>not connected
      </span>
    );
  }

  return (
    <span className={className} title={checkedAddress}>
      <span className={dotClassName} aria-hidden="true" />
      <span className={longClassName}>{working ? "Checking " : "Wallet "}</span>
      <span className="mono" aria-hidden="true">
        {shortAddress(checkedAddress)}
      </span>
      <span className="visually-hidden">
        {working ? "Checking " : "Wallet "}
        {checkedAddress}
      </span>
    </span>
  );
}
