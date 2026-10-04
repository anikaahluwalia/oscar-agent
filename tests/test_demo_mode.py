"""Demo mode: each browser gets its own demo (oscar/demo.py), kept apart from the real inbox, and
decided by the real Oscar. Entry, isolation, the real pipeline, starting again, learning and safety,
and the demo emails themselves."""

import inspect
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from oscar import api, demo
from oscar.agent import decide
from oscar.api import app, get_app_settings_path, get_http, get_real_history, get_tokens, not_in_demo
from oscar.gmail import TokenStore
from oscar.history import History
from oscar.models import AutonomyLevel, Email
from oscar.preferences import Preferences
from oscar.understand import Reader

LEVELS = [AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY, AutonomyLevel.ASK_FIRST, AutonomyLevel.ESCALATE]
START = [e for e in demo.emails() if e.arrives == "start"]
LATER = [e for e in demo.emails() if e.arrives == "later"]


@pytest.fixture
def setup(tmp_path, monkeypatch):
    """A real inbox in a scratch folder, its token file, and no demos yet."""
    monkeypatch.setattr(demo, "SESSIONS", demo.Sessions())
    real = History(tmp_path / "real")
    tokens = TokenStore(tmp_path / "token.json")
    app.dependency_overrides[get_tokens] = lambda: tokens
    app.dependency_overrides[get_real_history] = lambda: real
    yield TestClient(app, headers={"content-type": "application/json"}), tokens, real
    app.dependency_overrides.clear()


def in_demo(session: str = "browser-one") -> TestClient:
    return TestClient(app, headers={"content-type": "application/json", "X-Oscar-Demo": session})


def by_email(decisions: list[dict]) -> dict[str, dict]:
    """The latest decision on each email."""
    out = {}
    for d in sorted(decisions, key=lambda d: d["created_at"]):
        out[d["email_id"]] = d
    return out


def listed(client: TestClient) -> dict[str, dict]:
    return by_email([item["decision"] for item in client.get("/decisions").json()])


def teach_like_this(client: TestClient, decision: dict) -> dict:
    """The rule menu's "always do this for emails like this", as What Oscar knows sends it."""
    r = client.post("/feedback", json={"decision_id": decision["id"], "kind": "ALWAYS_DO_THIS", "scope": "kind",
                                       "desired_level": "PROCEED_SILENTLY"})
    assert r.status_code == 200, r.text
    return r.json()


def connect(tokens: TokenStore) -> None:
    tokens.save({"refresh_token": "r", "access_token": "a", "expires_at": 9e9, "address": "me@example.com"})


# --- Entry -------------------------------------------------------------------------------------

def test_the_demo_works_without_gmail(setup):
    client = in_demo()
    started = client.post("/demo/start")
    assert started.status_code == 200
    assert {d["email_id"] for d in started.json()} == {e.email.id for e in START}
    assert set(listed(client)) == {e.email.id for e in START}
    status = client.get("/gmail").json()
    assert status["demo"] is True and status["connected"] is False and status["address"] is None


def test_the_demo_still_works_with_gmail_connected(setup):
    client, tokens, real = setup
    connect(tokens)
    demo_client = in_demo()
    assert demo_client.post("/demo/start").status_code == 200
    assert demo_client.get("/gmail").json() | {"configured": None} == {
        "configured": None, "connected": False, "demo": True, "only_demo": False, "address": None, "name": None, "picture": None,
        "connected_at": None, "last_sync": None, "auto_check_minutes": 0, "rethinking": False, "can_draft": False,
        "can_act": False, "acting": False, "read_only": False}
    # Without the header it's the real connection, as before.
    status = client.get("/gmail").json()
    assert status["demo"] is False and status["connected"] is True and status["address"] == "me@example.com"


def test_start_and_check_are_only_for_the_demo(setup):
    client, *_ = setup
    assert client.post("/demo/start").status_code == 400
    assert client.post("/demo/check").status_code == 400


@pytest.mark.parametrize("session", ["", "short", "has spaces in it", "a" * 65, "semi;colon1"])
def test_a_bad_session_id_is_refused_not_ignored(setup, session):
    client, tokens, real = setup
    connect(tokens)
    real.add_decision(decide(Email(id="r1", sender="boss@work.example", subject="Real", body="fyi")))
    r = in_demo(session).get("/decisions")
    assert r.status_code == 400  # never quietly the real inbox


# --- Isolation ---------------------------------------------------------------------------------

