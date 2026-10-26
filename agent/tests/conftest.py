from contextlib import nullcontext

import pytest
from fastapi.testclient import TestClient

from agent import claim, main
from backend.main import app


@pytest.fixture
def api(tmp_path, monkeypatch):
    """The backend on a fresh database, which the agent reaches in place of HTTP."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(claim, "RETRY_DELAY", 0)
    with TestClient(app) as client:
        for module in [main, claim]:
            monkeypatch.setattr(module, "backend", lambda: nullcontext(client))
        yield client
