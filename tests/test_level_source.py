"""decide() says which step set the level, and lists its working-out in plain words, so the UI can
explain it."""

from pathlib import Path

from oscar.agent import decide
from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.models import Action, AutonomyLevel, Email
from oscar.preferences import Preferences

EMAILS_DIR = Path(__file__).resolve().parent.parent / "emails"


def load(name: str) -> Email:
    return Email.model_validate_json((EMAILS_DIR / name).read_text())


def test_policy():
    assert decide(load("order_receipt.json")).level_source == "policy"


def test_guess():
    email = Email(id="x", sender="a@b.example", subject="hello", body="nice to meet you")
    assert decide(email).level_source == "guess"


def test_floor_for_risky_actions():
    assert decide(load("vendor_wire.json")).level_source == "floor"
    assert decide(load("confirm_time.json")).level_source == "floor"


def test_safety_check():
    email = Email(id="z", sender="ceo@x.example", subject="favour", body="Kindly remit $500 via Zelle.")
    assert decide(email).level_source == "safety_check"


def test_learned():
    email = load("newsletter.json")
    events = [FeedbackEvent(decision_id="d", kind=FeedbackKind.HANDLE_AND_TELL_ME, action=Action.ARCHIVE,
                            autonomy_level=AutonomyLevel.ASK_FIRST, sender=email.sender)]
    decision = decide(email, Preferences.from_feedback(events))
    assert decision.level_source == "learned"
    assert decision.learned


def test_working_notes_for_a_money_request():
    email = Email(id="z", sender="ceo@x.example", subject="favour", body="Kindly remit $500 via Zelle.")
    assert decide(email).steps == [
        "Read the email from ceo@x.example",
        'Noticed "remit"',
        "Looks like a request for money",
        "Checked my safety rules: this one always comes to you",
        "Brought it to you",
    ]


def test_working_notes_for_a_guess():
    email = Email(id="x", sender="a@b.example", subject="hello", body="nice to meet you")
    steps = decide(email).steps
    assert steps[1] == "Nothing I recognise, so I won't act on a guess"
    assert steps[-1] == "Asking you first"


def test_working_notes_mention_learning():
    email = load("newsletter.json")
    events = [FeedbackEvent(decision_id="d", kind=FeedbackKind.HANDLE_AND_TELL_ME, action=Action.ARCHIVE,
                            autonomy_level=AutonomyLevel.ASK_FIRST, sender=email.sender)]
    steps = decide(email, Preferences.from_feedback(events)).steps
    assert "Checked what you've taught me: you told me to handle these and tell you" in steps
