"""Run the agent on one claim against the running backend: uv run -m agent CLM-1001"""

import sys
import uuid

from agent.claim import work_claim


def main(claim_id: str) -> None:
    print(work_claim(claim_id, f"{claim_id}-{uuid.uuid4().hex[:8]}"))


if __name__ == "__main__":
    main(sys.argv[1])
