"""The claims queue and the rules for deciding, paying and signing off claims."""

import json
import sqlite3
from datetime import UTC, datetime
from typing import Any

from backend.db import connect, payout_approval_limit

MAX_FAILURES = 2

CLAIM_FIELDS = [
    "status",
    "failures",
    "decision",
    "payout",
    "reason",
    "policy_section",
    "decided_at",
    "signed_off_by",
    "signed_off_at",
    "paid_amount",
    "paid_at",
]


class NotFoundError(Exception):
    """A record that doesn't exist."""


class RefusedError(Exception):
    """A change the rules don't allow."""


def find(conn: sqlite3.Connection, table: str, key: str, value: str) -> sqlite3.Row:
    """Return one row, or raise NotFoundError."""
    row = conn.execute(
        f"SELECT * FROM {table} WHERE {key} = ?",  # noqa: S608
        (value,),
    ).fetchone()
    if row is None:
        raise NotFoundError(f"{value} not found")
    return row


def list_claims() -> list[dict[str, Any]]:
    """Return one summary row per claim, in claim order."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT claims.*, json_extract(customers.data, '$.name') AS customer_name "
            "FROM claims JOIN customers USING (customer_id) ORDER BY claim_id"
        ).fetchall()
    return [summary(row) for row in rows]


def summary(row: sqlite3.Row) -> dict[str, Any]:
    """Return the queue table's row for a claim."""
    data = json.loads(row["data"])
    return {
        "claim_id": row["claim_id"],
        "customer_name": row["customer_name"],
        "claim_type": data["claim_type"],
        "submitted_on": data["submitted_on"],
        "amount_claimed": data["amount_claimed"],
        "status": row["status"],
        "decision": row["decision"],
        "payout": row["payout"],
        "paid_amount": row["paid_amount"],
    }


def get_claim(claim_id: str) -> dict[str, Any]:
    """Return a claim in full, with where it stands."""
    with connect() as conn:
        row = find(conn, "claims", "claim_id", claim_id)
    return json.loads(row["data"]) | {field: row[field] for field in CLAIM_FIELDS}


def get_record(table: str, key: str, value: str) -> dict[str, Any]:
    """Return a policy, customer or handler record."""
    with connect() as conn:
        return json.loads(find(conn, table, key, value)["data"])


def get_claim_history(customer_id: str) -> dict[str, Any]:
    """Return a customer's name and earlier claims, without contact details."""
    customer = get_record("customers", "customer_id", customer_id)
    return {
        "customer_id": customer_id,
        "name": customer["name"],
        "previous_claims": customer["previous_claims"],
    }


def list_handlers() -> list[dict[str, Any]]:
    """Return the claims handlers."""
    with connect() as conn:
        rows = conn.execute("SELECT data FROM handlers ORDER BY handler_id")
        return [json.loads(row["data"]) for row in rows]


def now() -> str:
    """Return the time now in UTC, to the second."""
    return datetime.now(UTC).isoformat(timespec="seconds")


def start_claim(claim_id: str) -> dict[str, Any]:
    """Move a waiting claim to in progress, keeping the steps of earlier attempts."""
    with connect() as conn:
        claim = find(conn, "claims", "claim_id", claim_id)
        if claim["status"] != "waiting":
            raise RefusedError(f"{claim_id} is not waiting")
        conn.execute(
            "UPDATE claims SET status = 'in_progress' WHERE claim_id = ?", (claim_id,)
        )
    if claim["failures"]:
        add_step(claim_id, f"Attempt {claim['failures'] + 1}")
    return get_claim(claim_id)


def release_claim(claim_id: str, reason: str) -> dict[str, Any]:
    """Put a claim that failed back in the queue, or leave it for a handler."""
    with connect() as conn:
        claim = find(conn, "claims", "claim_id", claim_id)
        if claim["status"] != "in_progress":
            raise RefusedError(f"{claim_id} is not in progress")
        failures = claim["failures"] + 1
        status = "waiting" if failures < MAX_FAILURES else "for_handler"
        conn.execute(
            "UPDATE claims SET status = ?, failures = ? WHERE claim_id = ?",
            (status, failures, claim_id),
        )
    where = "Back in the queue" if status == "waiting" else "Left for a handler"
    add_step(claim_id, f"{where}: {reason}")
    return get_claim(claim_id)


