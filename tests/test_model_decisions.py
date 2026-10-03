"""Stage 11: how the model's reading changes Oscar's decisions, and what it can never change."""

from oscar.agent import decide
from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.models import Action, AutonomyLevel, Email
from oscar.preferences import Preferences
from oscar.understand import Understanding

S, N, A, E = (AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY, AutonomyLevel.ASK_FIRST,
              AutonomyLevel.ESCALATE)


def read_as(kind: str, confidence: float = 0.9) -> Understanding:
    return Understanding(kind=kind, summary=f"A {kind}", confidence=confidence)


def email(body: str, sender: str = "someone@site.example", category: str | None = None) -> Email:
    return Email(id="x", sender=sender, subject="Hello", body=body, category=category)


PLAIN = email("Hope you're well. Some thoughts on the plan below.")


def test_the_model_fills_in_when_the_rules_found_nothing():
    assert decide(PLAIN).level_source == "guess"
    d = decide(PLAIN, understanding=read_as("receipt"))
    assert d.action == Action.APPLY_LABEL and d.autonomy_level == S
    assert d.understood_by == "model" and d.summary == "A receipt" and d.email_type == "receipt"


def test_a_low_confidence_reading_is_still_a_guess():
    d = decide(PLAIN, understanding=read_as("receipt", confidence=0.4))
    assert d.level_source == "guess" and d.understood_by is None


def test_list_mail_never_gets_a_reply_drafted():
    promo = email("Big news inside!", sender="deals@shop.example", category="promotions")
    d = decide(promo, understanding=read_as("question"))
    assert d.action != Action.DRAFT_REPLY


def test_the_promotions_setting_applies_but_new_senders_are_still_asked():
    promo = email("Big news inside!", sender="deals@shop.example", category="promotions")
    d = decide(promo, bulk_action=Action.MARK_READ, understanding=read_as("marketing"))
    assert d.action == Action.MARK_READ and d.autonomy_level == A


def test_a_risky_reading_stops_the_email():
    d = decide(PLAIN, understanding=read_as("scam"))
    assert d.autonomy_level == E and d.level_source == "model_check"
    money = decide(PLAIN, understanding=read_as("money_request"))
    assert money.action == Action.MOVE_MONEY and money.autonomy_level == E


def test_a_benign_reading_never_beats_a_safety_check():
    wire = email("Please wire $4,000 to the account below today.")
    d = decide(wire, understanding=read_as("marketing"), model_first=True)
    assert d.autonomy_level == E and d.level_source in ("safety_check", "floor")


def test_the_model_never_replaces_a_floored_rule_action():
    confirm = email("Please confirm you can make Thursday.")
    rules = decide(confirm)
    d = decide(confirm, understanding=read_as("account_update"), model_first=True)
    assert (d.action, d.autonomy_level) == (rules.action, rules.autonomy_level)


def test_model_first_replaces_a_low_risk_rule_action():
    receipt = email("Your order has shipped. Tracking number inside.")
    d = decide(receipt, understanding=read_as("account_update"), model_first=True)
    assert d.action == Action.MARK_READ and d.understood_by == "model"


def test_a_risky_reading_beats_a_learned_habit():
    sender = "news@letter.example"
    taught = [FeedbackEvent(decision_id=f"d{i}", kind=FeedbackKind.APPROVE, action=Action.ARCHIVE,
                            autonomy_level=A, sender=sender) for i in range(10)]
    d = decide(email("Weekly digest. View in browser.", sender=sender), Preferences.from_feedback(taught),
               understanding=read_as("instructions_for_ai"))
    assert d.autonomy_level == E
