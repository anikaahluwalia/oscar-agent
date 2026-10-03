"""Stage 12: Oscar acting in Gmail, only in ways that can be undone. He can mark read, archive or add one
of his own labels and nothing else, and undo puts back exactly what he changed. Fake Gmail only."""

import pytest

from oscar.act import ActionError, can_do, do, undo
from oscar.agent import decide
from oscar.gmail import GmailClient, parse_message
from oscar.history import History
from oscar.models import Action, AutonomyLevel
from tests.fake_gmail import FakeGmail, connected, message


def setup(tmp_path, msg):
    fake = FakeGmail([msg])
    client = GmailClient(connected(tmp_path), fake.http())
    email, info = parse_message(msg)
    return fake, client, email, info


def real(email, info, **changes):
    d = decide(email).model_copy(update={"source": "gmail", "gmail": info, **changes})
    return d


@pytest.mark.parametrize("action, before, after", [
    (Action.MARK_READ, ["INBOX", "UNREAD"], ["INBOX"]),
    (Action.ARCHIVE, ["INBOX", "UNREAD"], ["UNREAD"]),
])
def test_each_action_is_undone_exactly(tmp_path, action, before, after):
    fake, client, email, info = setup(tmp_path, message("m1", "a@b.example", "Hi", "Hello", labels=before))
    history = History()
    d = real(email, info, action=action, autonomy_level=AutonomyLevel.PROCEED_SILENTLY)
    history.add_decision(d)
    do(history, client, d, by="oscar")
    assert fake.messages["m1"]["labelIds"] == after
    undo(history, client, d.id)
    assert sorted(fake.messages["m1"]["labelIds"]) == sorted(before)


def test_labelling_uses_oscars_own_label_and_undo_takes_it_off(tmp_path):
    fake, client, email, info = setup(tmp_path, message("m1", "shop@b.example", "Receipt", "Your receipt"))
    history = History()
    d = real(email, info, action=Action.APPLY_LABEL, autonomy_level=AutonomyLevel.PROCEED_SILENTLY, email_type="receipt")
    do(history, client, d, by="oscar")
    label = next(l["id"] for l in fake.labels if l["name"] == "Receipts")
    assert label in fake.messages["m1"]["labelIds"]
    undo(history, client, d.id)
    assert label not in fake.messages["m1"]["labelIds"]


def test_undo_only_puts_back_what_oscar_changed(tmp_path):
    # Already read when Oscar marked it read: undo mustn't make it unread.
    fake, client, email, info = setup(tmp_path, message("m1", "a@b.example", "Hi", "Hello", labels=["INBOX"]))
    history = History()
    d = real(email, info, action=Action.MARK_READ, autonomy_level=AutonomyLevel.PROCEED_SILENTLY)
    record = do(history, client, d, by="oscar")
    assert record.removed == [] and record.added == []
    undo(history, client, d.id)
    assert fake.messages["m1"]["labelIds"] == ["INBOX"]


@pytest.mark.parametrize("action", [Action.DRAFT_REPLY, Action.SEND_REPLY, Action.FORWARD, Action.UNSUBSCRIBE,
                                    Action.PERMANENTLY_DELETE, Action.MOVE_MONEY, Action.SEND_CREDENTIALS,
                                    Action.ACCEPT_MEETING])
def test_only_the_three_undoable_actions_are_ever_done(tmp_path, action):
    fake, client, email, info = setup(tmp_path, message("m1", "a@b.example", "Hi", "Hello"))
    d = real(email, info, action=action, autonomy_level=AutonomyLevel.PROCEED_SILENTLY)
    assert not can_do(d)
    with pytest.raises(ActionError):
        do(History(), client, d, by="oscar")
    assert not [r for r in fake.gmail_requests() if r.method == "POST"]


def test_nothing_stopped_is_ever_done(tmp_path):
    fake, client, email, info = setup(tmp_path, message("m1", "a@b.example", "Hi", "Hello"))
    d = real(email, info, action=Action.MARK_READ, autonomy_level=AutonomyLevel.ESCALATE)
    assert not can_do(d)


def test_an_action_is_done_once_and_undone_once(tmp_path):
    fake, client, email, info = setup(tmp_path, message("m1", "a@b.example", "Hi", "Hello"))
    history = History()
    d = real(email, info, action=Action.MARK_READ, autonomy_level=AutonomyLevel.PROCEED_SILENTLY)
    do(history, client, d, by="oscar")
    with pytest.raises(ActionError, match="already"):
        do(history, client, d, by="oscar")
    undo(history, client, d.id)
    with pytest.raises(ActionError, match="nothing to undo"):
        undo(history, client, d.id)


def test_actions_are_saved_and_loaded(tmp_path):
    fake, client, email, info = setup(tmp_path, message("m1", "a@b.example", "Hi", "Hello"))
    history = History(tmp_path / "data")
    d = real(email, info, action=Action.ARCHIVE, autonomy_level=AutonomyLevel.PROCEED_SILENTLY)
    do(history, client, d, by="oscar")
    undo(history, client, d.id)
    loaded = History(tmp_path / "data").action_for(d.id)
    assert loaded.removed == ["INBOX"] and loaded.undone_at is not None
