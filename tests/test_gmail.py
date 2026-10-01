from urllib.parse import parse_qs, urlparse

import pytest

from oscar.feedback import FeedbackError, FeedbackKind, record_feedback
from oscar.gmail import SCOPE, GmailClient, auth_url, parse_message
from oscar.history import History
from oscar.inbox import sync
from oscar.models import AutonomyLevel
from tests.fake_gmail import FakeGmail, connected, message

INBOX = [
    message("m1", "digest@newsletter.example", "Weekly digest", "Top stories this week. View in browser | Unsubscribe"),
    message("m2", "accounts@vendor.example", "Overdue", "Please wire me $4,800 today to the account below."),
    message("m3", "friend@example.com", "Hi", "<p>Could you send me the notes from <b>today</b>?</p>", html=True),
]


def test_only_asks_for_read_only_access():
    assert SCOPE == "https://www.googleapis.com/auth/gmail.readonly"
    scopes = parse_qs(urlparse(auth_url("s")).query)["scope"][0].split()
    assert scopes == [SCOPE]


def test_never_changes_anything_in_gmail(tmp_path):
    # The whole point of Stage 9: every request to Gmail is a read.
    fake = FakeGmail(INBOX, sent_to={"friend@example.com"})
    history = History()
    sync(history, GmailClient(connected(tmp_path), fake.http()))
    sync(history, GmailClient(connected(tmp_path), fake.http()))
    assert fake.gmail_requests()
    assert {r.method for r in fake.gmail_requests()} == {"GET"}


def test_client_has_no_way_to_write():
    writes = {"modify", "send", "trash", "delete", "archive", "insert", "batch", "draft", "label_add"}
    assert not {name for name in dir(GmailClient) if any(w in name.lower() for w in writes)}


def test_parses_a_message():
    email, info = parse_message(INBOX[2])
    assert email.sender == "friend@example.com"
    assert email.to == ["me@example.com"]
    assert email.body == "Could you send me the notes from today ?"
    assert info.thread_id == "t1" and info.received_at is not None
    email, info = parse_message(message("x", "a@b.c", "s", "b", labels=("INBOX", "CATEGORY_PROMOTIONS")))
    assert info.category == "promotions"


def test_sync_logs_what_oscar_would_do(tmp_path):
    fake = FakeGmail(INBOX, sent_to={"friend@example.com"})
    history = History()
    new = sync(history, GmailClient(connected(tmp_path), fake.http()))
    assert len(new) == 3
    by_id = {d.email_id: d for d in new}
    assert all(d.source == "gmail" and d.policy_version for d in new)
    assert by_id["m3"].gmail.emailed_before is True
    assert by_id["m1"].gmail.emailed_before is False
    assert by_id["m3"].gmail.thread_length == 2
    # Read-only wording: what he would do, never what he did.
    assert by_id["m2"].autonomy_level == AutonomyLevel.ESCALATE
    for d in new:
        assert not d.message.startswith(("Handled it", "Heads up: I")), d.message
        assert d.steps[-1].startswith("Would ")
    # Seen emails aren't decided again.
    assert sync(history, GmailClient(connected(tmp_path), fake.http())) == []


def test_refreshes_an_expired_token(tmp_path):
    fake = FakeGmail(INBOX)
    store = connected(tmp_path, expired=True)
    GmailClient(store, fake.http()).address()
    assert store.load()["access_token"] == "fresh"


def test_follow_up_notes_what_you_did_later(tmp_path):
    fake = FakeGmail(INBOX)
    history = History()
    sync(history, GmailClient(connected(tmp_path), fake.http()))
    assert len(history.follow_ups) == 3
    fake.messages["m1"]["labelIds"] = ["UNREAD"]  # you archived it
    del fake.messages["m2"]  # you deleted it
    sync(history, GmailClient(connected(tmp_path), fake.http()))
    latest = {f.decision_id: f for f in history.follow_ups}
    by_email = {d.email_id: d.id for d in history.decisions.values()}
    assert latest[by_email["m1"]].in_inbox is False
    assert latest[by_email["m2"]].gone is True
    assert len(history.follow_ups) == 5  # unchanged ones aren't logged again


def test_no_feedback_on_the_real_inbox(tmp_path):
    history = History()
    sync(history, GmailClient(connected(tmp_path), FakeGmail(INBOX).http()))
    decision = next(iter(history.decisions.values()))
    with pytest.raises(FeedbackError, match="only reading your real inbox"):
        record_feedback(history, decision.id, FeedbackKind.ALWAYS_DO_THIS)
