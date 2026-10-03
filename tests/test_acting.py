"""Stage 12 through the API: Oscar acting in a (fake) Gmail, only when allowed, and undoable."""

import time

import pytest
from fastapi.testclient import TestClient

from oscar.act import MAX_PER_CHECK
from oscar.api import app, get_history, get_http, get_real_history, get_tokens
from oscar.gmail import ACT_SCOPE, SCOPE, TokenStore
from oscar.history import History
from tests.fake_gmail import FakeGmail, message

def new(*args, **kwargs):
    """An email that arrives after acting is turned on: the only kind Oscar acts on."""
    return message(*args, received_ms=int((time.time() + 60) * 1000), **kwargs)


RECEIPT = new("r1", "orders@shop.example", "Your receipt", "Thanks for your order. Your receipt is attached.")
NEWSLETTER = new("n1", "digest@letters.example", "This week", "Top stories. View in browser. Manage your preferences.")
WIRE = new("w1", "accounts@vendor.example", "Overdue", "Please wire me $4,800 today to the account below.")


def tokens(tmp_path, scope: str) -> TokenStore:
    store = TokenStore(tmp_path / "token.json")
    store.save({"refresh_token": "r", "access_token": "a", "expires_at": time.time() + 3600, "scope": scope})
    return store


@pytest.fixture
def api(tmp_path):
    def make(messages, scope=ACT_SCOPE, acting=True):
        real = History()
        fake = FakeGmail(messages)
        store = tokens(tmp_path, scope)
        app.dependency_overrides[get_tokens] = lambda: store
        app.dependency_overrides[get_real_history] = lambda: real
        app.dependency_overrides[get_history] = lambda: real
        app.dependency_overrides[get_http] = fake.http
        client = TestClient(app, headers={"content-type": "application/json"})
        if acting:
            assert client.post("/gmail/acting", json={"on": True}).status_code == 200
        return client, real, fake
    yield make
    app.dependency_overrides.clear()


def decision_for(real, message_id):
    return next(d for d in real.decisions.values() if d.gmail.message_id == message_id)


def names(fake, message_id):
    """The email's labels by name: Gmail's own (INBOX, UNREAD) as they are, the rest by their name."""
    by_id = {l["id"]: l["name"] for l in fake.labels}
    return sorted(by_id.get(l, l) for l in fake.messages[message_id]["labelIds"])


def writes(fake):
    return [r for r in fake.gmail_requests() if r.method == "POST"]


def test_nothing_is_written_until_you_turn_acting_on(api):
    client, real, fake = api([RECEIPT, NEWSLETTER], acting=False)
    assert client.get("/gmail").json()["read_only"] is True
    client.post("/gmail/sync")
    assert not writes(fake)


def test_acting_needs_permission_to_change_labels(api):
    client, real, fake = api([RECEIPT], scope=SCOPE, acting=False)
    assert client.post("/gmail/acting", json={"on": True}).status_code == 409
    assert client.get("/gmail").json()["can_act"] is False


def test_oscar_does_what_he_decided_on_his_own_and_it_can_be_undone(api):
    client, real, fake = api([RECEIPT, NEWSLETTER, WIRE])
    assert client.post("/gmail/sync").json()["done"] == 1
    receipt = decision_for(real, "r1")
    assert receipt.acting and real.action_for(receipt.id) is not None
    assert names(fake, "r1") == ["Handled", "INBOX", "Receipts", "UNREAD"]
    # Asks and stops stay unread in the inbox: the only change is the label with his call.
    assert names(fake, "n1") == ["INBOX", "Needs you", "UNREAD"]
    assert names(fake, "w1") == ["INBOX", "Stopped", "UNREAD"]
    assert client.post("/feedback", json={"decision_id": receipt.id, "kind": "UNDO"}).status_code == 200
    assert names(fake, "r1") == ["Handled", "INBOX", "UNREAD"]
    client.post("/gmail/sync")  # the next check notices it was undone
    assert names(fake, "r1") == ["FYI", "INBOX", "UNREAD"]


def test_approving_an_ask_does_it_and_declining_doesnt(api):
    client, real, fake = api([NEWSLETTER, new("n2", "news@other.example", "Digest", "Weekly digest. View in browser.")])
    client.post("/gmail/sync")
    ask, other = decision_for(real, "n1"), decision_for(real, "n2")
    assert ask.autonomy_level == "ASK_FIRST"
    assert client.post("/feedback", json={"decision_id": ask.id, "kind": "APPROVE"}).status_code == 200
    assert "INBOX" not in fake.messages["n1"]["labelIds"], "archived"
    client.post("/feedback", json={"decision_id": other.id, "kind": "REJECT"})
    assert "INBOX" in fake.messages["n2"]["labelIds"]
    item = next(i for i in client.get("/decisions").json() if i["decision"]["id"] == ask.id)
    assert item["done"]["by"] == "you" and item["done"]["removed"] == ["INBOX"]


