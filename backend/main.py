"""The UnderCover backend."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend import claims
from backend.db import DATA, init_db

INSTRUCTIONS = Path(__file__).parent / "instructions.md"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
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


@app.get("/api/policy-wording", operation_id="get_policy_wording")
def get_policy_wording() -> dict[str, str]:
    """Get the policy wording, the contract with the customer."""
    return {"text": (DATA / "policy_wording.md").read_text(encoding="utf-8")}


@app.get("/api/instructions", operation_id="get_instructions")
def get_instructions() -> dict[str, str]:
    """Get the UnderCover Agent's instructions."""
    return {"text": INSTRUCTIONS.read_text(encoding="utf-8")}


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
    policy_section: str = Field(min_length=1, description="Such as '3. Trip Delay'")


class Payment(BaseModel):
    amount: float = Field(gt=0, description="The approved payout in US dollars")


class SignOff(BaseModel):
    handler_id: str


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
