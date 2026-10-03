"""Oscar's call on each email as a coloured label in Gmail: Stopped, Needs you or FYI.

Only while he's allowed to act, never anything but his own labels, and never a label you put there
yourself. Emails he handled on his own get no status label. You can rename any of his labels in
Settings, and the label is renamed in Gmail too (oscar/labels.py)."""

import json

import httpx

from oscar.act import TAGS_PER_CHECK, Tag
from oscar.gmail import GmailClient
from oscar.history import History
from oscar.labels import COLOURS, DEFAULT_NAMES
from tests.fake_gmail import FakeGmail, connected, message
from tests.test_acting import NEWSLETTER, RECEIPT, WIRE, api, decision_for, names, new, writes  # noqa: F401

ROLE_OF = {name: role for role, name in DEFAULT_NAMES.items()}
QUESTION = new("q1", "sam@work.example", "Quick question", "Could you look over the plan before Friday?")


def made(fake):
    """The labels Oscar asked Gmail to make, as sent."""
    return [json.loads(r.content) for r in writes(fake) if r.url.path.endswith("/labels")]


def wires(n, prefix="o"):
    """Old money requests, from before acting was on: he never acts on them, but a safety rule
    stops each one, so each gets "Stopped"."""
    return [message(f"{prefix}{i}", f"accounts{i}@vendor.example", "Overdue", "Please wire me $4,800 today.") for i in range(n)]


def test_each_email_gets_his_call_in_its_own_colour_with_a_plain_name(api):
    client, real, fake = api([RECEIPT, NEWSLETTER, WIRE, QUESTION])
    assert client.post("/gmail/sync").json()["labelled"] == 3
    assert names(fake, "r1") == ["INBOX", "Receipts", "UNREAD"], "handled on his own: no status label"
    assert names(fake, "n1") == ["INBOX", "Needs you", "UNREAD"]
    assert names(fake, "w1") == ["INBOX", "Stopped", "UNREAD"]
    assert names(fake, "q1") == ["FYI", "INBOX", "UNREAD"], "he'd draft a reply and tell you"
    for label in made(fake):
        assert "/" not in label["name"] and label["name"] != "Handled"
        assert label["color"] == dict(zip(("backgroundColor", "textColor"), COLOURS[ROLE_OF[label["name"]]]))


def test_the_backlog_is_labelled_but_nothing_else_about_it_changes(api):
    client, real, fake = api(wires(3))
    result = client.post("/gmail/sync").json()
    assert result["done"] == 0 and result["labelled"] == 3
    for i in range(3):
        assert names(fake, f"o{i}") == ["INBOX", "Stopped", "UNREAD"]


def test_a_few_at_a_time(api):
    client, real, fake = api(wires(TAGS_PER_CHECK + 5))
    assert client.post("/gmail/sync?limit=100").json()["labelled"] == TAGS_PER_CHECK
    assert client.post("/gmail/sync?limit=100").json()["labelled"] == 5
    assert client.post("/gmail/sync?limit=100").json()["labelled"] == 0, "nothing to redo"


def test_the_label_follows_his_call(api):
    client, real, fake = api([NEWSLETTER])
    client.post("/gmail/sync")
    assert names(fake, "n1") == ["INBOX", "Needs you", "UNREAD"]
    client.post("/feedback", json={"decision_id": decision_for(real, "n1").id, "kind": "APPROVE"})
    client.post("/gmail/sync")
    assert names(fake, "n1") == ["UNREAD"], "archived by you, and his Needs you label taken off"


def test_his_old_handled_label_comes_off(api):
    client, real, fake = api([RECEIPT])
    fake.labels.append({"id": "Label_3", "name": "Handled"})
    fake.messages["r1"]["labelIds"].append("Label_3")
    client.post("/gmail/sync")
    # Saved the way tags were before labels had roles: by name.
    real.tags["r1"] = Tag.model_validate({"email_id": "r1", "message_id": "r1", "label": "Handled", "added": True})
    client.post("/gmail/sync")
    assert "Label_3" not in fake.messages["r1"]["labelIds"]
    assert not [label for label in made(fake) if label["name"] == "Handled"], "and he never makes it again"


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
    client, real, fake = api(wires(1))
    client.post("/gmail/acting", json={"on": False})
    client.post("/gmail/sync")
    client.post("/gmail/acting", json={"on": True})
    del fake.messages["o0"]
    assert client.post("/gmail/sync").json()["labelled"] == 0
    assert real.tags["o0"].gone, "noted as gone, so it isn't tried again"


