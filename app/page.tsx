import Link from "next/link";

import { AccessDocket } from "@/components/AccessDocket";
import { ProofReceipt } from "@/components/ProofReceipt";
import { VaultMark } from "@/components/ProtectedAsset";
import { INITIAL_ACCESS_STATE } from "@/lib/access/state";
import { loadProofReceipt } from "@/lib/evidence/receipt";
import {
  AENEID_CHAIN_ID,
  PROTECTED_ASSET_NAME,
  REQUIRED_LICENSE_LABEL,
} from "@/lib/protocol/constants";
import styles from "./page.module.css";

/**
 * Landing surface.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS REAL ON THIS PAGE, AND WHAT IS NOT
 *
 * Real: the Proof Receipt. Every row is read from the canonical run's committed artifacts by
 * `lib/evidence/receipt.ts`, and every transaction hash in it was re-checked against Aeneid by
 * the independent verifier before it was published.
 *
 * Not yet wired: the access flow itself. This build has no wallet connector, so the page cannot
 * learn which address is asking — and a docket that answered without asking the chain would be
 * inventing a verdict, which is the one thing this product exists not to do. The button is
 * therefore `disabled`, and the reason is printed under it rather than left for the reader to
 * infer from a dead control.
 *
 * The state machine below the surface is real (`lib/access/state.ts`) and the protocol adapter
 * is real (`lib/protocol/*`); what is missing is the connection between a visitor's wallet and
 * those two. That is the next build, and it is stated as missing here so nobody has to guess.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default function Home() {
  const receipt = loadProofReceipt();
  const networkLabel = `Story Aeneid · Chain ${AENEID_CHAIN_ID}`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/">
            <VaultMark className={styles.brandMark} />
            <span className={styles.brandName}>LicenseVault</span>
          </Link>

          <nav className={styles.headerNav} aria-label="Sections">
            <a className={styles.headerLink} href="#how-it-works">
              How it works
            </a>
            <a className={styles.headerLink} href="#proof">
              Proof
            </a>
            {/* Deliberately not a button. There is no wallet connector in this build, and a
                control that looked clickable would misrepresent what the page can do. */}
            <span className={styles.wallet}>
              <span className={styles.walletDot} aria-hidden="true" />
              <span className={styles.walletLong}>Wallet </span>not connected
            </span>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <section className={styles.proposition}>
            <p className={`label ${styles.eyebrow}`}>Onchain rights. Real access.</p>

            <h1 className={`display ${styles.headline}`}>A license should open the door.</h1>

            <p className={styles.supporting}>
              LicenseVault connects an onchain IP license to real access permission for protected
              content. The content stays sealed until the read is allowed.
            </p>

            <a className={styles.propositionLink} href="#how-it-works">
              How it works
            </a>
            <p className={styles.propositionHint}>
              The protocol condition decides access — not a flag in this page.
            </p>
          </section>

          <AccessDocket
            state={INITIAL_ACCESS_STATE}
            walletLabel={null}
            assetName={PROTECTED_ASSET_NAME}
            assetSublabel="Fictional demonstration resource"
            licenseRequired={REQUIRED_LICENSE_LABEL}
            networkLabel={networkLabel}
            networkBadge="Aeneid · Testnet"
            action={{
              label: "Check Access",
              reason:
                "Not wired to a wallet yet. This build has no wallet connector, so the docket " +
                "cannot know which address is asking — and it will not answer a question it " +
                "never asked the chain. The protocol flow underneath is real and has already " +
                "run end to end on Aeneid; that run is in the proof receipt below.",
            }}
          />
        </div>

        <section className={styles.how} id="how-it-works" aria-labelledby="how-heading">
          <h2 className={`label ${styles.sectionHeading}`} id="how-heading">
            How it works
          </h2>

          <ol className={styles.howSteps}>
            <li className={styles.howStep}>
              <span className={styles.howStepIndex} aria-hidden="true">
                01
              </span>
              <h3 className={styles.howStepTitle}>License</h3>
              <p className={styles.howStepText}>
                A creator registers an IP asset on Story and attaches commercial terms. That
                attachment is the right being granted — not a promise made on a website.
              </p>
            </li>

            <li className={styles.howStep}>
              <span className={styles.howStepIndex} aria-hidden="true">
                02
              </span>
              <h3 className={styles.howStepTitle}>Verify</h3>
              <p className={styles.howStepText}>
                The content is sealed with a key held inside a CDR vault, and the vault&apos;s read
                condition carries the terms. The condition asks the license contract who owns the
                token — so the chain answers, not this page.
              </p>
            </li>

            <li className={styles.howStep}>
              <span className={styles.howStepIndex} aria-hidden="true">
                03
              </span>
              <h3 className={styles.howStepTitle}>Protected read</h3>
              <p className={styles.howStepText}>
                Only a wallet holding the license can perform the read, and only then is the key
                released and the content decrypted. Without the license the read is refused and
                the bytes stay sealed.
              </p>
            </li>
          </ol>

          <p className={styles.howNote}>
            The gate is the protocol condition, not a toggle in this interface. A malformed
            request and a missing license produce different answers, and this interface is built
            to keep them different: a refusal is reported as a refusal only when the chain
            actually refused.
          </p>
        </section>

        <div id="proof">
          {receipt !== null ? (
            <ProofReceipt receipt={receipt} />
          ) : (
            <section className="receipt" aria-labelledby="proof-missing">
              <h2 className="label receipt__heading" id="proof-missing">
                Proof receipt
              </h2>
              <p className="receipt__subhead">
                The canonical run is not present in this checkout, so there is nothing to show
                here. Nothing is substituted for it.
              </p>
            </section>
          )}
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.footerNote}>
            A demonstration build on Story Aeneid testnet. The protected asset is fictional; the
            run recorded above is real.
          </p>
          <p className={styles.footerContext}>{networkLabel}</p>
        </div>
      </footer>
    </div>
  );
}
