"use client";

/**
 * AccessPanel — the docket with the real verification flow attached.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS COMPONENT IS RESPONSIBLE FOR, AND WHAT IT IS NOT
 *
 * It is the only place the docket is handed a live action. It renders the address field, the
 * two shortcuts that fill it, and it passes `verify` through to the machine. It contains no
 * verdict logic: `verify` dispatches to `/api/verify-license`, which performs a real
 * `eth_call` to the vault's read condition on Aeneid, and the answer comes back through
 * `lib/access/verify.ts` into `lib/access/state.ts`.
 *
 * It also never claims more than the check establishes. The check asks the CONDITION whether
 * the address may read. It does not perform the protected read and it does not decrypt, so the
 * strongest thing on this page is LICENSE VERIFIED — never ACCESS GRANTED. The copy below the
 * button says exactly that, because a docket that blurred those two would be worth nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useSyncExternalStore } from "react";

import { AccessDocket } from "./AccessDocket";
import { useAccess } from "./AccessProvider";
import { FAILURE_COPY } from "./LicenseStatus";
import { CANONICAL_VAULT } from "@/lib/protocol/canonical-vault";

export interface AccessPanelProps {
  assetName: string;
  assetSublabel: string;
  licenseRequired: string;
  networkLabel: string;
  networkBadge: string;
}

const FORM_ID = "verify-license-form";

/** Injected wallets do not change after load, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * Is there a browser wallet to read an address from?
 *
 * `useSyncExternalStore` rather than an effect that calls `setState`: the answer is an external
 * fact that is only knowable on the client, and the server snapshot (`false`) is what keeps the
 * server and client markup identical on first paint. An effect would render once without the
 * control and again with it, which is the cascading render React warns about.
 */
function useInjectedWalletAvailable(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => typeof window !== "undefined" && typeof window.ethereum?.request === "function",
    () => false,
  );
}

export function AccessPanel({
  assetName,
  assetSublabel,
  licenseRequired,
  networkLabel,
  networkBadge,
}: AccessPanelProps) {
  const { state, draft, setDraft, checkedAddress, problem, busy, verify, reset, useInjectedWallet } =
    useAccess();

  const walletAvailable = useInjectedWalletAvailable();

  const verified = state.phase === "LICENSE_VERIFIED";
  const failure = state.phase === "VERIFICATION_ERROR" ? state.failure : null;

  // The one primary action. After a verification it becomes a way to check a different
  // address, because there is nothing further this build can honestly do with the answer.
  const action = verified
    ? { label: "Check another address", onActivate: reset, busy: false }
    : { label: "Verify license", onActivate: () => verify(), busy, formId: FORM_ID };

  return (
    <AccessDocket
      state={state}
      walletLabel={checkedAddress}
      walletFull={checkedAddress}
      assetName={assetName}
      assetSublabel={assetSublabel}
      licenseRequired={licenseRequired}
      networkLabel={networkLabel}
      networkBadge={networkBadge}
      action={action}
    >
      <form
        id={FORM_ID}
        className="verify"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          verify();
        }}
      >
        <label className="field" htmlFor="wallet-address">
          <span className="label field__label">Wallet address</span>
          <input
            id="wallet-address"
            className="field__input mono"
            name="address"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
            value={draft}
            disabled={busy || verified}
            onChange={(event) => setDraft(event.target.value)}
            aria-describedby="verify-help"
          />
        </label>

        <p className="verify__help" id="verify-help">
          The check asks this vault&apos;s read condition, on chain, whether that address holds
          license token <span className="mono">#{String(CANONICAL_VAULT.licenseTokenId)}</span>.
          It is a read-only call to Story Aeneid: no signature, no gas, no key.
        </p>

        <div className="verify__shortcuts">
          {walletAvailable ? (
            <button type="button" className="linkish" onClick={useInjectedWallet} disabled={busy}>
              Use my wallet
            </button>
          ) : null}
          <button
            type="button"
            className="linkish"
            disabled={busy || verified}
            onClick={() => {
              setDraft(CANONICAL_VAULT.licenseHolder);
              verify(CANONICAL_VAULT.licenseHolder);
            }}
          >
            Use the recorded license holder
          </button>
        </div>

        {problem !== null ? (
          <p className="verify__problem" role="alert">
            {problem}
          </p>
        ) : null}

        {failure !== null ? (
          <p className="verify__problem">{FAILURE_COPY[failure.kind]}</p>
        ) : null}
      </form>
    </AccessDocket>
  );
}