def test_teaching_in_the_demo_never_reaches_the_real_inbox(setup, tmp_path):
    client, tokens, real = setup
    connect(tokens)
    real.add_decision(decide(Email(id="r1", sender="boss@work.example", subject="Real", body="fyi")))
    before = {p.name: p.read_text() for p in (tmp_path / "real").iterdir()}
    demo_client = in_demo()
    evergreen = by_email(demo_client.post("/demo/start").json())["demo_promo_evergreen"]
    teach_like_this(demo_client, evergreen)
    demo_client.post("/demo/check")
    assert real.feedback == [] and list(real.decisions) == list(History(tmp_path / "real").decisions)
    assert {p.name: p.read_text() for p in (tmp_path / "real").iterdir()} == before
    assert client.get("/learned").json() == []


def test_starting_the_demo_again_leaves_the_real_inbox_and_token_alone(setup, tmp_path):
    client, tokens, real = setup
    connect(tokens)
    real.add_decision(decide(Email(id="r1", sender="boss@work.example", subject="Real", body="fyi")))
    token_before = (tmp_path / "token.json").read_text()
    assert isinstance(in_demo().post("/demo/reset").json(), list)
    assert (tmp_path / "token.json").read_text() == token_before
    assert [d.email_id for d in real.decisions.values()] == ["r1"]
    assert [d.email_id for d in History(tmp_path / "real").decisions.values()] == ["r1"]


def test_real_decisions_never_show_in_a_demo(setup):
    client, tokens, real = setup
    connect(tokens)
    real.add_decision(decide(Email(id="r1", sender="boss@work.example", subject="Real", body="fyi")))
    demo_client = in_demo()
    assert demo_client.get("/decisions").json() == []
    demo_client.post("/demo/start")
    assert "r1" not in listed(demo_client)
    assert set(listed(client)) == {"r1"}  # and the real inbox has only its own


def test_two_demos_never_see_each_other(setup):
    one, two = in_demo("browser-one"), in_demo("browser-two")
    evergreen = by_email(one.post("/demo/start").json())["demo_promo_evergreen"]
    teach_like_this(one, evergreen)
    assert two.get("/decisions").json() == [] and two.get("/learned").json() == []
    two.post("/demo/start")
    assert two.get("/learned").json() == []
    assert one.get("/learned").json() != []
    assert one.post("/feedback", json={"decision_id": listed(two)["demo_friend_dinner"]["id"], "kind": "APPROVE"}).status_code == 404


def test_the_oldest_demo_is_forgotten_past_the_limit():
    sessions = demo.Sessions(limit=2)
    first = sessions.get("session-1")
    sessions.get("session-2")
    assert sessions.get("session-1") is first  # used again, so it's the newest
    sessions.get("session-3")
    assert list(sessions.histories) == ["session-1", "session-3"]


GUARDED = [
    ("post", "/app-settings", {"labels": {}}),
    ("get", "/cold-start", None), ("post", "/cold-start/start", {}), ("post", "/cold-start/skip", {}),
    ("post", "/cold-start/answer", {"pattern_id": "p", "choice": "handle"}), ("post", "/cold-start/done", {}),
    ("post", "/labels/rename", {"role": "receipts", "name": "Paid"}),
    ("get", "/extension/status", None), ("get", "/extension/thread/abcdef12", None), ("get", "/extension/threads?ids=abcdef12", None),
    ("post", "/gmail/acting", {"on": True}), ("get", "/auth/google/start", None),
    ("get", "/auth/google/callback?state=s&code=c", None), ("post", "/gmail/sync", {}), ("post", "/gmail/recheck", {}),
    ("post", "/gmail/disconnect", {}),
    # Not real, but a demo only takes in its own emails, so one browser can't fill up the API's memory.
    ("post", "/decide", {"id": "x", "sender": "a@b.example", "subject": "s", "body": "b"}), ("post", "/demo/inbox", {}),
]


@pytest.mark.parametrize("method,path,body", GUARDED)
def test_nothing_real_can_be_reached_from_the_demo(setup, method, path, body):
    def untouchable():
        raise AssertionError("the demo looked up something real")

    for dependency in (get_tokens, get_real_history, get_http, get_app_settings_path):
        app.dependency_overrides[dependency] = untouchable
    client = in_demo()
    r = client.post(path, json=body) if method == "post" else client.get(path, follow_redirects=False)
    assert r.status_code == 409 and r.json() == {"detail": "That's not part of the demo."}


