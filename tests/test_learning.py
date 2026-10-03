"""How your answers change what Oscar does for one sender. Approving only says the action was right;
"just handle it" or "handle and tell me" sets how much he asks; an undo makes him more careful; and the
newest "always" rule wins."""

from pathlib import Path

from oscar.agent import decide
from oscar.feedback import FeedbackKind, record_feedback
from oscar.history import History
from oscar.models import AutonomyLevel, Email
from oscar.preferences import Preferences

EMAILS_DIR = Path(__file__).resolve().parent.parent / "emails"


def load(name: str) -> Email:
    return Email.model_validate_json((EMAILS_DIR / name).read_text())


def decide_with(history: History, email: Email):
    decision = decide(email, Preferences.from_feedback(history.feedback))
    history.add_decision(decision)
    return decision


def test_approving_says_the_action_was_right_not_to_stop_asking():
    history = History()
    email = load("newsletter.json")
    for _ in range(10):
        decision = decide_with(history, email)
        assert decision.autonomy_level == AutonomyLevel.ASK_FIRST
        record_feedback(history, decision.id, FeedbackKind.APPROVE)
    assert all(e.action_feedback == "CORRECT" and e.desired_level is None for e in history.feedback)


def test_newsletter_does_what_you_say_for_emails_like_this():
    history = History()
    email = load("newsletter.json")
    asked = decide_with(history, email)
    assert asked.autonomy_level == AutonomyLevel.ASK_FIRST
    record_feedback(history, asked.id, FeedbackKind.APPROVE)
    record_feedback(history, asked.id, FeedbackKind.HANDLE_AND_TELL_ME)
    told = decide_with(history, email)
    assert told.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY
    record_feedback(history, told.id, FeedbackKind.JUST_HANDLE_IT)
    assert decide_with(history, email).autonomy_level == AutonomyLevel.PROCEED_SILENTLY


def test_undo_makes_oscar_tell_you_next_time():
    history = History()
    email = load("fyi_update.json")  # MARK_READ, PROCEED_SILENTLY
    first = decide_with(history, email)
    record_feedback(history, first.id, FeedbackKind.UNDO)

    second = decide_with(history, email)
    assert second.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY
    assert second.learned
    assert "you undid this" in second.explanation


def test_oscar_can_earn_it_back_after_an_undo():
    # Okays after an undo say the action was right, but he stays careful until you say otherwise.
    history = History()
    email = load("fyi_update.json")
    record_feedback(history, decide_with(history, email).id, FeedbackKind.UNDO)
    for _ in range(14):
        decision = decide_with(history, email)
        assert decision.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY
        record_feedback(history, decision.id, FeedbackKind.APPROVE)
    record_feedback(history, decide_with(history, email).id, FeedbackKind.JUST_HANDLE_IT)
    assert decide_with(history, email).autonomy_level == AutonomyLevel.PROCEED_SILENTLY


def test_undo_after_a_notification_goes_back_to_asking():
    history = History()
    email = load("newsletter.json")
    record_feedback(history, decide_with(history, email).id, FeedbackKind.HANDLE_AND_TELL_ME)
    notified = decide_with(history, email)
    assert notified.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY
    record_feedback(history, notified.id, FeedbackKind.UNDO)

    assert decide_with(history, email).autonomy_level == AutonomyLevel.ASK_FIRST


def test_two_undos_make_oscar_ask():
    history = History()
    email = load("fyi_update.json")
    record_feedback(history, decide_with(history, email).id, FeedbackKind.UNDO)
    record_feedback(history, decide_with(history, email).id, FeedbackKind.UNDO)
    assert decide_with(history, email).autonomy_level == AutonomyLevel.ASK_FIRST


def test_always_ask_me_overrides_what_oscar_learned():
    history = History()
    email = load("newsletter.json")
    record_feedback(history, decide_with(history, email).id, FeedbackKind.JUST_HANDLE_IT)
    silent = decide_with(history, email)
    assert silent.autonomy_level == AutonomyLevel.PROCEED_SILENTLY

    record_feedback(history, silent.id, FeedbackKind.ALWAYS_ASK_ME)
    decision = decide_with(history, email)
    assert decision.autonomy_level == AutonomyLevel.ASK_FIRST
    assert "you asked me to always check with you" in decision.explanation


def test_always_ask_me_on_a_silent_action():
    history = History()
    email = load("order_receipt.json")  # APPLY_LABEL, PROCEED_SILENTLY
    record_feedback(history, decide_with(history, email).id, FeedbackKind.ALWAYS_ASK_ME)
    assert decide_with(history, email).autonomy_level == AutonomyLevel.ASK_FIRST


def test_learned_summary_through_the_api(client):
    email = load("newsletter.json").model_dump()
    first = client.post("/decide", json=email).json()
    client.post("/feedback", json={"decision_id": first["id"], "kind": "APPROVE"})
    client.post("/feedback", json={"decision_id": first["id"], "kind": "HANDLE_AND_TELL_ME"})
    [row] = client.get("/learned").json()
    assert {k: row[k] for k in ("sender", "action", "approved", "always_ask", "told", "level", "reason", "sentence")} == {
        "sender": "digest@morningbrew-weekly.example", "action": "ARCHIVE", "approved": 1.0, "always_ask": False,
        "told": "PROCEED_AND_NOTIFY", "level": "PROCEED_AND_NOTIFY", "reason": "you told me to handle these and tell you",
        "sentence": "archive from digest@morningbrew-weekly.example: you told me to handle these and tell you, so I do it and let you know."}
    # What the record is built from, for the UI: one answer about the level, and that it came from you.
    assert row["evidence"] == 1.0 and row["provenance"] == "USER_FEEDBACK"


def test_learned_summary_shows_careful_actions():
    history = History()
    email = load("fyi_update.json")
    record_feedback(history, decide_with(history, email).id, FeedbackKind.UNDO)
    [row] = Preferences.from_feedback(history.feedback).summary()
    assert row["level"] == AutonomyLevel.PROCEED_AND_NOTIFY
    assert row["reason"] == "you undid this last time"


def test_newer_always_do_this_replaces_always_ask_me():
    history = History()
    email = load("newsletter.json")
    record_feedback(history, decide_with(history, email).id, FeedbackKind.ALWAYS_ASK_ME)
    _, reply = record_feedback(history, decide_with(history, email).id, FeedbackKind.ALWAYS_DO_THIS)
    assert reply == "Got it! I'll start taking care of these for you."
    # Oscar said he'd remember, so he shouldn't keep asking.
    assert decide_with(history, email).autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY


def test_newer_always_ask_me_replaces_always_do_this():
    history = History()
    email = load("newsletter.json")
    record_feedback(history, decide_with(history, email).id, FeedbackKind.ALWAYS_DO_THIS)
    record_feedback(history, decide_with(history, email).id, FeedbackKind.ALWAYS_ASK_ME)
    assert decide_with(history, email).autonomy_level == AutonomyLevel.ASK_FIRST
