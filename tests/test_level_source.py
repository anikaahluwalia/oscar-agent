"""decide() says which step set the level, so the UI can explain it."""

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
    events = [FeedbackEvent(decision_id="d", kind=FeedbackKind.APPROVE, action=Action.ARCHIVE,
                            autonomy_level=AutonomyLevel.ASK_FIRST, sender=email.sender) for _ in range(3)]
    decision = decide(email, Preferences.from_feedback(events))
    assert decision.level_source == "learned"
    assert decision.learned
