"""The UnderCover backend."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

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