def test_every_route_that_touches_gmail_or_settings_is_guarded():
    """Found from the routes themselves, so a new endpoint can't be missed. /feedback and /chat use the
    token only for real-inbox decisions (a demo's own decisions act in its pretend Gmail instead),
    /email-image only fetches an email's image, and reading the app settings is fine. Opening an email
    and reviewing look up anything real only outside the demo, and only when it's needed, so they
    aren't found here: test_opening_a_demo_email_never_touches_anything_real,
    test_reviewing_in_the_demo_never_touches_anything_real and test_acting_in_the_demo_never_touches_anything_real
    check them instead."""
    allowed = {("POST", "/feedback"), ("POST", "/chat"), ("GET", "/email-image"), ("GET", "/app-settings")}

    def calls(dependant) -> set:
        found = set()
        for sub in dependant.dependencies:
            found |= {sub.call} | calls(sub)
        return found

    real = {get_tokens, get_real_history, get_http, get_app_settings_path}
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        used = calls(route.dependant)
        for method in route.methods:
            if used & real and (method, route.path) not in allowed:
                assert not_in_demo in used, f"{method} {route.path} can reach real data from the demo"


def test_opening_a_demo_email_shows_all_of_it(setup):
    client = in_demo()
    dinner = by_email(client.post("/demo/start").json())["demo_friend_dinner"]
    whole = next(e.email for e in START if e.email.id == "demo_friend_dinner")
    assert len(whole.body) > len(dinner["snippet"])  # more than the start Oscar keeps
    r = client.get(f"/emails/{dinner['id']}/content")
    assert r.status_code == 200
    assert r.json() == {"html": None, "text": whole.body}  # shaped like a real one, line breaks and all


def test_a_demo_only_opens_its_own_emails(setup):
    one, two = in_demo("browser-one"), in_demo("browser-two")
    dinner = by_email(one.post("/demo/start").json())["demo_friend_dinner"]
    two.post("/demo/start")
    assert two.get(f"/emails/{dinner['id']}/content").status_code == 404
    assert one.get("/emails/nope/content").status_code == 404


def test_opening_a_demo_email_never_touches_anything_real(setup, tmp_path):
    client, tokens, real = setup
    connect(tokens)
    real.add_decision(decide(Email(id="r1", sender="boss@work.example", subject="Real", body="fyi")))
    real_id = next(iter(real.decisions))
    demo_client = in_demo()
    dinner = by_email(demo_client.post("/demo/start").json())["demo_friend_dinner"]
    before = {p.name: p.read_text() for p in tmp_path.rglob("*") if p.is_file()}

    def untouchable():
        raise AssertionError("the demo looked up something real")

    for dependency in (get_tokens, get_real_history, get_http, get_app_settings_path):
        app.dependency_overrides[dependency] = untouchable
    assert demo_client.get(f"/emails/{dinner['id']}/content").status_code == 200
    assert demo_client.get(f"/emails/{real_id}/content").status_code == 404  # a real email is never found from the demo
    assert {p.name: p.read_text() for p in tmp_path.rglob("*") if p.is_file()} == before


def test_feedback_in_the_demo_never_opens_the_token(setup):
    class NoPeeking(TokenStore):
        def load(self):
            raise AssertionError("the demo read the Gmail token")

    app.dependency_overrides[get_tokens] = lambda: NoPeeking(Path("/nonexistent"))
    client = in_demo()
    evergreen = by_email(client.post("/demo/start").json())["demo_promo_evergreen"]
    teach_like_this(client, evergreen)
    assert client.post("/demo/check").json() == {"new": len(LATER), "skipped": 0, "done": 0}
    assert client.get("/gmail").json()["demo"] is True


# --- Reviewing in the demo: the same Yes and No as on the real inbox --------------------------------

def untouchable_real():
    def untouchable():
        raise AssertionError("the demo looked up something real")

    for dependency in (get_tokens, get_real_history, get_http, get_app_settings_path):
        app.dependency_overrides[dependency] = untouchable


def test_reviewing_in_the_demo_never_touches_anything_real(setup, tmp_path):
    client, tokens, real = setup
    connect(tokens)
    real.add_decision(decide(Email(id="r1", sender="boss@work.example", subject="Real", body="fyi")))
    demo_client = in_demo()
    evergreen = by_email(demo_client.post("/demo/start").json())["demo_promo_evergreen"]
    before = {p.name: p.read_text() for p in tmp_path.rglob("*") if p.is_file()}
    untouchable_real()
    assert demo_client.post("/reviews", json={"decision_id": evergreen["id"], "label": "CORRECT"}).status_code == 200
    assert demo_client.get("/reviews/summary").json()["reviewed"] == 1
    assert {p.name: p.read_text() for p in tmp_path.rglob("*") if p.is_file()} == before
    assert real.reviews == [] and real.feedback == []


