from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.models import Action, AutonomyLevel
from oscar.preferences import Preferences

ASK = AutonomyLevel.ASK_FIRST
SENDER = "digest@ai-weekly.example"


def event(kind, action=Action.ARCHIVE, level=AutonomyLevel.ASK_FIRST, blocked=False):
    return FeedbackEvent(decision_id="d1", kind=kind, action=action, autonomy_level=level,
                         sender=SENDER, blocked_by_floor=blocked)


def approvals(n, **kwargs):
    return [event(FeedbackKind.APPROVE, **kwargs) for _ in range(n)]


def test_no_feedback_means_no_suggestion():
    assert Preferences().suggest(Action.ARCHIVE, ASK, SENDER) is None


def test_two_approvals_is_not_enough():
    assert Preferences.from_feedback(approvals(2)).suggest(Action.ARCHIVE, ASK, SENDER) is None


def test_three_approvals_moves_to_notify():
    level, reason = Preferences.from_feedback(approvals(3)).suggest(Action.ARCHIVE, ASK, SENDER)
    assert level == AutonomyLevel.PROCEED_AND_NOTIFY
    assert reason == "you've okayed this 3 times"


def test_eight_approvals_moves_to_silent():
    level, _ = Preferences.from_feedback(approvals(8)).suggest(Action.ARCHIVE, ASK, SENDER)
    assert level == AutonomyLevel.PROCEED_SILENTLY


def test_one_rejection_keeps_it_at_notify():
    prefs = Preferences.from_feedback(approvals(8) + [event(FeedbackKind.REJECT)])
    level, _ = prefs.suggest(Action.ARCHIVE, ASK, SENDER)
    assert level == AutonomyLevel.PROCEED_AND_NOTIFY


def test_mixed_feedback_gives_no_suggestion():
    prefs = Preferences.from_feedback(approvals(3) + [event(FeedbackKind.REJECT)] * 2)
    assert prefs.suggest(Action.ARCHIVE, ASK, SENDER) is None


def test_always_do_this_counts_as_three_okays():
    level, reason = Preferences.from_feedback([event(FeedbackKind.ALWAYS_DO_THIS)]).suggest(Action.ARCHIVE, ASK, SENDER)
    assert level == AutonomyLevel.PROCEED_AND_NOTIFY
    assert reason == "you told me you're fine with this"


def test_preferences_are_per_action():
    prefs = Preferences.from_feedback(approvals(8))
    assert prefs.suggest(Action.UNSUBSCRIBE, ASK, SENDER) is None


def test_blocked_feedback_is_ignored():
    prefs = Preferences.from_feedback([event(FeedbackKind.ALWAYS_DO_THIS, action=Action.MOVE_MONEY, blocked=True)])
    assert prefs.suggest(Action.MOVE_MONEY, ASK, SENDER) is None


def test_feedback_on_escalated_decisions_is_ignored():
    prefs = Preferences.from_feedback(approvals(8, level=AutonomyLevel.ESCALATE))
    assert prefs.suggest(Action.ARCHIVE, ASK, SENDER) is None


def test_drafts_never_learn_to_be_silent():
    prefs = Preferences.from_feedback(approvals(50, action=Action.DRAFT_REPLY, level=AutonomyLevel.PROCEED_AND_NOTIFY))
    level, _ = prefs.suggest(Action.DRAFT_REPLY, AutonomyLevel.PROCEED_AND_NOTIFY, SENDER)
    assert level == AutonomyLevel.PROCEED_AND_NOTIFY


def test_preferences_are_per_sender():
    prefs = Preferences.from_feedback(approvals(8))
    assert prefs.suggest(Action.ARCHIVE, ASK, "letters@longform-notes.example") is None


def test_policies_change_how_fast_oscar_learns():
    from oscar.feedback import FeedbackEvent, FeedbackKind
    from oscar.models import Action, AutonomyLevel
    from oscar.preferences import POLICIES, Preferences

    events = [FeedbackEvent(decision_id=str(i), kind=FeedbackKind.APPROVE, action=Action.ARCHIVE,
                            autonomy_level=AutonomyLevel.ASK_FIRST, sender="n@x.example") for i in range(6)]
    level = lambda name: (Preferences.from_feedback(events, POLICIES[name]).suggest(Action.ARCHIVE, AutonomyLevel.ASK_FIRST, "n@x.example") or (None,))[0]  # noqa: E731
    # Six okays: the independent policy works quietly, the default tells you, the careful one tells you too.
    assert level("independent-p1") == AutonomyLevel.PROCEED_SILENTLY
    assert level("default-p1") == AutonomyLevel.PROCEED_AND_NOTIFY
    assert level("careful-p1") == AutonomyLevel.PROCEED_AND_NOTIFY


def test_forget_starts_fresh_for_that_sender_and_action():
    from oscar.feedback import FeedbackEvent, FeedbackKind
    from oscar.models import Action, AutonomyLevel
    from oscar.preferences import Preferences

    def ev(kind, sender="a@news.example", action=Action.ARCHIVE):
        return FeedbackEvent(decision_id="d", kind=kind, action=action, autonomy_level=AutonomyLevel.ASK_FIRST, sender=sender)

    events = [ev(FeedbackKind.ALWAYS_DO_THIS)] * 4 + [ev(FeedbackKind.APPROVE, action=Action.MARK_READ)]
    prefs = Preferences.from_feedback(events + [ev(FeedbackKind.FORGET)])
    assert ("a@news.example", Action.ARCHIVE) not in prefs.by_key
    assert ("a@news.example", Action.MARK_READ) in prefs.by_key, "only that action is forgotten"
