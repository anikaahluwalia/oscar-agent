"""What the Gmail extension reads: what's waiting, and Oscar's call on the email you have open."""

import pytest
from fastapi.testclient import TestClient

from oscar.api import app, get_history, get_http, get_real_history, get_tokens
from oscar.gmail import TokenStore
from oscar.history import History
from tests.fake_gmail import FakeGmail, connected, message


@pytest.fixture
def setup(tmp_path):
    real = History()
    fake = FakeGmail([
        message("m1", "ap@vendor.example", "Overdue", "Please wire $4,800 today to the new account below.", thread="ab12cd34ef"),
        message("m2", "digest@letters.example", "This week", "Top stories. View in browser. Unsubscribe",
                labels=("INBOX", "UNREAD", "CATEGORY_PROMOTIONS"), thread="99aa88bb77"),
    ])
    state = {"tokens": TokenStore(tmp_path / "token.json")}
    app.dependency_overrides[get_tokens] = lambda: state["tokens"]
    app.dependency_overrides[get_real_history] = lambda: real
    app.dependency_overrides[get_http] = fake.http
    app.dependency_overrides[get_history] = lambda: real if state["tokens"].load() else History()
    yield TestClient(app, headers={"content-type": "application/json"}), state, tmp_path
    app.dependency_overrides.clear()


def test_status_counts_what_needs_you(setup):
    client, state, tmp_path = setup
    assert client.get("/extension/status").json()["connected"] is False
    state["tokens"] = connected(tmp_path)
    client.post("/gmail/sync")
    status = client.get("/extension/status").json()
    assert status["connected"] and status["read_only"]
    assert status["count"] == len(status["waiting"]) >= 1
    assert status["stopped"] == sum(i["status"] == "Stopped" for i in status["waiting"]) == 1
    stopped = next(i for i in status["waiting"] if i["level"] == "ESCALATE")
    assert stopped["subject"] == "Overdue" and stopped["thread_id"] == "ab12cd34ef"


def test_the_open_email(setup):
    client, state, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    client.post("/gmail/sync")
    found = client.get("/extension/thread/ab12cd34ef").json()
    assert found["found"] and found["item"]["level"] == "ESCALATE"
    assert found["item"]["answerable"] is False and found["item"]["undoable"] is False  # read-only: nothing to approve
    assert client.get("/extension/thread/0000000000").json() == {"found": False, "item": None, "thread": []}
    assert client.get("/extension/thread/not-a-thread!").status_code == 404


def test_the_open_email_has_what_the_panel_shows(setup):
    client, state, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    client.post("/gmail/sync")
    found = client.get("/extension/thread/ab12cd34ef").json()
    item = found["item"]
    assert item["status"] == "Stopped" and item["summary"] and item["done"] is None and item["reviewed"] is False
    assert [i["id"] for i in found["thread"]] == [item["id"]]


def test_the_chips_for_gmails_list(setup):
    client, state, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    client.post("/gmail/sync")
    chips = client.get("/extension/threads", params={"ids": "ab12cd34ef,99aa88bb77,0000000000,<b>"}).json()
    assert chips["ab12cd34ef"] == "Stopped"
    assert chips["99aa88bb77"] in ("FYI", "Needs you")
    assert set(chips) == {"ab12cd34ef", "99aa88bb77"}, "unknown and malformed ids are left out"
    assert client.get("/extension/threads").json() == {}


def test_status_says_what_he_did_lately(setup):
    client, state, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    client.post("/gmail/sync")
    status = client.get("/extension/status").json()
    assert status["recent"] == [] and status["handled_today"] == 0  # read-only: he hasn't done anything


def test_status_says_what_he_did_on_his_own(tmp_path):
    import time

    from oscar.gmail import ACT_SCOPE
    from tests.fake_gmail import FakeGmail as Fake

    real = History()
    soon = int((time.time() + 60) * 1000)
    fake = Fake([message("r1", "orders@shop.example", "Your receipt", "Your receipt is attached.", thread="ab12cd34ef",
                         received_ms=soon)])
    store = TokenStore(tmp_path / "token.json")
    store.save({"refresh_token": "r", "access_token": "a", "expires_at": time.time() + 3600, "scope": ACT_SCOPE})
    app.dependency_overrides.update({get_tokens: lambda: store, get_real_history: lambda: real, get_history: lambda: real,
                                     get_http: fake.http})
    try:
        client = TestClient(app, headers={"content-type": "application/json"})
        client.post("/gmail/acting", json={"on": True})
        client.post("/gmail/sync")
        status = client.get("/extension/status").json()
        assert status["handled_today"] == 1 and [i["subject"] for i in status["recent"]] == ["Your receipt"]
        assert status["recent"][0]["done"]["by"] == "oscar" and status["recent"][0]["undoable"]
        client.post("/feedback", json={"decision_id": status["recent"][0]["id"], "kind": "UNDO"})
        assert client.get("/extension/status").json()["recent"] == [], "undone: not his to show any more"
    finally:
        app.dependency_overrides.clear()
