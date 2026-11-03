"""Exercise the notebook's actual tool and task without executing model cells."""

import ast
import asyncio
import json
import runpy
from contextvars import ContextVar
from pathlib import Path
from types import SimpleNamespace
from typing import Literal

import pytest
from langchain_core.tools import tool


@pytest.fixture
def lab(tmp_path):
    path = Path(__file__).resolve().parents[2] / "labs/week2day2.ipynb"
    notebook = json.loads(path.read_text(encoding="utf-8"))
    names = {"_decision_state", "record_decision", "decide"}
    statements = []
    for cell in notebook["cells"]:
        if cell["cell_type"] != "code":
            continue
        tree = ast.parse("".join(cell["source"]))
        for node in tree.body:
            if isinstance(node, ast.Assign):
                selected = any(
                    isinstance(t, ast.Name) and t.id in names for t in node.targets
                )
            elif isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                selected = node.name in names
            else:
                selected = False
            if selected:
                statements.append(node)
    namespace = {
        "ContextVar": ContextVar,
        "Literal": Literal,
        "tool": tool,
        "make_user_prompt": lambda claim: claim["claim_id"],
        "langfuse_handler": None,
    }
    # Load only the real decision code, never the model or dataset cells.
    extracted = tmp_path / "notebook_decisions.py"
    extracted.write_text(
        ast.unparse(ast.Module(body=statements, type_ignores=[])), encoding="utf-8"
    )
    return SimpleNamespace(**runpy.run_path(str(extracted), init_globals=namespace))


def scripted_agent(lab, decisions, *, fail=False):
    async def ainvoke(payload, config):
        claim_id = payload["messages"][0]["content"]
        for decision, payout in decisions:
            await lab.record_decision.ainvoke(
                {
                    "claim_id": claim_id,
                    "rationale": f"Evidence supports {decision}",
                    "decision": decision,
                    "payout": payout,
                }
            )
        if fail:
            raise RuntimeError("Agent failed after drafting")
        return {
            "messages": [
                SimpleNamespace(
                    type="ai", response_metadata={"token_usage": {"cost": 0}}
                ),
                SimpleNamespace(type="tool", name="qdrant-find", text="retrieved fact"),
            ]
        }

    return SimpleNamespace(ainvoke=ainvoke)


@pytest.mark.parametrize(
    "decisions",
    [
        [("decline", 0), ("approve", 300)],
        [("approve", 300), ("decline", 0)],
    ],
)
def test_latest_draft_is_final_and_history_is_preserved(lab, decisions):
    answer = asyncio.run(
        lab.decide(scripted_agent(lab, decisions), {"claim_id": "claim-a"})
    )
    assert (answer["decision"], answer["payout"]) == decisions[-1]
    assert [
        (d["decision"], d["payout"]) for d in answer["decision_history"]
    ] == decisions
    assert answer["cost"] == 0
    assert answer["retrieved"] == "retrieved fact"
    assert lab._decision_state.get() is None


def test_zero_approval_preserves_previous_draft(lab):
    async def ainvoke(payload, config):
        fields = {"claim_id": "claim-a", "rationale": "Original reason"}
        await lab.record_decision.ainvoke(
            {**fields, "decision": "decline", "payout": 0}
        )
        refusal = await lab.record_decision.ainvoke(
            {
                **fields,
                "rationale": "Invalid replacement",
                "decision": "approve",
                "payout": 0,
            }
        )
        assert refusal == "An approval needs a payout above zero"
        return {"messages": []}

    answer = asyncio.run(
        lab.decide(SimpleNamespace(ainvoke=ainvoke), {"claim_id": "claim-a"})
    )
    assert answer["decision"] == "decline"
    assert answer["rationale"] == "Original reason"
    assert answer["decision_history"] == [
        {"decision": "decline", "payout": 0, "rationale": "Original reason"}
    ]


def test_cases_and_repeated_runs_are_isolated(lab):
    async def run():
        first, second = await asyncio.gather(
            lab.decide(
                scripted_agent(lab, [("approve", 300)]), {"claim_id": "claim-a"}
            ),
            lab.decide(scripted_agent(lab, [("decline", 0)]), {"claim_id": "claim-b"}),
        )
        repeated = await lab.decide(scripted_agent(lab, []), {"claim_id": "claim-a"})
        return first, second, repeated

    first, second, repeated = asyncio.run(run())
    assert (first["decision"], first["payout"]) == ("approve", 300)
    assert (second["decision"], second["payout"]) == ("decline", 0)
    assert len(first["decision_history"]) == len(second["decision_history"]) == 1
    assert repeated["decision"] == "refer"
    assert repeated["rationale"] == "Nothing recorded"
    assert repeated["decision_history"] == []


def test_failure_does_not_finalize_and_next_run_starts_empty(lab):
    async def run():
        with pytest.raises(RuntimeError, match="Agent failed after drafting"):
            await lab.decide(
                scripted_agent(lab, [("approve", 300)], fail=True),
                {"claim_id": "claim-a"},
            )
        assert lab._decision_state.get() is None
        return await lab.decide(scripted_agent(lab, []), {"claim_id": "claim-a"})

    answer = asyncio.run(run())
    assert answer["decision_history"] == []
    assert answer["decision"] == "refer"


def test_wrong_claim_and_outside_invocation_are_refused(lab):
    fields = {
        "claim_id": "claim-b",
        "rationale": "Other claim",
        "decision": "decline",
        "payout": 0,
    }
    assert "active decide invocation" in lab.record_decision.invoke(fields)

    async def ainvoke(payload, config):
        assert "active decide invocation" in await lab.record_decision.ainvoke(fields)
        return {"messages": []}

    answer = asyncio.run(
        lab.decide(SimpleNamespace(ainvoke=ainvoke), {"claim_id": "claim-a"})
    )
    assert answer["decision_history"] == []
