"""Oscar on a real Gmail, tested against the fake one. Connecting asks for read-only access, a read-only
check only ever reads, and he logs what he would do. Since Stage 12 the only change he can make is to
labels: INBOX, UNREAD and his own. Also covers messy emails and Gmail hiccups."""

from urllib.parse import parse_qs, urlparse

import pytest

from oscar.feedback import FeedbackError, FeedbackKind, record_feedback
from oscar.gmail import PROFILE_SCOPES, SCOPE, GmailClient, auth_url, parse_message
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
    assert scopes == [SCOPE, *PROFILE_SCOPES]  # Gmail read-only, and your name and photo


def test_never_changes_anything_in_gmail(tmp_path):
    # The whole point of Stage 9: every request to Gmail is a read.
    fake = FakeGmail(INBOX, sent_to={"friend@example.com"})
    history = History()
    sync(history, GmailClient(connected(tmp_path), fake.http()))
    sync(history, GmailClient(connected(tmp_path), fake.http()))
    assert fake.gmail_requests()
    assert {r.method for r in fake.gmail_requests()} == {"GET"}


def test_client_has_no_way_to_send_trash_or_delete_an_email():
    # Its only writes are labels (Stage 12) and reply drafts (Stage 17): it can save a draft and take
    # back a draft it made, but nothing can send an email or a draft, trash or delete a message.
    import inspect

    from oscar import gmail
    risky = {"send", "trash", "insert", "batch", "import", "spam"}
    assert not {name for name in dir(GmailClient) if any(w in name.lower() for w in risky)}
    assert {name for name in dir(GmailClient) if "delete" in name.lower()} == {"delete_draft"}
    assert {name for name in dir(GmailClient) if "draft" in name.lower()} == {"create_draft", "delete_draft"}
    source = inspect.getsource(gmail)
    assert "/send" not in source and "/trash" not in source, "Gmail's send and trash endpoints are never named"
    assert source.count("self.http.delete(") == 1 and "self.http.delete(" in inspect.getsource(GmailClient.delete_draft)
    assert 'f"{GMAIL_URL}/drafts/{draft_id}"' in inspect.getsource(GmailClient.delete_draft), "only ever a draft"


def test_connecting_is_read_only_and_acting_is_asked_for_separately():
    from oscar.gmail import ACT_SCOPE
    assert parse_qs(urlparse(auth_url("s", act=True)).query)["scope"][0].split() == [ACT_SCOPE, *PROFILE_SCOPES]


@pytest.mark.parametrize("label", ["Label_9", "SPAM", "TRASH", "SENT", "DRAFT", "IMPORTANT", "STARRED"])
def test_only_unread_inbox_and_oscars_own_labels_can_change(tmp_path, label):
    from oscar.gmail import GmailError
    fake = FakeGmail(INBOX)
    client = GmailClient(connected(tmp_path), fake.http())
    with pytest.raises(GmailError, match="isn't allowed"):
        client.modify_labels("m1", add=[label], remove=[])
    with pytest.raises(GmailError, match="isn't allowed"):
        client.modify_labels("m1", add=[], remove=[label])
    assert not [r for r in fake.gmail_requests() if r.method == "POST"], "refused before Gmail was asked"


def test_oscar_makes_his_own_labels_and_can_use_them(tmp_path):
    fake = FakeGmail(INBOX)
    client = GmailClient(connected(tmp_path), fake.http())
    receipts = client.label_id("receipts")
    assert receipts == client.label_id("receipts"), "made once"
    client.modify_labels("m1", add=[receipts], remove=["UNREAD"])
    assert fake.messages["m1"]["labelIds"] == ["INBOX", receipts]
    assert any(l["name"] == "Receipts" for l in fake.labels)


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
    assert sync(history, GmailClient(connected(tmp_path), fake.http())).new == 3
    new = list(history.decisions.values())
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
    assert sync(history, GmailClient(connected(tmp_path), fake.http())).new == 0


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


def test_an_email_in_the_bin_counts_as_deleted(tmp_path):
    from oscar.inbox import deleted_in_gmail
    fake = FakeGmail(INBOX)
    history = History()
    sync(history, GmailClient(connected(tmp_path), fake.http()))
    assert deleted_in_gmail(history) == set()
    fake.messages["m1"]["labelIds"] = ["TRASH"]  # you deleted it in Gmail: it goes to the Bin first
    del fake.messages["m2"]  # and this one is gone for good
    sync(history, GmailClient(connected(tmp_path), fake.http()))
    assert deleted_in_gmail(history) == {"m1", "m2"}
    fake.messages["m1"]["labelIds"] = ["INBOX"]  # you took it back out of the Bin
    sync(history, GmailClient(connected(tmp_path), fake.http()))
    assert deleted_in_gmail(history) == {"m2"}
    assert len(history.decisions) == 3, "his history keeps them"


def test_no_approving_or_undoing_what_was_only_read(tmp_path):
    history = History()
    sync(history, GmailClient(connected(tmp_path), FakeGmail(INBOX).http()))
    decision = next(d for d in history.decisions.values() if d.autonomy_level == AutonomyLevel.ASK_FIRST)
    with pytest.raises(FeedbackError, match="only reading your real inbox"):
        record_feedback(history, decision.id, FeedbackKind.APPROVE)
    with pytest.raises(FeedbackError, match="nothing to undo"):
        record_feedback(history, decision.id, FeedbackKind.UNDO)
    # "Always do this" only teaches him, so it's fine on any real email.
    record_feedback(history, decision.id, FeedbackKind.ALWAYS_DO_THIS)


