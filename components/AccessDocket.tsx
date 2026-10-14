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
 *
 * The handler itself is never implemented here. This component receives one, or it does not —
 * it has no branch that could reach a verdict on its own.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";

import { LicenseStatus, statusCopy } from "./LicenseStatus";
import { ProtectedAsset } from "./ProtectedAsset";
import type { AccessState } from "@/lib/access/state";

export interface DocketAction {
  label: string;
  /** Absent means the flow is not wired yet: rendered `disabled`, with `reason` shown. */
  onActivate?: () => void;
  /** Shown under a disabled action. Required whenever the action cannot be used. */
  reason?: string;
  /** True while the real work is in flight, so the control cannot be fired twice. */
  busy?: boolean;
  /** Disable a connected action until its additional input is valid. */
  disabled?: boolean;
  /**
   * When set, the button submits this form instead of calling `onActivate` directly.
   *
   * Real form semantics, not decoration: a `<button type="submit" form="…">` means Enter in the
   * address field submits, the control is reachable by keyboard in the expected order, and the
   * browser associates the label with the field.
   */
  formId?: string;
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
  /** Short pre-action guidance inside the docket. */
  children?: ReactNode;
  /** Progress, recovered content and session-specific proof shown after the primary action. */
  footer?: ReactNode;
  /** Anchor target for hero CTAs. */
  id?: string;
}

function actionLabelFor(fallback: string): string {
  // The caller owns the label for each real operation. A fixed generic override here would
  // hide "Connect wallet", "Get demo license" and "Download recovered manifest".
  return fallback;
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
  children,
  footer,
  id = "access-docket",
}: AccessDocketProps) {
  const copy = statusCopy(state.phase);
  const label = actionLabelFor(action.label);
  const wired = action.onActivate !== undefined || action.formId !== undefined;

  if (!wired && action.reason === undefined) {
    // A disabled control with no stated reason is exactly the thing the UI lock forbids. Fail
    // loudly in development rather than shipping a button that just looks broken.
    throw new Error(
      "AccessDocket: an unwired action must state the reason it cannot be used. " +
        "A disabled control with no explanation reads as a bug, not as a limit.",
    );
  }

  return (
    <article className="docket" id={id} aria-labelledby="docket-heading">
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
        {children}
        <button
          type={action.formId === undefined ? "button" : "submit"}
          form={action.formId}
          onClick={action.formId === undefined ? action.onActivate : undefined}
          className="action action--block"
          disabled={!wired || action.disabled === true || action.busy === true}
          aria-busy={action.busy === true}
          aria-describedby="docket-action-note"
        >
          {label}
        </button>
        <p className="docket__note" id="docket-action-note">
          {copy.sentence}
        </p>
        {(!wired || action.disabled === true) && action.reason !== undefined ? (
          <p className="docket__reason">{action.reason}</p>
        ) : null}
      </div>
      {footer !== undefined ? <div className="docket__footer">{footer}</div> : null}
    </article>
  );
}
