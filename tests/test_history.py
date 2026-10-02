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


def test_history_is_saved_and_loaded(tmp_path):
    from oscar.feedback import FeedbackKind, record_feedback

    history = History(tmp_path)
    decision = decide(make_email(subject="weekly newsletter"))  # ARCHIVE, ASK_FIRST
    history.add_decision(decision)
    event, _ = record_feedback(history, decision.id, FeedbackKind.APPROVE)

    reloaded = History(tmp_path)
    assert reloaded.get_decision(decision.id) == decision
    assert reloaded.feedback == [event]



def test_the_real_inbox_folder_is_the_connected_account(tmp_path):
    from oscar.history import real_inbox_dir
    assert real_inbox_dir(tmp_path) == tmp_path / "gmail" / "accounts" / "none"
    (tmp_path / "gmail").mkdir()
    (tmp_path / "gmail" / "account.txt").write_text("me@example.com\n")
    assert real_inbox_dir(tmp_path) == tmp_path / "gmail" / "accounts" / "me@example.com"
