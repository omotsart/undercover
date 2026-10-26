# Plan: the harness

This plan builds the brief in `docs/HARNESS.md` on top of the pilot (`docs/STATUS.md`, `docs/PLAN.md`). The UnderCover Agent stops being one claim agent that our code feeds a claim at a time. It becomes a queue agent that plans a run as a to-do list and hands each claim to a fresh claim agent. That claim agent looks up the sections of the wording and the manual it needs, rather than being handed whole documents. Around both agents sits a harness of tools, middleware and backend rules. It retries what fails, puts back in the queue any claim that fails, and makes sure no claim is decided or paid twice.

It follows `docs/TECH_STACK.md`, `docs/CODE_STANDARDS.md`, `docs/PROCESS.md` and `docs/BRAND.md`. Each phase builds on the one before and ends with a commit. `docs/PLAN.md` stays as it is.

## The approach

### How the parts fit together

```
dashboard ──"Work the queue" (cap)──▶ backend ── starts a run in a background thread
                                         ▲
                                         │ HTTP only
                         ┌───────────────┴────────────────┐
                         │ queue agent (create_agent)     │
                         │ list_waiting_claims            │
                         │ write_todos ─────────────────▶ │ the run's to-do list, shown on the queue page
                         │ work_claim(claim_id) ──┐       │
                         │ finish_run(summary)    │       │
                         └────────────────────────┼───────┘
                                                  ▼  one line back: "CLM-1004: approve, $186.00, paid"
                         ┌────────────────────────────────┐
                         │ claim agent, fresh for each    │
                         │ claim (create_agent)           │
                         │ get_claim, get_policy,         │
                         │ get_claim_history,             │
                         │ search_documents, read_section,│
                         │ record_decision, pay_claim     │
                         └────────────────────────────────┘
```

Both agents are LangChain's `create_agent` on OpenRouter, as now. The brief asks us to build the pieces into our own agent rather than add a framework, so there is no Deep Agents and no LangGraph graph of our own. The subagent is a tool, `work_claim`, that runs a new claim agent and returns one line.

### What the agent decides, and what the code guarantees

The brief wants the agent to organize its own work. A cheap model can still forget, loop or fail, so I split the work this way: the agent makes the choices, and the backend enforces every rule that must hold whatever the model does. This is the same split as the pilot's $1,000 rule.

| The agent decides | The code guarantees |
|---|---|
| Which claims to work and in what order | A run never starts more distinct claims than its cap: `add_run_claim` refuses |
| What goes on the to-do list, and when to tick items off | The list is stored on the run and the dashboard shows it as written |
| How to decide each claim, and which sections to read | Each claim starts from a clean context, so earlier claims cost nothing |
| When the run is finished, and the summary | `finish_run` refuses while a claim is still waiting within the cap, so the agent can't miss one |
| | A claim that fails before a decision goes back to waiting; after a second failure it is left for a handler |
| | A claim is decided only while in progress and paid only once (unchanged from the pilot), so a retry can never decide or pay it twice |
| | A model call that times out or errors is retried with backoff before the claim counts as failed |

### The run

A run is a record in the backend: its id, its cap, its status (`running`, `finished` or `stopped`), the to-do list, the claims it has started, the summary, and when it started and finished. One run at a time: starting a second one while the first is running gets a 409, as now.

1. "Work the queue" on the dashboard, or `POST /api/queue/work` with `{"cap": 5}`, creates the run and starts the queue agent in a background thread.
2. The queue agent lists the waiting claims and writes its to-do list, one item per claim it means to work, plus a final "Check for missed claims and write the summary".
3. For each claim it marks the item in progress, calls `work_claim`, and marks the item done or left for a handler from the one-line report.
4. When it's done it calls `finish_run` with a short summary for the handlers. If a claim is still waiting within the cap, the backend refuses and names the claims, and the agent works them first. A claim that failed once is waiting again, so this is also how it gets its retry.
5. If the queue agent itself stops (the provider is down past every retry, or it ends without `finish_run`), the worker marks the run `stopped` with the reason and puts any claim left in progress back in the queue.

