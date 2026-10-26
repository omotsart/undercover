"""The queue agent, which plans a run, hands each claim to a fresh claim agent and
finishes with a summary for the handlers."""

import json
import uuid
from collections.abc import Callable
from typing import Any, Literal

from langchain.agents import create_agent
from langchain.agents.middleware import (
    AgentMiddleware,
    ModelCallLimitMiddleware,
    ModelRetryMiddleware,
)
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel

from agent import claim
from agent.main import backend, call, instructions, model

MODEL_CALL_LIMIT = 150

ClaimModel = Callable[[str], BaseChatModel] | None


class Todo(BaseModel):
    content: str
    status: Literal["to_do", "in_progress", "done", "for_handler"]


def tools(run_id: int, claim_model: ClaimModel) -> list[BaseTool]:
    """Return the queue agent's tools for one run."""

    @tool
    def list_waiting_claims() -> str:
        """List the waiting claims with their type, amount claimed and date
        submitted."""
        with backend() as client:
            found = client.get("/api/claims").raise_for_status().json()
        fields = ["claim_id", "claim_type", "amount_claimed", "submitted_on"]
        return json.dumps(
            [{f: c[f] for f in fields} for c in found if c["status"] == "waiting"]
        )

    @tool
    def write_todos(todos: list[Todo]) -> str:
        """Write your to-do list in full, replacing the last one. Each item's
        status is to_do, in_progress, done or for_handler."""
        body = {"todos": [todo.model_dump() for todo in todos]}
        reply = call("PUT", f"/api/runs/{run_id}/todos", body)
        return reply if reply.startswith("Refused") else "To-do list saved."

    @tool
    def work_claim(claim_id: str) -> str:
        """Hand one claim to a fresh claim agent, which decides it and pays it if
        approved, and get the outcome back in one line."""
        reply = call("POST", f"/api/runs/{run_id}/claims", {"claim_id": claim_id})
        if reply.startswith("Refused"):
            return reply
        thread_id = f"{claim_id}-run-{run_id}-{uuid.uuid4().hex[:6]}"
        llm = claim_model(claim_id) if claim_model else None
        return claim.work_claim(claim_id, thread_id, llm)

    @tool
    def finish_run(summary: str) -> str:
        """Finish the run with a summary of three or four sentences for the
        handlers. Refused while a claim is still waiting within your cap."""
        reply = call("POST", f"/api/runs/{run_id}/finish", {"summary": summary})
        return reply if reply.startswith("Refused") else "The run is finished."

    return [list_waiting_claims, write_todos, work_claim, finish_run]


def run_queue(
    run_id: int,
    cap: int,
    llm: BaseChatModel | None = None,
    claim_model: ClaimModel = None,
) -> str:
    """Run the queue agent over the queue up to the cap, and return its last reply."""
    middleware: list[AgentMiddleware[Any, Any, Any]] = [
        ModelRetryMiddleware(
            max_retries=claim.RETRIES,
            on_failure="error",
            initial_delay=claim.RETRY_DELAY,
        ),
        ModelCallLimitMiddleware(run_limit=MODEL_CALL_LIMIT, exit_behavior="end"),
    ]
    agent = create_agent(
        llm or model(),
        tools=tools(run_id, claim_model),
        system_prompt=instructions("queue"),
        middleware=middleware,
    )
    task = f"Work the queue. Your cap is {cap} claims."
    result = agent.invoke(
        {"messages": [{"role": "user", "content": task}]},
        config={
            "configurable": {"thread_id": f"run-{run_id}"},
            "recursion_limit": 10 * MODEL_CALL_LIMIT,
        },
    )
    return result["messages"][-1].text
