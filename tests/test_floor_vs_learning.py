"""Learning must never take Oscar below the safety floor.

These tests skip the feedback rules and write feedback events directly, as if
the feedback file had been edited or filled with bad data, then check that every
risky email still gets at least its floor.
"""

import json
import random
from pathlib import Path

import pytest

from oscar.agent import decide
from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.models import Action, AutonomyLevel, Email
from oscar.preferences import Preferences
from oscar.safety import ACTION_FLOORS, LEVEL_ORDER

ROOT = Path(__file__).resolve().parent.parent
LEVELS = list(AutonomyLevel)
RISKY_EMAILS = ["vendor_wire.json", "password_request.json", "sent_in_error.json", "confirm_time.json",
                "forward_request.json", "meeting_invite.json", "reengagement.json"]


def load(path: Path) -> Email:
    return Email.model_validate_json(path.read_text())


def flagged_scenarios() -> list[Email]:
    scenarios = json.loads((ROOT / "scenarios" / "baseline.json").read_text())
    emails = [Email(id=s["id"], **s["email"]) for s in scenarios]
    return [e for e in emails if decide(e).safety_flags]


def fake_yes(action: Action, n: int) -> list[FeedbackEvent]:
    return [FeedbackEvent(decision_id="fake", kind=FeedbackKind.ALWAYS_DO_THIS, action=action,
                          autonomy_level=AutonomyLevel.ASK_FIRST, sender="x@y.example") for _ in range(n)]


def everything_approved() -> Preferences:
    return Preferences.from_feedback([e for a in Action for e in fake_yes(a, 100)])


def at_least(level: AutonomyLevel, floor: AutonomyLevel) -> bool:
    return LEVEL_ORDER.index(level) >= LEVEL_ORDER.index(floor)


@pytest.mark.parametrize("name", RISKY_EMAILS)
def test_risky_actions_stay_at_their_floor(name):
    decision = decide(load(ROOT / "emails" / name), everything_approved())
    assert decision.action in ACTION_FLOORS
    assert at_least(decision.autonomy_level, ACTION_FLOORS[decision.action][0])


def test_flagged_emails_stay_escalated():
    emails = flagged_scenarios()
    assert len(emails) >= 10
    prefs = everything_approved()
    for email in emails:
        assert decide(email, prefs).autonomy_level == AutonomyLevel.ESCALATE, email.id


def test_random_feedback_never_beats_the_floor():
    # Without feedback every one of these emails is already at its floor, so
    # feedback can only keep it there or make it stricter.
    rng = random.Random(7)
    emails = [load(ROOT / "emails" / n) for n in RISKY_EMAILS] + flagged_scenarios()
    baseline = {e.id: decide(e).autonomy_level for e in emails}
    for _ in range(200):
        events = [
            FeedbackEvent(decision_id="fake", kind=rng.choice(list(FeedbackKind)), action=rng.choice(list(Action)),
                          autonomy_level=rng.choice(LEVELS), sender="x@y.example",
                          blocked_by_floor=rng.random() < 0.2)
            for _ in range(rng.randint(0, 60))
        ]
        prefs = Preferences.from_feedback(events)
        for email in emails:
            level = decide(email, prefs).autonomy_level
            assert at_least(level, baseline[email.id]), email.id
