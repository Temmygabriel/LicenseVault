"use client";

import { useAccess } from "./AccessProvider";

export function HeroActions() {
  const { walletAddress, connectWallet, busy } = useAccess();

  return (
    <div className="hero-actions">
      {walletAddress === null ? (
        <button
          type="button"
          className="hero-actions__primary"
          onClick={() => void connectWallet()}
          disabled={busy}
        >
          <span aria-hidden="true">↗</span> Connect wallet
        </button>
      ) : (
        <a className="hero-actions__primary" href="#access-docket">
          Open access docket <span aria-hidden="true">→</span>
        </a>
      )}
      <a className="hero-actions__secondary" href="#how-it-works">
        How it works <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}
