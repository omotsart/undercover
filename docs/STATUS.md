# Status

The pilot is being built from `docs/PLAN.md`. Phases 1 to 4 of 6 are done.

## What's built

- `backend/`: FastAPI and SQLite. The database is `backend/undercover.db` (or `DATABASE_PATH`), created and seeded from `data/` on first start. Read operations for claims, policies, claim history, the policy wording, the agent's instructions and the handlers. Operations to start a claim, record the agent's steps and decision, pay a claim and sign off a payout. `pay_claim` refuses a payout over $1,000 until a handler signs off, and signing off releases the payment. `POST /api/queue/work` runs the agent on every waiting claim, one at a time, in a background thread; a claim whose run fails or ends without a decision goes back to waiting
- `agent/`: the UnderCover Agent on LangChain's `create_agent`. `run(claim_id, thread_id)` fetches its instructions (`backend/instructions.md`) from the API, starts the claim, and reads, decides and pays through six tools that call the API, posting each step to the backend as it goes
- `dashboard/`: one page that shows whether the backend is up
- `e2e/`: one test of that page

## How to run it

- `npm run dev` starts the backend on port 8000 and the dashboard on port 5173
- `npm run seed` resets the database to the claims queue in `data/`
- `uv run -m agent CLM-1001` runs the agent on one claim against the running backend, with the model in `MODEL_NAME` or GPT-6 Luna
- `npm run check` runs every check
