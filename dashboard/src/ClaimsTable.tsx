import { type RefObject, useRef, useState } from "react";
import type { ClaimSummary, Status } from "./api";
import { Card, DecisionChip, Link, StatusChip } from "./components";
import { claimType, date, money } from "./format";
import { readParam, writeParams } from "./hooks";
import { ROW_HEIGHT, pageItems, usePageSize } from "./paging";

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

type Filter = "all" | Status;

const FILTERS: { filter: Filter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "awaiting_signoff", label: "Waiting for sign-off" },
  { filter: "waiting", label: "Waiting" },
  { filter: "decided", label: "Decided" },
];

function filterFromUrl(): Filter {
  const status = readParam("status");
  return FILTERS.find((tab) => tab.filter === status)?.filter ?? "all";
}

function pageFromUrl(): number {
  return Math.max(1, Math.floor(Number(readParam("page"))) || 1);
}

function matches(claim: ClaimSummary, filter: Filter): boolean {
  return filter === "all" || claim.status === filter;
}

function Filters({
  claims,
  filter,
  onChoose,
}: Readonly<{
  claims: ClaimSummary[];
  filter: Filter;
  onChoose: (filter: Filter) => void;
}>) {
  return (
    <div className="table-filters" role="group" aria-label="Filter claims">
      {FILTERS.map((tab) => {
        const count = claims.filter((claim) =>
          matches(claim, tab.filter),
        ).length;
        const active = tab.filter === filter;
        return (
          <button
            key={tab.filter}
            type="button"
            className={["pill", active && "active", count === 0 && "is-empty"]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={active}
            onClick={() => {
              onChoose(tab.filter);
            }}
          >
            <span>{tab.label}</span>{" "}
            <span className="tab-count num">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function Row({ claim }: Readonly<{ claim: ClaimSummary }>) {
  return (
    <div className="claim-row clickable-row" role="row">
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
      <span className="row-arrow" aria-hidden="true">
        ›
      </span>
    </div>
  );
}

function Pager({
  current,
  count,
  hidden,
  onGo,
}: Readonly<{
  current: number;
  count: number;
  hidden: boolean;
  onGo: (page: number) => void;
}>) {
  return (
    <nav className={`pager${hidden ? " is-hidden" : ""}`} aria-label="Pages">
      <button
        type="button"
        className="icon-button"
        aria-label="Previous page"
        disabled={current === 1}
        onClick={() => {
          onGo(current - 1);
        }}
      >
        ‹
      </button>
      {pageItems(current, count).map((item, index) =>
        item === "…" ? (
          <span key={`gap-${String(index)}`} className="pager-gap">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`pill page-pill num${item === current ? " active" : ""}`}
            aria-label={`Page ${String(item)}`}
            aria-current={item === current ? "page" : undefined}
            onClick={() => {
              onGo(item);
            }}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className="icon-button"
        aria-label="Next page"
        disabled={current === count}
        onClick={() => {
          onGo(current + 1);
        }}
      >
        ›
      </button>
    </nav>
  );
}

export function ClaimsTable({
  claims,
  main,
  column,
  expanded,
  onExpand,
}: Readonly<{
  claims: ClaimSummary[];
  main: RefObject<HTMLElement | null>;
  column: RefObject<HTMLElement | null>;
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
}>) {
  const [filter, setFilter] = useState(filterFromUrl);
  const [page, setPage] = useState(pageFromUrl);
  const card = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  const pageSize = usePageSize(main, column, card, body, footer);

  const shown = claims.filter((claim) => matches(claim, filter));
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pageCount);
  const rows = expanded
    ? shown
    : shown.slice((current - 1) * pageSize, current * pageSize);

  const choose = (next: Filter) => {
    setFilter(next);
    setPage(1);
    writeParams({ status: next === "all" ? null : next, page: null });
  };
  const go = (next: number) => {
    setPage(next);
    writeParams({ page: next === 1 ? null : String(next) });
  };
  const toggle = () => {
    onExpand(!expanded);
    if (expanded) card.current?.scrollIntoView({ block: "start" });
  };

  return (
    <Card title="Claims" className="table-card" ref={card}>
      <Filters claims={claims} filter={filter} onChoose={choose} />
      <div className="table-scroll">
        <div className="claims-table" role="table" aria-label="Claims">
          <div className="claims-head" role="row">
            {COLUMNS.map((name) => (
              <span key={name} role="columnheader">
                {name}
              </span>
            ))}
          </div>
          <div
            ref={body}
            className="claims-body"
            role="rowgroup"
            style={{ minHeight: pageSize * ROW_HEIGHT }}
          >
            {rows.map((claim) => (
              <Row key={claim.claim_id} claim={claim} />
            ))}
            {shown.length === 0 && (
              <p className="empty table-empty">
                {claims.length === 0
                  ? "No claims in the queue."
                  : "No claims with this status."}
              </p>
            )}
          </div>
        </div>
      </div>
      {pageCount > 1 && (
        <div ref={footer} className="table-footer">
          <button
            type="button"
            className={`icon-button expand${expanded ? " is-expanded" : ""}`}
            aria-label={expanded ? "Collapse" : "Show all"}
            title={expanded ? "Collapse" : "Show all"}
            aria-expanded={expanded}
            onClick={toggle}
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
          <Pager
            current={current}
            count={pageCount}
            hidden={expanded}
            onGo={go}
          />
        </div>
      )}
    </Card>
  );
}
