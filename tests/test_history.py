from oscar.agent import decide
from oscar.history import History
from oscar.models import Email


def make_email(**overrides) -> Email:
    fields = {"id": "e1", "sender": "a@b.example", "subject": "hello", "body": "nice to meet you"}
    fields.update(overrides)
    return Email(**fields)


def test_each_decision_gets_its_own_id():
    email = make_email()
    assert decide(email).id != decide(email).id


def test_history_returns_saved_decision():
    history = History()
    decision = decide(make_email())
    history.add_decision(decision)
    assert history.get_decision(decision.id) == decision


def test_history_returns_none_for_unknown_id():
    assert History().get_decision("missing") is None
