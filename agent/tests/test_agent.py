from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from agent import __main__ as cli
from agent import main
from backend.main import app


class StubModel(GenericFakeChatModel):
    """A chat model that gives scripted replies in place of a real model."""

    def bind_tools(self, tools, **kwargs):
        return self


@pytest.fixture
def api(tmp_path, monkeypatch):
    """The backend on a fresh database, which the agent reaches in place of HTTP."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(main, "backend", lambda: TestClient(app))
    with TestClient(app) as client:
        yield client


def tool_call(name, **args):
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": name}])


def decide(claim_id, decision, payout):
    return tool_call(
        "record_decision",
        claim_id=claim_id,
        decision=decision,
        payout=payout,
        reason="The reason.",
        policy_section="3. Trip Delay",
    )


def stub(*replies):
    return StubModel(messages=iter(replies))


def steps(api, claim_id):
    return [step["text"] for step in api.get(f"/api/claims/{claim_id}/steps").json()]


def test_approve_and_pay(api):
    reply = main.run(
        "CLM-1001",
        "thread-1",
        stub(
            tool_call("get_claim", claim_id="CLM-1001"),
            tool_call("get_policy", policy_id="POL-2001"),
            tool_call("get_claim_history", customer_id="CUS-3001"),
            tool_call("get_policy_wording"),
            decide("CLM-1001", "approve", 420),
            tool_call("pay_claim", claim_id="CLM-1001", amount=420),
            AIMessage(content="Approved and paid $420.00."),
        ),
    )
    assert reply == "Approved and paid $420.00."
    claim = api.get("/api/claims/CLM-1001").json()
    assert claim["status"] == "decided"
    assert claim["decision"] == "approve"
    assert claim["paid_amount"] == 420
    assert steps(api, "CLM-1001") == [
        "Reading the claim",
        "Reading policy POL-2001",
        "Reading the customer's claim history",
        "Reading the policy wording",
        "Recording the decision: approve, payout $420.00",
        "Decision recorded",
        "Paying $420.00",
        "Payment made",
        "Approved and paid $420.00.",
    ]


def test_payment_over_the_limit_is_refused(api):
    main.run(
        "CLM-1002",
        "thread-2",
        stub(
            decide("CLM-1002", "approve", 1500),
            tool_call("pay_claim", claim_id="CLM-1002", amount=1500),
            AIMessage(content="Approved; the payment waits for sign-off."),
        ),
    )
    claim = api.get("/api/claims/CLM-1002").json()
    assert claim["status"] == "awaiting_signoff"
    assert claim["paid_amount"] is None
    assert steps(api, "CLM-1002")[3] == (
        "Refused: A payout over $1,000.00 waits for a handler's sign-off."
    )


def test_decline(api):
    main.run(
        "CLM-1003",
        "thread-3",
        stub(decide("CLM-1003", "decline", 0), AIMessage(content="Declined.")),
    )
    claim = api.get("/api/claims/CLM-1003").json()
    assert claim["status"] == "decided"
    assert claim["decision"] == "decline"
    assert claim["payout"] == 0


def test_the_agent_reads_its_instructions_from_the_api(api, monkeypatch):
    seen = []

    def create_agent(model, tools, system_prompt):
        seen.append(system_prompt)
        return SimpleNamespace(stream=lambda *args, **kwargs: [])

    monkeypatch.setattr(main, "create_agent", create_agent)
    main.run("CLM-1001", "thread-4", stub())
    assert seen == [api.get("/api/instructions").json()["text"]]
    assert api.get("/api/claims/CLM-1001").json()["status"] == "in_progress"


def test_the_agent_cannot_sign_off_or_start_claims():
    names = {t.name for t in main.TOOLS}
    assert names == {
        "get_claim",
        "get_policy",
        "get_claim_history",
        "get_policy_wording",
        "record_decision",
        "pay_claim",
    }


def test_cli(api, monkeypatch, capsys):
    monkeypatch.setattr(cli, "run", lambda claim_id, thread_id: f"{claim_id} done")
    cli.main("CLM-1001")
    assert capsys.readouterr().out == "CLM-1001 done\n"


def test_model_name(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("MODEL_NAME", raising=False)
    assert main.model().model_name == "openai/gpt-6-luna"
    monkeypatch.setenv("MODEL_NAME", "openrouter/free")
    assert main.model().model_name == "openrouter/free"
