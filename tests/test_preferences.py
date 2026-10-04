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
    """Approving: the action was right. It says nothing about how much he should ask."""
    return [event(FeedbackKind.APPROVE, **kwargs) for _ in range(n)]


def quietly(n, **kwargs):
    """Answers that say the level outright: he could have done it quietly."""
    return [event(FeedbackKind.REVIEW, desired=S, **kwargs) for _ in range(n)]


def level(prefs, action=Action.ARCHIVE, sender=SENDER, email_type="newsletter", current=ASK):
    found = prefs.suggest(action, current, sender, email_type)
    return found.level if found else None


# --- thresholds ------------------------------------------------------------------

def test_no_feedback_means_no_suggestion():
    assert level(Preferences()) is None


def test_approving_alone_never_changes_how_much_he_asks():
    prefs = Preferences.from_feedback(approvals(50))
    assert level(prefs) is None
    [row] = prefs.summary()
    assert row["approved"] == 50 and row["evidence"] == 0, "the action was right; nothing about asking"


def test_below_the_evidence_and_confidence_thresholds_nothing_changes():
    # 2 answers aren't enough on their own.
    assert level(Preferences.from_feedback(quietly(2))) is None


def test_four_answers_move_to_notify():
    found = Preferences.from_feedback(quietly(4)).suggest(Action.ARCHIVE, ASK, SENDER, "newsletter")
    assert found.level == N and found.reason == "you told me so 4 times"
    assert found.scope == "sender" and found.evidence == 4 and found.confidence >= 0.5


def test_eight_answers_move_to_silent():
    assert level(Preferences.from_feedback(quietly(8))) == S


def test_keep_asking_keeps_him_asking():
    prefs = Preferences.from_feedback(quietly(8) + [event(FeedbackKind.KEEP_ASKING)])
    assert level(prefs) == ASK


def test_just_handle_it_is_a_rule_for_that_sender_straight_away():
    found = Preferences.from_feedback([event(FeedbackKind.JUST_HANDLE_IT)]).suggest(Action.ARCHIVE, ASK, SENDER, "newsletter")
    assert found.level == S and found.reason == "you told me to just handle these"
    assert level(Preferences.from_feedback([event(FeedbackKind.HANDLE_AND_TELL_ME)])) == N


def test_one_no_keeps_it_from_going_quiet():
    prefs = Preferences.from_feedback(quietly(8) + [event(FeedbackKind.REJECT)])
    assert level(prefs, current=S) == N


def test_always_do_this_is_a_rule():
    assert level(Preferences.from_feedback([event(FeedbackKind.ALWAYS_DO_THIS)])) == N


def test_always_ask_me_wins_over_okays():
    prefs = Preferences.from_feedback(quietly(10) + [event(FeedbackKind.ALWAYS_ASK_ME)])
    assert level(prefs) == ASK


# --- scopes ----------------------------------------------------------------------

def test_preferences_are_per_action():
    assert level(Preferences.from_feedback(quietly(8)), action=Action.UNSUBSCRIBE) is None


def test_one_sender_doesnt_teach_him_about_another():
    assert level(Preferences.from_feedback(quietly(8)), sender="letters@longform-notes.example") is None


def test_senders_at_one_domain_carry_over_but_only_to_notify():
    events = quietly(8, sender="weekly@news.example") + quietly(8, sender="daily@news.example")
    prefs = Preferences.from_feedback(events)
    found = prefs.suggest(Action.ARCHIVE, ASK, "monthly@news.example", "newsletter")
    assert found.level == N and found.scope == "domain"


def test_a_kind_of_email_carries_over_with_three_senders():
    two = quietly(8, sender="a@one.example") + quietly(8, sender="b@two.example")
    assert level(Preferences.from_feedback(two), sender="c@three.example") is None
    three = two + quietly(8, sender="d@four.example")
    found = Preferences.from_feedback(three).suggest(Action.ARCHIVE, ASK, "c@three.example", "newsletter")
    assert found.level == S and found.scope == "kind", "an easy-to-undo action can go quiet across senders"


def test_shared_email_domains_dont_count_as_one_sender():
    events = quietly(8, sender="ann@gmail.com") + quietly(8, sender="bob@gmail.com")
    assert level(Preferences.from_feedback(events), sender="cal@gmail.com") is None


def test_what_you_said_about_a_sender_beats_the_broad_habit():
    events = (quietly(8, sender="a@one.example") + quietly(8, sender="b@two.example")
              + quietly(8, sender="d@four.example") + [event(FeedbackKind.ALWAYS_ASK_ME, sender="c@three.example")])
    assert level(Preferences.from_feedback(events), sender="c@three.example") == ASK


def test_broad_habits_are_only_for_easy_to_undo_actions():
    events = [event(FeedbackKind.REVIEW, desired=S, action=Action.UNSUBSCRIBE, sender=s) for s in
              ("a@one.example", "b@two.example", "d@four.example") for _ in range(8)]
    assert level(Preferences.from_feedback(events), action=Action.UNSUBSCRIBE, sender="c@three.example") is None



# A sender's own answers come before what's true across senders (found replaying the real inbox:
# "label it" for one job site lost to everyone else's job alerts being archived).
JOBS = "alerts@jobsite.example"


def labelled_by_you(n, sender=JOBS):
    """Review answers from when he couldn't tell what the email was: label it, quietly."""
    return [FeedbackEvent(decision_id=f"r{i}", kind=FeedbackKind.REVIEW, action=Action.APPLY_LABEL,
                          autonomy_level=ASK, sender=sender, email_type="unknown", desired_level=S,
                          action_feedback="CORRECT") for i in range(n)]


