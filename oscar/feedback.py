"""User feedback on Oscar's decisions.

Stage 4 only records feedback. Oscar doesn't change what he does because of it
until Stage 5.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from oscar.history import History
from oscar.models import Action, AutonomyLevel, Decision, new_id, now


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
        if decision.action not in REPLY_ACTIONS:
            raise FeedbackError("Edit then send only works on replies.")
        if not edited_text:
            raise FeedbackError("I need the edited text to send.")


def record_feedback(
    history: History, decision_id: str, kind: FeedbackKind, edited_text: str | None = None
) -> tuple[FeedbackEvent, str]:
    decision = history.get_decision(decision_id)
    if decision is None:
        raise FeedbackError(f"I can't find decision {decision_id}.")
    check_allowed(decision, kind, edited_text)
    event = FeedbackEvent(
        decision_id=decision.id,
        kind=kind,
        action=decision.action,
        autonomy_level=decision.autonomy_level,
        sender=decision.sender,
        edited_text=edited_text,
    )
    history.add_feedback(event)
    return event, REPLIES[kind]
