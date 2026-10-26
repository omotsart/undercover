"""Working the queue: the agent decides each waiting claim in turn."""

import threading
import uuid

from agent.claim import work_claim
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
            work_claim(claim_id, f"{claim_id}-{uuid.uuid4().hex[:8]}")
    finally:
        lock.release()


def recover() -> None:
    """Put right what a restart left behind: claims stuck in progress."""
    claims.release_stuck_claims("The server restarted while the agent worked it.")
