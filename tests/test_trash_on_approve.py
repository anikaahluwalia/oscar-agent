"""Deleting an email: only when it asked to be deleted, Oscar asked you, and you held to approve.
Then it goes to the Trash (not for good), stays on your lists as handled, and undo takes it back out.
He never does it on his own, a rule can't make him, and a safety stop is never deleted."""

from fastapi.testclient import TestClient

from oscar import demo
from oscar.act import ActionError, can_trash, trash
from oscar.history import History
from oscar.models import Action, AutonomyLevel, Decision, GmailInfo
from oscar.pretend_gmail import PretendGmail, gmail_message

import pytest

JSON = {"content-type": "application/json"}


def a_delete(level=AutonomyLevel.ASK_FIRST, action=Action.PERMANENTLY_DELETE) -> Decision:
    return Decision(email_id="m1", sender="elliot@partner.example", subject="Re: spreadsheet", action=action,
                    autonomy_level=level, confidence=0.9, explanation="It asks to delete email for good.", matched_pattern="delete it for good",
                    gmail=GmailInfo(message_id="m1", thread_id="t-m1", labels=["INBOX"]))


def test_only_a_delete_oscar_asked_about_can_be_trashed():
    assert can_trash(a_delete())
    assert not can_trash(a_delete(AutonomyLevel.ESCALATE))  # a safety stop: never
    assert not can_trash(a_delete(AutonomyLevel.PROCEED_SILENTLY))  # never on his own
    assert not can_trash(a_delete(action=Action.ARCHIVE))


def test_trash_and_undo_in_gmail():
    gmail = PretendGmail([gmail_message("m1", "elliot@partner.example", "Re: spreadsheet", "please delete it")], trash=True)
    history, decision = History(), a_delete()
    history.add_decision(decision)
    trash(history, gmail.client(), decision)
    assert "TRASH" in gmail.messages["m1"]["labelIds"]
    with pytest.raises(ActionError):
        trash(history, gmail.client(), decision)  # once
    from oscar.act import undo
    undo(history, gmail.client(), decision.id)
    assert "TRASH" not in gmail.messages["m1"]["labelIds"]


def test_deleting_for_good_is_still_refused():
    gmail = PretendGmail([gmail_message("m1", "a@b.example", "hi", "x")], trash=True)
    response = gmail.client().http.delete("https://gmail.googleapis.com/gmail/v1/users/me/messages/m1")
    assert response.status_code == 403 and "m1" in gmail.messages


def test_in_the_demo(monkeypatch):
    monkeypatch.setattr(demo, "SESSIONS", demo.Sessions())
    client = TestClient(__import__("oscar.api", fromlist=["app"]).app, headers={**JSON, "X-Oscar-Demo": "trash-test-1"})
    client.post("/demo/start")
    client.post("/demo/check")
    rows = client.get("/decisions").json()
    d = next(r["decision"] for r in rows if r["decision"]["action"] == "PERMANENTLY_DELETE")
    assert d["autonomy_level"] == "ASK_FIRST"
    reply = client.post("/feedback", json={"decision_id": d["id"], "kind": "APPROVE"}).json()["reply"]
    assert "Trash" in reply
    row = next(r for r in client.get("/decisions").json() if r["decision"]["id"] == d["id"])
    assert row["done"]["trashed"] and not row["gone"]  # still on your lists, so you can undo it
    client.post("/feedback", json={"decision_id": d["id"], "kind": "UNDO"})
    inbox = demo.SESSIONS.inbox(demo.SESSIONS.get("trash-test-1"))
    assert "TRASH" not in inbox.messages[d["email_id"]]["labelIds"]