# --- found by a code review ---------------------------------------------------

import base64  # noqa: E402

import httpx  # noqa: E402

from oscar import inbox as inbox_module  # noqa: E402
from oscar.chat import answer  # noqa: E402
from oscar.gmail import body_text  # noqa: E402
from oscar.overview import brief  # noqa: E402


def test_one_bad_email_doesnt_stop_the_check(tmp_path):
    fake = FakeGmail(INBOX)
    real_handler = fake.handler

    def flaky(request: httpx.Request):
        if request.url.path.endswith("/messages/m2") and request.url.params.get("format") == "full":
            return httpx.Response(500, json={})
        return real_handler(request)

    fake.handler = flaky
    history = History()
    result = sync(history, GmailClient(connected(tmp_path), httpx.Client(transport=httpx.MockTransport(flaky))))
    assert (result.new, result.skipped) == (2, 1)
    # It's tried again next time.
    fake.handler = real_handler
    assert sync(history, GmailClient(connected(tmp_path), fake.http())).new == 1


def test_only_one_check_at_a_time(tmp_path):
    inbox_module._syncing.acquire()
    try:
        with pytest.raises(inbox_module.AlreadySyncing):
            sync(History(), GmailClient(connected(tmp_path), FakeGmail(INBOX).http()))
    finally:
        inbox_module._syncing.release()


def test_a_gmail_hiccup_isnt_a_deleted_email(tmp_path):
    fake = FakeGmail(INBOX)
    history = History()
    sync(history, GmailClient(connected(tmp_path), fake.http()))
    before = len(history.follow_ups)

    def busy(request: httpx.Request):
        if request.url.params.get("format") == "minimal" and "/messages/" in request.url.path:
            return httpx.Response(429, json={})
        return fake.handler(request)

    sync(history, GmailClient(connected(tmp_path), httpx.Client(transport=httpx.MockTransport(busy))))
    assert len(history.follow_ups) == before
    assert not any(f.gone for f in history.follow_ups)


def test_reads_the_emails_charset():
    data = base64.urlsafe_b64encode("Überweisung fällig".encode("latin-1")).decode()
    part = {"mimeType": "text/plain", "headers": [{"name": "Content-Type", "value": 'text/plain; charset="ISO-8859-1"'}],
            "body": {"data": data}}
    assert body_text(part) == "Überweisung fällig"


def test_chat_and_brief_say_what_oscar_would_do(tmp_path):
    history = History()
    sync(history, GmailClient(connected(tmp_path), FakeGmail(INBOX).http()))
    summary = brief(history)["summary"]
    assert summary.startswith("I read 3 emails! I'd have") and "left to review" in summary
    handled = answer(history, "what did you handle?").reply
    assert handled.startswith("I'm only watching your inbox") and "I handled" not in handled
    assert "I did these" not in answer(history, "what needs me?").reply


def test_marketing_padding_is_removed():
    # Marketing emails pad the plain-text part with invisible spacers, often written out
    # as "&zwnj;" text, so the inbox preview looks tidy. Oscar should read the words.
    plain = "&zwnj; &zwnj;&nbsp;&zwnj; ‌​͏­﻿ Free standard shipping &amp; returns"
    part = {"mimeType": "text/plain", "body": {"data": base64.urlsafe_b64encode(plain.encode()).decode()}}
    assert body_text(part) == "Free standard shipping & returns"


def test_keeps_gmails_preview():
    raw = message("p", "a@b.example", "Sale", "body")
    raw["snippet"] = "&zwnj; Free shipping &amp; returns \u200c"
    _, info = parse_message(raw)
    assert info.preview == "Free shipping & returns"


def test_email_content_for_showing():
    from oscar.gmail import email_content

    raw = message("h", "shop@x.example", "Sale", (
        '<html><head><meta http-equiv="refresh" content="0;url=https://evil.example"><script>alert(1)</script>'
        '<link rel="stylesheet" href="https://x.example/a.css"></head>'
        '<body onload="steal()"><p>Big &amp; bold</p><a href="javascript:alert(1)">x</a>'
        '<a href="https://shop.example">Shop</a><img src="https://t.example/pixel.gif"><form action="/x"><input></form>'
        '<iframe src="https://evil.example"></iframe></body></html>'), html=True)
    content = email_content(raw)
    page = content["html"]
    for bad in ("<script", "http-equiv", "onload", "javascript:", "<form", "<iframe", "<link"):
        assert bad not in page.lower(), bad
    assert "https://shop.example" in page and "Big &amp; bold" in page
    assert "Big & bold" in content["text"]


class StubReader:
    """Stands in for the model: reads every email as a receipt."""

    def read(self, email):
        from oscar.understand import Understanding
        return Understanding(kind="receipt", summary="An order receipt", confidence=0.9)


def test_sync_uses_the_model_only_when_it_is_turned_on(tmp_path):
    from oscar.inbox import reader_for
    history = History()
    assert reader_for(history) is None, "reading real email with a model is off by default"
    sync(history, GmailClient(connected(tmp_path), FakeGmail(INBOX, sent_to={"friend@example.com"}).http()),
         reader=StubReader())
    assert {d.summary for d in history.decisions.values()} == {"An order receipt"}
