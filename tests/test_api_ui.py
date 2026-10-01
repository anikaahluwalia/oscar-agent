"""Endpoints used by the web app."""

from oscar.agent import decide
from oscar.history import History
from oscar.models import Email


def test_demo_inbox_and_list(client):
    loaded = client.post("/demo/inbox").json()
    assert len(loaded) == 12
    listed = client.get("/decisions").json()
    assert len(listed) == 12
    assert all(item["feedback"] == [] for item in listed)
    assert listed[0]["decision"]["subject"]


def test_list_includes_feedback(client):
    [newsletter] = [d for d in client.post("/demo/inbox").json() if d["email_id"] == "newsletter"]
    client.post("/feedback", json={"decision_id": newsletter["id"], "kind": "APPROVE"})
    [item] = [i for i in client.get("/decisions").json() if i["decision"]["id"] == newsletter["id"]]
    assert [f["kind"] for f in item["feedback"]] == ["APPROVE"]


def test_reset(client):
    client.post("/demo/inbox")
    client.post("/demo/reset")
    assert client.get("/decisions").json() == []


def test_reset_deletes_saved_files(tmp_path):
    history = History(tmp_path)
    history.add_decision(decide(Email(id="e", sender="s@x.example", subject="hi", body="fyi")))
    history.clear()
    assert History(tmp_path).decisions == {}


def test_cors_allows_the_web_app(client):
    response = client.options("/decisions", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
