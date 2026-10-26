import type { ClaimSummary, Decision, Status } from "./api";
import { Card, DecisionChip, StatusChip } from "./components";
import {
  DECISIONS,
  STATUSES,
  STATUS_LABELS,
  countBy,
  money,
  percent,
} from "./format";

export function StatusBar({
  claims,
  live,
}: Readonly<{ claims: ClaimSummary[]; live: boolean }>) {
  const counts = countBy(STATUSES, claims, (claim) => claim.status);
  return (
    <div className="status-bar">
      {STATUSES.map((status) => (
        <div key={status} className="status-bar-item">
          <span className="label">{STATUS_LABELS[status]}</span>
          <span
            className={`status-pill status-${status}${live && status === "in_progress" ? " is-live" : ""}`}
          >
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
const GAP = 2;
// Each arc loses its rounded caps and a gap, so a small share gets at least
// enough room to show as a short arc rather than a dot.
const MIN_DASH = 8;
const MIN_ARC = WIDTH + GAP + MIN_DASH;

function arcs(counts: Record<Status, number>, total: number) {
  const shown = STATUSES.filter((status) => counts[status] > 0);
  const small = shown.filter(
    (status) => (counts[status] / total) * CIRCUMFERENCE < MIN_ARC,
  );
  const rest = total - small.reduce((sum, status) => sum + counts[status], 0);
  const room = CIRCUMFERENCE - small.length * MIN_ARC;
  let offset = 0;
  return shown.map((status) => {
    const length = small.includes(status)
      ? MIN_ARC
      : (counts[status] / rest) * room;
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
            <rect className="hatch-light" width="10" height="10" />
            <rect className="hatch-stripe" width="4" height="10" />
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
                : `${String(length - WIDTH - GAP)} ${String(CIRCUMFERENCE)}`
            }
            strokeDashoffset={-(offset + WIDTH / 2 + GAP / 2)}
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
  const paid = claims.reduce((sum, claim) => sum + (claim.paid_amount ?? 0), 0);
  return (
    <Card title="Decisions">
      <div className="paid-total">
        <span className="card-number num">{money(paid)}</span>
        <span className="label">Paid</span>
      </div>
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
