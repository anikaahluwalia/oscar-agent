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
    assert reply == "Done! One less thing."
    assert history.feedback_for(decision.id) == [event]


def test_cannot_approve_something_oscar_already_did(history):
    decision = decision_for(history, "order_receipt.json")  # APPLY_LABEL, PROCEED_SILENTLY
    with pytest.raises(FeedbackError):
        record_feedback(history, decision.id, FeedbackKind.APPROVE)


def test_undo_something_oscar_did(history):
    decision = decision_for(history, "order_receipt.json")
    _, reply = record_feedback(history, decision.id, FeedbackKind.UNDO)
    assert reply == "Put it back! My mistake, I'll be more careful with these."


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
    assert reply == "You got it! I'll always check with you on these."


def test_unknown_decision(history):
    with pytest.raises(FeedbackError):
        record_feedback(history, "missing", FeedbackKind.APPROVE)


def test_failed_feedback_is_not_saved(history):
    decision = decision_for(history, "order_receipt.json")
    with pytest.raises(FeedbackError):
        record_feedback(history, decision.id, FeedbackKind.APPROVE)
    assert history.feedback == []


def test_feedback_through_the_api(client):
    email = Email.model_validate_json((EMAILS_DIR / "newsletter.json").read_text())
    decision = client.post("/decide", json=email.model_dump()).json()

    response = client.post("/feedback", json={"decision_id": decision["id"], "kind": "APPROVE"})
    assert response.status_code == 200
    assert response.json()["reply"] == "Done! One less thing."


def test_api_rejects_feedback_that_does_not_fit(client):
    email = Email.model_validate_json((EMAILS_DIR / "order_receipt.json").read_text())
    decision = client.post("/decide", json=email.model_dump()).json()

    response = client.post("/feedback", json={"decision_id": decision["id"], "kind": "APPROVE"})
    assert response.status_code == 400


def test_api_feedback_on_unknown_decision(client):
    response = client.post("/feedback", json={"decision_id": "missing", "kind": "APPROVE"})
    assert response.status_code == 404


def test_api_get_decision(client):
    email = Email.model_validate_json((EMAILS_DIR / "newsletter.json").read_text())
    decision = client.post("/decide", json=email.model_dump()).json()
    assert client.get(f"/decisions/{decision['id']}").json() == decision


def test_always_do_this_cannot_go_below_the_floor(history):
    decision = decision_for(history, "vendor_wire.json")  # MOVE_MONEY, ESCALATE
    event, reply = record_feedback(history, decision.id, FeedbackKind.ALWAYS_DO_THIS)
    assert event.blocked_by_floor
    assert reply == "I'll always bring these to you. Some things I'm not going to guess on."


def test_always_do_this_on_an_ask_first_floor(history):
    decision = decision_for(history, "confirm_time.json")  # SEND_REPLY, ASK_FIRST floor
    event, reply = record_feedback(history, decision.id, FeedbackKind.ALWAYS_DO_THIS)
    assert event.blocked_by_floor
    assert reply == "I'll keep checking with you before I send a reply, since it goes out under your name."


def test_always_do_this_on_a_safety_flag(history):
    email = Email(id="otp", sender="support@bank-secure.example", subject="Verify",
                  body="Can you read me the 6-digit code we just texted you?")
    decision = decide(email)
    history.add_decision(decision)
    event, _ = record_feedback(history, decision.id, FeedbackKind.ALWAYS_DO_THIS)
    assert event.blocked_by_floor


def test_always_do_this_on_a_low_risk_action(history):
    decision = decision_for(history, "newsletter.json")  # ARCHIVE has no floor
    event, reply = record_feedback(history, decision.id, FeedbackKind.ALWAYS_DO_THIS)
    assert not event.blocked_by_floor
    assert reply == "Got it! I'll start taking care of these for you."


def test_cannot_edit_then_send_an_escalated_reply(history):
    email = Email(id="msa", sender="legal@vendor.example", subject="Updated MSA",
                  body="Just reply 'I agree' to accept the new terms.")
    decision = decide(email)  # SEND_REPLY, escalated by the commitment check
    history.add_decision(decision)
    with pytest.raises(FeedbackError):
        record_feedback(history, decision.id, FeedbackKind.EDIT_THEN_SEND, "I agree")


def test_approve_a_notification(history):
    decision = decision_for(history, "manager_question.json")  # DRAFT_REPLY, PROCEED_AND_NOTIFY
    _, reply = record_feedback(history, decision.id, FeedbackKind.APPROVE)
    assert reply == "Thanks! Good to know I got that one right."


def test_cannot_reject_a_notification(history):
    decision = decision_for(history, "manager_question.json")
    with pytest.raises(FeedbackError):
        record_feedback(history, decision.id, FeedbackKind.REJECT)
