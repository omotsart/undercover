import type { ClaimSummary, Decision, Status } from "./api";
import { Card, DecisionChip, StatusChip } from "./components";
import { DECISIONS, STATUSES, STATUS_LABELS, countBy, percent } from "./format";

export function StatusBar({ claims }: Readonly<{ claims: ClaimSummary[] }>) {
  const counts = countBy(STATUSES, claims, (claim) => claim.status);
  return (
    <div className="status-bar">
      {STATUSES.map((status) => (
        <div key={status} className="status-bar-item">
          <span className="label">{STATUS_LABELS[status]}</span>
          <span className={`status-pill status-${status}`}>
            <span className={status === "in_progress" ? "chip-inner" : ""}>
              {counts[status]} · {percent(counts[status], claims.length)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

const RADIUS = 52;
const WIDTH = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function arcs(counts: Record<Status, number>, total: number) {
  let offset = 0;
  return STATUSES.filter((status) => counts[status] > 0).map((status) => {
    const length = (counts[status] / total) * CIRCUMFERENCE;
    const arc = { status, length, offset };
    offset += length;
    return arc;
  });
}

export function RingChart({ claims }: Readonly<{ claims: ClaimSummary[] }>) {
  const counts = countBy(STATUSES, claims, (claim) => claim.status);
  const segments = arcs(counts, claims.length);
  const whole = segments.length === 1;
  return (
    <Card title="By status">
      <svg
        className="ring"
        viewBox="0 0 140 140"
        role="img"
        aria-label={`${String(claims.length)} claims by status`}
      >
        <defs>
          <pattern
            id="hatch"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(30)"
          >
            <rect width="10" height="10" fill="#FFFFFF" />
            <rect width="4" height="10" fill="#6B7079" />
          </pattern>
        </defs>
        <circle className="ring-track" cx="70" cy="70" r={RADIUS} />
        {segments.map(({ status, length, offset }) => (
          <circle
            key={status}
            className={`ring-arc ring-${status}`}
            cx="70"
            cy="70"
            r={RADIUS}
            strokeWidth={WIDTH}
            strokeLinecap={whole ? "butt" : "round"}
            strokeDasharray={
              whole
                ? undefined
                : `${String(Math.max(length - WIDTH - 2, 0.01))} ${String(CIRCUMFERENCE)}`
            }
            strokeDashoffset={-(offset + WIDTH / 2 + 1)}
            transform="rotate(-90 70 70)"
          />
        ))}
        <text
          className="ring-total"
          x="70"
          y="70"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {claims.length}
        </text>
      </svg>
      <ul className="legend">
        {STATUSES.map((status) => (
          <li key={status}>
            <StatusChip status={status} />
            <span className="num">{counts[status]}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function DecisionsBar({ claims }: Readonly<{ claims: ClaimSummary[] }>) {
  const decided = claims.filter((claim) => claim.decision !== null);
  const counts = countBy(DECISIONS, decided, (claim) => claim.decision);
  return (
    <Card title="Decisions">
      {decided.length === 0 ? (
        <p className="empty">No decisions yet.</p>
      ) : (
        <>
          <div className="decision-bar" aria-hidden="true">
            {DECISIONS.filter((decision) => counts[decision] > 0).map(
              (decision: Decision) => (
                <span
                  key={decision}
                  className={`decision-segment segment-${decision}`}
                  style={{ flexGrow: counts[decision] }}
                />
              ),
            )}
          </div>
          <ul className="legend">
            {DECISIONS.map((decision) => (
              <li key={decision}>
                <DecisionChip decision={decision} />
                <span className="num">{counts[decision]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
