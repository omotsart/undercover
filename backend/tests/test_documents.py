def test_list_sections(client):
    wording, manual = client.get("/api/documents").json()
    assert wording["document"] == "policy_wording"
    assert wording["title"] == "UnderCover Travel Insurance: Policy Wording"
    assert len(wording["sections"]) == 12
    assert wording["sections"][2] == "3. Trip Delay"
    assert manual["document"] == "claims_manual"
    assert len(manual["sections"]) == 14
    assert manual["sections"][8] == "9. Repeat claims"


def test_read_section(client):
    section = client.get("/api/documents/claims_manual/sections/9").json()
    assert section["title"] == "9. Repeat claims"
    assert section["text"].startswith("## 9. Repeat claims\n")
    assert "third claim within any 12 month period" in section["text"]
    assert "## 10." not in section["text"]


def test_unknown_documents_and_sections(client):
    for path in [
        "/api/documents/evals/sections/1",
        "/api/documents/claims_manual/sections/99",
    ]:
        response = client.get(path)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"]


def search(client, query):
    return client.get("/api/documents/search", params={"query": query}).json()


def test_search_finds_the_manual_first(client):
    for query in ["monkey", "wild animal", "a monkey took my bag"]:
        best = search(client, query)[0]
        assert (best["document"], best["title"]) == (
            "claims_manual",
            "7. Interpretation notes",
        )
    assert "Monkeys" in search(client, "monkey")[0]["line"]
    assert search(client, "meals without receipts")[0]["title"] == (
        "10. Meals without receipts"
    )


def test_search_returns_at_most_five_sections(client):
    assert len(search(client, "claim")) == 5
    assert search(client, "zebra crossing") == []
    assert search(client, "the and") == []
