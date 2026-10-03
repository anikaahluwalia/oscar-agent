"""The learning model on its own: counts per level, thresholds, and which scope wins."""

from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.models import Action, AutonomyLevel
from oscar.preferences import POLICIES, Preferences

S, N, ASK, E = (AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY,
                AutonomyLevel.ASK_FIRST, AutonomyLevel.ESCALATE)
SENDER = "digest@ai-weekly.example"


def event(kind, action=Action.ARCHIVE, level=ASK, blocked=False, sender=SENDER, email_type="newsletter", desired=None):
    return FeedbackEvent(decision_id="d1", kind=kind, action=action, autonomy_level=level, sender=sender,
                         blocked_by_floor=blocked, email_type=email_type, desired_level=desired)


def approvals(n, **kwargs):
    return [event(FeedbackKind.APPROVE, **kwargs) for _ in range(n)]


def level(prefs, action=Action.ARCHIVE, sender=SENDER, email_type="newsletter", current=ASK):
    found = prefs.suggest(action, current, sender, email_type)
    return found.level if found else None


# --- thresholds ------------------------------------------------------------------

def test_no_feedback_means_no_suggestion():
    assert level(Preferences()) is None


def test_below_the_evidence_and_confidence_thresholds_nothing_changes():
    # 3 okays: 3 answers, but only 71% sure, so he still asks.
    assert level(Preferences.from_feedback(approvals(3))) is None


def test_four_okays_moves_to_notify():
    found = Preferences.from_feedback(approvals(4)).suggest(Action.ARCHIVE, ASK, SENDER, "newsletter")
    assert found.level == N and found.reason == "you've okayed this 4 times"
    assert found.scope == "sender" and found.evidence == 4 and found.confidence >= 0.5


def test_eight_okays_moves_to_silent():
    assert level(Preferences.from_feedback(approvals(8))) == S


def test_review_answers_say_the_level_outright():
    reviews = [event(FeedbackKind.REVIEW, desired=S) for _ in range(3)]
    assert level(Preferences.from_feedback(reviews[:2])) is None, "two answers aren't enough"
    found = Preferences.from_feedback(reviews + [event(FeedbackKind.REVIEW, desired=S)]).suggest(
        Action.ARCHIVE, ASK, SENDER, "newsletter")
    assert found.level == N and found.reason == "you told me so in 4 reviews"


def test_a_right_answer_on_an_ask_keeps_him_asking():
    rights = [event(FeedbackKind.REVIEW, desired=ASK) for _ in range(5)]
    assert level(Preferences.from_feedback(approvals(4) + rights)) is None


def test_one_no_keeps_it_from_going_quiet():
    prefs = Preferences.from_feedback(approvals(8) + [event(FeedbackKind.REJECT)])
    assert level(prefs, current=S) == N


def test_always_do_this_is_a_rule():
    assert level(Preferences.from_feedback([event(FeedbackKind.ALWAYS_DO_THIS)])) == N


def test_always_ask_me_wins_over_okays():
    prefs = Preferences.from_feedback(approvals(10) + [event(FeedbackKind.ALWAYS_ASK_ME)])
    assert level(prefs) == ASK


# --- scopes ----------------------------------------------------------------------

def test_preferences_are_per_action():
    assert level(Preferences.from_feedback(approvals(8)), action=Action.UNSUBSCRIBE) is None


def test_one_sender_doesnt_teach_him_about_another():
    assert level(Preferences.from_feedback(approvals(8)), sender="letters@longform-notes.example") is None


def test_senders_at_one_domain_carry_over_but_only_to_notify():
    events = approvals(8, sender="weekly@news.example") + approvals(8, sender="daily@news.example")
    prefs = Preferences.from_feedback(events)
    found = prefs.suggest(Action.ARCHIVE, ASK, "monthly@news.example", "newsletter")
    assert found.level == N and found.scope == "domain"


def test_a_kind_of_email_carries_over_with_three_senders():
    two = approvals(8, sender="a@one.example") + approvals(8, sender="b@two.example")
    assert level(Preferences.from_feedback(two), sender="c@three.example") is None
    three = two + approvals(8, sender="d@four.example")
    found = Preferences.from_feedback(three).suggest(Action.ARCHIVE, ASK, "c@three.example", "newsletter")
    assert found.level == N and found.scope == "kind"


def test_shared_email_domains_dont_count_as_one_sender():
    events = approvals(8, sender="ann@gmail.com") + approvals(8, sender="bob@gmail.com")
    assert level(Preferences.from_feedback(events), sender="cal@gmail.com") is None


def test_what_you_said_about_a_sender_beats_the_broad_habit():
    events = (approvals(8, sender="a@one.example") + approvals(8, sender="b@two.example")
              + approvals(8, sender="d@four.example") + [event(FeedbackKind.ALWAYS_ASK_ME, sender="c@three.example")])
    assert level(Preferences.from_feedback(events), sender="c@three.example") == ASK


def test_broad_habits_are_only_for_easy_to_undo_actions():
    events = [event(FeedbackKind.APPROVE, action=Action.UNSUBSCRIBE, sender=s) for s in
              ("a@one.example", "b@two.example", "d@four.example") for _ in range(8)]
    assert level(Preferences.from_feedback(events), action=Action.UNSUBSCRIBE, sender="c@three.example") is None


# --- what's ignored --------------------------------------------------------------

def test_blocked_feedback_is_ignored():
    prefs = Preferences.from_feedback([event(FeedbackKind.ALWAYS_DO_THIS, action=Action.MOVE_MONEY, blocked=True)])
    assert level(prefs, action=Action.MOVE_MONEY) is None


def test_feedback_on_escalated_decisions_is_ignored():
    assert level(Preferences.from_feedback(approvals(8, level=E))) is None


def test_drafts_never_learn_to_be_silent():
    prefs = Preferences.from_feedback(approvals(50, action=Action.DRAFT_REPLY, level=N, email_type="question"))
    assert level(prefs, action=Action.DRAFT_REPLY, email_type="question", current=N) == N


def test_policies_change_how_fast_oscar_learns():
    events = approvals(6)
    get = lambda name: level(Preferences.from_feedback(events, POLICIES[name]))  # noqa: E731
    assert get("default-p2") == N
    assert get("careful-p2") is None


def test_forget_starts_fresh_for_that_sender_and_action():
    events = approvals(8) + approvals(8, action=Action.MARK_READ) + [event(FeedbackKind.FORGET)]
    prefs = Preferences.from_feedback(events)
    assert not prefs.has(SENDER, Action.ARCHIVE)
    assert prefs.has(SENDER, Action.MARK_READ), "only that action is forgotten"


def test_records_say_where_they_came_from():
    [row] = Preferences.from_feedback(approvals(4)).summary()
    assert row["provenance"] == "USER_FEEDBACK" and row["evidence"] == 4 and row["updated_at"] is not None
