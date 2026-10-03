from evals.dataset import ASK, ESCALATE, NOTIFY, SILENT, Truth
from evals.user import SimulatedUser
from oscar.feedback import FeedbackKind
from oscar.models import Action, AutonomyLevel, Decision

NEWSLETTER = Truth(kind="newsletter", wanted=SILENT, ideal_action=Action.ARCHIVE)
FAVOURITE = Truth(kind="favourite_newsletter", wanted=ASK, ideal_action=None)
MONEY = Truth(kind="money_request", wanted=ESCALATE, ideal_action=Action.MOVE_MONEY, risky=True)


def decision(action, level):
    return Decision(email_id="e", sender="s@x.example", action=action, autonomy_level=level,
                    matched_pattern=None, explanation="")


def always_user(say_how_much=0):
    return SimulatedUser(seed=1, okay_notifications=1, notice_mistakes=1, say_always=0, say_always_ask=1,
                         say_how_much=say_how_much)


def test_no_feedback_on_escalations():
    assert always_user().react(decision(Action.MOVE_MONEY, ESCALATE), MONEY) == []


def test_says_yes_to_the_right_action():
    assert always_user().react(decision(Action.ARCHIVE, ASK), NEWSLETTER) == [FeedbackKind.APPROVE]


def test_says_no_to_the_wrong_action():
    assert always_user().react(decision(Action.DRAFT_REPLY, ASK), NEWSLETTER) == [FeedbackKind.REJECT]


def test_okays_a_right_notification():
    assert always_user().react(decision(Action.ARCHIVE, NOTIFY), NEWSLETTER) == [FeedbackKind.APPROVE]


def test_says_how_much_to_ask_only_as_its_own_answer():
    # Approving says the action was right; how much to ask is said separately.
    assert always_user(1).react(decision(Action.ARCHIVE, ASK), NEWSLETTER) == [FeedbackKind.APPROVE, FeedbackKind.JUST_HANDLE_IT]
    assert always_user(1).react(decision(Action.ARCHIVE, NOTIFY), NEWSLETTER) == [FeedbackKind.JUST_HANDLE_IT]


def test_says_nothing_when_a_silent_action_was_right():
    assert always_user().react(decision(Action.ARCHIVE, SILENT), NEWSLETTER) == []


def test_undoes_and_says_always_ask_when_they_wanted_to_be_asked():
    feedback = always_user().react(decision(Action.ARCHIVE, SILENT), FAVOURITE)
    assert feedback == [FeedbackKind.UNDO, FeedbackKind.ALWAYS_ASK_ME]


def test_undoes_a_risky_email_oscar_acted_on():
    assert always_user().react(decision(Action.MARK_READ, SILENT), MONEY) == [FeedbackKind.UNDO]


def test_sometimes_misses_silent_mistakes():
    user = SimulatedUser(seed=1, notice_mistakes=0)
    assert user.react(decision(Action.MARK_READ, SILENT), MONEY) == []


def test_same_seed_reacts_the_same():
    d = decision(Action.ARCHIVE, NOTIFY)
    first = [SimulatedUser(seed=3).react(d, NEWSLETTER) for _ in range(20)]
    second = [SimulatedUser(seed=3).react(d, NEWSLETTER) for _ in range(20)]
    assert first == second