def archived_everywhere():
    return [e for s in ("a@one.example", "b@two.example", "d@four.example")
            for e in quietly(8, sender=s, email_type="job_alert")]


def test_what_you_showed_for_a_sender_beats_what_emails_like_it_get():
    prefs = Preferences.from_feedback(archived_everywhere() + labelled_by_you(2))
    assert prefs.habit(JOBS, "job_alert") == Action.APPLY_LABEL


def test_a_sender_you_never_answered_for_gets_what_emails_like_it_get():
    prefs = Preferences.from_feedback(archived_everywhere() + labelled_by_you(2))
    assert prefs.habit("new@otherjobs.example", "job_alert") == Action.ARCHIVE


def test_a_newer_rule_for_the_sender_still_wins():
    told = [event(FeedbackKind.JUST_HANDLE_IT, sender=JOBS, email_type="job_alert", desired=S)]
    prefs = Preferences.from_feedback(archived_everywhere() + labelled_by_you(2) + told)
    assert prefs.habit(JOBS, "job_alert") == Action.ARCHIVE


def test_answers_about_a_senders_other_emails_dont_count():
    # Two labels on a shop's receipts say nothing about its newsletters.
    archived = [e for s in ("a@one.example", "b@two.example", "d@four.example") for e in quietly(8, sender=s)]
    receipts = approvals(2, action=Action.APPLY_LABEL, sender="news@shop.example", email_type="receipt")
    assert Preferences.from_feedback(archived + receipts).habit("news@shop.example", "newsletter") == Action.ARCHIVE


def test_answers_about_this_kind_beat_the_senders_other_answers():
    jobs = approvals(2, action=Action.APPLY_LABEL, sender=JOBS, email_type="job_alert")
    social = approvals(3, action=Action.ARCHIVE, sender=JOBS, email_type="social_notification")
    assert Preferences.from_feedback(jobs + social).habit(JOBS, "job_alert") == Action.APPLY_LABEL


def test_the_newest_rule_wins_whether_its_for_the_sender_or_every_email_like_it():
    labels = approvals(2, action=Action.APPLY_LABEL, sender=JOBS, email_type="job_alert")
    every = FeedbackEvent(decision_id="k", kind=FeedbackKind.ALWAYS_DO_THIS, action=Action.ARCHIVE, autonomy_level=ASK,
                          sender=JOBS, email_type="job_alert", desired_level=S, scope="kind")
    assert Preferences.from_feedback(labels + [every]).habit(JOBS, "job_alert") == Action.ARCHIVE
    just_this_one = event(FeedbackKind.JUST_HANDLE_IT, action=Action.APPLY_LABEL, sender=JOBS, email_type="job_alert", desired=S)
    assert Preferences.from_feedback(labels + [every, just_this_one]).habit(JOBS, "job_alert") == Action.APPLY_LABEL


def test_an_action_you_turned_down_for_the_sender_is_never_the_habit():
    no = event(FeedbackKind.REJECT, sender=JOBS, email_type="job_alert")
    assert Preferences.from_feedback(archived_everywhere() + [no]).habit(JOBS, "job_alert") is None

# --- what's ignored --------------------------------------------------------------

def test_blocked_feedback_is_ignored():
    prefs = Preferences.from_feedback([event(FeedbackKind.ALWAYS_DO_THIS, action=Action.MOVE_MONEY, blocked=True)])
    assert level(prefs, action=Action.MOVE_MONEY) is None


def test_feedback_on_escalated_decisions_is_ignored():
    assert level(Preferences.from_feedback(quietly(8, level=E))) is None


def test_drafts_never_learn_to_be_silent():
    prefs = Preferences.from_feedback(quietly(50, action=Action.DRAFT_REPLY, level=N, email_type="question"))
    assert level(prefs, action=Action.DRAFT_REPLY, email_type="question", current=N) == N


def test_policies_change_how_fast_oscar_learns():
    events = quietly(6)
    get = lambda name: level(Preferences.from_feedback(events, POLICIES[name]))  # noqa: E731
    assert get("default-p3") == N
    assert get("careful-p3") is None


def test_forget_starts_fresh_for_that_sender_and_action():
    events = approvals(8) + approvals(8, action=Action.MARK_READ) + [event(FeedbackKind.FORGET)]
    prefs = Preferences.from_feedback(events)
    assert not prefs.has(SENDER, Action.ARCHIVE)
    assert prefs.has(SENDER, Action.MARK_READ), "only that action is forgotten"


def test_records_say_where_they_came_from():
    [row] = Preferences.from_feedback(quietly(4)).summary()
    assert row["provenance"] == "USER_FEEDBACK" and row["evidence"] == 4 and row["updated_at"] is not None


def test_one_okay_each_from_many_senders_isnt_enough_to_carry_over():
    events = [e for s in ("a@one.example", "b@two.example", "d@four.example", "e@five.example", "f@six.example")
              for e in quietly(1, sender=s)]
    assert level(Preferences.from_feedback(events), sender="c@three.example") is None


def test_a_senders_other_answers_still_count_when_nothing_else_says_anything():
    # You taught him to mark a courier's notices read; the model now reads its next email as a
    # receipt. Nobody's receipts say anything, so what you said for the sender still counts
    # (found by the trap/control pairs: known_02_control).
    taught = [event(FeedbackKind.JUST_HANDLE_IT, action=Action.MARK_READ, sender="notify@courier.example",
                    email_type="fyi", desired=S)]
    assert Preferences.from_feedback(taught).habit("notify@courier.example", "receipt") == Action.MARK_READ
