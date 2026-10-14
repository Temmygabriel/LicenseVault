"use client";

import { useMemo } from "react";
import { AccessDocket, type DocketAction } from "./AccessDocket";
import { useAccess } from "./AccessProvider";
import { shortAddress } from "@/lib/format";
import { AENEID_CHAIN_ID, AENEID_FAUCET_URL, explorerTxUrl } from "@/lib/protocol/constants";
import type { AccessPhase } from "@/lib/access/state";

type StepStatus = "done" | "active" | "blocked" | "waiting";

function Step({ number, title, detail, status }: {
  number: string; title: string; detail: string; status: StepStatus;
}) {
  const accessibility = status === "done" ? "Complete" : status === "active" ? "In progress" : status === "blocked" ? "Blocked" : "Waiting";
  return (
    <li className={`journey-step journey-step--${status}`} aria-current={status === "active" ? "step" : undefined}>
      <span className="journey-step__number" aria-hidden="true">{status === "done" ? "✓" : number}</span>
      <span className="journey-step__copy"><span className="journey-step__title">{title}</span><span className="journey-step__detail">{detail}</span></span>
      <span className="journey-step__status">{accessibility}</span>
    </li>
  );
}

function TxLink({ label, hash }: { label: string; hash: string }) {
  const href = explorerTxUrl(hash as `0x${string}`);
  return <div className="session-proof__row"><span>{label}</span>{href
    ? <a href={href} target="_blank" rel="noreferrer noopener" className="mono">{hash.slice(0, 10)}…{hash.slice(-8)} ↗<span className="visually-hidden"> — open transaction in Aeneid Explorer</span></a>
    : <code className="mono">{hash}</code>}</div>;
}

function descriptionFor(phase: AccessPhase, connected: boolean, correctNetwork: boolean): string {
  if (!connected) return "Connect a wallet to check the licensing condition. Connecting alone never signs or spends anything.";
  if (!correctNetwork) return "Your wallet is connected to another chain. Switch to Aeneid Testnet before checking or opening this asset.";
  switch (phase) {
    case "LOCKED": return "Check whether this wallet holds the license token used by this protected vault. This first check is read-only.";
    case "CHECKING": return "Asking the live Aeneid license condition. This is a real chain result, not a visual simulation.";
    case "NO_LICENSE": return "The on-chain condition refused this wallet for the demo token being checked. Get a demo license or explicitly test a locked read.";
    case "LICENSE_VERIFIED": return "The live condition confirmed the license. Sign the protected read next; content remains sealed until decryption and hash verification succeed.";
    case "ACCESSING": return "The CDR SDK is submitting the actual read and collecting threshold-validator responses. No fake progress percentage is displayed.";
    case "UNLOCKED": return "The CDR read returned a data key, this manifest decrypted in the browser, and its SHA-256 matched the recorded value.";
    case "VERIFICATION_ERROR": return "The request did not produce a trustworthy result. This is not a license denial; resolve the error and retry.";
  }
}

