import threading

from fastapi.testclient import TestClient

from backend import claims, runs, worker
from backend.main import app


def wait_for_the_run():
    with worker.lock:
        pass


def test_one_run_at_a_time(client, monkeypatch):
    release = threading.Event()
    monkeypatch.setattr(worker, "run_queue", lambda run_id, cap: release.wait())
    client.post("/api/queue/work", json={"cap": 5})
    response = client.post("/api/queue/work", json={"cap": 5})
    assert response.status_code == 409
    assert "already being worked" in response.json()["detail"]
    release.set()
    wait_for_the_run()


def test_a_run_left_running_in_the_database_is_refused(client):
    runs.create_run(5)
    response = client.post("/api/queue/work", json={"cap": 5})
    assert response.status_code == 409
    assert worker.lock.acquire(blocking=False)
    worker.lock.release()


def test_a_run_that_fails_is_stopped_and_releases_its_claim(client, monkeypatch):
    def run_queue(run_id, cap):
        claims.start_claim("CLM-1001")
        raise RuntimeError("The provider is down")

    monkeypatch.setattr(worker, "run_queue", run_queue)
    client.post("/api/queue/work", json={"cap": 5})
    wait_for_the_run()
    current = client.get("/api/runs/current").json()
    assert (current["status"], current["summary"]) == (
        "stopped",
        "The run stopped: The provider is down",
    )
    assert client.get("/api/claims/CLM-1001").json()["status"] == "waiting"


def test_a_run_the_agent_never_finished_is_stopped(client, monkeypatch):
    monkeypatch.setattr(worker, "run_queue", lambda run_id, cap: None)
    client.post("/api/queue/work", json={"cap": 5})
    wait_for_the_run()
    current = client.get("/api/runs/current").json()
    assert (current["status"], current["summary"]) == (
        "stopped",
        "The agent ended without finishing the run.",
    )


def test_a_restart_stops_the_run(client):
    runs.create_run(5)
    with TestClient(app):
        pass
    current = client.get("/api/runs/current").json()
    assert (current["status"], current["summary"]) == (
        "stopped",
        "The server restarted during the run.",
    )
