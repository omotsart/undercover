# Week 2 Day 2: revisable decisions

Baseline commit: `06a6400671fd3ca7657a7a0b00ad8fc7421f69ca`.

The original notebook outputs are preserved. Baseline accuracy and mistake cost:

| Experiment | Accuracy | Cost of mistakes | Found fact |
| --- | ---: | ---: | ---: |
| Payout tool | 0.64 | 1064.60 | — |
| Payout tool and memory | 0.92 | 3000.00 | 1.0 |

The original memory run rejected corrections from decline/0 to approve/300 for CLM-1304 and approve/427.60 for CLM-1306. The evaluator therefore scored the initial declines at 1500 each.

## Behavior

`record_decision` now saves or replaces a provisional decision for the active claim. Accepted drafts, including their rationales and payouts, are appended to `decision_history`. Approval still requires a positive payout; a rejected call leaves the last valid draft and history untouched.

`decide` creates invocation-local state using `ContextVar`, so tools running asynchronously or in executor threads see the correct claim. It finalizes the latest draft only after `await agent.ainvoke(...)` succeeds. `finally` resets the context on success, exception or cancellation. Exceptions propagate rather than returning a draft. A successful invocation without any draft keeps the existing `refer / 0 / Nothing recorded` fallback.

Existing answer fields (`decision`, `payout`, `rationale`, `cost`, `retrieved`), evaluators and table columns are unchanged. `decision_history` is an additional answer field visible in Langfuse task outputs. Both claim agents receive the revised tool description and shared instructions. No reference answers, business data, penalties or scoring formulas were changed.

## Local checks

Run from the repository root in PowerShell:

```powershell
uv run pytest -q agent/tests/test_lab_decisions.py --no-cov
npm run check
```

The six regression cases load the actual notebook definitions and use the real LangChain tool with a scripted `ainvoke`, without model calls. They cover decline to approval, approval to decline, invalid zero approval, history preservation, concurrent claims, repeated runs, exception cleanup, and rejecting calls for another claim or outside an invocation.

Validation passed: six regression cases; all 91 Python tests (99.50% coverage); all 55 frontend tests; all 15 Playwright tests. Ruff, Pyright, Prettier, ESLint and TypeScript checks passed. After the final test-loader adjustment, the Python checks and all 91 tests were repeated successfully.

## Measured memory run

One full run on the same 25 claims used the existing taught Qdrant memory, the notebook's original model (`openai/gpt-6-luna`, low reasoning), payout tool and unchanged evaluators. No baseline traces, results, dataset items or memory facts were deleted or replaced. The run is named `Payout tool and memory - revisable decisions - 2026-11-03T19:29:24.281489Z`.

| Metric | Baseline with memory | Revised decisions |
| --- | ---: | ---: |
| Accuracy | 0.92 | 0.88 |
| Cost of mistakes | 3000.00 | 150.00 |
| Found fact | 1.0 | 1.0 |

New decision accuracy is 0.88, precision 1.0, recall 0.823529, Cohen's kappa 0.780059 and straight-through rate 0.80. Model cost reported by the notebook is $0.0150321.

Accepted revisions include CLM-1304 decline/0 to approve/300, CLM-1306 refer/0 to approve/427.60, and CLM-1320 refer/0 to approve/663.67. These are observed model decisions, not claim-specific rules.

Three errors remain; each is an unnecessary referral costing 50 under the unchanged evaluator:

| Claim | Expected | Actual | Agent's reason for referral |
| --- | --- | --- | --- |
| CLM-1309 | approve/671.99 | refer/0 | Uncertainty about whether the stolen backpack was unattended |
| CLM-1319 | approve/432.40 | refer/0 | Uncertainty about whether the river outing was an excluded adventure sport |
| CLM-1323 | approve/205.40 | refer/0 | Uncertainty about allocating taxi costs between the police station and embassy |

The fix removes the confirmed revision block; this single run reduced mistake cost while accuracy fell. It does not establish that all future decisions will be correct.

`docs/week2day2_memory_results.json` contains all 25 final outputs, accepted draft histories, retrieved facts, trace IDs, aggregate metrics and remaining errors. The standalone launch completed all model calls and evaluators, then failed while printing Langfuse's formatted report to a Windows cp1251 console. Results were recovered through the current Langfuse experiments API and rescored with the actual unchanged notebook functions; no second model experiment was run. For standalone Python launches, set `PYTHONIOENCODING=utf-8` to avoid that console issue.

## Repeat the memory experiment

Open `labs/week2day2.ipynb` with the `.venv` kernel. With the existing taught `labs/qdrant_data`, execute these cells in order (identifiers are in the notebook JSON):

1. Imports (`42eba528`), environment and Langfuse (`904a3ea1`), claim data (`a634afa5`).
2. Windows adjustment (`da374f6d`). Set `MEMORY = Path("qdrant_data").resolve()` and `MEMORY_ENV = {"QDRANT_LOCAL_PATH": str(MEMORY), "COLLECTION_NAME": "memory"}`. Execute the MCP connection cell (`1c1026f8`, starting with `MEMORY_ENV =`). Skip the preceding `shutil.rmtree` cell to retain the taught memory.
3. Model and memory assistant (`05ee2f1b`). Skip the demonstration questions and fact-teaching cells when reusing the existing memory.
4. Shared instructions (`0e008253`), decision and payout tools (`ddf08f96`), read-only memory tools (`97b5354c`), agents (`dffd86f0`). Recreate both agents after editing their tools or instructions.
5. Scoring (`3280ed63`, `b9f89860`). Set `DATASET = "even-harder-claims"`; reuse the existing dataset without running the upload cell. Run selection (`0301cc6b`) with `TINY = False`, `N_TIMES = 1`; confirm 25 claims.
6. Task definitions (`fe902d98`), then Experiment 2 (`9ab160fd`, starting with `memory_tables = []`), its table (`11a0e5e4`) and error rows (`ffef4393`). Use `run_scores(memory_table)` for the run metrics.

Do not execute the Langfuse cleanup cell. It deletes traces and dataset items. A rerun creates a new experiment run and keeps earlier runs.
