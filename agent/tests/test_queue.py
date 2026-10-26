import json

import pytest
from langchain_core.messages import AIMessage

from agent import queue
from agent.tests.stubs import FailingModel, decide, steps, stub, tool_call
from backend import runs


@pytest.fixture
def run_id(api):
    return lambda cap: runs.create_run(cap)["run_id"]


def claim_models(**scripts):
    """Give each claim agent its next scripted model, by claim id."""
    return lambda claim_id: scripts[claim_id.replace("-", "_")].pop(0)


def declines(claim_id):
    return stub(decide(claim_id, "decline", 0), AIMessage(content="Declined."))


def fails():
    return FailingModel(messages=iter([]), failures=3)


def work(claim_id):
    return tool_call("work_claim", claim_id=claim_id)


def finish():
    return tool_call("finish_run", summary="The run is done.")


def todos(*items):
    return tool_call(
        "write_todos",
        todos=[{"content": content, "status": status} for content, status in items],
    )


def run(api, run_id):
    return api.get("/api/runs/current").json()


def status(api, claim_id):
    return api.get(f"/api/claims/{claim_id}").json()["status"]


def test_the_todo_list_is_stored(api, run_id):
    rid = run_id(1)
    reply = queue.run_queue(
        rid,
        1,
        stub(
            todos(("Work CLM-1004", "to_do"), ("Check for missed claims", "to_do")),
            todos(
                ("Work CLM-1004", "in_progress"), ("Check for missed claims", "to_do")
            ),
            work("CLM-1004"),
            todos(("Work CLM-1004", "done"), ("Check for missed claims", "done")),
            finish(),
            AIMessage(content="One claim declined."),
        ),
        claim_models(CLM_1004=[declines("CLM-1004")]),
    )
    assert reply == "One claim declined."
    current = run(api, rid)
    assert current["todos"] == [
        {"content": "Work CLM-1004", "status": "done"},
        {"content": "Check for missed claims", "status": "done"},
    ]
    assert (current["status"], current["summary"]) == ("finished", "The run is done.")


def test_a_run_works_no_more_than_its_cap(api, run_id):
    rid = run_id(3)
    models = claim_models(
        CLM_1001=[declines("CLM-1001")],
        CLM_1002=[declines("CLM-1002")],
        CLM_1003=[declines("CLM-1003")],
    )
    queue.run_queue(
        rid,
        3,
        stub(
            tool_call("list_waiting_claims"),
            work("CLM-1001"),
            work("CLM-1002"),
            work("CLM-1003"),
            work("CLM-1004"),
            finish(),
            AIMessage(content="Done."),
        ),
        models,
    )
    assert run(api, rid)["claims"] == ["CLM-1001", "CLM-1002", "CLM-1003"]
    statuses = [c["status"] for c in api.get("/api/claims").json()]
    assert statuses.count("decided") == 3
    assert statuses.count("waiting") == 22


def test_a_failed_claim_does_not_stop_the_run_and_is_tried_again(api, run_id):
    rid = run_id(2)
    queue.run_queue(
        rid,
        2,
        stub(
            work("CLM-1001"),
            work("CLM-1002"),
            finish(),
            work("CLM-1001"),
            finish(),
            AIMessage(content="Done."),
        ),
        claim_models(
            CLM_1001=[fails(), declines("CLM-1001")],
            CLM_1002=[declines("CLM-1002")],
        ),
    )
    assert status(api, "CLM-1002") == "decided"
    found = api.get("/api/claims/CLM-1001").json()
    assert (found["status"], found["failures"]) == ("decided", 1)
    assert "Attempt 2" in steps(api, "CLM-1001")
    assert run(api, rid)["status"] == "finished"


def test_a_claim_that_fails_twice_is_left_for_a_handler(api, run_id):
    rid = run_id(1)
    queue.run_queue(
        rid,
        1,
        stub(
            work("CLM-1001"),
            finish(),
            work("CLM-1001"),
            finish(),
            AIMessage(content="Done."),
        ),
        claim_models(CLM_1001=[fails(), fails()]),
    )
    assert status(api, "CLM-1001") == "for_handler"
    assert run(api, rid)["status"] == "finished"


def test_the_run_cannot_finish_with_a_missed_claim(api, run_id):
    rid = run_id(2)
    queue.run_queue(
        rid,
        2,
        stub(
            work("CLM-1001"),
            finish(),
            work("CLM-1002"),
            finish(),
            AIMessage(content="Done."),
        ),
        claim_models(CLM_1001=[declines("CLM-1001")], CLM_1002=[declines("CLM-1002")]),
    )
    current = run(api, rid)
    assert current["claims"] == ["CLM-1001", "CLM-1002"]
    assert current["status"] == "finished"
    assert status(api, "CLM-1002") == "decided"


def test_list_waiting_claims(api, run_id):
    tools = {t.name: t for t in queue.tools(run_id(5), None)}
    waiting = json.loads(tools["list_waiting_claims"].invoke({}))
    assert len(waiting) == 25
    assert waiting[0] == {
        "claim_id": "CLM-1001",
        "claim_type": "trip_delay",
        "amount_claimed": 420.0,
        "submitted_on": "2026-06-24",
    }


def test_tools_report_refusals(api, run_id):
    rid = run_id(5)
    runs.end_run(rid, "stopped", "Stopped.")
    tools = {t.name: t for t in queue.tools(rid, None)}
    refused = f"Refused: Run {rid} is stopped"
    assert tools["write_todos"].invoke({"todos": []}) == refused
    assert tools["work_claim"].invoke({"claim_id": "CLM-1001"}) == refused
    assert tools["finish_run"].invoke({"summary": "Done."}) == refused


def test_the_queue_agent_runs_the_queue_and_decides_nothing(api, run_id):
    assert {t.name for t in queue.tools(run_id(5), None)} == {
        "list_waiting_claims",
        "write_todos",
        "work_claim",
        "finish_run",
    }
