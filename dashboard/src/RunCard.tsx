import { useCallback } from "react";
import { api, type ClaimSummary, type Run } from "./api";
import {
  Card,
  Link,
  QueuedChip,
  RunChip,
  StatusChip,
  TodoChip,
} from "./components";
import { claimType, money } from "./format";
import { usePolling } from "./hooks";

interface Outcome {
  kind: string;
  icon: string;
  label: string;
  chip: string;
}

// What happened to a claim in the run, from where the claim stands now.
function outcome(claim: ClaimSummary): Outcome {
  const payout = money(claim.payout ?? 0);
  if (claim.status === "awaiting_signoff")
    return {
      kind: "signoff",
      icon: "$",
      label: `Waiting for sign-off · ${payout}`,
      chip: "status-awaiting_signoff",
    };
  if (claim.status === "for_handler")
    return {
      kind: "handler",
      icon: "!",
      label: "Left for a handler",
      chip: "status-for_handler",
    };
  if (claim.status === "waiting")
    return {
      kind: "back",
      icon: "↺",
      label: "Back in the queue",
      chip: "status-waiting",
    };
  if (claim.decision === "decline")
    return {
      kind: "declined",
      icon: "✕",
      label: "Declined",
      chip: "decision-decline",
    };
  if (claim.decision === "refer")
    return {
      kind: "referred",
      icon: "→",
      label: "Referred",
      chip: "decision-refer",
    };
  return {
    kind: "paid",
    icon: "✓",
    label:
      claim.paid_amount === null
        ? `Approved · ${payout}`
        : `Paid · ${money(claim.paid_amount)}`,
    chip: "decision-approve",
  };
}

function ClaimCells({ claim }: Readonly<{ claim: ClaimSummary }>) {
  return (
    <>
      <span className="run-id num">{claim.claim_id}</span>
      <span className="run-type">{claimType(claim.claim_type)}</span>
      <span className="run-amount num">{money(claim.amount_claimed)}</span>
    </>
  );
}

function LastStep({ claimId }: Readonly<{ claimId: string }>) {
  const load = useCallback(() => api.listSteps(claimId), [claimId]);
  const { data: steps } = usePolling(load);
  const last = steps?.at(-1);
  return last ? <span className="run-step">{last.text}</span> : null;
}

function WorkingRow({
  claim,
  showStep,
}: Readonly<{ claim: ClaimSummary; showStep: boolean }>) {
  return (
    <div className="run-row is-working">
      <span className="run-icon icon-working" aria-hidden="true" />
      <ClaimCells claim={claim} />
      <span className="run-outcome">
        <StatusChip status="in_progress" live />
        {showStep && <LastStep claimId={claim.claim_id} />}
      </span>
    </div>
  );
}

function DoneRow({ claim }: Readonly<{ claim: ClaimSummary }>) {
  const { kind, icon, label, chip } = outcome(claim);
  return (
    <Link to={`/claims/${claim.claim_id}`} className="run-row clickable-row">
      <span className={`run-icon icon-${kind}`} aria-hidden="true">
        {icon}
      </span>
      <ClaimCells claim={claim} />
      <span className="run-outcome">
        <span className={`chip ${chip}`}>{label}</span>
      </span>
      <span className="row-arrow" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

function QueuedRow({ plan }: Readonly<{ plan: string | undefined }>) {
  return (
    <div className="run-row is-queued">
      <span className="run-icon icon-queued" aria-hidden="true" />
      <span className="run-plan">{plan}</span>
      <span className="run-outcome">
        <QueuedChip />
      </span>
    </div>
  );
}

function Metric({
  label,
  count,
  sum,
}: Readonly<{ label: string; count: number; sum?: number }>) {
  return (
    <div className="run-metric">
      <dt className="label">{label}</dt>
      <dd>
        <span className="card-number num">{count}</span>
        {sum !== undefined && <span className="num">{money(sum)}</span>}
      </dd>
    </div>
  );
}

function Metrics({ claims }: Readonly<{ claims: ClaimSummary[] }>) {
  const paid = claims.filter((claim) => claim.paid_amount !== null);
  const signOff = claims.filter((claim) => claim.status === "awaiting_signoff");
  const total = (list: ClaimSummary[], key: "paid_amount" | "payout") =>
    list.reduce((sum, claim) => sum + (claim[key] ?? 0), 0);
  return (
    <dl className="run-metrics">
      <Metric
        label="Paid"
        count={paid.length}
        sum={total(paid, "paid_amount")}
      />
      <Metric
        label="Waiting for sign-off"
        count={signOff.length}
        sum={total(signOff, "payout")}
      />
      <Metric
        label="Declined"
        count={claims.filter((claim) => claim.decision === "decline").length}
      />
      <Metric
        label="Back in the queue"
        count={claims.filter((claim) => claim.status === "waiting").length}
      />
    </dl>
  );
}

function RunDetails({ run }: Readonly<{ run: Run }>) {
  return (
    <div className="run-details">
      {run.todos.length > 0 && (
        <details>
          <summary>The agent's plan</summary>
          <ol className="plan">
            {run.todos.map((todo, index) => (
              <li key={`${String(index)}-${todo.content}`}>
                <TodoChip status={todo.status} />
                <span>{todo.content}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {run.summary && (
        <details>
          <summary>Run summary</summary>
          <p className="run-summary">{run.summary}</p>
        </details>
      )}
    </div>
  );
}

function RunClaims({
  run,
  claims,
}: Readonly<{ run: Run; claims: ClaimSummary[] }>) {
  const running = run.status === "running";
  const working = claims.find((claim) => claim.status === "in_progress");
  const plans = run.todos
    .filter((todo) => todo.status === "to_do")
    .map((todo) => todo.content);
  const queued = running ? Math.max(run.cap - claims.length, 0) : 0;
  if (claims.length === 0 && queued === 0)
    return <p className="empty">No claims were worked in this run.</p>;
  return (
    <ol className="run-claims" aria-label="Claims in this run">
      {claims.map((claim) => (
        <li key={claim.claim_id}>
          {claim.status === "in_progress" ? (
            <WorkingRow claim={claim} showStep={claim === working} />
          ) : (
            <DoneRow claim={claim} />
          )}
        </li>
      ))}
      {Array.from({ length: queued }, (_, index) => (
        <li key={`queued-${String(index)}`}>
          <QueuedRow plan={plans[index]} />
        </li>
      ))}
    </ol>
  );
}

export function RunCard({
  run,
  error,
  claims,
}: Readonly<{
  run: Run | null | undefined;
  error?: string;
  claims: ClaimSummary[];
}>) {
  const inRun = run
    ? run.claims.flatMap(
        (claimId) => claims.find((claim) => claim.claim_id === claimId) ?? [],
      )
    : [];
  return (
    <Card title="The agent's run">
      {run === undefined && (
        <p className="empty">{error ?? "Loading the run."}</p>
      )}
      {run === null && <p className="empty">The agent hasn't run yet.</p>}
      {run && (
        <>
          <div className="run-head">
            <RunChip status={run.status} />
            <span className="num">Run {run.run_id}</span>
            <span className="count num">
              {run.claims.length} of {run.cap} claims
            </span>
          </div>
          {run.status !== "running" && <Metrics claims={inRun} />}
          <RunClaims run={run} claims={inRun} />
          <RunDetails run={run} />
        </>
      )}
    </Card>
  );
}
