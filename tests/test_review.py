"""Reviewing Oscar's calls on a real inbox. A review says what he should have done and the label is
worked out from that; answers no version of Oscar could pass are refused; re-reads are graded on the same
email; and since Stage 11 a review also teaches him."""

from oscar.feedback import FeedbackKind
from oscar.review import REVIEW_LABEL_NAMES, Review, ReviewLabel


def test_every_label_has_a_name():
    assert set(REVIEW_LABEL_NAMES) == set(ReviewLabel)


def test_review_labels_are_not_feedback():
    # Review labels and feedback kinds are separate things and never share a name.
    assert not {label.value for label in ReviewLabel} & {kind.value for kind in FeedbackKind}


def test_review_round_trips():
    review = Review(decision_id="d1", label=ReviewLabel.INCORRECT_TYPE, actual_type="recruiter")
    assert Review.model_validate_json(review.model_dump_json()) == review


# --- recording and summarising reviews ---------------------------------------

from datetime import timedelta  # noqa: E402

import pytest  # noqa: E402

from oscar.agent import decide  # noqa: E402
from oscar.history import History  # noqa: E402
from oscar.models import Email  # noqa: E402
from oscar.review import ReviewError, record_review, summary  # noqa: E402


def real(history: History, id: str, version: str = "v1"):
    d = decide(Email(id=id, sender="a@b.example", subject="s", body="hello"), read_only=True)
    d = d.model_copy(update={"source": "gmail", "policy_version": version})
    history.add_decision(d)
    return d


def test_reviews_are_only_for_the_real_inbox():
    history = History()
    demo = decide(Email(id="d", sender="a@b.example", subject="s", body="hello"))
    history.add_decision(demo)
    with pytest.raises(ReviewError, match="real inbox"):
        record_review(history, Review(decision_id=demo.id, label=ReviewLabel.CORRECT))


def test_a_decision_is_logged_before_its_review():
    history = History()
    d = real(history, "1")
    with pytest.raises(ReviewError, match="logged before"):
        record_review(history, Review(decision_id=d.id, label=ReviewLabel.CORRECT, reviewed_at=d.created_at - timedelta(seconds=1)))


def test_something_else_needs_a_note():
    history = History()
    d = real(history, "1")
    with pytest.raises(ReviewError, match="Say what was wrong"):
        record_review(history, Review(decision_id=d.id, label=ReviewLabel.OTHER))
    record_review(history, Review(decision_id=d.id, label=ReviewLabel.OTHER, note="It's a duplicate of yesterday's"))


def test_reviews_teach_oscar_nothing():
    # A review isn't saved as feedback. What it teaches is worked out from it (see the Stage 11 tests below).
    history = History()
    d = real(history, "1")
    record_review(history, Review(decision_id=d.id, label=ReviewLabel.QUESTIONED_TOO_MUCH))
    assert history.feedback == []


def test_summary_counts_latest_review_and_ignores_skips():
    history = History()
    a, b, c, _ = real(history, "1"), real(history, "2"), real(history, "3", "v2"), real(history, "4", "v2")
    record_review(history, Review(decision_id=a.id, label=ReviewLabel.NEEDED_TO_ASK))
    record_review(history, Review(decision_id=a.id, label=ReviewLabel.CORRECT))  # changed my mind
    record_review(history, Review(decision_id=b.id, label=ReviewLabel.INCORRECT_TYPE, actual_type="recruiter"))
    record_review(history, Review(decision_id=c.id, label=ReviewLabel.SKIP))
    s = summary(history)
    assert (s["decisions"], s["reviewed"], s["scored"]) == (4, 3, 2)
    assert s["agreement"] == 0.5
    assert s["labels"]["CORRECT"] == 1 and s["labels"]["NEEDED_TO_ASK"] == 0
    assert s["by_version"]["v2"]["scored"] == 0 and s["by_version"]["v2"]["agreement"] is None


def reread(history, of, id, seconds, **changes):
    d = of.model_copy(update={"id": id, "recheck_of": of.id, "policy_version": f"v{seconds}",
                              "created_at": of.created_at + timedelta(seconds=seconds), **changes})
    history.add_decision(d)
    return d


