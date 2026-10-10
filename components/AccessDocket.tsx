/**
 * AccessDocket — the product object. Everything else on the page supports this.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO RULES THIS COMPONENT EXISTS TO KEEP
 *
 * 1. The rows report STATE, and state comes from `lib/access/state.ts` — a machine whose
 *    successful states cannot be constructed without evidence. This component never decides
 *    anything; it renders a phase it was handed.
 *
 * 2. The action is enabled ONLY when a real handler is attached. A `CHECK ACCESS` button that
 *    looks live but answers from local state is the exact failure this project is built to
 *    refuse, so when there is no handler the button is `disabled` and the reason is printed
 *    underneath it, in the same breath.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { LicenseStatus, statusCopy } from "./LicenseStatus";
import { ProtectedAsset } from "./ProtectedAsset";
import type { AccessState } from "@/lib/access/state";

export interface DocketAction {
  label: string;
  /** Absent means the flow is not wired yet: rendered `disabled`, with `reason` shown. */
  onActivate?: () => void;
  /** Shown under a disabled action. Required whenever the action cannot be used. */
  reason?: string;
}

export interface AccessDocketProps {
  state: AccessState;
  /** Display form of the connected wallet, or `null` when nothing is connected. */
  walletLabel: string | null;
  /** Full address for the accessible text when the visible form is shortened. */
  walletFull?: string | null;
  /** The one protected resource this MVP ships. */
  assetName: string;
  assetSublabel: string;
  licenseRequired: string;
  /** Full network description, for the ruled NETWORK row. */
  networkLabel: string;
  /** Compact network badge for the docket header — `Aeneid · Testnet`. */
  networkBadge: string;
  action: DocketAction;
}

function actionLabelFor(state: AccessState, fallback: string): string {
  switch (state.phase) {
    case "CHECKING":
      return "Verifying License";
    case "ACCESSING":
      return "Accessing";
    case "UNLOCKED":
      return "Open Protected Asset";
    case "VERIFICATION_ERROR":
    case "NO_LICENSE":
      return "Try Again";
    default:
      return fallback;
  }
}

export function AccessDocket({
  state,
  walletLabel,
  walletFull,
  assetName,
  assetSublabel,
  licenseRequired,
  networkLabel,
  networkBadge,
  action,
}: AccessDocketProps) {
  const copy = statusCopy(state.phase);
  const label = actionLabelFor(state, action.label);
  const wired = action.onActivate !== undefined;

  if (!wired && action.reason === undefined) {
    // A disabled control with no stated reason is exactly the thing the UI lock forbids. Fail
    // loudly in development rather than shipping a button that just looks broken.
    throw new Error(
      "AccessDocket: an unwired action must state the reason it cannot be used. " +
        "A disabled control with no explanation reads as a bug, not as a limit.",
    );
  }

  return (
    <article className="docket" aria-labelledby="docket-heading">
      <div className="docket__header">
        <h2 className="docket__title" id="docket-heading">
          LicenseVault <span aria-hidden="true">/</span> Access Docket
        </h2>
        <span className="docket__badge">{networkBadge}</span>
      </div>

      <div className="docket__resource">
        <ProtectedAsset name={assetName} sublabel={assetSublabel} />
      </div>

      <dl className="docket__rows">
        <div className="docket__row">
          <dt className="label">License required</dt>
          <dd className="docket__value">{licenseRequired}</dd>
        </div>

        <div className="docket__row">
          <dt className="label">License holder</dt>
          <dd className="docket__value docket__value--quiet">
            {walletLabel === null ? (
              "Wallet not connected"
            ) : (
              <>
                <span className="mono" aria-hidden="true">
                  {walletLabel}
                </span>
                <span className="visually-hidden">{walletFull ?? walletLabel}</span>
              </>
            )}
          </dd>
        </div>

        <div className="docket__row">
          <dt className="label">Access status</dt>
          <dd className="docket__value">
            <LicenseStatus phase={state.phase} />
          </dd>
        </div>

        <div className="docket__row docket__row--last">
          <dt className="label">Network</dt>
          <dd className="docket__value mono">{networkLabel}</dd>
        </div>
      </dl>

      <div className="docket__action">
        <button
          type="button"
          className="action action--block"
          disabled={!wired}
          aria-describedby="docket-action-note"
        >
          {label}
        </button>
        <p className="docket__note" id="docket-action-note">
          {copy.sentence}
        </p>
        {!wired && action.reason !== undefined ? (
          <p className="docket__reason">{action.reason}</p>
        ) : null}
      </div>
    </article>
  );
}
