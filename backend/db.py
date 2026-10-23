"""The UnderCover database: SQLite, seeded from the business data in data/."""

import json
import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

DATA = Path(__file__).parent.parent / "data"
DEFAULT_PATH = Path(__file__).parent / "undercover.db"

TABLES = ["claims", "policies", "customers", "handlers", "steps"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS claims (
    claim_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    data TEXT NOT NULL,
    status TEXT NOT NULL,
    decision TEXT,
    payout REAL,
    reason TEXT,
    policy_section TEXT,
    decided_at TEXT,
    signed_off_by TEXT,
    signed_off_at TEXT,
    paid_amount REAL,
    paid_at TEXT
);
CREATE TABLE IF NOT EXISTS policies (policy_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customers (customer_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS handlers (handler_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def database_path() -> str:
    """Return the database file, from DATABASE_PATH or the default."""
    return os.environ.get("DATABASE_PATH", str(DEFAULT_PATH))


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Open the database, commit on success and always close it."""
    conn = sqlite3.connect(database_path(), timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def read_data(name: str) -> Any:
    """Read a JSON file from data/."""
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def seed(conn: sqlite3.Connection) -> None:
    """Load the claims queue and the records it needs from data/."""
    conn.executemany(
        "INSERT INTO claims (claim_id, customer_id, data, status) "
        "VALUES (?, ?, ?, 'waiting')",
        [
            (c["claim_id"], c["customer_id"], json.dumps(c))
            for c in read_data("claims.json")
        ],
    )
    for table, key, name in [
        ("policies", "policy_id", "policies.json"),
        ("customers", "customer_id", "customers.json"),
        ("handlers", "handler_id", "handlers.json"),
    ]:
        conn.executemany(
            f"INSERT INTO {table} ({key}, data) VALUES (?, ?)",  # noqa: S608
            [(row[key], json.dumps(row)) for row in read_data(name)],
        )


def init_db() -> None:
    """Create the tables, and seed them if the queue is empty."""
    with connect() as conn:
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM claims").fetchone()[0] == 0:
            seed(conn)


def reset_db() -> None:
    """Drop every table and seed the database again."""
    with connect() as conn:
        for table in TABLES:
            conn.execute(f"DROP TABLE IF EXISTS {table}")
    init_db()


def payout_approval_limit() -> float:
    """Return the payout above which a handler must sign off."""
    return read_data("company.json")["payout_approval_limit"]
