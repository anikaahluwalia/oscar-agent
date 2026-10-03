"""The basic chat, which needs no model: what needs you, why Oscar made a call, what he handled, and
plain requests turned into rules. A rule that would go below the safety floor is refused."""

from pathlib import Path

from oscar.agent import decide
from oscar.chat import answer
from oscar.feedback import FeedbackKind, record_feedback
from oscar.history import History
from oscar.models import AutonomyLevel, Email
from oscar.preferences import Preferences

EMAILS_DIR = Path(__file__).resolve().parent.parent / "emails"


def inbox() -> History:
    history = History()
    for path in sorted(EMAILS_DIR.glob("*.json")):
        history.add_decision(decide(Email.model_validate_json(path.read_text()), Preferences.from_feedback(history.feedback)))
    return history


def by_email(history: History, email_id: str):
    return next(d for d in history.decisions.values() if d.email_id == email_id)


def test_what_needs_me():
    history = inbox()
    r = answer(history, "What needs me?")
    assert r.reply.startswith("For you:")
    assert by_email(history, "vendor_wire").id in r.decisions


def test_what_needs_me_matches_the_brief():
    from oscar.overview import brief

    history = inbox()
    r = answer(history, "What needs me?")
    # Same list as the headline: for you, waiting, and what he told you about.
    assert "in case you want to check" in r.reply
    assert brief(history)["summary"].startswith(f"{len(r.decisions)} emails need you.")
    for d in list(history.decisions.values()):
        level = d.autonomy_level
        if level == AutonomyLevel.ESCALATE:
            record_feedback(history, d.id, FeedbackKind.SEEN)
        elif level == AutonomyLevel.ASK_FIRST:
            record_feedback(history, d.id, FeedbackKind.REJECT)
        elif level == AutonomyLevel.PROCEED_AND_NOTIFY:
            record_feedback(history, d.id, FeedbackKind.APPROVE)
    assert answer(history, "What needs me?").reply.startswith("All quiet!")


def test_what_did_you_handle():
    r = answer(inbox(), "what did you handle today?")
    assert "I quietly handled 3" in r.reply


def test_what_do_you_know_before_feedback():
    assert answer(inbox(), "what do you know about me?").reply.startswith("Nothing yet!")


def test_why_about_an_email():
    history = inbox()
    wire = by_email(history, "vendor_wire")
    r = answer(history, "why?", wire.id)
    assert r.reply.startswith(wire.explanation)
    assert "checked my safety rules" in r.reply
    # What Oscar noticed is in the explanation already, so it's said once.
    assert r.reply.count(wire.noticed) == 1


def test_why_without_an_email():
    assert answer(inbox(), "why?").reply.startswith("Which email?")


def test_teach_a_rule():
    history = inbox()
    r = answer(history, "Always archive emails from digest@morningbrew-weekly.example")
    assert r.reply == "Got it! I'll start taking care of these for you."
    assert history.feedback[-1].kind == FeedbackKind.ALWAYS_DO_THIS
    # The rule took effect: the newsletter is no longer asked about.
    again = decide(Email.model_validate_json((EMAILS_DIR / "newsletter.json").read_text()), Preferences.from_feedback(history.feedback))
    assert again.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY


def test_always_ask_me_rule():
    history = inbox()
    r = answer(history, "always ask me about emails from casey@company.example")
    assert r.reply == "You got it! I'll always check with you on these."


def test_safety_floor_answers_in_chat():
    history = inbox()
    r = answer(history, "always pay invoices from accounts@supplier.example")
    assert r.reply.startswith("I'll always bring these to you.")
    assert history.feedback == []


def test_floor_for_ask_first_actions():
    history = inbox()
    r = answer(history, "always forward emails from alex@company.example")
    assert r.reply.startswith("I'll keep checking with you before I forward this")


def test_unknown_sender():
    assert "haven't seen anything from" in answer(inbox(), "always archive emails from nobody@x.example").reply


def test_unknown_request_is_honest():
    assert answer(inbox(), "book me a flight to Toronto").reply.startswith("That one's beyond me for now.")


def test_chat_endpoint(client):
    client.post("/demo/inbox")
    r = client.post("/chat", json={"message": "what needs me?"}).json()
    assert r["reply"].startswith("For you:")


def test_dont_ask_me_means_go_ahead():
    history = inbox()
    answer(history, "don't ask me about archiving emails from digest@morningbrew-weekly.example")
    assert history.feedback[-1].kind == FeedbackKind.ALWAYS_DO_THIS


def test_stop_asking_means_go_ahead():
    history = inbox()
    answer(history, "stop asking me about archiving emails from digest@morningbrew-weekly.example")
    assert history.feedback[-1].kind == FeedbackKind.ALWAYS_DO_THIS


def test_never_archive_means_ask():
    history = inbox()
    answer(history, "never archive emails from digest@morningbrew-weekly.example")
    assert history.feedback[-1].kind == FeedbackKind.ALWAYS_ASK_ME


def test_archive_my_promotions_is_a_rule_for_emails_like_this():
    history = inbox()
    reply = answer(history, "please archive promotions").reply
    assert "emails like this" in reply
    assert [(e.kind, e.scope) for e in history.feedback] == [(FeedbackKind.ALWAYS_DO_THIS, "kind")]