def test_an_old_half_answer_only_carries_over_when_the_reread_decided_the_same():
    from oscar.models import Action, AutonomyLevel
    from oscar.overview import needs_you
    history = History()
    first = real(history, "e1")
    record_review(history, Review(decision_id=first.id, label=ReviewLabel.INCORRECT_ACTION,
                                  should_be_action=Action.ARCHIVE, reviewed_at=first.created_at + timedelta(seconds=1)))
    same = reread(history, first, "re1", 2)
    assert history.review_carried_over(same.id).label == ReviewLabel.INCORRECT_ACTION
    assert all(same.id not in [d.id for d in ds] for ds in needs_you(history).values())
    # A re-read that changed its mind is a new decision to check.
    changed = reread(history, same, "re2", 3, action=Action.ARCHIVE, autonomy_level=AutonomyLevel.ASK_FIRST)
    assert history.review_carried_over(changed.id) is None
    record_review(history, Review(decision_id=changed.id, label=ReviewLabel.CORRECT,
                                  reviewed_at=changed.created_at + timedelta(seconds=1)))
    s = summary(history)
    assert s["reviewed"] == 1 and s["rereads"]["reviewed"] == 1, "a re-read's review is counted, on its own"


def test_a_full_answer_grades_a_reread_that_changed_its_mind():
    from oscar.models import Action, AutonomyLevel
    from oscar.review import answer as full_answer, graded
    history = History()
    first = real(history, "e1")
    review = full_answer(first, AutonomyLevel.PROCEED_SILENTLY, Action.MARK_READ, why="preference")
    review.reviewed_at = first.created_at + timedelta(seconds=1)
    record_review(history, review)
    fixed = reread(history, first, "re1", 2, action=Action.MARK_READ, autonomy_level=AutonomyLevel.PROCEED_SILENTLY)
    assert graded(history, fixed) == {"level": AutonomyLevel.PROCEED_SILENTLY, "action": Action.MARK_READ,
                                      "error": "none", "from_earlier": True, "earlier_error": "too_cautious"}
    s = summary(history)
    assert s["graded"]["n"] == 1 and s["graded"]["passed"] == 0, "the first read was wrong"
    assert s["rereads"]["graded"]["passed"] == 1, "the re-read gets it right, measured on the same email"
    assert s["rereads"]["reviewed"] == 0, "and you didn't have to review it again"


def test_rereads_of_half_answered_emails_hold_back_grading():
    from oscar.models import Action, AutonomyLevel
    history = History()
    first = real(history, "e1")
    record_review(history, Review(decision_id=first.id, label=ReviewLabel.INCORRECT_ACTION,
                                  should_be_action=Action.ARCHIVE, reviewed_at=first.created_at + timedelta(seconds=1)))
    reread(history, first, "re1", 2, action=Action.ARCHIVE, autonomy_level=AutonomyLevel.ASK_FIRST)
    assert summary(history)["rereads"]["old_way"] == 1 and summary(history)["rereads"]["graded"]["held_back"]


def test_old_half_answers_are_counted_apart_never_guessed():
    from oscar.models import Action
    history = History()
    d = real(history, "e1")
    record_review(history, Review(decision_id=d.id, label=ReviewLabel.INCORRECT_ACTION,
                                  should_be_action=Action.ARCHIVE, reviewed_at=d.created_at + timedelta(seconds=1)))
    s = summary(history)
    assert s["old_way"] == 1 and s["graded"] == {"n": 0, "held_back": True}
    # A "Yes" alongside it isn't graded alone: that would show 100% while the "No" waits.
    d2 = real(history, "e2")
    record_review(history, Review(decision_id=d2.id, label=ReviewLabel.CORRECT, reviewed_at=d2.created_at + timedelta(seconds=1)))
    assert summary(history)["graded"] == {"n": 1, "held_back": True}


# --- full answers: what Oscar should have done -------------------------------

from oscar.models import Action, AutonomyLevel  # noqa: E402
from oscar.review import Answer, Reason, answer, derive_label, expected_answer  # noqa: E402