def test_a_yes_in_the_demo_is_saved_only_there_and_approves_what_he_asked(setup):
    client, tokens, real = setup
    connect(tokens)
    one, two = in_demo("browser-one"), in_demo("browser-two")
    evergreen = by_email(one.post("/demo/start").json())["demo_promo_evergreen"]
    two.post("/demo/start")
    r = one.post("/reviews", json={"decision_id": evergreen["id"], "label": "CORRECT"})
    assert r.status_code == 200, r.text
    item = next(i for i in one.get("/decisions").json() if i["decision"]["id"] == evergreen["id"])
    assert item["review"]["label"] == "CORRECT"
    assert [f["kind"] for f in item["feedback"]] == ["APPROVE"]  # a yes to an ask is your approval, as on the real inbox
    # Never in another demo, or the real inbox.
    assert all(i["review"] is None for i in two.get("/decisions").json())
    assert two.get("/reviews/summary").json()["reviewed"] == 0
    assert two.post("/reviews", json={"decision_id": evergreen["id"], "label": "CORRECT"}).status_code == 400
    assert real.reviews == [] and client.get("/reviews/summary").json()["reviewed"] == 0
    # And the real inbox's own reviews still only take real decisions.
    assert client.post("/reviews", json={"decision_id": evergreen["id"], "label": "CORRECT"}).status_code == 400


def test_a_no_in_the_demo_teaches_that_demo_only(setup):
    """You said he should have asked, because he missed that it's risky: always ask about it from now
    on, straight away, as on the real inbox (review._lesson). Read again, the same email is asked about."""
    client, tokens, real = setup
    one, two = in_demo("browser-one"), in_demo("browser-two")
    started = one.post("/demo/start").json()
    two.post("/demo/start")
    quiet = next(d for d in started if d["autonomy_level"] == "PROCEED_SILENTLY")
    r = one.post("/reviews", json={"decision_id": quiet["id"], "should_be_level": "ASK_FIRST", "should_be_action": quiet["action"],
                                   "why": "risk"})
    assert r.status_code == 200, r.text
    assert r.json()["complete"] and r.json()["label"] == "MISINTERPRETED_RISK"
    item = next(i for i in one.get("/decisions").json() if i["decision"]["id"] == quiet["id"])
    assert item["feedback"] == []  # your answer is the review; putting it back isn't feedback
    assert item["done"]["undone_at"], "he should have asked, so it's put back in the demo's pretend Gmail"
    assert item["answer"]["level"] == "ASK_FIRST" and item["answer"]["error"] == "too_permissive"
    email = next(e.email for e in demo.emails() if e.email.id == quiet["email_id"])
    taught = Preferences.from_feedback(api.teaching(demo.SESSIONS.get("browser-one")))
    assert decide(email, taught).autonomy_level == "ASK_FIRST"
    assert api.teaching(demo.SESSIONS.get("browser-two")) == [] and two.get("/learned").json() == []
    assert real.reviews == [] and client.get("/learned").json() == []


# --- Acting in the demo's own pretend Gmail ----------------------------------------------------

def item_for(client: TestClient, email_id: str) -> dict:
    return next(i for i in client.get("/decisions").json() if i["decision"]["email_id"] == email_id)


def inbox_of(session: str = "browser-one"):
    return demo.SESSIONS.inbox(demo.SESSIONS.get(session))


def labels_of(session: str, email_id: str) -> list[str]:
    return inbox_of(session).messages[email_id]["labelIds"]


def drafts_in(email_id: str, session: str = "browser-one") -> list[dict]:
    """The drafts in that email's thread, in the demo's pretend Gmail."""
    return [d for d in inbox_of(session).drafts if d["threadId"] == f"t-{email_id}"]


def test_a_reply_he_drafts_in_the_demo_is_the_saved_draft_in_its_own_pretend_gmail(setup):
    one, two = in_demo("browser-one"), in_demo("browser-two")
    one.post("/demo/start")
    work = item_for(one, "demo_work_draft")
    saved = demo.saved_draft(demo.demo_email("demo_work_draft"))
    assert saved and work["done"]["draft_text"] == saved and work["done"]["by"] == "oscar", "drafted, never sent"
    assert [d["id"] for d in drafts_in("demo_work_draft")] == [work["done"]["draft_id"]]
    assert inbox_of().sent == [] and "INBOX" in labels_of("browser-one", "demo_work_draft")
    # A yes keeps it, and it's only in this demo.
    assert one.post("/reviews", json={"decision_id": work["decision"]["id"], "label": "CORRECT"}).status_code == 200
    assert item_for(one, "demo_work_draft")["done"]["undone_at"] is None
    assert two.get("/decisions").json() == [] and inbox_of("browser-two").drafts == []


