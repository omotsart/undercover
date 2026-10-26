import type { MouseEvent, ReactNode, Ref } from "react";
import type { Decision, RunStatus, Status, TodoStatus } from "./api";
import {
  DECISION_LABELS,
  RUN_LABELS,
  STATUS_LABELS,
  TODO_LABELS,
} from "./format";
import { REFRESH, navigate } from "./hooks";

export function Link({
  to,
  className,
  children,
}: Readonly<{
  to: string;
  className?: string;
  children: ReactNode;
}>) {
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
      return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  );
}

export function Header({ path }: Readonly<{ path: string }>) {
  const onInstructions = path === "/instructions";
  return (
    <header className="header">
      <Link to="/" className="brand">
        UnderCover
      </Link>
      <nav className="nav" aria-label="Main">
        <Link to="/" className={onInstructions ? "pill" : "pill active"}>
          Queue
        </Link>
        <Link
          to="/instructions"
          className={onInstructions ? "pill active" : "pill"}
        >
          Instructions
        </Link>
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh"
          onClick={() => window.dispatchEvent(new Event(REFRESH))}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </nav>
    </header>
  );
}

// "live" moves the In progress hatching. Only one place on a screen should move.
function FilledChip({
  status,
  label,
  live = false,
}: Readonly<{ status: Status; label: string; live?: boolean }>) {
  return (
    <span className={`chip status-${status}${live ? " is-live" : ""}`}>
      {status === "in_progress" ? (
        <span className="chip-inner">{label}</span>
      ) : (
        label
      )}
    </span>
  );
}

export function StatusChip({
  status,
  live = false,
}: Readonly<{ status: Status; live?: boolean }>) {
  return (
    <FilledChip status={status} label={STATUS_LABELS[status]} live={live} />
  );
}

// To-do items and runs wear the claim status colors that mean the same thing.
const TODO_COLORS: Record<TodoStatus, Status> = {
  to_do: "waiting",
  in_progress: "in_progress",
  done: "decided",
  for_handler: "for_handler",
};

export function TodoChip({ status }: Readonly<{ status: TodoStatus }>) {
  return (
    <FilledChip status={TODO_COLORS[status]} label={TODO_LABELS[status]} />
  );
}

export function QueuedChip() {
  return <FilledChip status="waiting" label="Queued" />;
}

const RUN_COLORS: Record<RunStatus, Status> = {
  running: "in_progress",
  finished: "decided",
  stopped: "awaiting_signoff",
};

export function RunChip({ status }: Readonly<{ status: RunStatus }>) {
  return (
    <FilledChip
      status={RUN_COLORS[status]}
      label={RUN_LABELS[status]}
      live={status === "running"}
    />
  );
}

const DECISION_ICONS: Record<Decision, string> = {
  approve: "✓",
  refer: "→",
  decline: "✕",
};

export function DecisionChip({
  decision,
}: Readonly<{ decision: Decision | null }>) {
  if (!decision) return <span className="no-decision">–</span>;
  return (
    <span className={`chip decision-${decision}`}>
      <span className="decision-icon" aria-hidden="true">
        {DECISION_ICONS[decision]}
      </span>
      {DECISION_LABELS[decision]}
    </span>
  );
}

export function Card({
  title,
  aside,
  className,
  children,
  ref,
}: Readonly<{
  title: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLElement>;
}>) {
  return (
    <section ref={ref} className={className ? `card ${className}` : "card"}>
      {aside ? (
        <div className="card-head">
          <h2 className="card-title">{title}</h2>
          {aside}
        </div>
      ) : (
        <h2 className="card-title">{title}</h2>
      )}
      {children}
    </section>
  );
}

// The round button that opens a long list in full and folds it back.
export function ExpandButton({
  expanded,
  show,
  onToggle,
}: Readonly<{ expanded: boolean; show: string; onToggle: () => void }>) {
  const label = expanded ? "Collapse" : show;
  return (
    <button
      type="button"
      className={`icon-button expand${expanded ? " is-expanded" : ""}`}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M6 9l6 6 6-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
