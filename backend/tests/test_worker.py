import threading

from backend import claims, worker


def wait_for_the_queue():
    with worker.lock:
        pass


def decline(claim_id, thread_id):
    claims.start_claim(claim_id)
    claims.record_decision(claim_id, "decline", 0, "Not covered.", "9. General")
    return f"{claim_id}: decline"


def test_every_waiting_claim_is_worked_once_in_order(client, monkeypatch):
    worked = []

    def work_claim(claim_id, thread_id):
        assert thread_id.startswith(f"{claim_id}-")
        worked.append(claim_id)
        return decline(claim_id, thread_id)

    monkeypatch.setattr(worker, "work_claim", work_claim)
    decline("CLM-1001", "earlier")
    assert client.post("/api/queue/work").json() == {"claims": 24}
    wait_for_the_queue()
    assert worked == [f"CLM-{n}" for n in range(1002, 1026)]
    assert {c["status"] for c in client.get("/api/claims").json()} == {"decided"}


def test_the_queue_is_worked_once_at_a_time(client, monkeypatch):
    release = threading.Event()
    monkeypatch.setattr(
        worker, "work_claim", lambda claim_id, thread_id: release.wait()
    )
    client.post("/api/queue/work")
    response = client.post("/api/queue/work")
    assert response.status_code == 409
    assert "already being worked" in response.json()["detail"]
    release.set()
    wait_for_the_queue()