def test_saying_yes_to_a_reply_he_asked_about_drafts_it(setup):
    client = in_demo()
    client.post("/demo/start")
    work = item_for(client, "demo_work_draft")["decision"]
    client.post("/feedback", json={"decision_id": work["id"], "kind": "KEEP_ASKING"})
    # Daniel writes again: now Oscar asks first, and your yes drafts the saved reply.
    history = demo.SESSIONS.get("browser-one")
    with httpx.Client() as http:
        ask = demo.arrive(history, demo.demo_email("demo_work_draft"), demo.reader(http), inbox_of())
    assert (ask.action, ask.autonomy_level) == ("DRAFT_REPLY", "ASK_FIRST")
    assert client.post("/feedback", json={"decision_id": ask.id, "kind": "APPROVE"}).status_code == 200
    record = history.action_for(ask.id)
    assert record.by == "you" and record.draft_text == demo.saved_draft(demo.demo_email("demo_work_draft"))


def test_without_a_saved_draft_there_is_no_draft(setup, monkeypatch, tmp_path):
    monkeypatch.setattr(demo, "DRAFTS", tmp_path / "none.jsonl")
    client = in_demo()
    client.post("/demo/start")
    assert item_for(client, "demo_work_draft")["done"] is None and inbox_of().drafts == []
    work = item_for(client, "demo_work_draft")["decision"]
    client.post("/feedback", json={"decision_id": work["id"], "kind": "KEEP_ASKING"})
    with httpx.Client() as http:
        ask = demo.arrive(demo.SESSIONS.get("browser-one"), demo.demo_email("demo_work_draft"), demo.reader(http), inbox_of())
    r = client.post("/feedback", json={"decision_id": ask.id, "kind": "APPROVE"})
    assert r.status_code == 400 and "no draft" in r.json()["detail"]


def test_a_no_in_review_takes_his_draft_away_and_does_what_you_said(setup):
    client = in_demo()
    client.post("/demo/start")
    work = item_for(client, "demo_work_draft")["decision"]
    r = client.post("/reviews", json={"decision_id": work["id"], "should_be_level": "PROCEED_SILENTLY",
                                      "should_be_action": "MARK_READ", "why": "preference"})
    assert r.status_code == 200, r.text
    done = item_for(client, "demo_work_draft")["done"]
    assert drafts_in("demo_work_draft") == [], "the draft for this email is gone"
    assert done["action"] == "MARK_READ" and done["by"] == "you" and "UNREAD" not in labels_of("browser-one", "demo_work_draft")
    # Only that email: the reply he drafted to Sarah is still there.
    assert len(drafts_in("demo_friend_dinner")) == 1 and item_for(client, "demo_friend_dinner")["done"]["undone_at"] is None


def test_a_no_in_review_puts_back_what_he_did_on_his_own(setup):
    client = in_demo()
    client.post("/demo/start")
    shipped = item_for(client, "demo_shipping_out")
    assert shipped["done"]["action"] == "APPLY_LABEL" and shipped["label"] in [
        lbl["name"] for lbl in inbox_of().labels if lbl["id"] in labels_of("browser-one", "demo_shipping_out")]
    client.post("/reviews", json={"decision_id": shipped["decision"]["id"], "should_be_level": "PROCEED_SILENTLY",
                                  "should_be_action": "ARCHIVE", "why": "preference"})
    assert labels_of("browser-one", "demo_shipping_out") == ["UNREAD", "CATEGORY_UPDATES"], "his label off, and archived instead"


def test_undo_in_the_demo_puts_it_back(setup):
    client = in_demo()
    client.post("/demo/start")
    work = item_for(client, "demo_work_draft")["decision"]
    assert client.post("/feedback", json={"decision_id": work["id"], "kind": "UNDO"}).status_code == 200
    assert item_for(client, "demo_work_draft")["done"]["undone_at"] and drafts_in("demo_work_draft") == []
    evergreen = item_for(client, "demo_promo_evergreen")["decision"]
    client.post("/reviews", json={"decision_id": evergreen["id"], "label": "CORRECT"})
    assert "INBOX" not in labels_of("browser-one", "demo_promo_evergreen"), "your yes archived it"
    assert client.post("/feedback", json={"decision_id": evergreen["id"], "kind": "UNDO"}).status_code == 200
    assert "INBOX" in labels_of("browser-one", "demo_promo_evergreen")
    assert client.post("/feedback", json={"decision_id": evergreen["id"], "kind": "UNDO"}).status_code == 400