def release_stuck_claims(reason: str) -> None:
    """Release every claim left in progress, such as after a restart."""
    for claim in list_claims():
        if claim["status"] == "in_progress":
            release_claim(claim["claim_id"], reason)


def add_step(claim_id: str, text: str) -> dict[str, str]:
    """Record a step the agent took on a claim."""
    step = {"text": text, "created_at": now()}
    with connect() as conn:
        find(conn, "claims", "claim_id", claim_id)
        conn.execute(
            "INSERT INTO steps (claim_id, text, created_at) VALUES (?, ?, ?)",
            (claim_id, step["text"], step["created_at"]),
        )
    return step


def list_steps(claim_id: str) -> list[dict[str, str]]:
    """Return the agent's steps on a claim, in order."""
    with connect() as conn:
        find(conn, "claims", "claim_id", claim_id)
        rows = conn.execute(
            "SELECT text, created_at FROM steps WHERE claim_id = ? ORDER BY id",
            (claim_id,),
        )
        return [dict(row) for row in rows]


def record_decision(
    claim_id: str, decision: str, payout: float, reason: str, policy_section: str
) -> dict[str, Any]:
    """Record the agent's decision on a claim in progress."""
    payout = round(payout, 2)
    if decision == "approve" and payout <= 0:
        raise RefusedError("An approved claim needs a payout.")
    if decision != "approve" and payout != 0:
        raise RefusedError("A declined or referred claim has no payout.")
    over_limit = decision == "approve" and payout > payout_approval_limit()
    with connect() as conn:
        if find(conn, "claims", "claim_id", claim_id)["status"] != "in_progress":
            raise RefusedError(f"{claim_id} is not in progress")
        conn.execute(
            "UPDATE claims SET status = ?, decision = ?, payout = ?, reason = ?, "
            "policy_section = ?, decided_at = ? WHERE claim_id = ?",
            (
                "awaiting_signoff" if over_limit else "decided",
                decision,
                payout,
                reason,
                policy_section,
                now(),
                claim_id,
            ),
        )
    return get_claim(claim_id)


def check_payment(claim: sqlite3.Row, amount: float) -> None:
    """Raise RefusedError unless the rules allow paying this amount."""
    if claim["decision"] != "approve":
        raise RefusedError("Only an approved claim can be paid.")
    if claim["paid_amount"] is not None:
        raise RefusedError(f"{claim['claim_id']} is already paid.")
    if round(amount, 2) != claim["payout"]:
        raise RefusedError(f"The approved payout is ${claim['payout']:,.2f}.")
    limit = payout_approval_limit()
    if claim["payout"] > limit and claim["signed_off_by"] is None:
        raise RefusedError(
            f"A payout over ${limit:,.2f} waits for a handler's sign-off."
        )


def pay_claim(claim_id: str, amount: float) -> dict[str, Any]:
    """Pay an approved claim, unless it still needs a handler's sign-off."""
    with connect() as conn:
        check_payment(find(conn, "claims", "claim_id", claim_id), amount)
        conn.execute(
            "UPDATE claims SET paid_amount = ?, paid_at = ? WHERE claim_id = ?",
            (round(amount, 2), now(), claim_id),
        )
    return get_claim(claim_id)


def sign_off_claim(claim_id: str, handler_id: str) -> dict[str, Any]:
    """Sign off a payout over the limit, which releases the payment."""
    with connect() as conn:
        claim = find(conn, "claims", "claim_id", claim_id)
        handler = json.loads(find(conn, "handlers", "handler_id", handler_id)["data"])
        if claim["status"] != "awaiting_signoff":
            raise RefusedError(f"{claim_id} is not waiting for sign-off")
        if not handler["can_approve_over_limit"]:
            raise RefusedError(f"{handler['name']} can't sign off this payout")
        conn.execute(
            "UPDATE claims SET status = 'decided', signed_off_by = ?, "
            "signed_off_at = ?, paid_amount = payout, paid_at = ? WHERE claim_id = ?",
            (handler["name"], signed_off_at := now(), signed_off_at, claim_id),
        )
    return get_claim(claim_id)
