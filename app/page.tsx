import {
  AENEID_CHAIN_ID,
  AENEID_RPC_URL,
  CDR_ADDRESS,
  LICENSE_READ_CONDITION_ADDRESS,
  PROTECTED_ASSET_NAME,
  REQUIRED_LICENSE_LABEL,
} from "@/lib/protocol/constants";

/**
 * Landing surface.
 *
 * DELIBERATELY NOT THE FINISHED PRODUCT UI.
 *
 * Build-spec §0 and §35 are explicit: the polished frontend must not be built before the
 * real protocol spike passes. BUILD 2 (the smallest real protected vault on Aeneid, with a
 * proven rejected-then-allowed read) has not run yet.
 *
 * So this page shows the Access Docket structure and the VERIFIED protocol facts, and the
 * primary action is DISABLED with the real reason stated. It does not simulate an access
 * decision, because there is no access decision to show yet.
 *
 * When BUILD 2 passes, this surface is wired to the real state machine in
 * `lib/access/state.ts` and the action becomes live.
 */
export default function Home() {
  return (
    <main
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "var(--space-16) var(--space-6) var(--space-24)",
      }}
    >
      <header style={{ marginBottom: "var(--space-12)" }}>
        <p
          className="label"
          style={{ margin: 0, letterSpacing: "0.18em", color: "var(--ink)" }}
        >
          LicenseVault
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gap: "var(--space-12)",
          gridTemplateColumns: "minmax(0, 1fr)",
          alignItems: "start",
        }}
      >
        {/* ── Product proposition ─────────────────────────────────────────── */}
        <section>
          <h1
            className="display"
            style={{
              fontSize: "clamp(2.25rem, 6vw, 3.75rem)",
              margin: "0 0 var(--space-6)",
              maxWidth: "16ch",
            }}
          >
            A license should open the door.
          </h1>

          <p
            style={{
              fontSize: "1.125rem",
              color: "var(--text-secondary)",
              maxWidth: "52ch",
              margin: "0 0 var(--space-8)",
            }}
          >
            LicenseVault turns an onchain IP license into a real access permission for
            protected digital content.
          </p>

          <p
            className="label"
            style={{ margin: 0, color: "var(--text-secondary)" }}
          >
            Built with Story
          </p>
        </section>

        {/* ── Access Docket — the primary product object ──────────────────── */}
        <section aria-labelledby="docket-heading">
          <article className="docket">
            <div className="docket__header">
              <span className="docket__title" id="docket-heading">
                Access Docket
              </span>
              <span className="docket__subtitle">Story Aeneid</span>
            </div>

            <div className="docket__row">
              <span className="label">Protected Asset</span>
              <span className="docket__value">{PROTECTED_ASSET_NAME}</span>
            </div>

            <div className="docket__row">
              <span className="label">License Required</span>
              <span className="docket__value">{REQUIRED_LICENSE_LABEL}</span>
            </div>

            <div className="docket__row">
              <span className="label">License Holder</span>
              <span className="docket__value mono" style={{ color: "var(--text-secondary)" }}>
                Wallet not connected
              </span>
            </div>

            <div className="docket__row">
              <span className="label">Access</span>
              <span
                className="docket__status docket__status--restricted"
                role="status"
              >
                Restricted
              </span>
            </div>

            <div className="docket__row" style={{ borderBottom: "none" }}>
              <span className="label">Network</span>
              <span className="docket__value mono">
                {AENEID_CHAIN_ID} · {AENEID_RPC_URL}
              </span>
            </div>
          </article>

          <div className="docket__action" style={{ padding: "var(--space-6) 0" }}>
            <button type="button" className="action" disabled aria-describedby="why-disabled">
              Check Access
            </button>
            <p
              id="why-disabled"
              style={{
                marginTop: "var(--space-4)",
                marginBottom: 0,
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                maxWidth: "54ch",
              }}
            >
              Verification is not wired yet. The protected vault has not been created on
              Aeneid, so there is no real access decision to report. This action stays
              disabled until the protocol harness proves a rejected read and then an
              allowed read against the live chain.
            </p>
          </div>
        </section>
      </div>

      {/* ── Verified protocol facts, shown as facts ────────────────────────── */}
      <section aria-labelledby="facts-heading" style={{ marginTop: "var(--space-24)" }}>
        <h2
          className="label"
          id="facts-heading"
          style={{ marginBottom: "var(--space-4)", color: "var(--ink)" }}
        >
          Verified Protocol Facts
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            maxWidth: "60ch",
            marginTop: 0,
            marginBottom: "var(--space-6)",
          }}
        >
          Read from live Aeneid chain state and the published SDK on 2026-10-05. The full
          evidence is in <span className="mono">docs/PROTOCOL_DISCOVERY.md</span>.
        </p>

        <dl
          style={{
            display: "grid",
            gap: "var(--space-3)",
            margin: 0,
            borderTop: "var(--border) solid var(--border-subtle)",
            paddingTop: "var(--space-4)",
          }}
        >
          {[
            ["CDR contract", CDR_ADDRESS],
            ["LicenseReadCondition", LICENSE_READ_CONDITION_ADDRESS],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 200px) minmax(0, 1fr)",
                gap: "var(--space-6)",
                alignItems: "baseline",
              }}
            >
              <dt className="label">{label}</dt>
              <dd className="mono" style={{ margin: 0, wordBreak: "break-all" }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
