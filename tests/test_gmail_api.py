import pytest
from fastapi.testclient import TestClient

from oscar.api import app, get_history, get_http, get_real_history, get_tokens
from oscar.gmail import TokenStore
from oscar.history import History
from tests.fake_gmail import FakeGmail, connected, message


@pytest.fixture
def setup(tmp_path, monkeypatch):
    real, demo = History(), History()
    fake = FakeGmail([message("m1", "digest@newsletter.example", "Digest", "Top stories. Unsubscribe", labels=("INBOX", "UNREAD", "CATEGORY_PROMOTIONS"))])
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
    assert client.post("/gmail/sync").json() == {"new": 1, "skipped": 0, "done": 0}
    item = client.get("/decisions").json()[0]
    assert item["decision"]["source"] == "gmail" and item["review"] is None
    assert item["decision"]["autonomy_level"] in ("ASK_FIRST", "ESCALATE")
    # What he should have done; the label is worked out from it.
    r = client.post("/reviews", json={"decision_id": item["decision"]["id"], "should_be_level": "PROCEED_SILENTLY",
                                      "should_be_action": "MARK_READ", "why": "preference"})
    assert r.status_code == 200, r.text
    assert client.get("/decisions").json()[0]["review"]["label"] in ("QUESTIONED_TOO_MUCH", "UNNECESSARY_FLAGGING")
    # Something no version of Oscar could do is refused.
    bad = client.post("/reviews", json={"decision_id": item["decision"]["id"], "should_be_level": "PROCEED_SILENTLY",
                                        "should_be_action": "SEND_REPLY"})
    assert bad.status_code == 400
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


def test_shows_the_whole_real_email(setup):
    client, state, real, demo, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    client.post("/gmail/sync")
    decision_id = next(iter(real.decisions))
    body = client.get(f"/emails/{decision_id}/content").json()
    assert "Top stories" in body["text"]
    # Nothing new is stored: only the decision Oscar logged.
    assert len(real.decisions) == 1


def test_no_content_for_demo_emails(setup):
    client, *_ = setup
    assert client.get("/emails/nope/content").status_code == 404


def test_checks_on_its_own(setup, monkeypatch):
    import threading

    import oscar.api as api

    client, state, real, demo, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    fake_client = api.app.dependency_overrides[get_http]()  # made before httpx.Client is swapped out
    monkeypatch.setattr(api, "get_tokens", lambda: state["tokens"])
    monkeypatch.setattr(api, "get_real_history", lambda: real)
    monkeypatch.setattr(api.httpx, "Client", lambda **_: fake_client)

    class Stop(threading.Event):
        calls = 0

        def wait(self, timeout=None):  # first the start-up pause, then stop after one check
            Stop.calls += 1
            return Stop.calls > 1

    api._auto_check(Stop(), 300)
    assert len(real.decisions) == 1
    assert state["tokens"].load()["last_sync"]


def test_auto_check_is_off_in_tests():
    import oscar.api as api

    assert api.auto_check_minutes() == 0


def test_eval_runs_come_from_saved_files(setup):
    client, *_ = setup
    runs = client.get("/evals/runs").json()
    assert runs and all("cases" not in r for r in runs)
    full = client.get(f"/evals/runs/{runs[0]['run_id']}").json()
    assert len(full["cases"]) == full["metrics"]["cases"]
    assert "email" in full["cases"][0] and "rationale" in full["cases"][0]


def test_promo_setting_applies_to_new_emails(setup):
    client, state, real, demo, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    assert client.get("/inbox-settings").json() == {"bulk_action": None}
    assert client.post("/inbox-settings", json={"bulk_action": "ARCHIVE"}).json() == {"bulk_action": "ARCHIVE"}
    client.post("/gmail/sync")
    decision = next(iter(real.decisions.values()))
    assert decision.action.value == "ARCHIVE"  # the newsletter is list mail
    assert client.post("/inbox-settings", json={"bulk_action": "DELETE"}).status_code == 422


def test_recheck_makes_new_decisions_and_keeps_the_old(setup, monkeypatch):
    import oscar.inbox as inbox

    client, state, real, demo, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    client.post("/gmail/sync")
    old = next(iter(real.decisions.values()))
    assert client.post("/gmail/recheck").json() == {"new": 0, "skipped": 0, "done": 0}  # same version: nothing to redo
    monkeypatch.setattr(inbox, "policy_version", lambda: "newer")
    assert client.post("/gmail/recheck").json() == {"new": 1, "skipped": 0, "done": 0}
    redo = [d for d in real.decisions.values() if d.recheck_of == old.id]
    assert len(redo) == 1 and old.id in real.decisions
    assert client.get("/decisions").json()[0]["decision"]["id"] == redo[0].id  # the newest is what's shown
    assert client.get("/reviews/summary").json()["decisions"] == 1  # the re-read isn't counted


def test_new_half_answers_are_refused(setup):
    client, state, real, demo, tmp_path = setup
    state["tokens"] = connected(tmp_path)
    client.post("/gmail/sync")
    d = client.get("/decisions").json()[0]["decision"]
    r = client.post("/reviews", json={"decision_id": d["id"], "label": "INCORRECT_ACTION", "should_be_action": "ARCHIVE"})
    assert r.status_code == 400 and "should have done" in r.json()["detail"]
    assert client.post("/reviews", json={"decision_id": d["id"], "label": "SKIP"}).status_code == 200
