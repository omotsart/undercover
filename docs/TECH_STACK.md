# Tech stack

- `backend/`: FastAPI and SQLite. Every API operation has an `operation_id`, a one-line docstring and no optional inputs. Paying a claim is a separate operation that takes the amount.
- `agent/`: LangChain's `create_agent` on OpenRouter, in two parts. The queue agent runs a run, given its run id and cap: it plans a to-do list, hands each claim to a claim agent and finishes with a summary. The claim agent works one claim from a clean start, given a claim id and a thread id, and is a tool of the queue agent. Both reach claims, documents and their instructions only through the backend's API. LangChain's middleware gives them retries on the model and the tools and a limit on model calls; there is no other agent framework. They use `deepseek/deepseek-v4.1-flash` with low reasoning effort by default, or the model in the environment variable `MODEL_NAME` if set, such as `openrouter/free`.
- `dashboard/`: React, Vite and TypeScript.
- `e2e/`: Playwright tests.
- `data/`: the business data the backend starts from. The agent never sees `data/evals/`, which holds the answer key.

Python 3.12 with uv, all in the root `pyproject.toml`. Node 26. The OpenRouter key is `OPENROUTER_API_KEY` in `.env`.
