"use client";

import { shortAddress } from "@/lib/format";
import { useAccess } from "./AccessProvider";

export interface WalletChipProps {
  className?: string;
  dotClassName?: string;
  longClassName?: string;
}

/** Wallet control: explicitly connect when signed out; report the real account when connected. */
export function WalletChip({ className, dotClassName, longClassName }: WalletChipProps) {
  const {
    walletAddress,
    walletChainId,
    busy,
    connectWallet,
    disconnectWallet,
  } = useAccess();

  if (walletAddress === null) {
    return (
      <button
        type="button"
        className={`${className ?? ""} wallet-connect-control`}
        onClick={() => void connectWallet()}
        disabled={busy}
        aria-busy={busy}
      >
        <span className={dotClassName} aria-hidden="true" />
        <span>{busy ? "Connecting…" : <>Connect<span className={longClassName}> wallet</span></>}</span>
      </button>
    );
  }

  const networkText =
    walletChainId === null
      ? "Network not checked"
      : walletChainId === 1315
        ? "Aeneid Testnet"
        : `Wrong network · ${walletChainId}`;

  return (
    <div className="wallet-control-group">
      <span className={className} title={walletAddress}>
        <span className={dotClassName} aria-hidden="true" />
        <span className={longClassName}>Wallet </span>
        <span className="mono">{shortAddress(walletAddress)}</span>
        <span className="visually-hidden">Full wallet address: {walletAddress}.</span>
        <span className="wallet-network-label">{networkText}</span>
      </span>
      <button
        type="button"
        className="wallet-disconnect"
        onClick={disconnectWallet}
        disabled={busy}
        aria-label="Disconnect LicenseVault's local session"
        title="Disconnect this site session only"
      >
        Disconnect
      </button>
    </div>
  );
}
