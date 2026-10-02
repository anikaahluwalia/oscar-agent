from oscar.feedback import FeedbackKind
from oscar.review import REVIEW_LABEL_NAMES, Review, ReviewLabel


def test_every_label_has_a_name():
    assert set(REVIEW_LABEL_NAMES) == set(ReviewLabel)


def test_review_labels_are_not_feedback():
    # Reviews score Oscar; feedback teaches him. They must never be mixed up.
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


def test_a_reread_that_decided_the_same_keeps_your_review():
    from oscar.models import Action, AutonomyLevel
    from oscar.overview import needs_you
    history = History()
    first = real(history, "e1")
    record_review(history, Review(decision_id=first.id, label=ReviewLabel.CORRECT,
                                  reviewed_at=first.created_at + timedelta(seconds=1)))
    same = first.model_copy(update={"id": "re1", "recheck_of": first.id, "policy_version": "v2",
                                    "created_at": first.created_at + timedelta(seconds=2)})
    history.add_decision(same)
    assert history.review_carried_over(same.id).label == ReviewLabel.CORRECT
    assert all(same.id not in [d.id for d in ds] for ds in needs_you(history).values())

    # The opposite: a re-read that changed its mind is a new decision to check.
    changed = same.model_copy(update={"id": "re2", "recheck_of": same.id, "action": Action.ARCHIVE,
                                      "autonomy_level": AutonomyLevel.ASK_FIRST, "policy_version": "v3",
                                      "created_at": first.created_at + timedelta(seconds=3)})
    history.add_decision(changed)
    assert history.review_carried_over(changed.id) is None
    record_review(history, Review(decision_id=changed.id, label=ReviewLabel.CORRECT,
                                  reviewed_at=changed.created_at + timedelta(seconds=1)))
    s = summary(history)
    assert s["reviewed"] == 1 and s["rereads"]["reviewed"] == 1, "a re-read's review is counted, on its own"


# --- full answers: what Oscar should have done -------------------------------

from oscar.models import Action, AutonomyLevel  # noqa: E402
from oscar.review import Reason, answer, derive_label, expected_answer  # noqa: E402

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
    assert derive_label(oscar_did(*oscar), *right, why) == label


def test_risky_reasons_mean_he_missed_a_risk():
    review = answer(oscar_did(N, Action.DRAFT_REPLY), E, reasons=[Reason.MONEY])
    assert review.label == ReviewLabel.MISINTERPRETED_RISK and review.why == "risk"


def test_just_important_is_graded_as_ask_me_not_as_a_missed_scam():
    review = answer(oscar_did(S, Action.MARK_READ), E, reasons=[Reason.IMPORTANT])
    assert expected_answer(review, None) == (A, None)
    assert review.label == ReviewLabel.NEEDED_TO_ASK


def test_a_yes_is_a_full_answer_and_old_half_answers_are_not():
    d = oscar_did(A, Action.ARCHIVE)
    assert expected_answer(Review(decision_id=d.id, label=ReviewLabel.CORRECT), d) == (A, Action.ARCHIVE)
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
