"""Stage 12 through the API: Oscar acting in a (fake) Gmail, only when allowed, and undoable."""

import time

import pytest
from fastapi.testclient import TestClient

from oscar.act import MAX_PER_CHECK
from oscar.api import app, get_history, get_http, get_real_history, get_tokens
from oscar.gmail import ACT_SCOPE, SCOPE, TokenStore
from oscar.history import History
from tests.fake_gmail import FakeGmail, message

RECEIPT = message("r1", "orders@shop.example", "Your receipt", "Thanks for your order. Your receipt is attached.")
NEWSLETTER = message("n1", "digest@letters.example", "This week", "Top stories. View in browser. Manage your preferences.")
WIRE = message("w1", "accounts@vendor.example", "Overdue", "Please wire me $4,800 today to the account below.")


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
    assert any(l.startswith("Label_") for l in fake.messages["r1"]["labelIds"])
    # Asks and stops are left alone.
    assert fake.messages["n1"]["labelIds"] == ["INBOX", "UNREAD"]
    assert fake.messages["w1"]["labelIds"] == ["INBOX", "UNREAD"]
    assert client.post("/feedback", json={"decision_id": receipt.id, "kind": "UNDO"}).status_code == 200
    assert fake.messages["r1"]["labelIds"] == ["INBOX", "UNREAD"]


def test_approving_an_ask_does_it_and_declining_doesnt(api):
    client, real, fake = api([NEWSLETTER, message("n2", "news@other.example", "Digest", "Weekly digest. View in browser.")])
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
    receipts = [message(f"r{i}", f"orders{i}@shop.example", "Your receipt", "Your receipt is attached.") for i in range(MAX_PER_CHECK + 5)]
    client, real, fake = api(receipts)
    assert client.post("/gmail/sync?limit=100").json()["done"] == MAX_PER_CHECK


def test_turning_acting_off_stops_new_actions_but_undo_still_works(api):
    client, real, fake = api([RECEIPT, message("r2", "orders@shop.example", "Receipt 2", "Your receipt is attached.")])
    client.post("/gmail/sync?limit=1")
    first = decision_for(real, "r1")
    client.post("/gmail/acting", json={"on": False})
    client.post("/gmail/sync")
    assert real.action_for(decision_for(real, "r2").id) is None
    assert client.post("/feedback", json={"decision_id": first.id, "kind": "UNDO"}).status_code == 200
