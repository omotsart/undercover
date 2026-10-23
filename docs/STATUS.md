# Status

The pilot is built: all six phases of `docs/PLAN.md` are done.

## What's built

- `backend/`: FastAPI and SQLite. The database is `backend/undercover.db` (or `DATABASE_PATH`), created and seeded from `data/` on first start; nothing reads `data/evals/`
  - Read operations for claims, policies, claim history (without personal details), the policy wording, the agent's instructions and the handlers
  - Operations to start a claim, record the agent's steps and decision, pay a claim and sign off a payout. `pay_claim` refuses a payout over $1,000 until a handler signs off, and signing off releases the payment
  - `POST /api/queue/work` runs the agent on every waiting claim, one at a time, in a background thread; a claim whose run fails or ends without a decision goes back to waiting
  - The agent's instructions are in `backend/instructions.md`
- `agent/`: the UnderCover Agent on LangChain's `create_agent`, with `openai/gpt-6-luna` at low reasoning effort or the model in `MODEL_NAME`. `run(claim_id, thread_id)` fetches its instructions from the API, starts the claim, and reads, decides and pays through six tools that call the API, posting each step to the backend as it goes
- `dashboard/`: React, in the brand from `docs/BRAND.md`, updating every two seconds
  - Queue: the status bar, the Waiting, For sign-off and Paid numbers, the claims table, the ring chart, the decisions bar, the Next for sign-off panel and the "Work the queue" button
  - Claim: the claim in full with its items, documents and policy, the agent's decision and reason, its steps as it works, and sign-off by a handler for a payout over $1,000
  - Instructions: the agent's instructions, read only
- `e2e/`: Playwright tests of the whole flow. They start their own backend on port 8001 and dashboard on port 5174 with a fresh database (`e2e/e2e.db`), and play the agent's part through the API, so they never call a model

## How to run it

- `npm run dev` starts the backend on port 8000 and the dashboard on http://localhost:5173
- `npm run seed` resets the database to the claims queue in `data/`
- `uv run -m agent CLM-1001` runs the agent on one claim against the running backend
- `npm run check` runs every check

## Known issues

- On Windows, uvicorn's `--reload` in `npm run dev` can hang after a code change and keep serving the old code. If the backend stops picking up changes, stop `npm run dev` and start it again.
