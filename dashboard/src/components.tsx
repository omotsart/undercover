import type { MouseEvent, ReactNode } from "react";
import type { Decision, Status } from "./api";
import { DECISION_LABELS, STATUS_LABELS } from "./format";
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

export function StatusChip({ status }: Readonly<{ status: Status }>) {
  return (
    <span className={`chip status-${status}`}>
      {status === "in_progress" ? (
        <span className="chip-inner">{STATUS_LABELS[status]}</span>
      ) : (
        STATUS_LABELS[status]
      )}
    </span>
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
  className,
  children,
}: Readonly<{
  title: string;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <section className={className ? `card ${className}` : "card"}>
      <h2 className="card-title">{title}</h2>
      {children}
    </section>
  );
}
