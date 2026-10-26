"""What the UnderCover Agent's queue and claim agents share: the API and the model."""

import os
from typing import Any

import httpx
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

load_dotenv(override=True)

BACKEND_URL = "http://localhost:8000"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash"
MODEL_TIMEOUT = 120


def backend() -> httpx.Client:
    """Return a client for the UnderCover backend."""
    return httpx.Client(base_url=BACKEND_URL, timeout=30)


def call(method: str, path: str, body: dict[str, Any] | None = None) -> str:
    """Call the backend and return its reply, or why it refused, for the model."""
    with backend() as client:
        response = client.request(method, path, json=body)
    if response.is_client_error:
        return f"Refused: {response.json()['detail']}"
    return response.raise_for_status().text


def instructions(name: str) -> str:
    """Return the agent's instructions for the queue or for a claim."""
    with backend() as client:
        found = client.get("/api/instructions").raise_for_status().json()
    return next(item["text"] for item in found if item["name"] == name)


def model() -> ChatOpenAI:
    """Return the model named in MODEL_NAME, or DeepSeek V4.1 Flash by default."""
    name = os.getenv("MODEL_NAME")
    return ChatOpenAI(
        model=name or DEFAULT_MODEL,
        base_url=OPENROUTER_BASE_URL,
        api_key=SecretStr(os.environ["OPENROUTER_API_KEY"]),
        reasoning_effort=None if name else "low",
        timeout=MODEL_TIMEOUT,
    )