def test_if_gmail_turns_down_the_colour_the_label_is_plain(tmp_path):
    fake = FakeGmail([message("m1", "a@b.example", "Hi", "Hello")])
    plain = fake.handler

    def picky(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/labels") and request.method == "POST" and b"color" in request.content:
            return httpx.Response(400, json={})
        return plain(request)
    client = GmailClient(connected(tmp_path), httpx.Client(transport=httpx.MockTransport(picky)))
    assert client.label_id("fyi") and fake.labels[-1]["name"] == "FYI"


def test_only_his_own_labels(tmp_path):
    import pytest

    from oscar.gmail import GmailError
    client = GmailClient(connected(tmp_path), FakeGmail([]).http())
    for role in ("Work", "handled", "INBOX"):
        with pytest.raises(GmailError):
            client.label_id(role)


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
    assert History(real.data_dir).tags["n1"].label == "needs_you"


# --- Renaming his labels ---------------------------------------------------------------------

def test_renaming_a_label_renames_it_in_gmail_and_emails_keep_it(api):
    client, real, fake = api([RECEIPT, NEWSLETTER])
    client.post("/gmail/sync")
    receipts = next(l["id"] for l in fake.labels if l["name"] == "Receipts")
    r = client.post("/labels/rename", json={"role": "receipts", "name": "Purchases"}).json()
    assert r["reply"] == "Done! Receipts is called Purchases now, in Gmail too."
    assert names(fake, "r1") == ["INBOX", "Purchases", "UNREAD"] and receipts in fake.messages["r1"]["labelIds"]
    assert client.get("/app-settings").json()["labels"]["receipts"] == "Purchases"
    item = next(i for i in client.get("/decisions").json() if i["decision"]["email_id"] == "r1")
    assert item["label"] == "Purchases", "the app names the label he used"
    # Undo still finds it, since Gmail kept the same label id.
    assert client.post("/feedback", json={"decision_id": item["decision"]["id"], "kind": "UNDO"}).status_code == 200
    assert names(fake, "r1") == ["INBOX", "UNREAD"]


def test_renaming_a_status_label_and_he_keeps_using_it(api):
    client, real, fake = api([NEWSLETTER, new("n2", "news@other.example", "Digest", "Weekly digest. View in browser.")])
    client.post("/gmail/sync?limit=1")
    client.post("/labels/rename", json={"role": "needs_you", "name": "Waiting on me"})
    client.post("/gmail/sync")
    assert names(fake, "n1") == ["INBOX", "UNREAD", "Waiting on me"]
    assert names(fake, "n2") == ["INBOX", "UNREAD", "Waiting on me"]
    assert len([l for l in fake.labels if l["name"] == "Waiting on me"]) == 1, "the same label, not a second one"


def test_a_name_you_already_use_is_used_from_now_on(api):
    client, real, fake = api([RECEIPT])
    client.post("/gmail/sync")
    fake.labels.append({"id": "Label_8", "name": "Shopping"})  # yours
    r = client.post("/labels/rename", json={"role": "receipts", "name": "Shopping"}).json()
    assert "already have a label called Shopping" in r["reply"]
    assert any(l["name"] == "Receipts" for l in fake.labels), "his old one is left alone"


def test_names_are_checked(api):
    client, real, fake = api([])
    for bad in ("", "Inbox", "FYI", "x" * 50):
        assert client.post("/labels/rename", json={"role": "receipts", "name": bad}).status_code == 400, bad
    assert client.post("/labels/rename", json={"role": "handled", "name": "Done"}).status_code == 400
    assert client.post("/app-settings", json={"labels": {"fyi": "Info"}}).status_code == 400, "only through rename"
    assert client.get("/app-settings").json()["labels"] == DEFAULT_NAMES


def test_without_permission_to_change_gmail_the_name_is_just_saved(api):
    from oscar.gmail import SCOPE
    client, real, fake = api([], scope=SCOPE, acting=False)
    r = client.post("/labels/rename", json={"role": "fyi", "name": "Heads up"}).json()
    assert r["reply"] == "Done! I'll call it Heads up." and not writes(fake)
