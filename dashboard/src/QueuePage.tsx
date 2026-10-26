import { useRef, useState } from "react";
import { api, type ClaimSummary } from "./api";
import { DecisionsBar, RingChart, StatusBar } from "./charts";
import { ClaimsTable } from "./ClaimsTable";
import { Link } from "./components";
import { errorMessage, money, plural } from "./format";
import { usePolling } from "./hooks";
import { RunCard } from "./RunCard";

function SignOffPanel({ claims }: Readonly<{ claims: ClaimSummary[] }>) {
  const waiting = claims.filter((claim) => claim.status === "awaiting_signoff");
  if (waiting.length === 0)
    return (
      <section
        className="dark-panel signoff-empty"
        aria-label="Next for sign-off"
      >
        <p className="empty">Nothing is waiting for sign-off.</p>
      </section>
    );
  return (
    <section className="dark-panel" aria-labelledby="signoff-title">
      <h2 id="signoff-title" className="card-title">
        Next for sign-off
      </h2>
      <ul className="signoff-list">
        {waiting.map((claim) => (
          <li key={claim.claim_id}>
            <Link
              to={`/claims/${claim.claim_id}`}
              className="signoff-link clickable-row"
            >
              <span className="num">{claim.claim_id}</span>
              <span className="signoff-name">{claim.customer_name}</span>
              <span className="num">{money(claim.payout ?? 0)}</span>
              <span className="row-arrow" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function QueuePage() {
  const { data: claims, error, refresh } = usePolling(api.listClaims);
  const run = usePolling(api.getCurrentRun);
  const [cap, setCap] = useState(5);
  // A message about a started run only lasts while that run works.
  const [message, setMessage] = useState<{
    text: string;
    whileWorking: boolean;
  }>();
  const [expanded, setExpanded] = useState(false);
  const column = useRef<HTMLDivElement>(null);

  if (!claims) return <p className="card">{error ?? "Loading the queue."}</p>;

  const count = (status: ClaimSummary["status"]) =>
    claims.filter((claim) => claim.status === status).length;
  const working = run.data?.status === "running";
  const waiting = count("waiting");

  const workQueue = () =>
    api
      .workQueue(Math.min(cap, waiting))
      .then(
        (started) => {
          setMessage({
            text: `The agent is working up to ${plural(started.cap, "claim")}.`,
            whileWorking: true,
          });
        },
        (reason: unknown) => {
          setMessage({ text: errorMessage(reason), whileWorking: false });
        },
      )
      .then(() => Promise.all([refresh(), run.refresh()]));

  return (
    <main className="stack">
      <div className="title-row">
        <div className="title">
          <h1>Claims queue</h1>
          <span className="count num">{plural(claims.length, "claim")}</span>
        </div>
        <div className="title-actions">
          {message && (working || !message.whileWorking) && (
            <span className="message">{message.text}</span>
          )}
          <label className="cap-field">
            <span>Claims to work</span>
            <input
              type="number"
              min={1}
              max={Math.max(waiting, 1)}
              value={cap}
              disabled={working || waiting === 0}
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
        <SignOffPanel claims={claims} />
      </div>
      <RunCard run={run.data} error={run.error} claims={claims} />
      <div className="main-grid">
        <ClaimsTable
          claims={claims}
          column={column}
          expanded={expanded}
          onExpand={setExpanded}
        />
        <div
          ref={column}
          className={`side-column${expanded ? " is-sticky" : ""}`}
        >
          <RingChart claims={claims} />
          <DecisionsBar claims={claims} />
        </div>
      </div>
    </main>
  );
}