The cap counts distinct claims. A retry of a claim already in the run doesn't use up the cap, so with a cap of 5, five claims are worked and the other twenty stay waiting.

To-do items have a text and one of four statuses: `to_do`, `in_progress`, `done` and `for_handler`. LangChain's `TodoListMiddleware` has only three statuses and keeps the list in the agent's state, where the dashboard can't see it. So `write_todos` is our own tool. It replaces the run's list through the API, and the backend validates it.

### A fresh claim agent for each claim

`work_claim(claim_id)` is a tool on the queue agent and a plain function underneath. It:

1. calls `add_run_claim`, which refuses past the cap
2. builds a new claim agent with the claim instructions and a new thread id (`CLM-1004-RUN-3-1`, for claim, run and attempt), and runs it the way the pilot's `run` does, posting each step to the claim
3. reads the claim back from the backend and returns one line built from the record, not from the model's prose, so the report is always accurate: `CLM-1004: approve, $186.00, paid`, `CLM-1002: approve, $1,150.00, waiting for sign-off`, `CLM-1019: refer` or `CLM-1007: failed (timed out), back in the queue`

The claim agent's context starts empty for every claim, and the queue agent only ever sees one line per claim. So the twenty-fifth claim costs about what the first does.

`uv run -m agent CLM-1001` runs the same `work_claim` on one named claim, outside a run, and prints the line.

### Looking things up

The claim agent no longer gets `get_policy_wording`. It gets two lookup tools over the wording and the manual:

- `search_documents(query)`: the sections of both documents that match the words of the query, best first, each with the line that matched. "monkey bag" finds the wild animals note in section 7 of the manual.
- `read_section(document, section)`: one section in full, such as `claims_manual`, `9`, which returns "9. Repeat claims".

The backend splits the two Markdown files on their `##` headings, so the sections stay in step with the documents and nothing is copied by hand. The instructions start each claim with the contents of both documents (section numbers and titles, a few lines), so the agent knows what there is to read. Then they tell it to look up the benefit's section, the exclusions, section 10 of the wording for the payout, and any manual section the claim touches.

Each lookup becomes a step on the claim, such as "Searching the documents for wild animals" and "Read the claims manual, 7. Interpretation notes". That way the claim page shows what the agent read. The decision's `policy_section` can now name a manual section, such as "Claims manual 9. Repeat claims", when that is what the decision rests on.

### Failures, and what happens to each

| What fails | What happens |
|---|---|
| A model call times out or the provider returns an error | `ModelRetryMiddleware` retries twice with backoff; the model client has a timeout so a call can't hang |
| A call to the backend fails (connection or 5xx) | `ToolRetryMiddleware` retries it; a refusal (409) still goes back to the model as the tool's result, as now |
| A claim agent loops | `ModelCallLimitMiddleware` stops it after 30 model calls; with no decision it counts as a failure |
| A claim fails before it is decided | `release_claim` puts it back to waiting with a step that says why, and the run carries on |
| The same claim fails a second time | `release_claim` moves it to the new status "Left for a handler", and nobody retries it |
| The queue agent stops | The worker marks the run `stopped` and releases any claim left in progress |
| The backend restarts mid-run | On startup, a `running` run is marked `stopped` and its in-progress claims are released, each counting as a failure |

`release_claim` only acts on a claim in progress. A claim that was decided before something failed stays decided, and is never released, decided again or paid again.

### Claim statuses

| Status in the API | Shown as | When |
|---|---|---|
| `waiting` | Waiting | Seeded, or released after a first failure |
| `in_progress` | In progress | A claim agent has started it |
| `awaiting_signoff` | Waiting for sign-off | Approved over $1,000 |
| `decided` | Decided | Declined, referred, approved within the limit, or signed off |
| `for_handler` | Left for a handler | New: it failed twice, so a person has to work it |

