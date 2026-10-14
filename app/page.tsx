import Link from "next/link";

import { AccessPanel } from "@/components/AccessPanel";
import { HeroActions } from "@/components/HeroActions";
import { AccessProvider } from "@/components/AccessProvider";
import { ProofReceipt } from "@/components/ProofReceipt";
import { ArchiveHeroArt, VaultMark } from "@/components/ProtectedAsset";
import { WalletChip } from "@/components/WalletChip";
import { loadProofReceipt } from "@/lib/evidence/receipt";
import {
  AENEID_CHAIN_ID,
  PROTECTED_ASSET_NAME,
  REQUIRED_LICENSE_LABEL,
} from "@/lib/protocol/constants";
import styles from "./page.module.css";

/**
 * Landing surface. The visual system is the Licensed Archive: editorial, precise and quiet.
 * The client interaction is a real wallet → license → protected-read flow. The historical
 * receipt is kept visibly separate from any transaction performed in the current session.
 */
export default function Home() {
  const receipt = loadProofReceipt();
  const networkLabel = `Story Aeneid · Chain ${AENEID_CHAIN_ID}`;

  return (
    <AccessProvider>
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
              {/* A status, not a way in: this build reads an address and asks the chain about
                  it. It never requests a signature, so there is nothing here to connect. */}
              <WalletChip
                className={styles.wallet}
                dotClassName={styles.walletDot}
                longClassName={styles.walletLong}
              />
            </nav>
          </div>
        </header>

        <main className={styles.main}>
          <div className={styles.hero}>
            <section className={styles.proposition}>
              <p className={`label ${styles.eyebrow}`}>Onchain rights. Real access.</p>

              <h1 className={`display ${styles.headline}`}>A license should open the door.</h1>

              <p className={styles.supporting}>
                A creator&apos;s license becomes a real access condition. Connect your wallet, verify
                the right, then sign a protected read. The content opens only after the browser
                recovers it and checks its integrity.
              </p>

              <HeroActions />

              <ArchiveHeroArt className={styles.heroArt} />

              <ul className={styles.proofPoints} aria-label="LicenseVault principles">
                <li><span aria-hidden="true">01</span><strong>Onchain decision</strong><small>The contract decides.</small></li>
                <li><span aria-hidden="true">02</span><strong>Protected read</strong><small>Encrypted until allowed.</small></li>
                <li><span aria-hidden="true">03</span><strong>Verifiable proof</strong><small>Real transaction evidence.</small></li>
              </ul>

              <p className={styles.propositionHint}>
                Connecting does not sign or spend anything. The protected read requires a separate
                wallet approval and may use testnet gas.
              </p>
            </section>

            <AccessPanel
              assetName={PROTECTED_ASSET_NAME}
              assetSublabel="Fictional demonstration resource"
              licenseRequired={REQUIRED_LICENSE_LABEL}
              networkLabel={networkLabel}
              networkBadge="Aeneid · Testnet"
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

          <div id="proof" className={styles.evidence}>
            <section className={styles.evidenceIntro} aria-labelledby="evidence-heading">
              <p className="label">Proof, not a promise</p>
              <h2 className={`display ${styles.evidenceTitle}`} id="evidence-heading">The record behind the result.</h2>
              <p>
                Your current session&apos;s mint/read transactions appear in the Access Docket. The
                receipt below is a separately labelled historical Aeneid run, independently
                checked against the chain.
              </p>
            </section>
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
              Aeneid testnet demonstration. The protected payload is an encrypted delivery
              manifest; the listed brand files are manifest entries, not delivered binaries.
            </p>
            <p className={styles.footerContext}>{networkLabel}</p>
          </div>
        </footer>
      </div>
    </AccessProvider>
  );
}
