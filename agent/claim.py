"""The claim agent, which decides one claim through the backend's API."""

import json
from typing import Any, Literal

from langchain.agents import create_agent
from langchain.agents.middleware import (
    AgentMiddleware,
    ModelCallLimitMiddleware,
    ModelRetryMiddleware,
    ToolRetryMiddleware,
)
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.tools import tool

from agent.main import backend, call, instructions, model

RETRIES = 2
RETRY_DELAY = 1.0
MODEL_CALL_LIMIT = 30
PROBLEM_LENGTH = 200

Document = Literal["policy_wording", "claims_manual"]
DOCUMENT_NAMES = {
    "policy_wording": "the policy wording",
    "claims_manual": "the claims manual",
}

STEPS = {
    "get_claim": "Reading the claim",
    "get_policy": "Reading policy {policy_id}",
    "get_claim_history": "Reading the customer's claim history",
    "search_documents": 'Searching the documents for "{query}"',
    "record_decision": "Recording the decision: {decision}, payout ${payout:,.2f}",
    "pay_claim": "Paying ${amount:,.2f}",
}
OUTCOMES = {"record_decision": "Decision recorded", "pay_claim": "Payment made"}


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
def search_documents(query: str) -> str:
    """Find the sections of the policy wording and the claims manual that match a
    few words, such as "wild animals" or "meals without receipts", best first."""
    with backend() as client:
        response = client.get("/api/documents/search", params={"query": query})
    return response.raise_for_status().text


@tool
def read_section(document: Document, section: str) -> str:
    """Read one section of the policy wording or the claims manual in full, by its
    number, such as "10"."""
    return call("GET", f"/api/documents/{document}/sections/{section}")


@tool
def record_decision(
    claim_id: str,
    decision: Literal["approve", "decline", "refer"],
    payout: float,
    reason: str,
    policy_section: str,
) -> str:
    """Record your decision with the payout in dollars (0 unless approved), a reason
    of two or three sentences, and the section it rests on."""
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
    search_documents,
    read_section,
    record_decision,
    pay_claim,
]


def contents() -> str:
    """Return the titles of the sections of both documents, for the first message."""
    with backend() as client:
        found = client.get("/api/documents").raise_for_status().json()
    return "\n\n".join(
        f"{document['title']} (`{document['document']}`):\n"
        + "\n".join(f"- {title}" for title in document["sections"])
        for document in found
    )


def outcome(message: ToolMessage) -> list[str]:
    """Return the step a tool's result shows, if any."""
    if message.text.startswith("Refused"):
        return [str(message.text)]
    if message.name == "read_section" and message.status == "success":
        section = json.loads(message.text)
        return [f"Read {DOCUMENT_NAMES[section['document']]}, {section['title']}"]
    return [OUTCOMES[message.name]] if message.name in OUTCOMES else []


def describe(message: BaseMessage) -> list[str]:
    """Return the steps a message shows, in words a handler can follow."""
    if isinstance(message, ToolMessage):
        return outcome(message)
    steps = [message.text.strip()] if message.text.strip() else []
    if isinstance(message, AIMessage):
        steps += [
            STEPS[tool_call["name"]].format(**tool_call["args"])
            for tool_call in message.tool_calls
            if tool_call["name"] in STEPS
        ]
    return steps


def middleware() -> list[AgentMiddleware[Any, Any, Any]]:
    """Return the claim agent's retries and its limit on model calls."""
    return [
        ModelRetryMiddleware(
            max_retries=RETRIES, on_failure="error", initial_delay=RETRY_DELAY
        ),
        ToolRetryMiddleware(max_retries=RETRIES, initial_delay=RETRY_DELAY),
        ModelCallLimitMiddleware(run_limit=MODEL_CALL_LIMIT, exit_behavior="end"),
    ]


def run(claim_id: str, thread_id: str, llm: BaseChatModel | None = None) -> str:
    """Run the agent on one claim, reporting its steps, and return its final reply."""
    agent = create_agent(
        llm or model(),
        tools=TOOLS,
        system_prompt=instructions("claim"),
        middleware=middleware(),
    )
    task = f"Decide claim {claim_id}.\n\nThe documents you can look up:\n\n{contents()}"
    with backend() as client:
        client.post(f"/api/claims/{claim_id}/start").raise_for_status()
        reply = ""
        for update in agent.stream(
            {"messages": [{"role": "user", "content": task}]},
            config={"configurable": {"thread_id": thread_id}},
            stream_mode="updates",
        ):
            for node in update.values():
                for message in (node or {}).get("messages", []):
                    for step in describe(message):
                        client.post(
                            f"/api/claims/{claim_id}/steps", json={"text": step}
                        ).raise_for_status()
                    reply = message.text
    return reply


def report(claim: dict[str, Any]) -> str:
    """Return the outcome of a claim in one line, from its record."""
    claim_id, decision = claim["claim_id"], claim["decision"]
    if claim["status"] == "for_handler":
        return f"{claim_id}: left for a handler"
    if decision != "approve":
        return f"{claim_id}: {decision}"
    if claim["paid_amount"] is not None:
        payment = "paid"
    elif claim["status"] == "awaiting_signoff":
        payment = "waiting for sign-off"
    else:
        payment = "not paid"
    return f"{claim_id}: approve, ${claim['payout']:,.2f}, {payment}"


def work_claim(claim_id: str, thread_id: str, llm: BaseChatModel | None = None) -> str:
    """Work one claim with a fresh claim agent, put right a failure, and report the
    outcome in one line."""
    problem = "the agent made no decision"
    try:
        run(claim_id, thread_id, llm)
    except Exception as error:  # a failed claim must never stop the run
        problem = (str(error) or type(error).__name__)[:PROBLEM_LENGTH]
    with backend() as client:
        claim = client.get(f"/api/claims/{claim_id}").raise_for_status().json()
        if claim["status"] == "waiting":
            return f"{claim_id}: not started ({problem})"
        if claim["status"] != "in_progress":
            return report(claim)
        claim = (
            client.post(f"/api/claims/{claim_id}/release", json={"reason": problem})
            .raise_for_status()
            .json()
        )
    where = (
        "back in the queue" if claim["status"] == "waiting" else "left for a handler"
    )
    return f"{claim_id}: failed ({problem}), {where}"
