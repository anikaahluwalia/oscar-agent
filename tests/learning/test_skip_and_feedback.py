""""Not sure, skip it" in Review teaches Oscar nothing."""

from oscar.gmail import GmailClient
from oscar.history import History
from oscar.inbox import sync
from oscar.review import Review, ReviewLabel, lessons, record_review
from tests.fake_gmail import FakeGmail, connected, message


def test_skip_teaches_nothing(tmp_path):
    history = History()
    sync(history, GmailClient(connected(tmp_path), FakeGmail([
        message("n", "digest@letters.example", "This week", "Top stories. View in browser. Unsubscribe")]).http()))
    decision = next(iter(history.decisions.values()))
    record_review(history, Review(decision_id=decision.id, label=ReviewLabel.SKIP))
    assert lessons(history) == []
