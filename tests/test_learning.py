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
