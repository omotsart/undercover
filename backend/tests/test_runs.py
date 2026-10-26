import pytest

from backend import claims, runs


@pytest.fixture
def run(client):
    return runs.create_run(5)


def add(client, run_id, claim_id):
    return client.post(f"/api/runs/{run_id}/claims", json={"claim_id": claim_id})


def finish(client, run_id, summary="Five claims worked."):
    return client.post(f"/api/runs/{run_id}/finish", json={"summary": summary})


def decline(claim_id):
    claims.start_claim(claim_id)
    claims.record_decision(claim_id, "decline", 0, "Not covered.", "9. General")


def test_no_run_before_the_first(client):
    assert client.get("/api/runs/current").json() is None


def test_a_run_takes_claims_up_to_its_cap(client, run):
    run_id = run["run_id"]
    for n in range(1001, 1006):
        assert add(client, run_id, f"CLM-{n}").status_code == 200
    response = add(client, run_id, "CLM-1006")
    assert response.status_code == 409
    assert response.json()["detail"] == (
        "The run has reached its cap of 5 claims, so CLM-1006 stays waiting."
    )
    assert add(client, run_id, "CLM-1003").status_code == 200
    current = client.get("/api/runs/current").json()
    assert current["claims"] == [f"CLM-{n}" for n in range(1001, 1006)]
    assert add(client, run_id, "CLM-9999").status_code == 404
    assert add(client, 99, "CLM-1001").status_code == 404


def test_the_todo_list_is_stored_in_order(client, run):
    todos = [
        {"content": "Work CLM-1004", "status": "done"},
        {"content": "Work CLM-1001", "status": "in_progress"},
        {"content": "Work CLM-1002", "status": "for_handler"},
        {"content": "Check for missed claims", "status": "to_do"},
    ]
    path = f"/api/runs/{run['run_id']}/todos"
    assert client.put(path, json={"todos": todos}).json()["todos"] == todos
    assert client.get("/api/runs/current").json()["todos"] == todos
    unknown = [{"content": "Work CLM-1001", "status": "completed"}]
    assert client.put(path, json={"todos": unknown}).status_code == 422


def test_finishing_checks_for_missed_claims(client, run):
    run_id = run["run_id"]
    response = finish(client, run_id)
    assert response.status_code == 409
    assert response.json()["detail"].startswith(
        "Still waiting within the cap of 5 claims: CLM-1001, CLM-1002,"
    )
    for n in range(1001, 1005):
        add(client, run_id, f"CLM-{n}")
        decline(f"CLM-{n}")
    add(client, run_id, "CLM-1005")
    claims.start_claim("CLM-1005")
    claims.release_claim("CLM-1005", "The model timed out")
    assert finish(client, run_id).json()["detail"] == (
        "Still waiting within the cap of 5 claims: CLM-1005. "
        "Work them before you finish."
    )
    claims.start_claim("CLM-1005")
    claims.release_claim("CLM-1005", "The model timed out")
    finished = finish(client, run_id).json()
    assert (finished["status"], finished["summary"]) == (
        "finished",
        "Five claims worked.",
    )
    assert finished["finished_at"]


def test_a_finished_run_takes_no_more_work(client, run):
    run_id = run["run_id"]
    runs.end_run(run_id, "stopped", "The agent ended without finishing the run.")
    for response in [
        add(client, run_id, "CLM-1001"),
        client.put(f"/api/runs/{run_id}/todos", json={"todos": []}),
        finish(client, run_id),
    ]:
        assert response.status_code == 409
        assert response.json()["detail"] == f"Run {run_id} is stopped"


def test_one_run_at_a_time(client, run):
    with pytest.raises(claims.RefusedError, match="already being worked"):
        runs.create_run(5)


def test_a_run_needs_a_cap_of_at_least_one(client):
    assert client.post("/api/queue/work", json={"cap": 0}).status_code == 422
    assert client.post("/api/queue/work", json={}).status_code == 422
