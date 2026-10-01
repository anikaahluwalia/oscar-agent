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