A failure isn't a decision, so a claim the agent couldn't finish is not dressed up as a referral. Its claim page says the agent couldn't decide it and its steps show why.

### The API

New and changed operations. Every operation keeps an `operation_id`, a one-line docstring and only required inputs.

| Operation | Method and path | Used by |
|---|---|---|
| `work_queue` (changed: takes `cap`, returns the run) | `POST /api/queue/work` | dashboard |
| `get_current_run` | `GET /api/runs/current` (the latest run, or null) | dashboard |
| `add_run_claim` | `POST /api/runs/{run_id}/claims` | agent (`work_claim`) |
| `write_todos` | `PUT /api/runs/{run_id}/todos` | agent tool |
| `finish_run` | `POST /api/runs/{run_id}/finish` | agent tool |
| `release_claim` | `POST /api/claims/{claim_id}/release` | agent (`work_claim`) |
| `list_sections` | `GET /api/documents` | agent |
| `read_section` | `GET /api/documents/{document}/sections/{section}` | agent tool |
| `search_documents` | `GET /api/documents/search?query=` | agent tool |
| `get_instructions` (changed: both sets) | `GET /api/instructions` | dashboard, agent |
| `get_policy_wording` (removed) | | |

`list_waiting_claims` is a tool over the existing `list_claims`. It keeps only the waiting claims, with the type, the amount claimed and the date submitted, so the queue agent can choose an order.

### The data

- `claims`: a new `failures` column, and the new `for_handler` status
- `runs`: the run record, with the to-do list as JSON
- `run_claims`: which claims each run started, for the cap

The schema changes, so an existing `backend/undercover.db` needs `npm run seed` once after this lands. Seeding still reads nothing in `data/evals/`.

### Instructions

`backend/instructions.md` becomes two files: `backend/instructions/queue.md` for running the queue and `backend/instructions/claim.md` for working a claim. The claim instructions are rewritten from the policy wording and the claims manual, and from nothing in `data/evals/`. They cover the order of work from section 4 of the manual, which sections to look up, and the manual's rules: refer a third claim in 12 months, refer a missing document with a request that names it, and refer to Special Investigations when the story and the documents disagree. They also cover wild animals, the $35 meals allowance, and declining when the payout comes to zero or less. The instructions page shows both, under "Running the queue" and "Working a claim".

### The model

`deepseek/deepseek-v4.1-flash` with low reasoning effort becomes the default for both agents; `MODEL_NAME` still overrides it, as now. The model client gets a timeout of two minutes. The retry settings are constants, so tests run them with no delay.

### Code layout

- `agent/main.py`: the backend client, `call`, `model()`, and turning messages into steps, shared by both agents
- `agent/claim.py`: the claim agent's tools, `run` (the pilot's, using the new tools and middleware) and `work_claim`
- `agent/queue.py`: the queue agent's tools and `run_queue(run_id, cap)`
- `agent/__main__.py`: `uv run -m agent CLM-1001`, through `work_claim`
- `backend/documents.py`: splitting the wording and the manual into sections, and the search
- `backend/runs.py`: runs, the cap, the to-do list and the finish check
- `backend/worker.py`: starts `run_queue` in a thread, and handles a run that stops and a restart
- `backend/claims.py`: `release_claim` and the failure count

## Phases

### Phase 1: The claim agent looks things up

Builds the lookup and moves the claim agent onto it, with the manual in its instructions and the new default model. It comes first because it changes how each claim is decided, and it can be checked on one claim before any of the run exists.

- `backend/documents.py` and the `list_sections`, `read_section` and `search_documents` operations; `get_policy_wording` removed
- `agent/claim.py`: the claim agent's tools move here, with `search_documents` and `read_section` in place of `get_policy_wording`; steps name what was searched and read
- `backend/instructions/claim.md`, written from the wording and the manual, and the contents of both documents given to the agent at the start of each claim
- `get_instructions` returns both sets; `queue.md` gets a first version (finished in Phase 4)
- The default model becomes `deepseek/deepseek-v4.1-flash` at low reasoning effort, with a two-minute timeout

