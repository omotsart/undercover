import threading

from backend import claims, worker


def wait_for_the_queue():
    with worker.lock:
        pass


def decline(claim_id, thread_id):
    claims.start_claim(claim_id)
    claims.record_decision(claim_id, "decline", 0, "Not covered.", "9. General")


def test_every_waiting_claim_is_worked_once_in_order(client, monkeypatch):
    worked = []

    def run(claim_id, thread_id):
        assert thread_id.startswith(f"{claim_id}-")
        worked.append(claim_id)
        decline(claim_id, thread_id)

    monkeypatch.setattr(worker, "run", run)
    decline("CLM-1001", "earlier")
    assert client.post("/api/queue/work").json() == {"claims": 24}
    wait_for_the_queue()
    assert worked == [f"CLM-{n}" for n in range(1002, 1026)]
    assert {c["status"] for c in client.get("/api/claims").json()} == {"decided"}


def test_the_queue_is_worked_once_at_a_time(client, monkeypatch):
    release = threading.Event()
    monkeypatch.setattr(worker, "run", lambda claim_id, thread_id: release.wait())
    client.post("/api/queue/work")
    response = client.post("/api/queue/work")
    assert response.status_code == 409
    assert "already being worked" in response.json()["detail"]
    release.set()
    wait_for_the_queue()


def test_a_failed_run_goes_back_in_the_queue(client, monkeypatch):
    def run(claim_id, thread_id):
        claims.start_claim(claim_id)
        if claim_id == "CLM-1001":
            raise RuntimeError("The model is down")
        if claim_id == "CLM-1002":
            return
        claims.record_decision(claim_id, "refer", 0, "Needs a person.", "11. Claims")

    monkeypatch.setattr(worker, "run", run)
    client.post("/api/queue/work")
    wait_for_the_queue()

    for claim_id, step in [
        ("CLM-1001", "The agent stopped: The model is down"),
        ("CLM-1002", "Back in the queue: the agent made no decision."),
    ]:
        assert client.get(f"/api/claims/{claim_id}").json()["status"] == "waiting"
        steps = [s["text"] for s in client.get(f"/api/claims/{claim_id}/steps").json()]
        assert step in steps
    assert client.get("/api/claims/CLM-1003").json()["status"] == "decided"
