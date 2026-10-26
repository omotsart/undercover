"""Run the agent against the running backend:

uv run -m agent CLM-1001    works one named claim
uv run -m agent --cap 5     starts a run over the queue, capped at five claims
"""

import argparse
import sys
import time
import uuid

from agent import main as api
from agent.claim import work_claim

POLL_SECONDS = 2.0
TODO_LABELS = {
    "to_do": "To do",
    "in_progress": "In progress",
    "done": "Done",
    "for_handler": "Left for a handler",
}


def work_queue(cap: int) -> int:
    """Start a run like the dashboard's button, print its to-do list as it changes,
    and return the exit code."""
    with api.backend() as client:
        response = client.post("/api/queue/work", json={"cap": cap})
        if response.is_error:
            print(response.json()["detail"])
            return 1
        print(f"Run {response.json()['run_id']} started, capped at {cap} claims.")
        seen: dict[str, str] = {}
        while True:
            run = client.get("/api/runs/current").raise_for_status().json()
            for todo in run["todos"]:
                if seen.get(todo["content"]) != todo["status"]:
                    seen[todo["content"]] = todo["status"]
                    print(f"{TODO_LABELS[todo['status']]}: {todo['content']}")
            if run["status"] != "running":
                print(f"\nRun {run['status']}. {run['summary']}")
                return 0
            time.sleep(POLL_SECONDS)


def main(args: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="uv run -m agent")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("claim_id", nargs="?", help="a claim to work, such as CLM-1001")
    target.add_argument("--cap", type=int, help="the most claims a run may work")
    parsed = parser.parse_args(args)
    if parsed.cap is not None:
        return work_queue(parsed.cap)
    print(work_claim(parsed.claim_id, f"{parsed.claim_id}-{uuid.uuid4().hex[:8]}"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