S, N, A, E = (AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY, AutonomyLevel.ASK_FIRST,
              AutonomyLevel.ESCALATE)


def oscar_did(level, action):
    d = decide(Email(id="e", sender="a@b.example", subject="s", body="hello"), read_only=True)
    return d.model_copy(update={"source": "gmail", "autonomy_level": level, "action": action})


@pytest.mark.parametrize("oscar, right, why, label", [
    ((N, Action.DRAFT_REPLY), (S, Action.MARK_READ), None, ReviewLabel.QUESTIONED_TOO_MUCH),
    ((E, Action.MOVE_MONEY), (S, Action.MARK_READ), None, ReviewLabel.UNNECESSARY_FLAGGING),
    ((S, Action.MARK_READ), (A, Action.MARK_READ), None, ReviewLabel.NEEDED_TO_ASK),
    ((N, Action.DRAFT_REPLY), (E, None), "risk", ReviewLabel.MISINTERPRETED_RISK),
    ((A, Action.ARCHIVE), (A, Action.MARK_READ), None, ReviewLabel.INCORRECT_ACTION),
    ((A, Action.ARCHIVE), (A, Action.ARCHIVE), "misread", ReviewLabel.INCORRECT_TYPE),
])
def test_the_label_is_worked_out_from_the_answer(oscar, right, why, label):
    assert derive_label(oscar_did(*oscar), Answer(*right), why) == label


def test_risky_reasons_mean_he_missed_a_risk():
    review = answer(oscar_did(N, Action.DRAFT_REPLY), E, reasons=[Reason.MONEY])
    assert review.label == ReviewLabel.MISINTERPRETED_RISK and review.why == "risk"


def test_just_important_is_graded_as_ask_me_not_as_a_missed_scam():
    review = answer(oscar_did(S, Action.MARK_READ), E, reasons=[Reason.IMPORTANT])
    assert expected_answer(review, None) == Answer(A, None, escalate_ok=True)
    assert review.label == ReviewLabel.NEEDED_TO_ASK


def test_a_yes_is_a_full_answer_and_old_half_answers_are_not():
    d = oscar_did(A, Action.ARCHIVE)
    assert expected_answer(Review(decision_id=d.id, label=ReviewLabel.CORRECT), d) == Answer(A, Action.ARCHIVE)
    old = Review(decision_id=d.id, label=ReviewLabel.INCORRECT_ACTION, should_be_action=Action.MARK_READ)
    assert expected_answer(old, d) is None


@pytest.mark.parametrize("level, action, kwargs, message", [
    (S, Action.SEND_REPLY, {}, "never does that without asking"),
    (S, None, {}, "what he should have done"),
    (A, Action.MOVE_MONEY, {}, "straight to you"),
    (E, None, {}, "why this should come straight"),
    (A, Action.ARCHIVE, {"why": "misread"}, "what kind of email"),
    (A, Action.ARCHIVE, {"label_name": "Jobs"}, "only goes with Label"),
    (N, Action.DRAFT_REPLY, {}, "That's what Oscar picked"),
])
def test_answers_no_oscar_could_pass_are_refused(level, action, kwargs, message):
    history = History()
    d = real(history, "e1")
    history.decisions[d.id] = d = d.model_copy(update={"autonomy_level": N, "action": Action.DRAFT_REPLY})
    review = answer(d, level, action, **kwargs)
    review.reviewed_at = d.created_at + timedelta(seconds=1)
    with pytest.raises(ReviewError, match=message):
        record_review(history, review)


def test_a_label_name_is_kept():
    history = History()
    d = real(history, "e1")
    review = answer(d, S, Action.APPLY_LABEL, label_name="Internships", why="preference")
    review.reviewed_at = d.created_at + timedelta(seconds=1)
    assert record_review(history, review).label_name == "Internships"


# --- found by the check after the review redesign -----------------------------

