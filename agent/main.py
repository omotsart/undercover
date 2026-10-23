"""The UnderCover Agent, which decides claims through the backend's API."""

import os
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

load_dotenv(override=True)

BACKEND_URL = "http://localhost:8000"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-6-luna"

STEPS = {
    "get_claim": "Reading the claim",
    "get_policy": "Reading policy {policy_id}",
    "get_claim_history": "Reading the customer's claim history",
    "get_policy_wording": "Reading the policy wording",
    "record_decision": "Recording the decision: {decision}, payout ${payout:,.2f}",
    "pay_claim": "Paying ${amount:,.2f}",
}
OUTCOMES = {"record_decision": "Decision recorded", "pay_claim": "Payment made"}


def backend() -> httpx.Client:
    """Return a client for the UnderCover backend."""
    return httpx.Client(base_url=BACKEND_URL, timeout=30)


def call(method: str, path: str, body: dict[str, Any] | None = None) -> str:
    """Call the backend and return its reply, or why it refused, for the model."""
    with backend() as client:
        response = client.request(method, path, json=body)
    if response.is_error:
        return f"Refused: {response.json()['detail']}"
    return response.text


@tool
def get_claim(claim_id: str) -> str:
    """Get a claim in full: the story, the items claimed and the documents."""
    return call("GET", f"/api/claims/{claim_id}")


@tool
def get_policy(policy_id: str) -> str:
    """Get a policy: the plan, add-ons, purchase date, trip and travelers."""
    return call("GET", f"/api/policies/{policy_id}")


@tool
def get_claim_history(customer_id: str) -> str:
    """Get the claims a customer made before this one."""
    return call("GET", f"/api/customers/{customer_id}/history")


@tool
def get_policy_wording() -> str:
    """Get the policy wording, the contract that every decision follows."""
    return call("GET", "/api/policy-wording")


@tool
def record_decision(
    claim_id: str,
    decision: Literal["approve", "decline", "refer"],
    payout: float,
    reason: str,
    policy_section: str,
) -> str:
    """Record your decision with the payout in dollars (0 unless approved), a reason
    of two or three sentences, and the policy section it rests on."""
    body = {
        "decision": decision,
        "payout": payout,
        "reason": reason,
        "policy_section": policy_section,
    }
    return call("POST", f"/api/claims/{claim_id}/decision", body)


@tool
def pay_claim(claim_id: str, amount: float) -> str:
    """Pay the approved payout on a claim."""
    return call("POST", f"/api/claims/{claim_id}/pay", {"amount": amount})


TOOLS = [
    get_claim,
    get_policy,
    get_claim_history,
    get_policy_wording,
    record_decision,
    pay_claim,
]


def model() -> ChatOpenAI:
    """Return the model named in MODEL_NAME, or GPT-6 Luna by default."""
    name = os.getenv("MODEL_NAME")
    return ChatOpenAI(
        model=name or DEFAULT_MODEL,
        base_url=OPENROUTER_BASE_URL,
        api_key=SecretStr(os.environ["OPENROUTER_API_KEY"]),
        reasoning_effort=None if name else "low",
    )


def describe(message: BaseMessage) -> list[str]:
    """Return the steps a message shows, in words a handler can follow."""
    if isinstance(message, ToolMessage):
        if message.text.startswith("Refused"):
            return [str(message.text)]
        return [OUTCOMES[message.name]] if message.name in OUTCOMES else []
    steps = [str(message.text)] if message.text else []
    if isinstance(message, AIMessage):
        steps += [
            STEPS.get(tool_call["name"], tool_call["name"]).format(**tool_call["args"])
            for tool_call in message.tool_calls
        ]
    return steps


def run(claim_id: str, thread_id: str, llm: BaseChatModel | None = None) -> str:
    """Run the agent on one claim, reporting its steps, and return its final reply."""
    with backend() as client:
        instructions = client.get("/api/instructions").raise_for_status().json()
        client.post(f"/api/claims/{claim_id}/start").raise_for_status()
        agent = create_agent(
            llm or model(), tools=TOOLS, system_prompt=instructions["text"]
        )
        reply = ""
        for update in agent.stream(
            {"messages": [{"role": "user", "content": f"Decide claim {claim_id}."}]},
            config={"configurable": {"thread_id": thread_id}},
            stream_mode="updates",
        ):
            for node in update.values():
                for message in node["messages"]:
                    for step in describe(message):
                        client.post(
                            f"/api/claims/{claim_id}/steps", json={"text": step}
                        ).raise_for_status()
                    reply = message.text
    return reply
