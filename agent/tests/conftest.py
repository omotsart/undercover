import pytest
from fastapi.testclient import TestClient

from agent import claim, main
from backend.main import app


@pytest.fixture
def api(tmp_path, monkeypatch):
    """The backend on a fresh database, which the agent reaches in place of HTTP."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    for module in [main, claim]:
        monkeypatch.setattr(module, "backend", lambda: TestClient(app))
    with TestClient(app) as client:
        yield client
