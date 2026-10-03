"""Each decision says, in a few words, what set its level: for the UI, never Oscar's working-out."""

from oscar.agent import decide
from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.models import Action, AutonomyLevel, Email
from oscar.preferences import Preferences

NEWSLETTER = Email(id="n", sender="digest@letters.example", subject="This week",
                   body="Top stories this week. View in browser. Unsubscribe", bulk=True)


def test_a_learned_level_says_what_it_rests_on():
    first = decide(NEWSLETTER)
    events = [FeedbackEvent(decision_id=f"d{i}", kind=FeedbackKind.REVIEW, action=first.action,
                            desired_level=AutonomyLevel.PROCEED_SILENTLY, autonomy_level=AutonomyLevel.ASK_FIRST,
                            sender=NEWSLETTER.sender, email_type=first.email_type) for i in range(4)]
    decision = decide(NEWSLETTER, Preferences.from_feedback(events))
    assert decision.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY
    assert decision.preference and decision.preference.scope == "sender" and decision.preference.evidence == 4
    assert "A sender you've taught me about" in decision.factors
    assert any("told me so 4 times" in f and "% sure" in f for f in decision.factors)
    assert decision.safety_floor is None and decision.safety_rule is None


def test_how_sure_he_is_is_the_number_that_set_the_level():
    # 4 answers: 75% sure you're fine with him acting, which is what moves him to "tell me".
    # It used to say 62% (how sure he was about doing it quietly), which read like he broke his rule.
    first = decide(NEWSLETTER)
    events = [FeedbackEvent(decision_id=f"d{i}", kind=FeedbackKind.REVIEW, action=first.action,
                            desired_level=AutonomyLevel.PROCEED_SILENTLY, autonomy_level=AutonomyLevel.ASK_FIRST,
                            sender=NEWSLETTER.sender, email_type=first.email_type) for i in range(8)]
    for n, level, sure in ((4, AutonomyLevel.PROCEED_AND_NOTIFY, 0.75), (8, AutonomyLevel.PROCEED_SILENTLY, 0.75)):
        decision = decide(NEWSLETTER, Preferences.from_feedback(events[:n]))
        assert decision.autonomy_level == level and decision.preference.confidence == sure
        assert any(f"told me so {n} times (75% sure)" in f for f in decision.factors)


def test_a_stopped_email_names_the_rule():
    decision = decide(Email(id="w", sender="billing@vendor.example", subject="Overdue",
                            body="Please wire $4,800 today to the new account below."))
    assert decision.autonomy_level == AutonomyLevel.ESCALATE and decision.safety_floor == AutonomyLevel.ESCALATE
    assert decision.safety_rule and decision.preference is None
    assert any(f.startswith("Safety rule:") for f in decision.factors)
    assert decision.action == Action.MOVE_MONEY
