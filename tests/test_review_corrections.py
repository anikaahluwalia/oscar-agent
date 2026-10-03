"""Saying "No" in Review about something Oscar already did in Gmail fixes the email too
(api.correct_from_review): he puts it back, and does the easy-to-undo action you picked instead."""

from tests.test_acting import NEWSLETTER, RECEIPT, api, decision_for, names  # noqa: F401


def archived_by_your_yes(api):  # noqa: F811
    client, real, fake = api([NEWSLETTER])
    client.post("/gmail/sync")
    ask = decision_for(real, "n1")
    client.post("/reviews", json={"decision_id": ask.id, "label": "CORRECT"})
    assert "INBOX" not in fake.messages["n1"]["labelIds"], "Yes approved it, so it was archived"
    return client, real, fake, ask


def test_no_with_a_different_action_puts_it_back_and_does_that_instead(api):  # noqa: F811
    client, real, fake, ask = archived_by_your_yes(api)
    r = client.post("/reviews", json={"decision_id": ask.id, "should_be_level": "PROCEED_SILENTLY", "should_be_action": "MARK_READ"})
    assert r.status_code == 200
    labels = fake.messages["n1"]["labelIds"]
    assert "INBOX" in labels and "UNREAD" not in labels, "back in the inbox, and marked read instead"
    assert real.action_for(ask.id).action.value == "MARK_READ" and real.action_for(ask.id).by == "you"


def test_no_he_should_have_asked_just_puts_it_back(api):  # noqa: F811
    client, real, fake, ask = archived_by_your_yes(api)
    r = client.post("/reviews", json={"decision_id": ask.id, "should_be_level": "ASK_FIRST", "should_be_action": "MARK_READ"})
    assert r.status_code == 200
    assert "INBOX" in fake.messages["n1"]["labelIds"] and real.action_for(ask.id).undone_at


def test_no_about_how_much_only_leaves_the_email_alone(api):  # noqa: F811
    client, real, fake = api([RECEIPT])
    client.post("/gmail/sync")
    done = decision_for(real, "r1")
    assert real.action_for(done.id) is not None, "he labelled it on his own"
    before = list(fake.messages["r1"]["labelIds"])
    client.post("/reviews", json={"decision_id": done.id, "should_be_level": "PROCEED_AND_NOTIFY", "should_be_action": "APPLY_LABEL"})
    assert fake.messages["r1"]["labelIds"] == before, "right action, only the level was off"


def test_the_label_he_added_comes_off_when_you_say_it_should_have_been_archived(api):  # noqa: F811
    client, real, fake = api([RECEIPT])
    client.post("/gmail/sync")
    done = decision_for(real, "r1")
    client.post("/reviews", json={"decision_id": done.id, "should_be_level": "PROCEED_SILENTLY", "should_be_action": "ARCHIVE"})
    assert names(fake, "r1") == ["UNREAD"], "his label off, and archived instead"


def test_nothing_changes_in_gmail_once_acting_is_off(api):  # noqa: F811
    client, real, fake, ask = archived_by_your_yes(api)
    client.post("/gmail/acting", json={"on": False})
    client.post("/reviews", json={"decision_id": ask.id, "should_be_level": "ASK_FIRST", "should_be_action": "MARK_READ"})
    assert "INBOX" not in fake.messages["n1"]["labelIds"], "Undo is still there for when acting is back on"
