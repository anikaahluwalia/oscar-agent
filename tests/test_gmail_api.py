import pytest
from fastapi.testclient import TestClient

from oscar.api import app, get_history, get_http, get_real_history, get_tokens
from oscar.gmail import TokenStore
from oscar.history import History
from tests.fake_gmail import FakeGmail, connected, message


@pytest.fixture
def setup(tmp_path, monkeypatch):
    real, demo = History(), History()
    fake = FakeGmail([message("m1", "digest@newsletter.example", "Digest", "Top stories. Unsubscribe")])
    state = {"tokens": TokenStore(tmp_path / "token.json")}
    app.dependency_overrides[get_tokens] = lambda: state["tokens"]
    app.dependency_overrides[get_real_history] = lambda: real
    app.dependency_overrides[get_http] = fake.http
    app.dependency_overrides[get_history] = lambda: real if state["tokens"].load() else demo
    yield TestClient(app, headers={"content-type": "application/json"}), state, real, demo, tmp_path
    app.dependency_overrides.clear()


def test_status_before_connecting(setup):
    client, *_ = setup
    status = client.get("/gmail").json()
    assert status["connected"] is False and status["read_only"] is True


def test_start_without_google_keys_says_so(setup, monkeypatch):
    client, *_ = setup
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    r = client.get("/auth/google/start", follow_redirects=False)
    assert "gmail=not_configured" in r.headers["location"]


def test_callback_needs_a_state_we_issued(setup):
    client, *_ = setup
    r = client.get("/auth/google/callback?state=forged&code=x", follow_redirects=False)
    assert r.headers["location"].endswith("/settings?gmail=expired")


def test_sync_review_and_summary(setup):
    client, state, real, demo, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    assert client.post("/gmail/sync").json() == {"new": 1, "skipped": 0}
    item = client.get("/decisions").json()[0]
    assert item["decision"]["source"] == "gmail" and item["review"] is None
    r = client.post("/reviews", json={"decision_id": item["decision"]["id"], "label": "QUESTIONED_TOO_MUCH",
                                      "should_be_level": "PROCEED_SILENTLY"})
    assert r.status_code == 200
    assert client.get("/decisions").json()[0]["review"]["label"] == "QUESTIONED_TOO_MUCH"
    s = client.get("/reviews/summary").json()
    assert s["reviewed"] == 1 and s["agreement"] == 0.0
    # Feedback (what Oscar learns from) is refused on the real inbox.
    assert client.post("/feedback", json={"decision_id": item["decision"]["id"], "kind": "APPROVE"}).status_code == 400


def test_demo_inbox_is_off_while_gmail_is_connected(setup):
    client, state, real, demo, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    assert client.post("/demo/inbox").status_code == 409
    assert client.post("/demo/reset").status_code == 409
    assert real.decisions == {} and demo.decisions == {}


def test_disconnect_keeps_decisions_and_reviews(setup):
    client, state, real, demo, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    client.post("/gmail/sync")
    assert client.post("/gmail/disconnect").json() == {"ok": True}
    assert state["tokens"].load() is None
    assert len(real.decisions) == 1


def test_posts_must_be_json(setup):
    client, *_ = setup
    # What another website could send without asking first: no JSON content type.
    r = client.post("/gmail/disconnect", headers={"content-type": "text/plain"})
    assert r.status_code == 415


def test_unknown_hosts_are_refused(setup):
    client, *_ = setup
    assert client.get("/gmail", headers={"host": "evil.example"}).status_code == 400
