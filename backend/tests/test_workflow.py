import pytest

from backend.db import connect


def decide(client, claim_id, decision, payout):
    client.post(f"/api/claims/{claim_id}/start")
    return client.post(
        f"/api/claims/{claim_id}/decision",
        json={
            "decision": decision,
            "payout": payout,
            "reason": "The reason.",
            "policy_section": "3. Trip Delay",
        },
    )


def pay(client, claim_id, amount):
    return client.post(f"/api/claims/{claim_id}/pay", json={"amount": amount})


def test_start_claim(client):
    client.post("/api/claims/CLM-1001/start")
    client.post("/api/claims/CLM-1001/steps", json={"text": "Read the claim"})
    assert client.get("/api/claims/CLM-1001").json()["status"] == "in_progress"
    assert [s["text"] for s in client.get("/api/claims/CLM-1001/steps").json()] == [
        "Read the claim"
    ]
    assert client.post("/api/claims/CLM-1001/start").status_code == 409


def test_steps_on_unknown_claim(client):
    assert client.get("/api/claims/CLM-9999/steps").status_code == 404
    response = client.post("/api/claims/CLM-9999/steps", json={"text": "Hello"})
    assert response.status_code == 404


def test_approve_within_the_limit_and_pay(client):
    assert decide(client, "CLM-1001", "approve", 420).json()["status"] == "decided"
    claim = pay(client, "CLM-1001", 420).json()
    assert claim["status"] == "decided"
    assert claim["decision"] == "approve"
    assert claim["paid_amount"] == 420
    assert claim["paid_at"]


def test_payment_over_the_limit_waits_for_sign_off(client):
    claim = decide(client, "CLM-1002", "approve", 1500).json()
    assert claim["status"] == "awaiting_signoff"

    response = pay(client, "CLM-1002", 1500)
    assert response.status_code == 409
    assert "sign-off" in response.json()["detail"]
    claim = client.get("/api/claims/CLM-1002").json()
    assert claim["status"] == "awaiting_signoff"
    assert claim["paid_amount"] is None

    response = client.post(
        "/api/claims/CLM-1002/sign-off", json={"handler_id": "HND-01"}
    )
    claim = response.json()
    assert claim["status"] == "decided"
    assert claim["paid_amount"] == 1500
    assert claim["signed_off_by"] == "Dana Whitfield"


def test_a_signed_off_claim_is_already_paid(client):
    decide(client, "CLM-1002", "approve", 1500)
    client.post("/api/claims/CLM-1002/sign-off", json={"handler_id": "HND-01"})
    assert pay(client, "CLM-1002", 1500).status_code == 409


@pytest.mark.parametrize(
    ("decision", "payout", "amount", "detail"),
    [
        ("decline", 0, 100, "Only an approved claim"),
        ("refer", 0, 100, "Only an approved claim"),
        ("approve", 420, 500, "The approved payout is $420.00"),
    ],
)
def test_payments_refused(client, decision, payout, amount, detail):
    decide(client, "CLM-1001", decision, payout)
    response = pay(client, "CLM-1001", amount)
    assert response.status_code == 409
    assert detail in response.json()["detail"]


def test_paying_twice_is_refused(client):
    decide(client, "CLM-1001", "approve", 420)
    pay(client, "CLM-1001", 420)
    assert "already paid" in pay(client, "CLM-1001", 420).json()["detail"]


def test_paying_a_waiting_claim_is_refused(client):
    assert pay(client, "CLM-1001", 420).status_code == 409


@pytest.mark.parametrize(
    ("decision", "payout", "detail"),
    [
        ("decline", 100, "has no payout"),
        ("refer", 50, "has no payout"),
        ("approve", 0, "needs a payout"),
    ],
)
def test_decisions_refused(client, decision, payout, detail):
    response = decide(client, "CLM-1001", decision, payout)
    assert response.status_code == 409
    assert detail in response.json()["detail"]


def test_deciding_a_claim_not_in_progress_is_refused(client):
    decide(client, "CLM-1001", "decline", 0)
    response = decide(client, "CLM-1001", "approve", 100)
    assert response.status_code == 409
    assert "not in progress" in response.json()["detail"]


def test_decision_must_be_valid(client):
    client.post("/api/claims/CLM-1001/start")
    response = client.post(
        "/api/claims/CLM-1001/decision",
        json={"decision": "maybe", "payout": 0, "reason": "", "policy_section": ""},
    )
    assert response.status_code == 422


def test_sign_off_refused(client):
    decide(client, "CLM-1001", "approve", 420)
    response = client.post(
        "/api/claims/CLM-1001/sign-off", json={"handler_id": "HND-01"}
    )
    assert response.status_code == 409
    assert "not waiting for sign-off" in response.json()["detail"]

    decide(client, "CLM-1002", "approve", 1500)
    response = client.post(
        "/api/claims/CLM-1002/sign-off", json={"handler_id": "HND-99"}
    )
    assert response.status_code == 404


def test_sign_off_needs_a_handler_who_can_approve_over_the_limit(client):
    with connect() as conn:
        conn.execute(
            "UPDATE handlers SET data = json_set(data, '$.can_approve_over_limit', "
            "json('false')) WHERE handler_id = 'HND-03'"
        )
    decide(client, "CLM-1002", "approve", 1500)
    response = client.post(
        "/api/claims/CLM-1002/sign-off", json={"handler_id": "HND-03"}
    )
    assert response.status_code == 409
    assert "Priya Raman can't sign off" in response.json()["detail"]
