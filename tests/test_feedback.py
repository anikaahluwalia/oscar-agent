from pathlib import Path

import pytest

from oscar.agent import decide
from oscar.feedback import FeedbackError, FeedbackKind, record_feedback
from oscar.history import History
from oscar.models import Email

EMAILS_DIR = Path(__file__).resolve().parent.parent / "emails"


def decision_for(history: History, email_file: str):
    email = Email.model_validate_json((EMAILS_DIR / email_file).read_text())
    decision = decide(email)
    history.add_decision(decision)
    return decision


@pytest.fixture
def history():
    return History()


def test_approve_an_ask_first_decision(history):
    decision = decision_for(history, "newsletter.json")  # ARCHIVE, ASK_FIRST
    event, reply = record_feedback(history, decision.id, FeedbackKind.APPROVE)
    assert event.action == decision.action
    assert event.sender == decision.sender
    assert reply == "Done."
    assert history.feedback_for(decision.id) == [event]


def test_cannot_approve_something_oscar_already_did(history):
    decision = decision_for(history, "order_receipt.json")  # APPLY_LABEL, PROCEED_SILENTLY
    with pytest.raises(FeedbackError):
        record_feedback(history, decision.id, FeedbackKind.APPROVE)


def test_undo_something_oscar_did(history):
    decision = decision_for(history, "order_receipt.json")
    _, reply = record_feedback(history, decision.id, FeedbackKind.UNDO)
    assert reply == "Put it back. Sorry about that."


def test_cannot_undo_something_oscar_only_asked_about(history):
    decision = decision_for(history, "newsletter.json")
    with pytest.raises(FeedbackError):
        record_feedback(history, decision.id, FeedbackKind.UNDO)


def test_edit_then_send_on_a_draft(history):
    decision = decision_for(history, "manager_question.json")  # DRAFT_REPLY
    event, _ = record_feedback(history, decision.id, FeedbackKind.EDIT_THEN_SEND, "Sure, by Thursday.")
    assert event.edited_text == "Sure, by Thursday."


def test_edit_then_send_needs_text(history):
    decision = decision_for(history, "manager_question.json")
    with pytest.raises(FeedbackError):
        record_feedback(history, decision.id, FeedbackKind.EDIT_THEN_SEND)


def test_edit_then_send_only_on_replies(history):
    decision = decision_for(history, "newsletter.json")
    with pytest.raises(FeedbackError):
        record_feedback(history, decision.id, FeedbackKind.EDIT_THEN_SEND, "hi")


def test_always_ask_me(history):
    decision = decision_for(history, "order_receipt.json")
    _, reply = record_feedback(history, decision.id, FeedbackKind.ALWAYS_ASK_ME)
    assert reply == "Okay. I'll always check with you on these."


def test_unknown_decision(history):
    with pytest.raises(FeedbackError):
        record_feedback(history, "missing", FeedbackKind.APPROVE)


def test_failed_feedback_is_not_saved(history):
    decision = decision_for(history, "order_receipt.json")
    with pytest.raises(FeedbackError):
        record_feedback(history, decision.id, FeedbackKind.APPROVE)
    assert history.feedback == []
