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
    stopped = next(i for i in status["waiting"] if i["level"] == "ESCALATE")
    assert stopped["subject"] == "Overdue" and stopped["thread_id"] == "ab12cd34ef"


def test_the_open_email(setup):
    client, state, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    client.post("/gmail/sync")
    found = client.get("/extension/thread/ab12cd34ef").json()
    assert found["found"] and found["item"]["level"] == "ESCALATE"
    assert found["item"]["answerable"] is False and found["item"]["undoable"] is False  # read-only: nothing to approve
    assert client.get("/extension/thread/0000000000").json() == {"found": False, "item": None}
    assert client.get("/extension/thread/not-a-thread!").status_code == 404