def test_acting_in_the_demo_never_touches_anything_real(setup, tmp_path, monkeypatch):
    """Yes, No, Undo and a rule all act in the demo's pretend Gmail. The real Gmail client, the token
    and the real inbox are never even looked up."""
    client, tokens, real = setup
    connect(tokens)
    before = {p.name: p.read_text() for p in tmp_path.rglob("*") if p.is_file()}

    def never(*args, **kwargs):
        raise AssertionError("the demo used something real")

    for dependency in (get_real_history, get_app_settings_path):
        app.dependency_overrides[dependency] = never
    monkeypatch.setattr(api, "gmail_client", never)
    monkeypatch.setattr(TokenStore, "load", never)  # a demo's pretend connection has its own, in memory
    demo_client = in_demo()
    demo_client.post("/demo/start")
    evergreen = item_for(demo_client, "demo_promo_evergreen")["decision"]
    work = item_for(demo_client, "demo_work_draft")["decision"]
    assert demo_client.post("/reviews", json={"decision_id": evergreen["id"], "label": "CORRECT"}).status_code == 200
    teach_like_this(demo_client, evergreen)
    assert demo_client.post("/reviews", json={"decision_id": work["id"], "should_be_level": "ASK_FIRST",
                                              "should_be_action": "DRAFT_REPLY", "why": "preference"}).status_code == 200
    assert demo_client.post("/feedback", json={"decision_id": evergreen["id"], "kind": "UNDO"}).status_code == 200
    demo_client.post("/demo/check")
    assert {p.name: p.read_text() for p in tmp_path.rglob("*") if p.is_file()} == before
    assert real.actions == {} and real.feedback == [] and real.reviews == []


def test_starting_again_gives_a_fresh_pretend_gmail(setup):
    client = in_demo()
    client.post("/demo/start")
    first = inbox_of()
    evergreen = item_for(client, "demo_promo_evergreen")["decision"]
    client.post("/reviews", json={"decision_id": evergreen["id"], "label": "CORRECT"})
    client.post("/demo/reset")
    assert inbox_of() is not first and "INBOX" in labels_of("browser-one", "demo_promo_evergreen")
    assert item_for(client, "demo_promo_evergreen")["done"] is None


def test_every_saved_draft_is_for_a_demo_email_he_drafts():
    """After changing a demo email, run python -m oscar.demo --read to write its draft again."""
    sessions = demo.Sessions()
    history = sessions.get("drafts-check")
    with httpx.Client() as http:
        read = demo.reader(http)
        for e in START + LATER:
            demo.arrive(history, e.email, read, sessions.inbox(history))
    replies = [d for d in history.decisions.values() if d.action == "DRAFT_REPLY" and d.autonomy_level in (
        "PROCEED_SILENTLY", "PROCEED_AND_NOTIFY")]
    assert replies and all(history.action_for(d.id) and history.action_for(d.id).draft_text for d in replies)


# --- The real pipeline -------------------------------------------------------------------------

def test_every_demo_decision_comes_from_decide(setup, monkeypatch):
    made = []

    def recording(email, preferences=None, **kwargs):
        assert isinstance(preferences, Preferences)
        decision = decide(email, preferences, **kwargs)
        made.append(decision)
        return decision

    monkeypatch.setattr(demo, "decide", recording)
    client = in_demo()
    started = client.post("/demo/start").json()
    assert [d["id"] for d in started] == [d.id for d in made]
    assert started == [json.loads(d.model_dump_json()) for d in made]
    client.post("/demo/check")
    assert len(made) == len(START) + len(LATER)


def test_the_demo_code_never_picks_a_decision_itself():
    """Nothing in the demo code names a demo email or sets a level or an action: only decide() does."""
    ids = [e.email.id for e in demo.emails()]
    sources = [Path(demo.__file__).read_text()] + [inspect.getsource(f) for f in (
        api.demo_session, api.not_in_demo, api.get_history, api.get_demo_history, api.demo_start, api.demo_check,
        api.reset, api.gmail_status)]
    for source in sources:
        assert not any(i in source for i in ids)
        assert not re.search(r"[\"']demo_\w", source)  # no demo email's id, written out or in part
        assert not re.search(r"AutonomyLevel\.|Action\.|autonomy_level\s*=|level_source|model_copy", source)


# --- Starting again ----------------------------------------------------------------------------

def outcome(decision: dict) -> tuple:
    return decision["action"], decision["autonomy_level"], decision["level_source"], decision["safety_flags"]


