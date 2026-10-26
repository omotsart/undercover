# Status

The pilot is built (`docs/PLAN.md`). The harness (`docs/PLAN_HARNESS.md`) is being built: Phase 1 of 6 is done.

## What's built

- `backend/`: FastAPI and SQLite. The database is `backend/undercover.db` (or `DATABASE_PATH`), created and seeded from `data/` on first start; nothing reads `data/evals/`
  - Read operations for claims, policies, claim history (without personal details), the agent's instructions and the handlers
  - The policy wording and the claims manual, split into sections: `list_sections`, `read_section` and `search_documents`. The whole wording is no longer handed out
  - Operations to start a claim, record the agent's steps and decision, pay a claim and sign off a payout. `pay_claim` refuses a payout over $1,000 until a handler signs off, and signing off releases the payment
  - `POST /api/queue/work` runs the agent on every waiting claim, one at a time, in a background thread; a claim whose run fails or ends without a decision goes back to waiting
  - The agent's instructions are in `backend/instructions/`: `claim.md` for working a claim, written from the wording and the manual, and `queue.md` for running the queue (a first version)
- `agent/`: the UnderCover Agent on LangChain's `create_agent`, with `deepseek/deepseek-v4.1-flash` at low reasoning effort or the model in `MODEL_NAME`
  - `agent/claim.py`: `run(claim_id, thread_id)` fetches the claim instructions and the contents of both documents, starts the claim, and reads, looks up sections, decides and pays through seven tools that call the API, posting each step (including each section it read) to the backend as it goes
  - `agent/main.py`: the backend client, the instructions and the model, shared by the agents
- `dashboard/`: React, in the brand from `docs/BRAND.md`, updating every two seconds
  - Queue: the status bar, the Waiting, For sign-off and Paid numbers, the claims table, the ring chart, the decisions bar, the Next for sign-off panel and the "Work the queue" button
  - Claim: the claim in full with its items, documents and policy, the agent's decision and reason, its steps as it works, and sign-off by a handler for a payout over $1,000
  - Instructions: the agent's instructions for running the queue and for working a claim, read only
- `e2e/`: Playwright tests of the whole flow. They start their own backend on port 8001 and dashboard on port 5174 with a fresh database (`e2e/e2e.db`), and play the agent's part through the API, so they never call a model

## How to run it

- `npm run dev` starts the backend on port 8000 and the dashboard on http://localhost:5173
- `npm run seed` resets the database to the claims queue in `data/`
- `uv run -m agent CLM-1001` runs the agent on one claim against the running backend
- `npm run check` runs every check

## Known issues

- On Windows, uvicorn's `--reload` in `npm run dev` can hang after a code change and keep serving the old code. If the backend stops picking up changes, stop `npm run dev` and start it again.
