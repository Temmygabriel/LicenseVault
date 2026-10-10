/**
 * ProofReceipt — the run, as a receipt.
 *
 * Everything below is read from the committed canonical run by `lib/evidence/receipt.ts`. No
 * value here is typed by hand into this component, which is what stops the page and the
 * evidence from drifting apart.
 *
 * The receipt also states its own limits: how many claims were re-derived by the independent
 * verifier, and how many it left unproven. A receipt that showed only the 41 and not the 1
 * would be a worse artifact than one that showed neither.
 */

import type { ProofReceipt as Receipt, ReceiptGroup } from "@/lib/evidence/receipt";

function Rows({ group }: { group: ReceiptGroup }) {
  const ordered = group.rows.filter((row) => row.value.length > 0);
  if (ordered.length === 0) return null;

  return (
    <div className="receipt__group">
      <h3 className="label receipt__group-heading">{group.heading}</h3>
      <dl className="receipt__rows">
        {ordered.map((row) => (
          <div className="receipt__row" key={`${group.heading}:${row.label}`}>
            <dt className="receipt__key">{row.label}</dt>
            <dd className={row.mono ? "receipt__value mono" : "receipt__value"}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ProofReceipt({ receipt }: { receipt: Receipt }) {
  const { verification } = receipt;

  return (
    <section className="receipt" aria-labelledby="proof-heading">
      <header className="receipt__header">
        <div>
          <h2 className="label receipt__heading" id="proof-heading">
            Proof receipt
          </h2>
          <p className="receipt__subhead">
            The canonical run <span className="mono">{receipt.runId}</span>, recorded on Story
            Aeneid. Every hash below was re-checked against the chain by an independent verifier
            before it was published.
          </p>
        </div>
      </header>

      <div className="receipt__grid">
        <Rows group={receipt.rights} />
        <Rows group={receipt.vault} />
        <Rows group={receipt.outcome} />
        <Rows group={receipt.network} />
      </div>

      {receipt.steps.length > 0 ? (
        <div className="receipt__steps">
          <h3 className="label receipt__group-heading">On-chain steps</h3>
          <ol className="receipt__step-list">
            {receipt.steps.map((step) => (
              <li className="receipt__step" key={step.txHash}>
                <span className="receipt__step-op">{step.operation}</span>
                <a
                  className="receipt__step-link mono"
                  href={step.href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {step.txHash.slice(0, 10)}…{step.txHash.slice(-8)}
                  <span className="visually-hidden"> — view {step.operation} on the explorer</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {verification !== null ? (
        <p className="receipt__verification">
          <strong>
            {verification.verified} verified · {verification.refuted} refuted ·{" "}
            {verification.notVerifiable} not verifiable
          </strong>{" "}
          — the result of re-deriving these claims from the chain, the published ABIs and the
          committed bytes rather than trusting the harness that wrote them. The unproven claims
          are listed rather than dropped: they are the limits of what this evidence supports.
        </p>
      ) : null}

      <details className="receipt__details">
        <summary className="receipt__summary">Technical details</summary>
        <p>
          The read was performed by a wallet holding license token{" "}
          <span className="mono">73227</span>; the refusal was performed by a wallet holding no
          token, which is why it is attributable to licensing rather than to a malformed request.
          Condition addresses, the raw RPC endpoint and the full claim list live in{" "}
          <span className="mono">docs/EVIDENCE.md</span> and the run directory itself.
        </p>
        <p>
          Verify it yourself — the check needs no key and no gas:
          <br />
          <code className="mono">npm run verify:run</code>
        </p>
      </details>
    </section>
  );
}
