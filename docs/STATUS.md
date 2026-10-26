# Status

The pilot (`docs/PLAN.md`) and the harness (`docs/PLAN_HARNESS.md`) are built. The UnderCover Agent works the queue in runs: a queue agent plans each run as a to-do list and hands each claim to a fresh claim agent, which looks up the policy wording and the claims manual section by section.

## What's built

- `backend/`: FastAPI and SQLite. The database is `backend/undercover.db` (or `DATABASE_PATH`), created and seeded from `data/` on first start; nothing reads `data/evals/`
  - Read operations for claims, policies, claim history (without personal details), the agent's instructions and the handlers
  - The policy wording and the claims manual, split into sections: `list_sections`, `read_section` and `search_documents`. The whole wording is no longer handed out
  - Operations to start a claim, record the agent's steps and decision, pay a claim and sign off a payout. `pay_claim` refuses a payout over $1,000 until a handler signs off, and signing off releases the payment
  - `release_claim` puts a claim that failed back to waiting, or leaves it for a handler (status `for_handler`) on its second failure. A claim is released only while in progress, so a decided claim is never decided or paid again. On startup, any claim left in progress is released
  - `start_claim` keeps the steps of earlier attempts and marks a retry "Attempt 2"
  - Runs (`backend/runs.py`): `POST /api/queue/work` with `{"cap": 5}` starts a run in a background thread, one run at a time. `add_run_claim` refuses a claim past the cap (a retry of a claim already in the run doesn't count), `write_todos` stores the run's to-do list, and `finish_run` refuses while a claim is still waiting within the cap. `GET /api/runs/current` returns the latest run. A run that fails or ends without finishing is stopped, and its claims in progress are released; a restart does the same
  - The agent's instructions are in `backend/instructions/`: `claim.md` for working a claim, written from the wording and the manual, and `queue.md` for running the queue
- `agent/`: the UnderCover Agent on LangChain's `create_agent`, with `deepseek/deepseek-v4.1-flash` at low reasoning effort or the model in `MODEL_NAME`
  - `agent/claim.py`: `run(claim_id, thread_id)` fetches the claim instructions and the contents of both documents, starts the claim, and reads, looks up sections, decides and pays through seven tools that call the API, posting each step (including each section it read) to the backend as it goes
  - `work_claim(claim_id, thread_id)` runs a fresh claim agent with retries on the model and the tools and a limit of 30 model calls, releases the claim if it fails or ends without a decision, and returns one line, such as `CLM-1001: approve, $420.00, paid`
  - `agent/queue.py`: the queue agent. `run_queue(run_id, cap)` lists the waiting claims, writes a to-do list, hands each claim to a fresh claim agent through `work_claim`, ticks the list off and finishes the run with a summary, through four tools: `list_waiting_claims`, `write_todos`, `work_claim` and `finish_run`. The backend's worker runs it for each run
  - `agent/main.py`: the backend client, the instructions and the model, shared by the agents
- `dashboard/`: React, in the brand from `docs/BRAND.md`, updating every two seconds
  - Queue: the status bar with five statuses (including Left for a handler), the Waiting, For sign-off and Paid numbers, "The agent's run" card with the run's status, its to-do list as the agent ticks it off and its summary, the claims table, the ring chart, the decisions bar, the Next for sign-off panel, and the "Claims to work" field (starting at 5) with the "Work the queue" button
  - Claim: the claim in full with its items, documents and policy, the agent's decision and reason, its steps as it works (including the sections it read and every attempt), sign-off by a handler for a payout over $1,000, and a line for a claim left for a handler
  - Instructions: the agent's instructions for running the queue and for working a claim, read only
- `e2e/`: Playwright tests of the whole flow. They start their own backend on port 8001 and dashboard on port 5174 with a fresh database (`e2e/e2e.db`), and play the agent's part through the API, so they never call a model

## How to run it

- `npm run dev` starts the backend on port 8000 and the dashboard on http://localhost:5173
- `npm run seed` resets the database to the claims queue in `data/`. Run it once after pulling the harness, since the database has new tables and columns
- On the queue page, set "Claims to work" and press "Work the queue" to start a run. Or `uv run -m agent --cap 5` starts the same run against the running backend and prints the to-do list as the agent ticks it off, then the summary. Through the API: `curl -X POST http://localhost:8000/api/queue/work -H "Content-Type: application/json" -d '{"cap": 5}'`, then `curl http://localhost:8000/api/runs/current` to follow it. In PowerShell: `Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/queue/work -ContentType application/json -Body '{"cap": 5}'` and `Invoke-RestMethod http://localhost:8000/api/runs/current`
- `uv run -m agent CLM-1001` runs the agent on one named claim against the running backend, outside a run, and prints its one-line outcome
- For a live trial on the real model, reseed first and cap the run at five claims. A run of five on DeepSeek V4.1 Flash takes about five minutes
- `npm run check` runs every check

## Known issues

- On Windows, uvicorn's `--reload` in `npm run dev` can hang after a code change and keep serving the old code. If the backend stops picking up changes, stop `npm run dev` and start it again.