export function AccessPanel({ assetName, assetSublabel, licenseRequired, networkLabel, networkBadge }: {
  assetName: string; assetSublabel: string; licenseRequired: string; networkLabel: string; networkBadge: string;
}) {
  const {
    state, walletAddress, walletChainId, operation, busy, problem, technicalDetail,
    mintedTokenId, selectedTokenId, licenseTokenIdInput, licenseTokenIdInputValid, setLicenseTokenIdInput, mintTxHash, readTxHash, deniedReadTxHash,
    manifest, manifestJson, plaintextHash, nativeBalance, protocolReadFee,
    connectWallet, switchToAeneid, verifyLicense, mintDemoLicense, tryLockedRead,
    unlockProtectedContent, retry, downloadRecoveredManifest,
  } = useAccess();

  const connected = walletAddress !== null;
  const correctNetwork = walletChainId === AENEID_CHAIN_ID;
  const phase = state.phase;
  const licensed = phase === "LICENSE_VERIFIED" || phase === "ACCESSING" || phase === "UNLOCKED";
  const denied = phase === "NO_LICENSE";
  const unlocked = phase === "UNLOCKED";
  const busyLabel = operation === "connecting" ? "Connecting wallet…" :
    operation === "checking" ? "Checking license…" :
    operation === "minting" ? "Minting demo license…" :
    operation === "reading" ? "Recovering protected content…" : "Working…";

  const action: DocketAction = useMemo(() => {
    if (busy) return { label: busyLabel, onActivate: () => undefined, busy: true };
    if (!connected) return { label: "Connect wallet", onActivate: () => void connectWallet() };
    if (!correctNetwork) return { label: "Switch to Aeneid", onActivate: () => void switchToAeneid() };
    if (unlocked) return { label: "Download recovered manifest", onActivate: downloadRecoveredManifest };
    if (phase === "LICENSE_VERIFIED") return { label: "Sign protected read", onActivate: () => void unlockProtectedContent() };
    if (denied) return { label: "Get demo license", onActivate: () => void mintDemoLicense() };
    if (phase === "VERIFICATION_ERROR") return { label: "Retry verification", onActivate: () => void retry() };
    return { label: "Check license", onActivate: () => void verifyLicense(), disabled: !licenseTokenIdInputValid, reason: "Enter a valid decimal license token ID before checking access." };
  }, [busy, busyLabel, connected, correctNetwork, unlocked, phase, denied, connectWallet, switchToAeneid, downloadRecoveredManifest, unlockProtectedContent, mintDemoLicense, retry, verifyLicense, licenseTokenIdInput]);

  const currentNetworkLabel = walletChainId === null ? "Wallet not connected" :
    walletChainId === AENEID_CHAIN_ID ? networkLabel : `Wrong network · chain ${walletChainId} (expected ${AENEID_CHAIN_ID})`;
  const currentBadge = !connected ? "CONNECT WALLET" : correctNetwork ? "AENEID · TESTNET" : `WRONG CHAIN · ${walletChainId}`;

  const steps = useMemo(() => {
    const s1: StepStatus = connected && correctNetwork ? "done" : connected ? "blocked" : "active";
    const s2: StepStatus = licensed ? "done" : denied ? "blocked" : operation === "checking" || operation === "minting" ? "active" : connected && correctNetwork ? "active" : "waiting";
    const s3: StepStatus = readTxHash ? "done" : deniedReadTxHash ? "blocked" : operation === "reading" ? "active" : "waiting";
    const s4: StepStatus = unlocked ? "done" : phase === "ACCESSING" && readTxHash ? "active" : "waiting";
    const s5: StepStatus = unlocked && plaintextHash ? "done" : unlocked ? "active" : "waiting";
    return [s1, s2, s3, s4, s5] as const;
  }, [connected, correctNetwork, licensed, denied, operation, readTxHash, deniedReadTxHash, unlocked, phase, plaintextHash]);

  const actionNote = !connected
    ? "Connect first. Connecting never signs a transaction."
    : !correctNetwork
      ? "Switch to Aeneid Testnet. No mint or read is submitted on another chain."
      : phase === "LICENSE_VERIFIED"
        ? "A verified license is not an unlock. Sign the protected read to continue."
        : denied
          ? "The demo license is minted by your wallet. Its recorded minting fee is zero; network gas still applies."
          : unlocked
            ? "Only the recovered and hash-verified manifest can be downloaded."
            : "Every result comes from the live protocol; errors never become a license denial.";

  const footer = (
    <div className="access-workflow">
      <div className="token-entry">
        <label className="label" htmlFor="license-token-id">License token ID</label>
        <input
          id="license-token-id"
          className="token-entry__input mono"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={licenseTokenIdInput}
          onChange={(event) => setLicenseTokenIdInput(event.currentTarget.value)}
          disabled={busy}
          aria-invalid={!licenseTokenIdInputValid}
          aria-describedby="license-token-help"
        />
        <p id="license-token-help">
          Check a token you already own for this asset. The field starts with the published demo token #73227 so judges can reproduce the recorded proof. If you do not have a license, use <strong>Get demo license</strong> after the check is refused.
        </p>
        {!licenseTokenIdInputValid ? <p className="token-entry__error" role="alert">Enter a non-negative decimal token ID (digits only, up to 256 bits).</p> : null}
      </div>
      <div className="access-workflow__heading"><div><p className="label">Access sequence</p><h3 className="access-workflow__title">From license to readable content</h3></div><span className="access-workflow__count">5 checkpoints</span></div>
      <ol className="journey-list" aria-label="LicenseVault access steps">
        <Step number="01" title="Connect wallet" detail="Your address; no signature on connection." status={steps[0]} />
        <Step number="02" title="Verify license" detail="Read the live license condition on Aeneid." status={steps[1]} />
        <Step number="03" title="Sign CDR read" detail="Your wallet submits the protected read; gas may apply." status={steps[2]} />
        <Step number="04" title="Recover & decrypt" detail="The SDK collects validator partials and opens the sealed bytes." status={steps[3]} />
        <Step number="05" title="Verify content" detail="The browser checks the recorded SHA-256 before reveal." status={steps[4]} />
      </ol>
      <p className="access-workflow__explanation">{descriptionFor(phase, connected, correctNetwork)}</p>

      {operation === "reading" ? <div className="operation-note" role="status"><span className="operation-note__mark" aria-hidden="true" /><div><strong>Waiting for the protected read</strong><p>Your wallet may ask for transaction approval. Then the SDK waits for validator responses. This can take time; no progress percentage is invented.</p></div></div> : null}

      {problem !== null ? <div className="access-problem" role="alert"><p className="access-problem__title">Action needs attention</p><p>{problem}</p>{problem.toLowerCase().includes("testnet token") || problem.toLowerCase().includes("gas") ? <a href={AENEID_FAUCET_URL} target="_blank" rel="noreferrer noopener" className="text-action">Open the official Aeneid testnet faucet ↗</a> : null}{technicalDetail !== null ? <details className="flow-details"><summary>Diagnostic label</summary><code>{technicalDetail}</code></details> : null}</div> : null}

      {connected && correctNetwork && nativeBalance !== null && protocolReadFee !== null ? <dl className="fee-sheet"><div><dt>Wallet balance</dt><dd className="mono">{nativeBalance} testnet token</dd></div><div><dt>CDR protocol read fee</dt><dd className="mono">{protocolReadFee} testnet token</dd></div><p>Network gas is separate from the CDR protocol fee. These values are queried live before a protected read; zero protocol fee does not mean zero gas.</p></dl> : null}

      {denied && connected && correctNetwork && !busy ? <div className="locked-test"><div><p className="label">Optional proof test</p><h4>Show the gate refusing access</h4><p>This sends a real CDR read using the demo token ID. If your wallet does not own it, the transaction should be refused. A reverted transaction still spends network gas.</p></div><button type="button" className="action action--outline" onClick={() => void tryLockedRead()}>Test locked read · gas required</button></div> : null}

      {unlocked && manifest !== null && manifestJson !== null ? <section className="recovered-resource" aria-labelledby="recovered-resource-heading">
        <div className="recovered-resource__banner"><div className="recovered-resource__symbol" aria-hidden="true"><span /><span /><span /></div><div className="recovered-resource__banner-copy"><p className="label">Protected resource · opened</p><h3 id="recovered-resource-heading">{manifest.asset}</h3><p>{manifest.license} · delivered by {manifest.deliveredBy}</p></div><span className="verified-seal">Verified</span></div>
        <div className="recovered-resource__body">
          <div className="recovered-resource__metadata"><div><span className="label">Manifest date</span><span>{manifest.released}</span></div><div><span className="label">Protected files listed</span><span>{manifest.contents.length} entries · metadata only</span></div><div><span className="label">IP asset identifier</span><code className="mono">{manifest.ipId}</code></div></div>
          <h4 className="label">Recovered delivery manifest</h4>
          <ul className="manifest-list">{manifest.contents.map(file => <li key={file.file}><span className="manifest-file-icon" aria-hidden="true">▤</span><span className="manifest-file-copy"><strong>{file.file}</strong><small>{file.format}</small></span><span className="manifest-file-size mono">{file.bytes.toLocaleString()} B</span></li>)}</ul>
          <p className="manifest-disclaimer">This MVP gates and decrypts the JSON delivery manifest shown above. The individual SVG, EPS, palette and PDF binaries are not included in this protected payload.</p>
        </div>
        <div className="content-integrity"><div className="content-integrity__mark" aria-hidden="true">✓</div><div><strong>Content integrity confirmed</strong><p>Recovered in this browser and matched against the hash recorded before sealing.</p>{plaintextHash !== null ? <code className="mono">SHA-256 · {plaintextHash}</code> : null}</div></div>
        <button type="button" className="action action--outline action--block" onClick={downloadRecoveredManifest}>Download recovered manifest</button>
      </section> : null}

      {(mintTxHash !== null || readTxHash !== null || deniedReadTxHash !== null) ? <section className="session-proof" aria-labelledby="session-proof-heading"><div className="session-proof__header"><div><p className="label">Current session</p><h3 id="session-proof-heading">Proof receipt</h3></div><span className={unlocked ? "session-proof__state session-proof__state--good" : "session-proof__state"}>{unlocked ? "UNLOCKED" : deniedReadTxHash ? "READ REFUSED" : "IN PROGRESS"}</span></div><div className="session-proof__row"><span>License token</span><code className="mono">#{String(mintedTokenId ?? selectedTokenId)}</code></div>{mintTxHash ? <TxLink label="Mint license" hash={mintTxHash} /> : null}{deniedReadTxHash ? <TxLink label="Refused CDR read" hash={deniedReadTxHash} /> : null}{readTxHash ? <TxLink label="Authorized CDR read" hash={readTxHash} /> : null}{plaintextHash ? <div className="session-proof__row"><span>Recovered content hash</span><code className="mono">{plaintextHash.slice(0, 20)}… MATCH</code></div> : null}<p>These transaction links belong to this browser session. The historical run below is separate.</p></section> : null}

      {connected ? <div className="wallet-session-foot"><span><span className="label">Connected</span><code className="mono">{shortAddress(walletAddress)}</code></span><span><span className="label">Gate token</span><code className="mono">#{String(selectedTokenId)}</code></span></div> : <p className="wallet-prompt-note">No wallet is connected. LicenseVault never asks for a seed phrase or private key.</p>}
    </div>
  );

  return <AccessDocket
    id="access-docket"
    state={state}
    walletLabel={walletAddress === null ? null : shortAddress(walletAddress)}
    walletFull={walletAddress}
    assetName={assetName}
    assetSublabel={assetSublabel}
    licenseRequired={licenseRequired}
    networkLabel={currentNetworkLabel}
    networkBadge={currentBadge || networkBadge}
    action={{ ...action, busy }}
    footer={footer}
  >
    <p className="docket__action-intro">{actionNote}</p>
  </AccessDocket>;
}
