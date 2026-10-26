"""The UnderCover backend."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend import claims, documents, runs, worker
from backend.db import init_db

INSTRUCTIONS = Path(__file__).parent / "instructions"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    worker.recover()
    yield


app = FastAPI(title="UnderCover", lifespan=lifespan)


@app.exception_handler(claims.NotFoundError)
def not_found(_: Request, error: claims.NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(error)})


@app.exception_handler(claims.RefusedError)
def refused(_: Request, error: claims.RefusedError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(error)})


@app.get("/api/health", operation_id="health")
def health() -> dict[str, str]:
    """Check that the backend is running."""
    return {"status": "ok"}


@app.get("/api/claims", operation_id="list_claims")
def list_claims() -> list[dict[str, Any]]:
    """List every claim in the queue with where it stands."""
    return claims.list_claims()


@app.get("/api/claims/{claim_id}", operation_id="get_claim")
def get_claim(claim_id: str) -> dict[str, Any]:
    """Get a claim in full: the story, items, documents and decision."""
    return claims.get_claim(claim_id)


@app.get("/api/policies/{policy_id}", operation_id="get_policy")
def get_policy(policy_id: str) -> dict[str, Any]:
    """Get a policy: the plan, add-ons, purchase date, trip and travelers."""
    return claims.get_record("policies", "policy_id", policy_id)


@app.get("/api/customers/{customer_id}/history", operation_id="get_claim_history")
def get_claim_history(customer_id: str) -> dict[str, Any]:
    """Get a customer's name and the claims they made before."""
    return claims.get_claim_history(customer_id)


@app.get("/api/documents", operation_id="list_sections")
def list_sections() -> list[dict[str, Any]]:
    """List the sections of the policy wording and the claims manual."""
    return documents.list_sections()


@app.get("/api/documents/search", operation_id="search_documents")
def search_documents(query: str) -> list[dict[str, str]]:
    """Find the sections of the wording and the manual that match the query."""
    return documents.search(query)


@app.get("/api/documents/{document}/sections/{section}", operation_id="read_section")
def read_section(document: str, section: str) -> dict[str, str]:
    """Read one section of the policy wording or the claims manual."""
    return documents.read_section(document, section)


@app.get("/api/instructions", operation_id="get_instructions")
def get_instructions() -> list[dict[str, str]]:
    """Get the UnderCover Agent's instructions for the queue and for a claim."""
    return [
        {
            "name": name,
            "title": title,
            "text": (INSTRUCTIONS / f"{name}.md").read_text(encoding="utf-8"),
        }
        for name, title in [
            ("queue", "Running the queue"),
            ("claim", "Working a claim"),
        ]
    ]


@app.get("/api/handlers", operation_id="list_handlers")
def list_handlers() -> list[dict[str, Any]]:
    """List the claims handlers."""
    return claims.list_handlers()


class Step(BaseModel):
    text: str = Field(min_length=1)


class Decision(BaseModel):
    decision: Literal["approve", "decline", "refer"]
    payout: float = Field(
        ge=0, description="The amount to pay in US dollars, 0 unless approved"
    )
    reason: str = Field(min_length=1, description="Two or three sentences")
    policy_section: str = Field(
        min_length=1,
        description="Such as '3. Trip Delay' or 'Claims manual 9. Repeat claims'",
    )


class Payment(BaseModel):
    amount: float = Field(gt=0, description="The approved payout in US dollars")


class SignOff(BaseModel):
    handler_id: str


class Release(BaseModel):
    reason: str = Field(min_length=1, description="What went wrong")


@app.post("/api/claims/{claim_id}/start", operation_id="start_claim")
def start_claim(claim_id: str) -> dict[str, Any]:
    """Start work on a waiting claim."""
    return claims.start_claim(claim_id)


@app.post("/api/claims/{claim_id}/steps", operation_id="add_step")
def add_step(claim_id: str, step: Step) -> dict[str, str]:
    """Record a step the agent took on a claim."""
    return claims.add_step(claim_id, step.text)


@app.get("/api/claims/{claim_id}/steps", operation_id="list_steps")
def list_steps(claim_id: str) -> list[dict[str, str]]:
    """List the steps the agent took on a claim, in order."""
    return claims.list_steps(claim_id)


@app.post("/api/claims/{claim_id}/decision", operation_id="record_decision")
def record_decision(claim_id: str, decision: Decision) -> dict[str, Any]:
    """Record the decision on a claim in progress, with the payout and reason."""
    return claims.record_decision(claim_id, **decision.model_dump())


@app.post("/api/claims/{claim_id}/pay", operation_id="pay_claim")
def pay_claim(claim_id: str, payment: Payment) -> dict[str, Any]:
    """Pay the approved payout on a claim; over the limit it needs a sign-off."""
    return claims.pay_claim(claim_id, payment.amount)


@app.post("/api/claims/{claim_id}/sign-off", operation_id="sign_off_claim")
def sign_off_claim(claim_id: str, sign_off: SignOff) -> dict[str, Any]:
    """Sign off a payout over the limit as a handler, which releases the payment."""
    return claims.sign_off_claim(claim_id, sign_off.handler_id)


@app.post("/api/claims/{claim_id}/release", operation_id="release_claim")
def release_claim(claim_id: str, release: Release) -> dict[str, Any]:
    """Put a claim that failed back in the queue, or after two failures leave it."""
    return claims.release_claim(claim_id, release.reason)


class Run(BaseModel):
    cap: int = Field(ge=1, description="The most claims the run may work")


class RunClaim(BaseModel):
    claim_id: str


class Todo(BaseModel):
    content: str = Field(min_length=1)
    status: Literal["to_do", "in_progress", "done", "for_handler"]


class Todos(BaseModel):
    todos: list[Todo]


class Finish(BaseModel):
    summary: str = Field(min_length=1, description="A short summary for the handlers")


@app.post("/api/queue/work", operation_id="work_queue")
def work_queue(run: Run) -> dict[str, Any]:
    """Start a run of the agent over the queue, capped at a number of claims."""
    return worker.work_queue(run.cap)


@app.get("/api/runs/current", operation_id="get_current_run")
def get_current_run() -> dict[str, Any] | None:
    """Get the latest run with its to-do list, or null before the first."""
    return runs.current_run()


@app.post("/api/runs/{run_id}/claims", operation_id="add_run_claim")
def add_run_claim(run_id: int, run_claim: RunClaim) -> dict[str, Any]:
    """Count a claim against the run's cap before working it."""
    return runs.add_run_claim(run_id, run_claim.claim_id)


@app.put("/api/runs/{run_id}/todos", operation_id="write_todos")
def write_todos(run_id: int, todos: Todos) -> dict[str, Any]:
    """Replace the run's to-do list."""
    return runs.write_todos(run_id, [todo.model_dump() for todo in todos.todos])


@app.post("/api/runs/{run_id}/finish", operation_id="finish_run")
def finish_run(run_id: int, finish: Finish) -> dict[str, Any]:
    """Finish the run with a summary, once no claim is waiting within its cap."""
    return runs.finish_run(run_id, finish.summary)
