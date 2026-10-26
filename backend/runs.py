"""Runs of the agent over the queue: the cap, the to-do list and the finish check."""

import json
import sqlite3
import threading
from typing import Any

from backend import claims
from backend.claims import NotFoundError, RefusedError, now
from backend.db import connect

cap_lock = threading.Lock()


def run_record(conn: sqlite3.Connection, run_id: int) -> dict[str, Any]:
    """Return a run with its to-do list and the claims it started."""
    row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    if row is None:
        raise NotFoundError(f"Run {run_id} not found")
    claim_ids = conn.execute(
        "SELECT claim_id FROM run_claims WHERE run_id = ? ORDER BY rowid", (run_id,)
    ).fetchall()
    return dict(row) | {
        "todos": json.loads(row["todos"]),
        "claims": [r["claim_id"] for r in claim_ids],
    }


def get_run(run_id: int) -> dict[str, Any]:
    """Return a run."""
    with connect() as conn:
        return run_record(conn, run_id)


def running_run(run_id: int) -> dict[str, Any]:
    """Return a run that is still running, or raise RefusedError."""
    run = get_run(run_id)
    if run["status"] != "running":
        raise RefusedError(f"Run {run_id} is {run['status']}")
    return run


def current_run() -> dict[str, Any] | None:
    """Return the latest run, or None before the first."""
    with connect() as conn:
        row = conn.execute("SELECT MAX(run_id) FROM runs").fetchone()
        return None if row[0] is None else run_record(conn, row[0])


def create_run(cap: int) -> dict[str, Any]:
    """Start a run capped at a number of claims, unless one is running."""
    with connect() as conn:
        if conn.execute("SELECT 1 FROM runs WHERE status = 'running'").fetchone():
            raise RefusedError("The queue is already being worked.")
        cursor = conn.execute(
            "INSERT INTO runs (cap, status, todos, started_at) "
            "VALUES (?, 'running', '[]', ?)",
            (cap, now()),
        )
        return run_record(conn, cursor.lastrowid or 0)


def add_run_claim(run_id: int, claim_id: str) -> dict[str, Any]:
    """Count a claim against the run's cap; a claim already in the run is a retry."""
    with cap_lock:
        run = running_run(run_id)
        claims.get_claim(claim_id)
        if claim_id in run["claims"]:
            return run
        if len(run["claims"]) >= run["cap"]:
            raise RefusedError(
                f"The run has reached its cap of {run['cap']} claims, "
                f"so {claim_id} stays waiting."
            )
        with connect() as conn:
            conn.execute(
                "INSERT INTO run_claims (run_id, claim_id) VALUES (?, ?)",
                (run_id, claim_id),
            )
            return run_record(conn, run_id)


def write_todos(run_id: int, todos: list[dict[str, str]]) -> dict[str, Any]:
    """Replace the run's to-do list."""
    running_run(run_id)
    with connect() as conn:
        conn.execute(
            "UPDATE runs SET todos = ? WHERE run_id = ?", (json.dumps(todos), run_id)
        )
        return run_record(conn, run_id)


def missed_claims(run: dict[str, Any]) -> list[str]:
    """Return the waiting claims the run should still work within its cap."""
    waiting = [c["claim_id"] for c in claims.list_claims() if c["status"] == "waiting"]
    if len(run["claims"]) < run["cap"]:
        return waiting
    return [claim_id for claim_id in waiting if claim_id in run["claims"]]


def finish_run(run_id: int, summary: str) -> dict[str, Any]:
    """Finish a run with its summary, unless it has missed a waiting claim."""
    run = running_run(run_id)
    missed = missed_claims(run)
    if missed:
        raise RefusedError(
            f"Still waiting within the cap of {run['cap']} claims: "
            f"{', '.join(missed)}. Work them before you finish."
        )
    return end_run(run_id, "finished", summary)


def end_run(run_id: int, status: str, summary: str) -> dict[str, Any]:
    """Mark a run finished or stopped, with the summary or the reason."""
    with connect() as conn:
        conn.execute(
            "UPDATE runs SET status = ?, summary = ?, finished_at = ? WHERE run_id = ?",
            (status, summary, now(), run_id),
        )
        return run_record(conn, run_id)


def stop_running_runs(reason: str) -> None:
    """Stop every run still marked as running, such as after a restart."""
    with connect() as conn:
        conn.execute(
            "UPDATE runs SET status = 'stopped', summary = ?, finished_at = ? "
            "WHERE status = 'running'",
            (reason, now()),
        )
