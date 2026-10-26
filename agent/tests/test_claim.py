from types import SimpleNamespace

from langchain_core.messages import AIMessage

from agent import __main__ as cli
from agent import claim, main
from agent.tests.stubs import decide, steps, stub, tool_call


def test_approve_and_pay(api):
    reply = claim.run(
        "CLM-1001",
        "thread-1",
        stub(
            tool_call("get_claim", claim_id="CLM-1001"),
            tool_call("get_policy", policy_id="POL-2001"),
            tool_call("get_claim_history", customer_id="CUS-3001"),
            tool_call("search_documents", query="meals without receipts"),
            tool_call("read_section", document="claims_manual", section="10"),
            tool_call("read_section", document="policy_wording", section="10"),
            decide("CLM-1001", "approve", 420),
            tool_call("pay_claim", claim_id="CLM-1001", amount=420),
            AIMessage(content="Approved and paid $420.00."),
        ),
    )
    assert reply == "Approved and paid $420.00."
    found = api.get("/api/claims/CLM-1001").json()
    assert found["status"] == "decided"
    assert found["decision"] == "approve"
    assert found["paid_amount"] == 420
    assert steps(api, "CLM-1001") == [
        "Reading the claim",
        "Reading policy POL-2001",
        "Reading the customer's claim history",
        'Searching the documents for "meals without receipts"',
        "Read the claims manual, 10. Meals without receipts",
        "Read the policy wording, 10. How we work out your payment",
        "Recording the decision: approve, payout $420.00",
        "Decision recorded",
        "Paying $420.00",
        "Payment made",
        "Approved and paid $420.00.",
    ]


def test_an_unknown_section_is_refused(api):
    claim.run(
        "CLM-1001",
        "thread-1",
        stub(
            tool_call("read_section", document="claims_manual", section="99"),
            AIMessage(content="I'll stop here."),
        ),
    )
    assert "Refused: Section 99 of claims_manual not found" in steps(api, "CLM-1001")


def test_blank_text_before_a_tool_call_is_not_a_step(api):
    claim.run(
        "CLM-1001",
        "thread-1",
        stub(
            AIMessage(
                content="\n\n",
                tool_calls=[
                    {"name": "get_claim", "args": {"claim_id": "CLM-1001"}, "id": "1"}
                ],
            ),
            AIMessage(content="Done."),
        ),
    )
    assert steps(api, "CLM-1001") == ["Reading the claim", "Done."]


def test_the_search_reaches_the_manual(api):
    found = claim.search_documents.invoke({"query": "monkey"})
    assert '"title":"7. Interpretation notes"' in found


def test_payment_over_the_limit_is_refused(api):
    claim.run(
        "CLM-1002",
        "thread-2",
        stub(
            decide("CLM-1002", "approve", 1500),
            tool_call("pay_claim", claim_id="CLM-1002", amount=1500),
            AIMessage(content="Approved; the payment waits for sign-off."),
        ),
    )
    found = api.get("/api/claims/CLM-1002").json()
    assert found["status"] == "awaiting_signoff"
    assert found["paid_amount"] is None
    assert steps(api, "CLM-1002")[3] == (
        "Refused: A payout over $1,000.00 waits for a handler's sign-off."
    )


def test_decline(api):
    claim.run(
        "CLM-1003",
        "thread-3",
        stub(decide("CLM-1003", "decline", 0), AIMessage(content="Declined.")),
    )
    found = api.get("/api/claims/CLM-1003").json()
    assert found["status"] == "decided"
    assert found["decision"] == "decline"
    assert found["payout"] == 0


def test_the_agent_reads_its_instructions_and_the_contents(api, monkeypatch):
    seen = []

    def create_agent(model, tools, system_prompt):
        def stream(state, **kwargs):
            seen.append(state["messages"][0]["content"])
            return []

        seen.append(system_prompt)
        return SimpleNamespace(stream=stream)

    monkeypatch.setattr(claim, "create_agent", create_agent)
    claim.run("CLM-1001", "thread-4", stub())
    instructions = {i["name"]: i["text"] for i in api.get("/api/instructions").json()}
    assert seen[0] == instructions["claim"]
    assert seen[1].startswith("Decide claim CLM-1001.")
    assert "- 9. Repeat claims" in seen[1]
    assert "(`claims_manual`)" in seen[1]
    assert api.get("/api/claims/CLM-1001").json()["status"] == "in_progress"


def test_the_agent_looks_things_up_and_cannot_sign_off_or_start_claims():
    assert {t.name for t in claim.TOOLS} == {
        "get_claim",
        "get_policy",
        "get_claim_history",
        "search_documents",
        "read_section",
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
    assert main.model().model_name == "deepseek/deepseek-v4.1-flash"
    assert main.model().reasoning_effort == "low"
    monkeypatch.setenv("MODEL_NAME", "openrouter/free")
    assert main.model().model_name == "openrouter/free"