Success criteria:

- [x] `uv run pytest -q backend` passes, with tests that both documents split into their numbered sections (12 in the wording, 14 in the manual), that `read_section` returns one section and a 404 for an unknown one, and that a search for "monkey" or "wild animal" finds the manual's section 7 first
- [x] `uv run pytest -q agent` passes with a stub model: a scripted claim that searches, reads two sections, approves and pays, with the steps "Searching the documents for …" and "Read the claims manual, 10. Meals without receipts" recorded on the claim
- [x] A test checks the claim agent's tools: no `get_policy_wording`, no sign-off, no starting claims
- [x] A test checks the default model is `deepseek/deepseek-v4.1-flash` and `MODEL_NAME` overrides it
- [x] `grep -ri evals backend agent` finds no mention outside the tests that check the folder is out of reach (seeding, and `/api/documents/evals/...` giving 404)
- [x] After `npm run seed`, with the backend running, `uv run -m agent CLM-1020` on the real model ends with a decision, and its steps show it searched and read sections of the manual, not the whole wording
- [x] `npm run check:python` passes with coverage of at least 80%

### Phase 2: Failures put right

Builds failure handling for a single claim: retries in the agent, a failure count and the new status in the backend, and `work_claim` with its one-line report. That way the run in Phase 4 can lean on it.

- `failures` on claims, the `for_handler` status, and `release_claim`: in progress to waiting with a step and one more failure, or to `for_handler` on the second failure; refused unless the claim is in progress
- `start_claim` keeps the steps of earlier attempts rather than clearing them, and adds a step "Attempt 2" on a retry, so every step on a claim stays recorded
- On startup, any claim left in progress is released
- `agent/claim.py`: `ModelRetryMiddleware`, `ToolRetryMiddleware` and `ModelCallLimitMiddleware` on the claim agent, and `work_claim(claim_id, thread_id)`, which runs it, releases the claim if it ends in progress or raises, and returns the one-line report
- `agent/__main__.py` uses `work_claim`

Success criteria:

- [x] Backend tests: release once goes back to waiting with one failure; release twice is `for_handler`; release on a waiting or decided claim gets 409; a decided claim is never moved by a release; a claim in progress at startup is released
- [x] Agent tests with stub models:
  - [x] A model that fails once and then answers is retried, and the claim is decided
  - [x] A claim agent that raises every time: the claim is back in the queue, with a step that says why, and the report reads "CLM-1001: failed (…), back in the queue"
  - [x] The same claim failing a second time: it is `for_handler`, and the report says so
  - [x] A claim agent that ends without deciding counts as a failure
  - [x] A claim agent that records a decision and then raises: the claim stays decided and isn't released
  - [x] The reports for an approval paid, an approval waiting for sign-off, a decline and a referral
- [x] `uv run -m agent CLM-1001` against the running backend on the real model prints one line with the decision and payout
- [x] `npm run check:python` passes with coverage of at least 80%

### Phase 3: Runs in the backend

Builds the run record and its rules (the cap, the to-do list and the finish check) in the backend on their own, without a model, as the pilot did with sign-off.

- `backend/runs.py`, the `runs` and `run_claims` tables, and `work_queue(cap)`, `get_current_run`, `add_run_claim`, `write_todos` and `finish_run`
- `add_run_claim` counts and adds in one transaction, so two calls at once can't both slip under the cap
- `finish_run` refuses, naming the claims, while any claim is waiting within the cap: any waiting claim while the run has started fewer than its cap, and any of the run's own claims that are waiting again after a failure
- `work_queue` keeps the one-run-at-a-time rule; for this phase its thread runs a stub, and Phase 4 connects the queue agent
- On startup, a run still `running` is marked `stopped`

Success criteria:

