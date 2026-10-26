"""Working the queue: a run of the agent in a background thread."""

import threading
from typing import Any

from agent.claim import work_claim
from backend import claims, runs

lock = threading.Lock()


def work_queue(cap: int) -> dict[str, Any]:
    """Start a run of the agent over the queue, capped at a number of claims."""
    if not lock.acquire(blocking=False):
        raise claims.RefusedError("The queue is already being worked.")
    try:
        run = runs.create_run(cap)
    except claims.RefusedError:
        lock.release()
        raise
    threading.Thread(target=work, args=(run["run_id"], cap), daemon=True).start()
    return run


def run_queue(run_id: int, cap: int) -> None:
    """Work the waiting claims in order up to the cap (until the queue agent)."""
    waiting = [c["claim_id"] for c in claims.list_claims() if c["status"] == "waiting"]
    for claim_id in waiting[:cap]:
        runs.add_run_claim(run_id, claim_id)
        work_claim(claim_id, f"{claim_id}-run-{run_id}")
    runs.finish_run(run_id, f"Worked {min(cap, len(waiting))} claims.")


def work(run_id: int, cap: int) -> None:
    """Run the agent, then make sure the run has ended and no claim is stuck."""
    try:
        run_queue(run_id, cap)
    except Exception as error:  # a run that fails must still end cleanly
        runs.end_run(run_id, "stopped", f"The run stopped: {error}")
    finally:
        if runs.get_run(run_id)["status"] == "running":
            runs.end_run(
                run_id, "stopped", "The agent ended without finishing the run."
            )
        claims.release_stuck_claims("The run stopped while the agent worked it.")
        lock.release()


def recover() -> None:
    """Put right what a restart left behind: a run and claims left unfinished."""
    runs.stop_running_runs("The server restarted during the run.")
    claims.release_stuck_claims("The server restarted while the agent worked it.")
