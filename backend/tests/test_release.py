from fastapi.testclient import TestClient

from backend.main import app


def release(client, claim_id, reason="The model timed out"):
    return client.post(f"/api/claims/{claim_id}/release", json={"reason": reason})


def steps(client, claim_id):
    return [s["text"] for s in client.get(f"/api/claims/{claim_id}/steps").json()]


def test_a_first_failure_goes_back_in_the_queue(client):
    client.post("/api/claims/CLM-1001/start")
    found = release(client, "CLM-1001").json()
    assert (found["status"], found["failures"]) == ("waiting", 1)
    assert steps(client, "CLM-1001") == ["Back in the queue: The model timed out"]


def test_a_second_failure_is_left_for_a_handler(client):
    client.post("/api/claims/CLM-1001/start")
    release(client, "CLM-1001")
    client.post("/api/claims/CLM-1001/start")
    found = release(client, "CLM-1001").json()
    assert (found["status"], found["failures"]) == ("for_handler", 2)
    assert steps(client, "CLM-1001") == [
        "Back in the queue: The model timed out",
        "Attempt 2",
        "Left for a handler: The model timed out",
    ]
    assert client.post("/api/claims/CLM-1001/start").status_code == 409
    summary = client.get("/api/claims").json()[0]
    assert summary["status"] == "for_handler"


def test_only_a_claim_in_progress_is_released(client):
    assert release(client, "CLM-1001").status_code == 409
    client.post("/api/claims/CLM-1003/start")
    client.post(
        "/api/claims/CLM-1003/decision",
        json={
            "decision": "decline",
            "payout": 0,
            "reason": "Not covered.",
            "policy_section": "9. General exclusions",
        },
    )
    response = release(client, "CLM-1003")
    assert response.status_code == 409
    assert "not in progress" in response.json()["detail"]
    assert client.get("/api/claims/CLM-1003").json()["status"] == "decided"
    assert release(client, "CLM-9999").status_code == 404
    assert release(client, "CLM-1001", "").status_code == 422


def test_a_restart_releases_claims_left_in_progress(client):
    client.post("/api/claims/CLM-1001/start")
    with TestClient(app):
        pass
    found = client.get("/api/claims/CLM-1001").json()
    assert (found["status"], found["failures"]) == ("waiting", 1)
    assert steps(client, "CLM-1001") == [
        "Back in the queue: The server restarted while the agent worked it."
    ]
