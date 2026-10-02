from oscar.agent import decide
from oscar.feedback import FeedbackError, FeedbackKind, record_feedback
from oscar.history import History
from oscar.models import AutonomyLevel, Email
from oscar.overview import TREND_WINDOW, autonomy, brief
from oscar.preferences import Preferences

NEWSLETTER = Email(id="n", sender="digest@ai-weekly.example", subject="Weekly digest",
                   body="Top stories. View in browser | Unsubscribe")
WIRE = Email(id="w", sender="accounts@supplier.example", subject="Balance", body="Please wire me $500 today.")
DRAFT = Email(id="d", sender="sam@company.example", subject="Notes", body="Could you send me the notes?")


def add(history: History, email: Email, email_id: str | None = None):
    email = email.model_copy(update={"id": email_id or email.id})
    decision = decide(email, Preferences.from_feedback(history.feedback))
    history.add_decision(decision)
    return decision


def test_empty_brief():
    assert brief(History())["summary"].startswith("Your inbox is empty")


def test_brief_counts_latest_decision_per_email():
    history = History()
    add(history, NEWSLETTER)
    add(history, NEWSLETTER)
    add(history, WIRE)
    b = brief(history)
    assert (b["waiting"], b["for_you"]) == (1, 1)
    assert b["summary"] == "2 emails need you."


def test_summary_wording():
    history = History()
    add(history, Email(id="f", sender="c@x.example", subject="FYI", body="fyi"))
    assert brief(history)["summary"] == "All done! I handled 1 quietly. Nothing needs you."
    add(history, WIRE)
    assert brief(history)["summary"] == "1 email needs you. I handled 1 quietly."


def test_answered_emails_dont_need_you():
    history = History()
    record_feedback(history, add(history, NEWSLETTER).id, FeedbackKind.APPROVE)
    assert brief(history)["waiting"] == 0


def test_trend_shows_when_oscar_asks_less():
    history = History()
    for i in range(2 * TREND_WINDOW):
        d = add(history, NEWSLETTER, f"n{i}")
        if d.autonomy_level == AutonomyLevel.ASK_FIRST:
            record_feedback(history, d.id, FeedbackKind.APPROVE)
    b = brief(history)
    # First 12: asked 3 times. Last 12: no asks.
    assert b["trend"] == "I haven't needed to ask you anything lately!"
    assert b["learned"] == "I've picked up one of your habits so far!"


def test_trend_as_a_percentage():
    history = History()
    for i in range(TREND_WINDOW):  # first window: always asks (no feedback)
        add(history, NEWSLETTER, f"a{i}")
    for i in range(TREND_WINDOW):  # second window: half ask, half are FYIs Oscar handles
        add(history, NEWSLETTER if i % 2 else Email(id="f", sender="c@x.example", subject="FYI", body="fyi"), f"b{i}")
    assert brief(history)["trend"] == "I'm asking you about 50% less than when we started!"


def test_no_trend_without_enough_history():
    history = History()
    add(history, NEWSLETTER)
    assert brief(history)["trend"] is None


def test_autonomy_rows_have_floors_and_ceilings():
    history = History()
    for email in (NEWSLETTER, WIRE, DRAFT):
        add(history, email)
    rows = {r["action"].value: r for r in autonomy(history)}
    assert rows["ARCHIVE"]["level"] == AutonomyLevel.ASK_FIRST and rows["ARCHIVE"]["floor"] is None
    assert rows["MOVE_MONEY"]["floor"] == AutonomyLevel.ESCALATE
    assert rows["DRAFT_REPLY"]["ceiling"] == AutonomyLevel.PROCEED_AND_NOTIFY


def test_autonomy_follows_learning():
    history = History()
    for i in range(3):
        record_feedback(history, add(history, NEWSLETTER, f"n{i}").id, FeedbackKind.APPROVE)
    [row] = autonomy(history)
    assert row["level"] == AutonomyLevel.PROCEED_AND_NOTIFY
    assert row["reason"] == "you've okayed this 3 times"


def test_safety_checked_emails_are_left_out():
    history = History()
    add(history, Email(id="z", sender="ceo@x.example", subject="favour", body="Kindly remit $500 via Zelle."))
    assert autonomy(history) == []


def test_endpoints(client):
    client.post("/demo/inbox")
    assert "summary" in client.get("/brief").json()
    assert len(client.get("/autonomy").json()) > 0


def test_got_it_takes_an_escalated_email_off_your_list():
    history = History()
    wire = add(history, WIRE)
    assert brief(history)["for_you"] == 1
    _, reply = record_feedback(history, wire.id, FeedbackKind.SEEN)
    assert reply == "Okay! It's all yours."
    assert brief(history)["for_you"] == 0
    # Got it is about the email, not about how much Oscar should do.
    assert Preferences.from_feedback(history.feedback).summary() == []


def test_got_it_is_only_for_escalated_emails():
    history = History()
    newsletter = add(history, NEWSLETTER)
    try:
        record_feedback(history, newsletter.id, FeedbackKind.SEEN)
        raise AssertionError("expected an error")
    except FeedbackError as e:
        assert "only for emails I brought to you" in str(e)


def test_told_you_emails_count_until_checked():
    history = History()
    draft = add(history, DRAFT)
    assert draft.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY
    assert brief(history)["summary"].startswith("1 email needs you.")
    record_feedback(history, draft.id, FeedbackKind.APPROVE)
    assert brief(history)["summary"].startswith("All done!")
