import { useCallback, useState } from "react";
import { api, type Claim } from "./api";
import { Card, DecisionChip, Link, StatusChip } from "./components";
import {
  claimType,
  date,
  errorMessage,
  money,
  sentenceCase,
  time,
} from "./format";
import { usePolling } from "./hooks";

function Field({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ClaimDetails({ claim }: Readonly<{ claim: Claim }>) {
  return (
    <>
      <Card title="The claim">
        <div className="fields">
          <Field label="Type" value={claimType(claim.claim_type)} />
          <Field label="Incident" value={date(claim.incident_date)} />
          <Field label="Where" value={claim.incident_location} />
          <Field label="Submitted" value={date(claim.submitted_on)} />
        </div>
        <p className="story">{claim.story}</p>
      </Card>
      <Card title="Items claimed">
        <table className="items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th className="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            {claim.items.map((item) => (
              <tr key={item.description}>
                <td>{item.description}</td>
                <td>{sentenceCase(item.category)}</td>
                <td className="num amount">{money(item.amount)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total claimed</td>
              <td />
              <td className="num amount">{money(claim.amount_claimed)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
      <Card title="Documents">
        {claim.documents.length === 0 ? (
          <p className="empty">No documents attached.</p>
        ) : (
          <ul className="documents">
            {claim.documents.map((document) => (
              <li key={document.name}>
                <h3>{document.name}</h3>
                <p>{document.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Payment({ claim }: Readonly<{ claim: Claim }>) {
  if (claim.paid_amount !== null && claim.paid_at !== null)
    return (
      <p>
        Paid {money(claim.paid_amount)} on {date(claim.paid_at)}
        {claim.signed_off_by && `, signed off by ${claim.signed_off_by}`}.
      </p>
    );
  if (claim.status === "awaiting_signoff")
    return <p>The payment waits for a handler's sign-off.</p>;
  if (claim.decision === "approve") return <p>Not paid yet.</p>;
  return null;
}

function DecisionCard({ claim }: Readonly<{ claim: Claim }>) {
  return (
    <Card title="Decision">
      {claim.decision === null ? (
        <p className="empty">The agent hasn't decided this claim yet.</p>
      ) : (
        <div className="decision">
          <div className="decision-head">
            <DecisionChip decision={claim.decision} />
            <span className="card-number num">{money(claim.payout ?? 0)}</span>
          </div>
          <p>{claim.reason}</p>
          <Field label="Policy section" value={claim.policy_section ?? ""} />
          <Payment claim={claim} />
        </div>
      )}
    </Card>
  );
}

function SignOff({
  claim,
  onSignedOff,
}: Readonly<{ claim: Claim; onSignedOff: () => void }>) {
  const { data: handlers } = usePolling(api.listHandlers, 60000);
  const [handlerId, setHandlerId] = useState("");
  const [error, setError] = useState<string>();

  const signOff = () =>
    api
      .signOff(claim.claim_id, handlerId)
      .then(onSignedOff, (reason: unknown) => {
        setError(errorMessage(reason));
      });

  return (
    <section className="dark-panel" aria-labelledby="signoff-title">
      <h2 id="signoff-title" className="card-title">
        Sign off
      </h2>
      <p>
        The agent approved {money(claim.payout ?? 0)}, which is over the
        $1,000.00 limit. The payment waits for a handler's sign-off.
      </p>
      <label className="handler-select">
        <span>Handler</span>
        <select
          value={handlerId}
          onChange={(event) => {
            setHandlerId(event.target.value);
          }}
        >
          <option value="">Choose a handler</option>
          {handlers?.map((handler) => (
            <option key={handler.handler_id} value={handler.handler_id}>
              {handler.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="main-action"
        disabled={!handlerId}
        onClick={() => void signOff()}
      >
        Sign off and pay
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Steps({ claimId }: Readonly<{ claimId: string }>) {
  const load = useCallback(() => api.listSteps(claimId), [claimId]);
  const { data: steps } = usePolling(load);
  return (
    <Card title="Agent steps">
      {!steps?.length ? (
        <p className="empty">The agent hasn't worked this claim yet.</p>
      ) : (
        <ol className="steps">
          {steps.map((step, index) => (
            <li key={`${String(index)}-${step.created_at}`}>
              <span className="label num">{time(step.created_at)}</span>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function PolicyCard({ policyId }: Readonly<{ policyId: string }>) {
  const load = useCallback(() => api.getPolicy(policyId), [policyId]);
  const { data: policy } = usePolling(load, 60000);
  return (
    <Card title="Policy">
      {policy && (
        <div className="fields">
          <Field label="Policy" value={policy.policy_id} />
          <Field label="Plan" value={sentenceCase(policy.plan)} />
          <Field
            label="Add-ons"
            value={policy.add_ons.map(sentenceCase).join(", ") || "None"}
          />
          <Field label="Bought" value={date(policy.purchased_on)} />
          <Field label="Trip" value={policy.trip.destination} />
          <Field
            label="Dates"
            value={`${date(policy.trip.departs_on)} to ${date(policy.trip.returns_on)}`}
          />
          <Field label="Trip cost" value={money(policy.trip.trip_cost)} />
          <Field label="Travelers" value={policy.travelers.join(", ")} />
        </div>
      )}
    </Card>
  );
}

export function ClaimPage({ claimId }: Readonly<{ claimId: string }>) {
  const load = useCallback(() => api.getClaim(claimId), [claimId]);
  const { data: claim, error, refresh } = usePolling(load);

  if (!claim)
    return (
      <main className="stack">
        <Link to="/">Back to the queue</Link>
        <p className="card">{error ?? "Loading the claim."}</p>
      </main>
    );

  return (
    <main className="stack">
      <div className="title-row">
        <div className="title">
          <h1 className="num">{claim.claim_id}</h1>
          <StatusChip status={claim.status} />
          <span className="count">{claim.summary}</span>
        </div>
      </div>
      <div className="main-grid">
        <div className="wide-column">
          <ClaimDetails claim={claim} />
        </div>
        <div className="side-column">
          <DecisionCard claim={claim} />
          {claim.status === "awaiting_signoff" && (
            <SignOff claim={claim} onSignedOff={() => void refresh()} />
          )}
          <Steps claimId={claimId} />
          <PolicyCard policyId={claim.policy_id} />
        </div>
      </div>
    </main>
  );
}