def test_starting_again_forgets_what_you_taught(setup):
    client = in_demo()
    first = by_email(client.post("/demo/start").json())
    evergreen = first["demo_promo_evergreen"]
    client.post("/feedback", json={"decision_id": evergreen["id"], "kind": "APPROVE"})
    teach_like_this(client, evergreen)
    client.post("/demo/check")
    assert client.get("/learned").json() != []
    restarted = client.post("/demo/reset").json()
    assert {d["email_id"] for d in restarted} == {e.email.id for e in START}
    assert client.get("/learned").json() == []
    now = listed(client)
    assert set(now) == {e.email.id for e in START}  # the later emails haven't come in again
    # Every email is decided just as it was the first time, as new decisions.
    assert {i: outcome(d) for i, d in now.items()} == {i: outcome(d) for i, d in first.items()}
    assert now["demo_promo_evergreen"]["autonomy_level"] == "ASK_FIRST" and now["demo_promo_evergreen"]["id"] != evergreen["id"]
    assert all(item["feedback"] == [] for item in client.get("/decisions").json())
    assert client.post("/demo/check").json()["new"] == len(LATER)
    assert client.post("/demo/check").json()["new"] == 0  # each comes in once
    # Without what you taught, the second shop is asked about again.
    assert listed(client)["demo_promo_trailhead"]["autonomy_level"] == "ASK_FIRST"


def test_two_checks_at_once_bring_each_email_in_once(setup, monkeypatch):
    """Two tabs share one demo, so both can check at the same moment."""
    client = in_demo()
    client.post("/demo/start")
    arrive = demo.arrive

    def slowly(*args):
        time.sleep(0.05)  # long enough for the other checks to begin meanwhile
        return arrive(*args)

    monkeypatch.setattr(demo, "arrive", slowly)
    with ThreadPoolExecutor(4) as pool:
        counts = list(pool.map(lambda _: client.post("/demo/check").json()["new"], range(4)))
    assert sorted(counts) == [0, 0, 0, len(LATER)]
    later = [item["decision"]["email_id"] for item in client.get("/decisions").json()
             if item["decision"]["email_id"] in {e.email.id for e in LATER}]
    assert sorted(later) == sorted(e.email.id for e in LATER)


# --- Learning and safety -----------------------------------------------------------------------

AT_LEAST_ASK = ("ASK_FIRST", "ESCALATE")
# Every action Oscar can take, each from an email that naturally calls for it.
ACTIONS = {"MARK_READ", "ARCHIVE", "APPLY_LABEL", "DRAFT_REPLY", "SEND_REPLY", "FORWARD", "UNSUBSCRIBE",
           "ACCEPT_MEETING", "PERMANENTLY_DELETE", "MOVE_MONEY", "SEND_CREDENTIALS"}


def test_a_fresh_demo_shows_every_level_and_every_action(setup):
    decisions = by_email(in_demo().post("/demo/start").json())
    assert {d["autonomy_level"] for d in decisions.values()} == {level.value for level in LEVELS}
    assert {d["action"] for d in decisions.values()} == ACTIONS
    evergreen = decisions["demo_promo_evergreen"]
    assert (evergreen["action"], evergreen["autonomy_level"], evergreen["level_source"]) == ("ARCHIVE", "ASK_FIRST", "policy")


def test_one_rule_handles_another_shop_quietly_but_never_the_injection(setup):
    client = in_demo()
    evergreen = by_email(client.post("/demo/start").json())["demo_promo_evergreen"]
    client.post("/feedback", json={"decision_id": evergreen["id"], "kind": "APPROVE"})
    teach_like_this(client, evergreen)
    assert client.post("/demo/check").json() == {"new": 2, "skipped": 0, "done": 0}
    now = listed(client)
    trailhead, sunday = now["demo_promo_trailhead"], now["demo_promo_injection"]
    assert (trailhead["action"], trailhead["autonomy_level"], trailhead["level_source"]) == (
        "ARCHIVE", "PROCEED_SILENTLY", "learned")
    assert trailhead["sender"] != evergreen["sender"]
    assert sunday["autonomy_level"] == "ESCALATE" and "PROMPT_INJECTION" in sunday["safety_flags"]
    assert sunday["action"] != "FORWARD"  # the hidden instructions are never followed


def test_without_the_rule_the_other_shop_is_still_asked_about(setup):
    client = in_demo()
    client.post("/demo/start")
    client.post("/demo/check")
    trailhead = listed(client)["demo_promo_trailhead"]
    assert (trailhead["action"], trailhead["autonomy_level"]) == ("ARCHIVE", "ASK_FIRST")


def test_each_email_gets_what_it_asks_for(setup):
    d = by_email(in_demo().post("/demo/start").json())
    work = d["demo_work_draft"]
    assert (work["action"], work["autonomy_level"]) == ("DRAFT_REPLY", "PROCEED_AND_NOTIFY")  # a draft, never sent
    for email_id, action in [("demo_send_reply", "SEND_REPLY"), ("demo_forward_invoice", "FORWARD"),
                             ("demo_unsubscribe", "UNSUBSCRIBE"), ("demo_interview_invite", "ACCEPT_MEETING")]:
        assert d[email_id]["action"] == action, email_id
        assert d[email_id]["autonomy_level"] in AT_LEAST_ASK, email_id
    # Already booked, already answered: nothing to accept.
    for email_id in ("demo_dentist_confirmed", "demo_calendar_reminder"):
        assert d[email_id]["action"] != "ACCEPT_MEETING", email_id


