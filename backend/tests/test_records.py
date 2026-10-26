from pathlib import Path

from backend import db, seed
from backend.main import app


def test_list_claims(client):
    claims = client.get("/api/claims").json()
    assert len(claims) == 25
    assert {claim["status"] for claim in claims} == {"waiting"}
    assert claims[0] == {
        "claim_id": "CLM-1001",
        "customer_name": "Maya Patel",
        "claim_type": "trip_delay",
        "submitted_on": "2026-06-24",
        "amount_claimed": 420.0,
        "status": "waiting",
        "decision": None,
        "payout": None,
        "paid_amount": None,
    }


def test_get_claim(client):
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["story"].startswith("My flight home from Rome")
    assert len(claim["items"]) == 3
    assert len(claim["documents"]) == 4
    assert claim["status"] == "waiting"
    assert claim["decision"] is None


def test_unknown_records(client):
    for path in [
        "/api/claims/CLM-9999",
        "/api/policies/POL-9999",
        "/api/customers/CUS-9999/history",
    ]:
        response = client.get(path)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"]


def test_get_policy(client):
    policy = client.get("/api/policies/POL-2001").json()
    assert policy["plan"] == "premium"
    assert policy["travelers"] == ["Maya Patel"]


def test_claim_history_leaves_out_personal_details(client):
    history = client.get("/api/customers/CUS-3001/history").json()
    assert history["name"] == "Maya Patel"
    assert [c["claim_id"] for c in history["previous_claims"]] == ["CLM-0412"]
    assert set(history) == {"customer_id", "name", "previous_claims"}


def test_the_whole_wording_is_no_longer_handed_out(client):
    assert client.get("/api/policy-wording").status_code == 404


def test_instructions(client):
    instructions = client.get("/api/instructions").json()
    assert [(i["name"], i["title"]) for i in instructions] == [
        ("queue", "Running the queue"),
        ("claim", "Working a claim"),
    ]
    assert all("UnderCover Agent" in i["text"] for i in instructions)


def test_handlers(client):
    handlers = client.get("/api/handlers").json()
    assert [h["name"] for h in handlers] == [
        "Dana Whitfield",
        "Marcus Oyelaran",
        "Priya Raman",
    ]


def test_every_operation_is_documented():
    for path in app.openapi()["paths"].values():
        for operation in path.values():
            assert operation["operationId"]
            assert operation["description"].count("\n") == 0
            for parameter in operation.get("parameters", []):
                assert parameter["required"]


def test_seed_resets_the_database(client, capsys):
    with db.connect() as conn:
        conn.execute("UPDATE claims SET status = 'decided'")
    seed.main()
    assert client.get("/api/claims/CLM-1001").json()["status"] == "waiting"
    assert "Seeded" in capsys.readouterr().out


def test_seeding_never_reads_the_evals(client, monkeypatch):
    read = []
    read_text = Path.read_text

    def spy(self, *args, **kwargs):
        read.append(self)
        return read_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", spy)
    db.reset_db()
    assert read
    assert all("evals" not in path.parts for path in read)
