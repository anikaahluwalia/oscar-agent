"""A reviewed mistake becomes a draft case without any of the real email in it."""

import json

from oscar.gmail import GmailClient
from oscar.history import History
from oscar.inbox import sync
from oscar.models import Action, AutonomyLevel
from oscar.regression import draft, write_draft
from oscar.review import answer, record_review
from tests.fake_gmail import FakeGmail, connected, message

PRIVATE = ("Hi Sam, your invoice 88412031 is ready at https://billing.realcorp.com/inv/88412031. "
           "Questions? Call 416-555-0199 or write to sam.lee@realcorp.com")


def test_a_draft_keeps_nothing_private(tmp_path):
    history = History()
    sync(history, GmailClient(connected(tmp_path), FakeGmail([
        message("m1", "billing@realcorp.com", "Invoice 88412031 for sam.lee@realcorp.com", PRIVATE)]).http()))
    decision = next(iter(history.decisions.values()))
    record_review(history, answer(decision, AutonomyLevel.PROCEED_AND_NOTIFY, Action.MARK_READ, why="preference"))
    case = draft(history, decision.id)
    text = json.dumps(case)
    for secret in ("realcorp", "88412031", "416-555-0199", "sam.lee", "https://billing"):
        assert secret not in text, secret
    assert case["draft"] and case["id"].startswith("draft-") and case["email"]["sender"] == "billing@sender.example"
    assert case["expect"] == {"level": "PROCEED_AND_NOTIFY", "action": "MARK_READ"}
    path = write_draft(history, decision.id, tmp_path / "drafts")
    assert path.parent.name == "drafts" and json.loads(path.read_text())["draft"] is True
