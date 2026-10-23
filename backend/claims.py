"""The claims queue and the rules for deciding, paying and signing off claims."""

import json
import sqlite3
from typing import Any

from backend.db import connect

CLAIM_FIELDS = [
    "status",
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
