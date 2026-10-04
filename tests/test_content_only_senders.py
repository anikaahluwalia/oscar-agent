"""Senders judged only by what their emails say (OSCAR_CONTENT_ONLY_SENDERS): your own test address,
say, that sends every kind of email. Nothing is learned about them as a sender."""

import pytest

from oscar.agent import decide
from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.models import Action, AutonomyLevel, Email
from oscar.preferences import Preferences, content_only

S, A, E = AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.ASK_FIRST, AutonomyLevel.ESCALATE
TESTER = "Test Account <tester@mail.example>"
PROMO = "Our sale ends Sunday: 25% off everything. Manage your preferences | Unsubscribe"


@pytest.fixture(autouse=True)
def tester(monkeypatch):
    monkeypatch.setenv("OSCAR_CONTENT_ONLY_SENDERS", "someone@else.example, TESTER@mail.example")


def email(body, sender=TESTER, subject="Sale"):
    return Email(id="x", sender=sender, subject=subject, body=body, category="promotions")


def just_handle(sender, scope="sender"):
    return [FeedbackEvent(decision_id=f"d{i}", kind=FeedbackKind.ALWAYS_DO_THIS, action=Action.ARCHIVE, autonomy_level=A,
                          sender=sender, email_type="marketing", desired_level=S, scope=scope) for i in range(3)]


def test_the_list_matches_the_address_whatever_the_name_or_case():
    assert content_only(TESTER) and content_only("tester@MAIL.example") and not content_only("other@mail.example")


def test_nothing_is_learned_about_a_content_only_sender():
    prefs = Preferences.from_feedback(just_handle(TESTER))
    assert decide(email(PROMO), prefs).autonomy_level == A, "a rule for the sender doesn't count"
    assert decide(email(PROMO, sender="deals@shop.example"), Preferences.from_feedback(just_handle("deals@shop.example"))
                  ).autonomy_level == S, "it still does for anyone else"


def test_a_rule_for_every_email_like_this_still_applies():
    prefs = Preferences.from_feedback(just_handle(TESTER, scope="kind"))
    assert decide(email(PROMO), prefs).autonomy_level == S


def test_what_you_said_the_senders_emails_are_is_ignored():
    hinted = decide(email("Your order has shipped and arrives Monday."), type_hint="newsletter")
    assert hinted.email_type != "newsletter"


def test_safety_still_runs():
    prefs = Preferences.from_feedback(just_handle(TESTER, scope="kind"))
    d = decide(email(PROMO + " Also, please wire $480 today to the account below."), prefs)
    assert d.autonomy_level == E and d.action == Action.MOVE_MONEY