- [x] Tests cover:
  - [x] A run with a cap of 5 takes five distinct claims, refuses a sixth with 409, and accepts a claim it already has (a retry)
  - [x] `write_todos` stores the list in order and refuses an unknown status
  - [x] `finish_run` refuses while a claim is waiting within the cap, then accepts once the cap is used and the run's claims are decided or left for a handler; the run is `finished` with the summary
  - [x] A second `work_queue` while a run is running gets 409; a cap below 1 gets 422
  - [x] `get_current_run` returns null before any run, then the latest run with its to-do list
- [x] Through `curl` against the running backend: `POST /api/queue/work` (checked with `{"cap": 1}`, since until Phase 4 a run works its claims on the real model), `PUT /api/runs/{id}/todos` and `GET /api/runs/current` give the same responses
- [x] `/openapi.json` shows an `operation_id` and a one-line description on every operation, and no optional parameters
- [x] `npm run check:python` passes with coverage of at least 80%

### Phase 4: The queue agent

Builds the agent that runs the queue, with its tools and instructions, and connects it to "Work the queue".

- `agent/queue.py`: the queue agent on `create_agent` with `list_waiting_claims`, `write_todos`, `work_claim` and `finish_run`; `ModelRetryMiddleware` and a model call limit high enough for 25 claims; `run_queue(run_id, cap)`, which opens with "Work the queue. Your cap is 5 claims." and returns the summary
- `backend/instructions/queue.md`, written in full: list the waiting claims, choose the order and write the to-do list up to the cap; work one claim at a time; mark each item in progress before and done or left for a handler after; on a failure, carry on with the next claim; before finishing, list the waiting claims again and retry any that came back; finish with a summary of three or four sentences for the handlers
- `backend/worker.py` runs `run_queue` for the run; if it raises or ends without `finish_run`, the run is `stopped` with the reason and any claim in progress is released
- Tests use a stub queue model and a stub claim model for each claim, and no test calls a model

Success criteria:

- [x] Tests with stub models cover the brief's list:
  - [x] The to-do list the agent writes is stored on the run, in order, with its statuses
  - [x] A run capped at 3 on a queue of 25 works three claims; the other 22 stay waiting
  - [x] A claim agent that fails doesn't stop the run: the next claim is still worked and the run finishes
  - [x] A failed claim goes back in the queue and is worked again later in the same run, and decided
  - [x] A claim that fails twice is left for a handler, and the run still finishes
  - [x] The check for missed claims: `finish_run` called with a claim still waiting within the cap is refused, the agent works it, and the second `finish_run` succeeds
  - [x] A queue agent that raises: the run is `stopped` and no claim is left in progress (in `backend/tests/test_worker.py`)
- [x] After `npm run seed`, `curl -X POST http://localhost:8000/api/queue/work -d '{"cap": 5}'` on the real model works five claims on its own. Afterwards `GET /api/runs/current` shows a finished run with five to-do items done or left for a handler and a summary. Five claims are decided, waiting for sign-off or left for a handler, twenty are waiting, and none is in progress. A run of five claims on DeepSeek V4.1 Flash should cost a few cents.
- [x] No claim over $1,000 is paid without a sign-off, and every decision has a reason and a section
- [x] `npm run check:python` passes with coverage of at least 80%

### Phase 5: The dashboard

Shows the run on the queue page, the new status everywhere, and both sets of instructions.

- `api.ts`: the run, its to-do items, `workQueue(cap)`, and the `for_handler` status
- The title row: a "Claims to work" number field next to "Work the queue", starting at 5, from 1 to the number waiting. The button is disabled while a run is running and reads "Working the queue"
- A new card, "The agent's run", across the full width between the summary row and the main grid. It shows the run's status, its cap and how many claims it has done, then the to-do list. Each item has a chip in the claim status color that means the same thing: To do in Steel Grey, In progress hatched, Done in Graphite, and Left for a handler in Slate. (The first draft of this plan gave Left for a handler Deep Sunflower here; I matched it to the claim status instead, so one label always has one color.) When the run finishes, its summary appears, with the reason when it stopped. Empty state: "The agent hasn't run yet." It polls `get_current_run` every two seconds
- The new status "Left for a handler" in the status chip, the status bar, the ring chart and the legends (see "Choices for you to check")
- The claim page: for a claim left for a handler, the decision card reads "The agent couldn't decide this claim. It's left for a handler." Its steps, across both attempts, show what went wrong
- The instructions page: "Running the queue" and "Working a claim", each in its own card, read only

