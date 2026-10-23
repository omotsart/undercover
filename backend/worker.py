"""Working the queue: the agent decides each waiting claim in turn."""

import threading
import uuid

from agent.main import run
from backend import claims

lock = threading.Lock()


def work_queue() -> int:
    """Start the agent on the waiting claims in a background thread."""
    if not lock.acquire(blocking=False):
        raise claims.RefusedError("The queue is already being worked.")
    claim_ids = [
        c["claim_id"] for c in claims.list_claims() if c["status"] == "waiting"
    ]
    threading.Thread(target=work, args=(claim_ids,), daemon=True).start()
    return len(claim_ids)


def work(claim_ids: list[str]) -> None:
    """Work each claim in order, then free the queue for the next run."""
    try:
        for claim_id in claim_ids:
            work_claim(claim_id)
    finally:
        lock.release()


def work_claim(claim_id: str) -> None:
    """Run the agent on a claim, and put it back in the queue if it isn't decided."""
    try:
        run(claim_id, f"{claim_id}-{uuid.uuid4().hex[:8]}")
    except Exception as error:  # one failed claim mustn't stop the queue
        claims.add_step(claim_id, f"The agent stopped: {error}")
    if claims.get_claim(claim_id)["status"] == "in_progress":
        claims.add_step(claim_id, "Back in the queue: the agent made no decision.")
        claims.return_to_queue(claim_id)
