import { useState } from "react";
import { api, type ClaimSummary } from "./api";
import { DecisionsBar, RingChart, StatusBar } from "./charts";
import { Card, DecisionChip, Link, StatusChip } from "./components";
import { claimType, date, errorMessage, money } from "./format";
import { usePolling } from "./hooks";
import { RunCard } from "./RunCard";

const COLUMNS = [
  "Claim",
  "Customer",
  "Type",
  "Submitted",
  "Claimed",
  "Status",
  "Decision",
  "Payout",
];

function ClaimsTable({ claims }: Readonly<{ claims: ClaimSummary[] }>) {
  return (
    <Card title="Claims" className="table-card">
      <div className="table-scroll">
        <div className="claims-table" role="table" aria-label="Claims">
          <div className="claims-head" role="row">
            {COLUMNS.map((column) => (
              <span key={column} role="columnheader">
                {column}
              </span>
            ))}
          </div>
          {claims.map((claim) => (
            <div key={claim.claim_id} className="claim-row" role="row">
              <span role="cell" className="num">
                <Link to={`/claims/${claim.claim_id}`} className="row-link">
                  {claim.claim_id}
                </Link>
              </span>
              <span role="cell">{claim.customer_name}</span>
              <span role="cell">{claimType(claim.claim_type)}</span>
              <span role="cell" className="num">
                {date(claim.submitted_on)}
              </span>
              <span role="cell" className="num amount">
                {money(claim.amount_claimed)}
              </span>
              <span role="cell">
                <StatusChip status={claim.status} />
              </span>
              <span role="cell">
                <DecisionChip decision={claim.decision} />
              </span>
              <span role="cell" className="num amount">
                {claim.payout === null ? (
                  <span className="no-decision">–</span>
                ) : (
                  money(claim.payout)
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
      {claims.length === 0 && <p className="empty">No claims in the queue.</p>}
    </Card>
  );
}

function SignOffPanel({ claims }: Readonly<{ claims: ClaimSummary[] }>) {
  const waiting = claims.filter((claim) => claim.status === "awaiting_signoff");
  return (
    <section className="dark-panel" aria-labelledby="signoff-title">
      <h2 id="signoff-title" className="card-title">
        Next for sign-off
      </h2>
      {waiting.length === 0 ? (
        <p className="empty">Nothing is waiting for sign-off.</p>
      ) : (
        <ul className="signoff-list">
          {waiting.map((claim) => (
            <li key={claim.claim_id}>
              <Link to={`/claims/${claim.claim_id}`} className="signoff-link">
                <span className="num">{claim.claim_id}</span>
                <span className="signoff-name">{claim.customer_name}</span>
                <span className="num">{money(claim.payout ?? 0)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BigNumber({
  value,
  label,
}: Readonly<{ value: string; label: string }>) {
  return (
    <div className="big-number">
      <span className="num">{value}</span>
      <span className="label">{label}</span>
    </div>
  );
}

export function QueuePage() {
  const { data: claims, error, refresh } = usePolling(api.listClaims);
  const run = usePolling(api.getCurrentRun);
  const [cap, setCap] = useState(5);
  const [message, setMessage] = useState<string>();

  if (!claims) return <p className="card">{error ?? "Loading the queue."}</p>;

  const count = (status: ClaimSummary["status"]) =>
    claims.filter((claim) => claim.status === status).length;
  const working = run.data?.status === "running";
  const waiting = count("waiting");
  const paid = claims.reduce((sum, claim) => sum + (claim.paid_amount ?? 0), 0);

  const workQueue = () =>
    api
      .workQueue(Math.min(cap, waiting))
      .then(
        (started) => {
          setMessage(
            `The agent is working up to ${String(started.cap)} claims.`,
          );
        },
        (reason: unknown) => {
          setMessage(errorMessage(reason));
        },
      )
      .then(() => Promise.all([refresh(), run.refresh()]));

  return (
    <main className="stack">
      <div className="title-row">
        <div className="title">
          <h1>Claims queue</h1>
          <span className="count num">{claims.length} claims</span>
        </div>
        <div className="title-actions">
          {message && <span className="message">{message}</span>}
          <label className="cap-field">
            <span>Claims to work</span>
            <input
              type="number"
              min={1}
              max={waiting}
              value={cap}
              disabled={working}
              onChange={(event) => {
                setCap(Number(event.target.value));
              }}
            />
          </label>
          <button
            type="button"
            className="main-action"
            disabled={working || waiting === 0 || cap < 1}
            onClick={() => void workQueue()}
          >
            {working ? "Working the queue" : "Work the queue"}
          </button>
        </div>
      </div>
      <div className="summary-row">
        <section className="card" aria-label="Claims by status">
          <StatusBar
            claims={claims}
            live={!working && count("in_progress") > 0}
          />
        </section>
        <section className="card big-numbers" aria-label="Totals">
          <BigNumber value={String(count("waiting"))} label="Waiting" />
          <BigNumber
            value={String(count("awaiting_signoff"))}
            label="For sign-off"
          />
          <BigNumber value={money(paid)} label="Paid" />
        </section>
      </div>
      <RunCard run={run.data} error={run.error} />
      <div className="main-grid">
        <ClaimsTable claims={claims} />
        <div className="side-column">
          <RingChart claims={claims} />
          <DecisionsBar claims={claims} />
          <SignOffPanel claims={claims} />
        </div>
      </div>
    </main>
  );
}
