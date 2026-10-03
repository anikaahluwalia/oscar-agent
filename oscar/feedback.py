"""User feedback on Oscar's decisions.

Stage 4 only records feedback. Oscar doesn't change what he does because of it
until Stage 5. Feedback can't get around the safety floor: "always do this" on a
risky decision is saved but marked blocked_by_floor, and Oscar says so.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from oscar.history import History
from oscar.models import Action, AutonomyLevel, Decision, new_id, now
from oscar.safety import ACTION_FLOORS
from oscar.voice import ACTION_PHRASES


class FeedbackKind(str, Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    UNDO = "UNDO"
    EDIT_THEN_SEND = "EDIT_THEN_SEND"
    ALWAYS_DO_THIS = "ALWAYS_DO_THIS"
    ALWAYS_ASK_ME = "ALWAYS_ASK_ME"
    SEEN = "SEEN"  # "got it" on an email Oscar brought to you; it teaches him nothing
    FORGET = "FORGET"  # forget what he's learned for this sender and action, and start fresh


class FeedbackEvent(BaseModel):
    id: str = Field(default_factory=new_id)
    created_at: datetime = Field(default_factory=now)
    decision_id: str
    kind: FeedbackKind
    # Copied from the decision so the feedback log makes sense on its own.
    action: Action
    autonomy_level: AutonomyLevel
    sender: str
    email_type: str = "unknown"  # what kind of email it was, so habits can carry over to similar emails
    edited_text: str | None = None
    # True when the user asked for more autonomy than the safety floor allows.
    blocked_by_floor: bool = False


class FeedbackError(ValueError):
    pass


REPLIES: dict[FeedbackKind, str] = {
    FeedbackKind.APPROVE: "Done! One less thing.",
    FeedbackKind.REJECT: "Okay! I left it alone.",
    FeedbackKind.UNDO: "Put it back! My mistake, I'll be more careful with these.",
    FeedbackKind.EDIT_THEN_SEND: "Sent with your changes! I'll pay attention to how you write these.",
    FeedbackKind.ALWAYS_DO_THIS: "Got it! I'll start taking care of these for you.",
    FeedbackKind.ALWAYS_ASK_ME: "You got it! I'll always check with you on these.",
    FeedbackKind.SEEN: "Okay! It's all yours.",
    FeedbackKind.FORGET: "Okay, I've forgotten that. I'll start fresh with this sender.",
}

OSCAR_ACTED = {AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY}
REPLY_ACTIONS = {Action.DRAFT_REPLY, Action.SEND_REPLY}


TEACHING_ONLY = {FeedbackKind.ALWAYS_DO_THIS, FeedbackKind.ALWAYS_ASK_ME, FeedbackKind.FORGET}  # change nothing in Gmail


def check_allowed(decision: Decision, kind: FeedbackKind, edited_text: str | None, undoable: bool = False) -> None:
    """Whether this feedback makes sense for this decision. undoable: Oscar did something in Gmail
    for it that hasn't been undone (Stage 12), so undo is allowed whatever the level."""
    if kind == FeedbackKind.FORGET or (decision.source == "gmail" and kind in TEACHING_ONLY):
        return  # these only teach him (or untaught him); they're fine on any email
    if decision.source == "gmail" and kind == FeedbackKind.UNDO:
        if not undoable:
            raise FeedbackError("I didn't do anything in Gmail with that one, so there's nothing to undo.")
        return
    if decision.source == "gmail" and kind == FeedbackKind.EDIT_THEN_SEND:
        raise FeedbackError("I never send email from your Gmail. Reply there yourself.")
    if decision.source == "gmail" and not decision.acting:
        # Made while Oscar only read the inbox: he didn't do anything, so there's nothing to
        # approve or undo. Reviewing is how you answer these.
        raise FeedbackError("I'm only reading your real inbox for now, so there's nothing to approve or undo. Review it instead.")
    level = decision.autonomy_level
    if kind == FeedbackKind.APPROVE and level not in (AutonomyLevel.ASK_FIRST, AutonomyLevel.PROCEED_AND_NOTIFY):
        raise FeedbackError("I only need an okay on things I asked about or told you about.")
    if kind == FeedbackKind.REJECT and level != AutonomyLevel.ASK_FIRST:
        raise FeedbackError("I only need a yes or no on things I asked you about.")
    if kind == FeedbackKind.UNDO and level not in OSCAR_ACTED:
        raise FeedbackError("I didn't do anything with that one, so there's nothing to undo.")
    if kind == FeedbackKind.SEEN and level != AutonomyLevel.ESCALATE:
        raise FeedbackError("Got it is only for emails I brought to you.")
    if kind == FeedbackKind.EDIT_THEN_SEND:
        if level == AutonomyLevel.ESCALATE:
            raise FeedbackError("I'm not sending anything on this one. You'll need to reply yourself.")
        if decision.action not in REPLY_ACTIONS:
            raise FeedbackError("Edit then send only works on replies.")
        if not edited_text:
            raise FeedbackError("I need the edited text to send.")


def floor_reply(decision: Decision) -> str | None:
    """Oscar's reply when "always do this" would go below the floor, else None."""
    if decision.autonomy_level == AutonomyLevel.ESCALATE or decision.safety_flags:
        return "I'll always bring these to you. Some things I'm not going to guess on."
    floor = ACTION_FLOORS.get(decision.action)
    if floor:
        return f"I'll keep checking with you before I {ACTION_PHRASES[decision.action]}, since {floor[1]}."
    return None


def record_feedback(
    history: History, decision_id: str, kind: FeedbackKind, edited_text: str | None = None, undoable: bool = False
) -> tuple[FeedbackEvent, str]:
    decision = history.get_decision(decision_id)
    if decision is None:
        raise FeedbackError(f"I can't find decision {decision_id}.")
    check_allowed(decision, kind, edited_text, undoable)
    reply = REPLIES[kind]
    if kind == FeedbackKind.APPROVE and decision.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY:
        reply = "Thanks! Good to know I got that one right."
    blocked = False
    if kind == FeedbackKind.ALWAYS_DO_THIS:
        blocked_reply = floor_reply(decision)
        if blocked_reply:
            reply, blocked = blocked_reply, True
    event = FeedbackEvent(
        decision_id=decision.id,
        kind=kind,
        action=decision.action,
        autonomy_level=decision.autonomy_level,
        sender=decision.sender,
        email_type=decision.email_type,
        edited_text=edited_text,
        blocked_by_floor=blocked,
    )
    history.add_feedback(event)
    return event, reply