def history_with_reread(changed: bool):
    from oscar.models import Action, AutonomyLevel
    history = History()
    first = real(history, "e1")
    record_review(history, Review(decision_id=first.id, label=ReviewLabel.NEEDED_TO_ASK,
                                  should_be_level=AutonomyLevel.ASK_FIRST, reviewed_at=first.created_at + timedelta(seconds=1)))
    changes = {"action": Action.ARCHIVE, "autonomy_level": AutonomyLevel.PROCEED_SILENTLY} if changed else {}
    return history, first, reread(history, first, "re1", 2, **changes)


@pytest.mark.parametrize("changed", [False, True])
def test_finishing_an_old_review_on_a_reread_counts_for_the_email(changed):
    history, first, again = history_with_reread(changed)
    review = answer(again, A, Action.ARCHIVE, why="preference")
    review.reviewed_at = again.created_at + timedelta(seconds=1)
    record_review(history, review)
    s = summary(history)
    assert s["old_way"] == 0 and s["graded"]["n"] == 1, "the first read is graded against the answer"
    assert s["rereads"]["graded"]["n"] == 1


def test_just_important_passes_when_a_reread_brings_it_to_you():
    from oscar.review import graded
    history = History()
    first = real(history, "e1")
    history.decisions[first.id] = first = first.model_copy(update={"autonomy_level": S, "action": Action.ARCHIVE})
    review = answer(first, E, reasons=[Reason.IMPORTANT], why="preference")
    review.reviewed_at = first.created_at + timedelta(seconds=1)
    record_review(history, review)
    stopped = reread(history, first, "re1", 2, autonomy_level=E, action=Action.MARK_READ)
    assert graded(history, stopped)["error"] == "none"


def test_other_at_the_same_level_means_his_action_was_wrong():
    history = History()
    d = real(history, "e1")
    history.decisions[d.id] = d = d.model_copy(update={"autonomy_level": S, "action": Action.ARCHIVE})
    review = answer(d, S, None, why="preference", note="should have starred it")
    review.reviewed_at = d.created_at + timedelta(seconds=1)
    assert record_review(history, review).label == ReviewLabel.INCORRECT_ACTION
    assert summary(history)["graded"]["passed"] == 0


@pytest.mark.parametrize("oscar, level, action, reasons", [
    ((A, Action.ARCHIVE), A, None, []),  # "nothing, I'll handle it": asking already leaves it to you
    ((E, Action.MOVE_MONEY), E, None, [Reason.SCAM]),  # he already stopped it
    ((A, Action.ARCHIVE), E, None, [Reason.IMPORTANT]),  # he already left it to you
])
def test_a_no_that_grades_as_what_oscar_did_needs_a_note(oscar, level, action, reasons):
    history = History()
    d = real(history, "e1")
    history.decisions[d.id] = d = d.model_copy(update={"autonomy_level": oscar[0], "action": oscar[1]})
    review = answer(d, level, action, reasons=reasons, why=None if reasons and reasons != [Reason.IMPORTANT] else "preference")
    review.reviewed_at = d.created_at + timedelta(seconds=1)
    with pytest.raises(ReviewError, match="That's what Oscar picked"):
        record_review(history, review)


@pytest.mark.parametrize("level, action, reasons", [(S, Action.ARCHIVE, []), (E, None, [Reason.IMPORTANT])])
def test_missed_a_risk_needs_a_careful_answer(level, action, reasons):
    history = History()
    d = real(history, "e1")
    history.decisions[d.id] = d = d.model_copy(update={"autonomy_level": N, "action": Action.DRAFT_REPLY})
    review = answer(d, level, action, reasons=reasons, why="risk")
    review.reviewed_at = d.created_at + timedelta(seconds=1)
    with pytest.raises(ReviewError, match="missed a risk"):
        record_review(history, review)


# --- Stage 11: reviews teach Oscar ---------------------------------------------

from oscar.feedback import FeedbackKind as FK  # noqa: E402
from oscar.preferences import Preferences  # noqa: E402
from oscar.review import lessons, teaching  # noqa: E402

PROMO = "Big sale this week. Manage your preferences."


