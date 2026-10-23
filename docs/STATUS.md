# Status

The pilot is being built from `docs/PLAN.md`. Phase 1 of 6 is done.

## What's built

- `backend/`: FastAPI and SQLite. The database is `backend/undercover.db` (or `DATABASE_PATH`), created and seeded from `data/` on first start. Read operations for claims, policies, claim history, the policy wording, the agent's instructions and the handlers
- `agent/`: still the hello-world agent, with one tool that calls the health route
- `dashboard/`: one page that shows whether the backend is up
- `e2e/`: one test of that page

## How to run it

- `npm run dev` starts the backend on port 8000 and the dashboard on port 5173
- `npm run seed` resets the database to the claims queue in `data/`
- `npm run check` runs every check
