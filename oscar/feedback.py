"""User feedback on Oscar's decisions.

Stage 4 only records feedback. Oscar doesn't change what he does because of it
until Stage 5. Feedback can't get around the safety floor: "always do this" on a
risky decision is saved but marked blocked_by_floor, and Oscar says so.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from oscar.agent import ACTION_PHRASES
from oscar.history import History
from oscar.models import Action, AutonomyLevel, Decision, new_id, now
from oscar.safety import ACTION_FLOORS


class FeedbackKind(str, Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    UNDO = "UNDO"
    EDIT_THEN_SEND = "EDIT_THEN_SEND"
    ALWAYS_DO_THIS = "ALWAYS_DO_THIS"
    ALWAYS_ASK_ME = "ALWAYS_ASK_ME"


class FeedbackEvent(BaseModel):
    id: str = Field(default_factory=new_id)
    created_at: datetime = Field(default_factory=now)
    decision_id: str
    kind: FeedbackKind
    # Copied from the decision so the feedback log makes sense on its own.
    action: Action
    autonomy_level: AutonomyLevel
    sender: str
    edited_text: str | None = None
    # True when the user asked for more autonomy than the safety floor allows.
    blocked_by_floor: bool = False


class FeedbackError(ValueError):
    pass


REPLIES: dict[FeedbackKind, str] = {
    FeedbackKind.APPROVE: "Done.",
    FeedbackKind.REJECT: "Okay, I left it alone.",
    FeedbackKind.UNDO: "Put it back. Sorry about that.",
    FeedbackKind.EDIT_THEN_SEND: "Sent with your changes. I'll pay attention to how you write these.",
    FeedbackKind.ALWAYS_DO_THIS: "Got it. I'll remember you're fine with this.",
    FeedbackKind.ALWAYS_ASK_ME: "Okay. I'll always check with you on these.",
}

OSCAR_ACTED = {AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY}
REPLY_ACTIONS = {Action.DRAFT_REPLY, Action.SEND_REPLY}


def check_allowed(decision: Decision, kind: FeedbackKind, edited_text: str | None) -> None:
    level = decision.autonomy_level
    if kind in (FeedbackKind.APPROVE, FeedbackKind.REJECT) and level != AutonomyLevel.ASK_FIRST:
        raise FeedbackError("I only need a yes or no on things I asked you about.")
    if kind == FeedbackKind.UNDO and level not in OSCAR_ACTED:
        raise FeedbackError("I didn't do anything with that one, so there's nothing to undo.")
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
        return "I can't take that one on myself. I'll keep bringing these to you."
    floor = ACTION_FLOORS.get(decision.action)
    if floor:
        return f"I'll keep asking before I {ACTION_PHRASES[decision.action]}, since {floor[1]}."
    return None


def record_feedback(
    history: History, decision_id: str, kind: FeedbackKind, edited_text: str | None = None
) -> tuple[FeedbackEvent, str]:
    decision = history.get_decision(decision_id)
    if decision is None:
        raise FeedbackError(f"I can't find decision {decision_id}.")
    check_allowed(decision, kind, edited_text)
    reply = REPLIES[kind]
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
        edited_text=edited_text,
        blocked_by_floor=blocked,
    )
    history.add_feedback(event)
    return event, reply
