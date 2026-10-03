"""Stage 12: Oscar acts on a real inbox, only in ways that can be undone.

He may mark an email as read, archive it, or put one of his own labels on it.
Nothing else: no sending, forwarding, unsubscribing, deleting or anything to do
with money. The Gmail client can't do those either (oscar/gmail.py).

Each action records exactly which labels it added and which it removed, given
what the email had at the time, so undo puts it back the way it was.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from oscar.models import Action, AutonomyLevel, Decision, new_id, now

if TYPE_CHECKING:
    from oscar.gmail import GmailClient
    from oscar.history import History

# What each action does to Gmail's labels: (labels to add, labels to remove).
# APPLY_LABEL adds one of Oscar's own labels, named for the kind of email.
CHANGES: dict[Action, tuple[list[str], list[str]]] = {
    Action.MARK_READ: ([], ["UNREAD"]),
    Action.ARCHIVE: ([], ["INBOX"]),
    Action.APPLY_LABEL: ([], []),
}
LABEL_FOR = {"receipt": "Receipts"}  # Oscar's label for each kind of email he labels
DEFAULT_LABEL = "Sorted"
ACTED_LEVELS = frozenset({AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY})
MAX_PER_CHECK = 25  # the most Oscar does on his own in one check, so a bug can't touch the whole inbox


class ActionError(RuntimeError):
    pass


class ActionRecord(BaseModel):
    id: str = Field(default_factory=new_id)
    decision_id: str
    message_id: str
    action: Action
    by: Literal["oscar", "you"]  # Oscar on his own, or you approving him
    added: list[str] = Field(default_factory=list)  # label ids actually added
    removed: list[str] = Field(default_factory=list)  # label ids actually removed
    done_at: datetime = Field(default_factory=now)
    undone_at: datetime | None = None


def can_do(decision: Decision) -> bool:
    """An action Oscar is allowed to take at all: one of the three undoable ones, on a real email,
    and never one a safety rule stopped."""
    return (decision.source == "gmail" and decision.gmail is not None and decision.action in CHANGES
            and decision.autonomy_level != AutonomyLevel.ESCALATE)


def label_name(decision: Decision) -> str:
    return LABEL_FOR.get(decision.email_type, DEFAULT_LABEL)


def do(history: History, gmail: GmailClient, decision: Decision, by: Literal["oscar", "you"]) -> ActionRecord:
    """Do the decision's action in Gmail and record exactly what changed."""
    if not can_do(decision):
        raise ActionError("That's not something Oscar does in Gmail.")
    if history.action_for(decision.id):
        raise ActionError("Oscar already did this one.")
    add, remove = CHANGES[decision.action]
    if decision.action == Action.APPLY_LABEL:
        add = [gmail.label_id(label_name(decision))]
    message_id = decision.gmail.message_id
    current = set(gmail.labels(message_id))
    # Only what really changes, so undo puts back exactly what was there.
    added = [label for label in add if label not in current]
    removed = [label for label in remove if label in current]
    gmail.modify_labels(message_id, add=added, remove=removed)
    record = ActionRecord(decision_id=decision.id, message_id=message_id, action=decision.action, by=by,
                          added=added, removed=removed)
    history.save_action(record)
    return record


def undo(history: History, gmail: GmailClient, decision_id: str) -> ActionRecord:
    """Put the email back the way it was before Oscar's action."""
    record = history.action_for(decision_id)
    if record is None or record.undone_at:
        raise ActionError("There's nothing to undo here.")
    gmail.modify_labels(record.message_id, add=record.removed, remove=record.added)
    record = record.model_copy(update={"undone_at": now()})
    history.save_action(record)
    return record
