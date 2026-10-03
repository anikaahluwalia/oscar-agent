"""Oscar's call on each email as a coloured label in Gmail: Handled, FYI, Needs you, Stopped.

Only while he's allowed to act, never anything but his own labels, and never a label you put there yourself."""

import json

import httpx

from oscar.act import TAGS_PER_CHECK
from oscar.gmail import OSCAR_LABELS, GmailClient
from oscar.history import History
from tests.fake_gmail import FakeGmail, connected, message
from tests.test_acting import NEWSLETTER, RECEIPT, WIRE, api, decision_for, names, new, writes  # noqa: F401


def made(fake):
    """The labels Oscar asked Gmail to make, as sent."""
    return [json.loads(r.content) for r in writes(fake) if r.url.path.endswith("/labels")]


def test_each_email_gets_his_call_in_its_own_colour_with_a_plain_name(api):
    client, real, fake = api([RECEIPT, NEWSLETTER, WIRE])
    assert client.post("/gmail/sync").json()["labelled"] == 3
    assert names(fake, "r1") == ["Handled", "INBOX", "Receipts", "UNREAD"]
    assert names(fake, "n1") == ["INBOX", "Needs you", "UNREAD"]
    assert names(fake, "w1") == ["INBOX", "Stopped", "UNREAD"]
    for label in made(fake):
        assert "/" not in label["name"]
        assert label["color"] == dict(zip(("backgroundColor", "textColor"), OSCAR_LABELS[label["name"]]))


def test_the_backlog_is_labelled_but_nothing_else_about_it_changes(api):
    old = [message(f"o{i}", f"orders{i}@shop.example", "Your receipt", "Your receipt is attached.") for i in range(3)]
    client, real, fake = api(old)
    result = client.post("/gmail/sync").json()
    assert result["done"] == 0 and result["labelled"] == 3
    for i in range(3):
        assert names(fake, f"o{i}") == ["FYI", "INBOX", "UNREAD"], "not handled: he didn't do anything to it"


def test_a_few_at_a_time(api):
    old = [message(f"o{i}", f"orders{i}@shop.example", "Your receipt", "Your receipt is attached.") for i in range(TAGS_PER_CHECK + 5)]
    client, real, fake = api(old)
    assert client.post("/gmail/sync?limit=100").json()["labelled"] == TAGS_PER_CHECK
    assert client.post("/gmail/sync?limit=100").json()["labelled"] == 5
    assert client.post("/gmail/sync?limit=100").json()["labelled"] == 0, "nothing to redo"


def test_the_label_follows_his_call(api):
    client, real, fake = api([NEWSLETTER])
    client.post("/gmail/sync")
    assert names(fake, "n1") == ["INBOX", "Needs you", "UNREAD"]
    client.post("/feedback", json={"decision_id": decision_for(real, "n1").id, "kind": "APPROVE"})
    client.post("/gmail/sync")
    assert names(fake, "n1") == ["Handled", "UNREAD"], "archived by you, and his old label taken off"


def test_a_label_you_put_there_yourself_is_never_taken_off(api):
    client, real, fake = api([NEWSLETTER])
    fake.labels.append({"id": "Label_7", "name": "needs you"})  # yours, already there
    fake.messages["n1"]["labelIds"].append("Label_7")
    client.post("/gmail/sync")
    assert not [label for label in made(fake) if label["name"].lower() == "needs you"], "he used yours"
    client.post("/feedback", json={"decision_id": decision_for(real, "n1").id, "kind": "APPROVE"})
    client.post("/gmail/sync")
    assert "Label_7" in fake.messages["n1"]["labelIds"]


def test_nothing_is_labelled_once_acting_is_off(api):
    client, real, fake = api([NEWSLETTER])
    client.post("/gmail/acting", json={"on": False})
    assert client.post("/gmail/sync").json()["labelled"] == 0
    assert names(fake, "n1") == ["INBOX", "UNREAD"]


def test_an_email_you_deleted_is_left_alone(api):
    client, real, fake = api([message("o1", "a@shop.example", "Your receipt", "Your receipt is attached.")])
    client.post("/gmail/acting", json={"on": False})
    client.post("/gmail/sync")
    client.post("/gmail/acting", json={"on": True})
    del fake.messages["o1"]
    assert client.post("/gmail/sync").json()["labelled"] == 0
    assert real.tags["o1"].label is None, "noted as gone, so it isn't tried again"


def test_if_gmail_turns_down_the_colour_the_label_is_plain(tmp_path):
    fake = FakeGmail([message("m1", "a@b.example", "Hi", "Hello")])
    plain = fake.handler

    def picky(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/labels") and request.method == "POST" and b"color" in request.content:
            return httpx.Response(400, json={})
        return plain(request)
    client = GmailClient(connected(tmp_path), httpx.Client(transport=httpx.MockTransport(picky)))
    assert client.label_id("FYI") and fake.labels[-1]["name"] == "FYI"


def test_only_his_own_label_names(tmp_path):
    import pytest

    from oscar.gmail import GmailError
    client = GmailClient(connected(tmp_path), FakeGmail([]).http())
    with pytest.raises(GmailError):
        client.label_id("Work")


def test_his_old_oscar_labels_are_still_his_so_undo_works(tmp_path):
    fake = FakeGmail([message("m1", "a@b.example", "Hi", "Hello", labels=("INBOX", "Label_5"))])
    fake.labels.append({"id": "Label_5", "name": "Oscar/Receipts"})
    client = GmailClient(connected(tmp_path), fake.http())
    client.modify_labels("m1", add=[], remove=["Label_5"])
    assert fake.messages["m1"]["labelIds"] == ["INBOX"]


def test_what_he_labelled_is_remembered(tmp_path, api):
    client, real, fake = api([NEWSLETTER])
    real.data_dir = tmp_path / "inbox"
    real.data_dir.mkdir()
    client.post("/gmail/sync")
    assert History(real.data_dir).tags["n1"].label == "Needs you"
