import pytest
from langchain_core.messages import AIMessage

from agent import claim
from agent.tests.stubs import FailingModel, decide, steps, stub, tool_call


def failing(times):
    return FailingModel(messages=iter([AIMessage(content="Never.")]), failures=times)


def status(api, claim_id):
    return api.get(f"/api/claims/{claim_id}").json()["status"]


def test_a_model_that_fails_once_is_retried(api):
    model = FailingModel(
        messages=iter([decide("CLM-1003", "decline", 0), AIMessage(content="Done.")]),
        failures=1,
    )
    assert claim.work_claim("CLM-1003", "t", model) == "CLM-1003: decline"
    assert status(api, "CLM-1003") == "decided"


def test_a_failed_claim_goes_back_in_the_queue(api):
    report = claim.work_claim("CLM-1001", "t", failing(3))
    assert report == "CLM-1001: failed (The model timed out), back in the queue"
    found = api.get("/api/claims/CLM-1001").json()
    assert (found["status"], found["failures"]) == ("waiting", 1)
    assert "Back in the queue: The model timed out" in steps(api, "CLM-1001")


def test_a_claim_that_fails_twice_is_left_for_a_handler(api):
    claim.work_claim("CLM-1001", "t1", failing(3))
    report = claim.work_claim("CLM-1001", "t2", failing(3))
    assert report == "CLM-1001: failed (The model timed out), left for a handler"
    assert status(api, "CLM-1001") == "for_handler"
    assert steps(api, "CLM-1001") == [
        "Back in the queue: The model timed out",
        "Attempt 2",
        "Left for a handler: The model timed out",
    ]
    assert claim.work_claim("CLM-1001", "t3", stub()) == "CLM-1001: left for a handler"
    assert status(api, "CLM-1001") == "for_handler"


def test_a_claim_the_agent_could_not_start_stays_waiting(api, monkeypatch):
    def model():
        raise KeyError("OPENROUTER_API_KEY")

    monkeypatch.setattr(claim, "model", model)
    report = claim.work_claim("CLM-1001", "t")
    assert report == "CLM-1001: not started ('OPENROUTER_API_KEY')"
    found = api.get("/api/claims/CLM-1001").json()
    assert (found["status"], found["failures"]) == ("waiting", 0)


def test_a_claim_agent_that_makes_no_decision_has_failed(api):
    report = claim.work_claim("CLM-1001", "t", stub(AIMessage(content="Hmm.")))
    assert report == "CLM-1001: failed (the agent made no decision), back in the queue"


def test_a_claim_agent_that_loops_is_stopped(api, monkeypatch):
    monkeypatch.setattr(claim, "MODEL_CALL_LIMIT", 3)
    model = stub(*[tool_call("get_claim", claim_id="CLM-1001")] * 5)
    report = claim.work_claim("CLM-1001", "t", model)
    assert report == "CLM-1001: failed (the agent made no decision), back in the queue"
    assert steps(api, "CLM-1001").count("Reading the claim") == 3


def test_a_decided_claim_is_never_released(api):
    model = stub(decide("CLM-1003", "decline", 0))  # then runs out of replies
    assert claim.work_claim("CLM-1003", "t", model) == "CLM-1003: decline"
    found = api.get("/api/claims/CLM-1003").json()
    assert (found["status"], found["failures"]) == ("decided", 0)


@pytest.mark.parametrize(
    ("claim_id", "payout", "pay", "report"),
    [
        ("CLM-1001", 420, True, "CLM-1001: approve, $420.00, paid"),
        ("CLM-1002", 1150, True, "CLM-1002: approve, $1,150.00, waiting for sign-off"),
        ("CLM-1004", 186, False, "CLM-1004: approve, $186.00, not paid"),
    ],
)
def test_reports_on_an_approval(api, claim_id, payout, pay, report):
    replies = [decide(claim_id, "approve", payout)]
    if pay:
        replies.append(tool_call("pay_claim", claim_id=claim_id, amount=payout))
    model = stub(*replies, AIMessage(content="Done."))
    assert claim.work_claim(claim_id, "t", model) == report


def test_report_on_a_referral(api):
    model = stub(decide("CLM-1019", "refer", 0), AIMessage(content="Referred."))
    assert claim.work_claim("CLM-1019", "t", model) == "CLM-1019: refer"


def test_report_on_a_claim_left_for_a_handler():
    found = {"claim_id": "CLM-1001", "status": "for_handler", "decision": None}
    assert claim.report(found) == "CLM-1001: left for a handler"
