"""Oscar should ask less as feedback builds up, but never below the safety floor."""

from pathlib import Path

from oscar.agent import decide
from oscar.feedback import FeedbackKind, record_feedback
from oscar.history import History
from oscar.models import AutonomyLevel, Email
from oscar.preferences import Preferences

EMAILS_DIR = Path(__file__).resolve().parent.parent / "emails"


def load(name: str) -> Email:
    return Email.model_validate_json((EMAILS_DIR / name).read_text())


def decide_with(history: History, email: Email):
    decision = decide(email, Preferences.from_feedback(history.feedback))
    history.add_decision(decision)
    return decision


def test_newsletter_archive_asks_then_notifies_then_goes_silent():
    history = History()
    email = load("newsletter.json")
    levels = []
    for _ in range(10):
        decision = decide_with(history, email)
        levels.append(decision.autonomy_level)
        if decision.autonomy_level != AutonomyLevel.PROCEED_SILENTLY:
            record_feedback(history, decision.id, FeedbackKind.APPROVE)

    assert levels[:3] == [AutonomyLevel.ASK_FIRST] * 3
    assert levels[3:8] == [AutonomyLevel.PROCEED_AND_NOTIFY] * 5
    assert levels[8:] == [AutonomyLevel.PROCEED_SILENTLY] * 2


def test_undo_makes_oscar_tell_you_next_time():
    history = History()
    email = load("fyi_update.json")  # MARK_READ, PROCEED_SILENTLY
    first = decide_with(history, email)
    record_feedback(history, first.id, FeedbackKind.UNDO)

    second = decide_with(history, email)
    assert second.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY
    assert second.learned
    assert "you undid this" in second.explanation


def test_oscar_can_earn_it_back_after_an_undo():
    # An undo counts as two no's, so it takes 26 okays to get the mean back to 0.9.
    history = History()
    email = load("fyi_update.json")
    record_feedback(history, decide_with(history, email).id, FeedbackKind.UNDO)
    for _ in range(26):
        decision = decide_with(history, email)
        assert decision.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY
        record_feedback(history, decision.id, FeedbackKind.APPROVE)
    assert decide_with(history, email).autonomy_level == AutonomyLevel.PROCEED_SILENTLY


def test_undo_after_a_notification_goes_back_to_asking():
    history = History()
    email = load("newsletter.json")
    for _ in range(3):
        record_feedback(history, decide_with(history, email).id, FeedbackKind.APPROVE)
    notified = decide_with(history, email)
    assert notified.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY
    record_feedback(history, notified.id, FeedbackKind.UNDO)

    assert decide_with(history, email).autonomy_level == AutonomyLevel.ASK_FIRST


def test_two_undos_make_oscar_ask():
    history = History()
    email = load("fyi_update.json")
    record_feedback(history, decide_with(history, email).id, FeedbackKind.UNDO)
    record_feedback(history, decide_with(history, email).id, FeedbackKind.UNDO)
    assert decide_with(history, email).autonomy_level == AutonomyLevel.ASK_FIRST


def test_always_ask_me_overrides_what_oscar_learned():
    history = History()
    email = load("newsletter.json")
    for _ in range(10):
        decision = decide_with(history, email)
        if decision.autonomy_level != AutonomyLevel.PROCEED_SILENTLY:
            record_feedback(history, decision.id, FeedbackKind.APPROVE)
    silent = decide_with(history, email)
    assert silent.autonomy_level == AutonomyLevel.PROCEED_SILENTLY

    record_feedback(history, silent.id, FeedbackKind.ALWAYS_ASK_ME)
    decision = decide_with(history, email)
    assert decision.autonomy_level == AutonomyLevel.ASK_FIRST
    assert "you asked me to always check with you" in decision.explanation


def test_always_ask_me_on_a_silent_action():
    history = History()
    email = load("order_receipt.json")  # APPLY_LABEL, PROCEED_SILENTLY
    record_feedback(history, decide_with(history, email).id, FeedbackKind.ALWAYS_ASK_ME)
    assert decide_with(history, email).autonomy_level == AutonomyLevel.ASK_FIRST