def test_re_reading_never_acts(api):
    client, real, fake = api([RECEIPT])
    client.post("/gmail/sync")
    before = len(writes(fake))
    for d in real.decisions.values():
        real.decisions[d.id] = d.model_copy(update={"policy_version": "older"})
    client.post("/gmail/recheck")
    assert len(writes(fake)) == before


def test_at_most_a_few_actions_per_check(api):
    receipts = [new(f"r{i}", f"orders{i}@shop.example", "Your receipt", "Your receipt is attached.") for i in range(MAX_PER_CHECK + 5)]
    client, real, fake = api(receipts)
    assert client.post("/gmail/sync?limit=100").json()["done"] == MAX_PER_CHECK


def test_turning_acting_off_stops_new_actions_but_undo_still_works(api):
    client, real, fake = api([RECEIPT, new("r2", "orders@shop.example", "Receipt 2", "Your receipt is attached.")])
    client.post("/gmail/sync?limit=1")
    first = decision_for(real, "r1")
    client.post("/gmail/acting", json={"on": False})
    client.post("/gmail/sync")
    assert real.action_for(decision_for(real, "r2").id) is None
    assert client.post("/feedback", json={"decision_id": first.id, "kind": "UNDO"}).status_code == 200



# --- found by the review before acting was turned on for real -----------------------------

def test_the_backlog_is_never_acted_on(api):
    old = [message(f"o{i}", f"orders{i}@shop.example", "Your receipt", "Your receipt is attached.") for i in range(5)]
    client, real, fake = api(old + [RECEIPT])
    assert client.post("/gmail/sync").json()["done"] == 1, "only the email that arrived after acting was turned on"
    assert real.action_for(decision_for(real, "r1").id) is not None


def test_an_approved_ask_can_be_undone(api):
    client, real, fake = api([NEWSLETTER])
    client.post("/gmail/sync")
    ask = decision_for(real, "n1")
    client.post("/feedback", json={"decision_id": ask.id, "kind": "APPROVE"})
    assert client.post("/feedback", json={"decision_id": ask.id, "kind": "UNDO"}).status_code == 200
    assert "INBOX" in fake.messages["n1"]["labelIds"]


def test_nothing_is_said_or_learned_when_nothing_happened(api):
    client, real, fake = api([NEWSLETTER, new("q1", "sam@work.example", "Hi", "Can you send me the notes from today?")])
    client.post("/gmail/sync")
    ask = decision_for(real, "n1")
    client.post("/gmail/acting", json={"on": False})
    assert client.post("/feedback", json={"decision_id": ask.id, "kind": "APPROVE"}).status_code == 409
    assert "INBOX" in fake.messages["n1"]["labelIds"] and not real.feedback
    reply = decision_for(real, "q1")  # a draft: not something he does in Gmail
    assert client.post("/feedback", json={"decision_id": reply.id, "kind": "UNDO"}).status_code == 400
    assert client.post("/feedback", json={"decision_id": reply.id, "kind": "EDIT_THEN_SEND", "edited_text": "hi"}).status_code == 400
    assert not real.feedback


def test_a_reread_keeps_what_was_done_and_it_can_still_be_undone(api):
    client, real, fake = api([RECEIPT])
    client.post("/gmail/sync")
    first = decision_for(real, "r1")
    real.decisions[first.id] = first.model_copy(update={"policy_version": "older"})
    client.post("/gmail/recheck")
    latest = next(i for i in client.get("/decisions").json() if i["decision"]["recheck_of"] == first.id)
    assert latest["decision"]["acting"] and latest["done"] is not None
    assert client.post("/feedback", json={"decision_id": latest["decision"]["id"], "kind": "UNDO"}).status_code == 200
    assert names(fake, "r1") == ["Handled", "INBOX", "UNREAD"], "the receipt label is off; his status label waits for the next check"


def test_reconnecting_needs_acting_turned_on_again(api):
    client, real, fake = api([RECEIPT])
    client.post("/gmail/disconnect")
    assert real.settings["acting"] is False


def test_turning_acting_off_stops_a_check_midway(api):
    from oscar.api import acting_since
    from oscar.gmail import GmailClient
    from oscar.inbox import sync
    client, real, fake = api([new(f"r{i}", f"o{i}@shop.example", "Your receipt", "Your receipt is attached.") for i in range(6)])
    asked = []
    store = app.dependency_overrides[get_tokens]()

    def still():
        asked.append(1)
        return len(asked) <= 2  # turned off after two actions
    result = sync(real, GmailClient(store, fake.http()), act_since=acting_since(store, real), still_acting=still)
    assert result.done == 2


def test_his_note_only_says_he_did_it_if_he_did(api):
    old = message("o1", "orders@shop.example", "Your receipt", "Your receipt is attached.")  # arrived before acting
    client, real, fake = api([old, RECEIPT])
    client.post("/gmail/sync")
    done, not_done = decision_for(real, "r1"), decision_for(real, "o1")
    assert real.action_for(done.id) and not real.action_for(not_done.id)
    assert "I'd" in not_done.message and "I'd" not in done.message