def promo_decision(history, id, sender="deals@shop.example", seconds=0):
    d = decide(Email(id=id, sender=sender, subject="Sale", body=PROMO, category="promotions"), read_only=True)
    d = d.model_copy(update={"source": "gmail", "policy_version": "v1"})
    history.add_decision(d)
    return d


def answered(history, d, level, action=None, **kw):
    review = answer(d, level, action, **kw)
    review.reviewed_at = d.created_at + timedelta(seconds=1)
    record_review(history, review)


def test_quiet_answers_teach_the_sender_once_there_are_enough():
    history = History()
    first = promo_decision(history, "e1")
    assert first.autonomy_level == A
    answered(history, first, S, Action.ARCHIVE, why="preference")
    assert [(e.kind, e.desired_level) for e in lessons(history)] == [(FK.REVIEW, S)]
    sale = Email(id="e9", sender="deals@shop.example", subject="Sale", body=PROMO, category="promotions")
    # One answer is one piece of evidence, not a rule: he still asks.
    assert decide(sale, Preferences.from_feedback(teaching(history))).autonomy_level == A
    for i in range(2, 5):
        answered(history, promo_decision(history, f"e{i}"), S, Action.ARCHIVE, why="preference")
    later = decide(sale, Preferences.from_feedback(teaching(history)))
    assert later.autonomy_level == N and later.level_source == "learned"


def test_a_missed_risk_only_makes_him_stricter():
    history = History()
    d = promo_decision(history, "e1")
    history.decisions[d.id] = d = d.model_copy(update={"autonomy_level": N, "action": Action.DRAFT_REPLY})
    answered(history, d, A, Action.MARK_READ, why="risk")
    taught = {(e.kind, e.action, e.desired_level) for e in lessons(history)}
    assert (FK.ALWAYS_ASK_ME, Action.DRAFT_REPLY, None) in taught
    assert (FK.REVIEW, Action.DRAFT_REPLY, A) in taught, "what he did gets an answer saying he should have asked"
    assert not any(e.kind == FK.ALWAYS_DO_THIS for e in lessons(history))


def test_a_yes_says_the_action_was_right_and_nothing_about_asking():
    # "Right" on something he asked about means "yes, archive it", not "keep asking me".
    history = History()
    d = promo_decision(history, "e1")
    assert d.autonomy_level == A
    record_review(history, Review(decision_id=d.id, label=ReviewLabel.CORRECT, reviewed_at=d.created_at + timedelta(seconds=1)))
    assert [(e.kind, e.action, e.desired_level, e.action_feedback) for e in lessons(history)] == [
        (FK.REVIEW, d.action, None, "CORRECT")]
    prefs = Preferences.from_feedback(lessons(history))
    assert all(r.evidence == 0 for r in prefs.records.values()), "no vote for any level"


def test_old_half_answers_teach_nothing():
    history = History()
    d = promo_decision(history, "e1")
    record_review(history, Review(decision_id=d.id, label=ReviewLabel.INCORRECT_ACTION, should_be_action=Action.ARCHIVE,
                                  reviewed_at=d.created_at + timedelta(seconds=1)))
    assert lessons(history) == []


def test_a_reread_never_learns_from_its_own_answer():
    history = History()
    d = promo_decision(history, "e1")
    answered(history, d, S, Action.ARCHIVE, why="preference")
    assert lessons(history, skip_email=d.email_id) == []
    other = promo_decision(history, "e2")
    answered(history, other, S, Action.ARCHIVE, why="preference")
    assert {e.decision_id for e in lessons(history, skip_email=d.email_id)} == {other.id}


def test_forget_also_wipes_what_earlier_reviews_taught():
    from oscar.feedback import record_feedback
    history = History()
    d = promo_decision(history, "e1")
    review = answer(d, S, Action.ARCHIVE, why="preference")
    review.reviewed_at = d.created_at  # reviewed before the Forget below
    record_review(history, review)
    assert Preferences.from_feedback(teaching(history)).has("deals@shop.example", Action.ARCHIVE)
    record_feedback(history, d.id, FK.FORGET)
    assert not Preferences.from_feedback(teaching(history)).has("deals@shop.example", Action.ARCHIVE)