Success criteria:

- [x] Vitest tests, with `fetch` stubbed, cover the to-do card (every item status, the empty state, a running, finished and stopped run, the summary), the field and button calling `work_queue` with the cap, the new status chip and its counts, the claim page for a claim left for a handler, and both sets of instructions
- [x] Playwright tests pass, updated for the new instructions and the new status, plus a test that the queue shows "The agent hasn't run yet." and the "Claims to work" field. The end-to-end tests never start a run, since that would call a model
- [x] `npm run check:ts` passes with coverage of at least 80%
- [x] In the browser (a Playwright script driving Chromium, since the Playwright MCP server wasn't available in this session), after `npm run seed`, with "Claims to work" at 5 and the real model: clicking "Work the queue" shows the to-do list fill in and its items ticked off as the run goes. Each claim's page shows its steps as it is worked, including the sections it read. At the end the run's summary shows, five claims have moved and twenty are still waiting
- [x] At 1440px and 375px wide no page scrolls sideways, and the status bar's five pills fit
- [x] Every status is a filled chip in its exact color, and every to-do item has its chip

### Phase 6: The product documents and the full check

Brings the product's own documents up to date and checks everything together.

- `docs/SPEC.md`: the claims manual moves from "Not for now" into the pilot's work. A claim reads the manual and the wording section by section, one run works the queue, a run can be capped, the to-do list is shown, and a claim that fails twice is left for a handler
- `docs/TECH_STACK.md`: the default model, the two agents, the claim agent as a tool of the queue agent, and the middleware
- `docs/STATUS.md`: what's built and how to run it, including `npm run seed` after this change, a capped run from the dashboard or `curl`, and `uv run -m agent CLM-1001`

Success criteria:

- [ ] `docs/SPEC.md`, `docs/TECH_STACK.md` and `docs/STATUS.md` describe the product as it now is; `docs/PLAN.md` and the root `README.md` are untouched
- [ ] Every criterion above is ticked
- [ ] `npm run check` passes in full

## Choices for you to check

These are the places where the brief left a choice and I made one. Tell me if you'd like any of them done differently before I build.

1. **A fifth claim status, "Left for a handler".** The brief says a claim that fails twice is left for a handler, which isn't one of the four statuses in `docs/SPEC.md`. I'd rather show it honestly than file it as a referral the agent never made. `docs/BRAND.md` fixes the status bar at four pills, so this needs your brand guide to grow. I suggest Slate `#55585E` with white text: it is readable, it's in your palette, and it doesn't compete with Deep Sunflower, which already means "a handler should look at this". The status bar becomes five equal pills, in the order Decided, Waiting for sign-off, Left for a handler, In progress, Waiting. I'd add this to the status table in `docs/BRAND.md`.
2. **"Claims to work" starts at 5.** It keeps a click from starting a run on the whole queue by accident, and you change it for a full run. The alternative is to start at the number waiting.
3. **One claim at a time.** The queue agent's instructions say to work claims one after another. The backend stays correct even if the model asks for two at once (the cap and the claim rules hold), but working in parallel isn't part of this brief.

## Not in this plan

- A handler working a claim that is left for a handler, or putting it back in the queue from the dashboard. The brief leaves these claims to a person and doesn't say how; they stay visible in the queue and on their pages.
- Paying a claim that was approved within the limit when the claim agent failed before paying. It stays decided and shows "Not paid yet" on its page. Retrying would risk deciding it twice, which the brief rules out.
- Running one named claim from the dashboard. One claim runs through `uv run -m agent CLM-1001`, as in the pilot.
- Scoring the agent against `data/evals/`, durable state, a dispatcher with a swarm, and anything else from later briefs.