def test_risky_emails_are_stopped_and_their_harmless_twins_are_not(setup):
    d = by_email(in_demo().post("/demo/start").json())
    money, code = d["demo_money_request"], d["demo_credential_request"]
    assert (money["action"], money["autonomy_level"]) == ("MOVE_MONEY", "ESCALATE")
    assert (code["action"], code["autonomy_level"]) == ("SEND_CREDENTIALS", "ESCALATE")
    delete = d["demo_delete_request"]
    assert delete["action"] == "PERMANENTLY_DELETE" and delete["autonomy_level"] in AT_LEAST_ASK
    assert d["demo_security_alert"]["autonomy_level"] == "ESCALATE"  # never dismissed on his own
    assert d["demo_contract_change"]["autonomy_level"] in AT_LEAST_ASK
    for twin in ("demo_payment_received", "demo_refund"):
        assert d[twin]["action"] != "MOVE_MONEY" and d[twin]["safety_flags"] == [], twin
    assert d["demo_credential_control"]["action"] != "SEND_CREDENTIALS"
    assert d["demo_credential_control"]["safety_flags"] == []
    assert d["demo_delete_control"]["action"] != "PERMANENTLY_DELETE"
    assert d["demo_doc_share_control"]["autonomy_level"] != "ESCALATE"
    for twin in ("demo_payment_received", "demo_refund", "demo_delete_control", "demo_doc_share_control"):
        assert d[twin]["autonomy_level"] in ("PROCEED_SILENTLY", "PROCEED_AND_NOTIFY"), twin


def test_risky_emails_are_stopped_by_the_rules_alone(setup, monkeypatch, tmp_path):
    """Without the model's readings too: the checks on the email itself catch them."""
    monkeypatch.setattr(demo, "READINGS", tmp_path / "none.jsonl")
    monkeypatch.setattr(demo, "api_key", lambda: "")
    d = by_email(in_demo().post("/demo/start").json())
    assert "MONEY" in d["demo_money_request"]["safety_flags"]
    assert "CREDENTIALS" in d["demo_credential_request"]["safety_flags"]
    for email_id in ("demo_money_request", "demo_credential_request"):
        assert d[email_id]["autonomy_level"] == "ESCALATE", email_id
    assert d["demo_credential_control"]["action"] != "SEND_CREDENTIALS"


# --- The demo emails ---------------------------------------------------------------------------

def test_the_demo_emails_are_varied_and_made_up():
    found = demo.emails()
    assert len(found) == 33
    assert len({e.email.id for e in found}) == len(found)
    senders = {e.email.sender.split("@")[-1].rstrip(">").lower() for e in found}
    assert len(senders) >= 20
    for e in found:
        text = f"{e.email.sender}\n{e.email.subject}\n{e.email.body}".lower()
        assert "test" not in text and "scenario" not in text, e.email.id
        # Every address and link, and any other name.with.a.dot (an address's name part dropped first).
        for domain in re.findall(r"\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b", re.sub(r"[\w.+-]+@", "", text)):
            assert domain.endswith(".example"), (e.email.id, domain)
    promos = {e.email.sender.split("@")[-1] for e in found if e.email.category == "promotions"}
    assert len(promos) >= 3
    assert [e.email.id for e in LATER] == ["demo_promo_trailhead", "demo_promo_injection"]


def test_a_demo_email_is_only_an_email():
    """Nothing in a demo email's file says what it's for or what Oscar should do: he only sees the email."""
    for path in sorted(demo.FOLDER.glob("*.json")):
        data = json.loads(path.read_text())
        assert set(data) == {"arrives", "email"}, path.name
        assert set(data["email"]) <= set(Email.model_fields), path.name


def test_every_demo_email_has_a_saved_reading():
    """Saved for the current prompt (understand.PROMPT_VERSION). After changing an email or the
    prompt, run python -m oscar.demo --read."""
    with httpx.Client() as http:
        reader = Reader(http, demo.READINGS, reads="full", saved_only=True)
        for e in demo.emails():
            assert reader.read(e.email) is not None, e.email.id


def test_a_missing_reading_means_the_rules_alone(setup, monkeypatch, tmp_path):
    monkeypatch.setattr(demo, "READINGS", tmp_path / "none.jsonl")
    started = in_demo().post("/demo/start")
    assert started.status_code == 200
    assert all(d["understood_by"] != "model" for d in started.json())
