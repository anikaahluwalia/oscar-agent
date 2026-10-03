"""Stage 12: Oscar acts on a real inbox, only in ways that can be undone.

He may mark an email as read, archive it, or put one of his own labels on it.
Nothing else: no sending, forwarding, unsubscribing, deleting or anything to do
with money. The Gmail client can't do those either (oscar/gmail.py).

Each action records exactly which labels it added and which it removed, given
what the email had at the time, so undo puts it back the way it was.

Separately, every email he reads gets his call as a coloured label (Handled, FYI,
Needs you, Stopped), so you can see it in Gmail itself. That's a note on the email,
not the email's action: it never reads, archives or answers anything, and an email
he stopped still gets "Stopped".
"""

from __future__ import annotations

import threading
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


# Oscar's call on an email, as the label you see in Gmail. "Handled" only once he really did it.
HANDLED, FYI, NEEDS_YOU, STOPPED = "Handled", "FYI", "Needs you", "Stopped"
STATUS_LABELS = (HANDLED, FYI, NEEDS_YOU, STOPPED)
TAGS_PER_CHECK = 50  # the most emails he labels or relabels in one check


class ActionError(RuntimeError):
    pass


# Doing and undoing hold this, so two requests at once (two tabs, a retry) can't both act on
# an email, or overwrite each other's record of what changed.
_lock = threading.Lock()


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


class Tag(BaseModel):
    """The status label Oscar last put on an email."""
    email_id: str
    message_id: str
    label: str | None  # None once the email is gone from Gmail
    added: bool = False  # he put it on (it wasn't already there), so it's his to take off later
    at: datetime = Field(default_factory=now)


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
    with _lock:
        return _do(history, gmail, decision, by)


def _do(history: History, gmail: GmailClient, decision: Decision, by: Literal["oscar", "you"]) -> ActionRecord:
    done = history.action_for(decision.id)
    if done and not done.undone_at:
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
    with _lock:
        record = history.action_for(decision_id)
        if record is None or record.undone_at:
            raise ActionError("There's nothing to undo here.")
        gmail.modify_labels(record.message_id, add=record.removed, remove=record.added)
        record = record.model_copy(update={"undone_at": now()})
        history.save_action(record)
        return record


def status_label(history: History, decision: Decision, waiting: set[str]) -> str:
    """The label for Oscar's latest call on an email. waiting is the ids of asks still on your list."""
    if decision.autonomy_level == AutonomyLevel.ESCALATE:
        return STOPPED
    done = history.action_for(decision.id)
    if done and not done.undone_at:
        return HANDLED
    if decision.autonomy_level == AutonomyLevel.ASK_FIRST and decision.id in waiting:
        return NEEDS_YOU
    return FYI


def tag(history: History, gmail: GmailClient, decision: Decision, label: str) -> Tag:
    """Put one status label on the email, taking off the one Oscar put there before. Nothing
    else on the email changes, and a label you put there yourself is never taken off."""
    with _lock:
        before = history.tags.get(decision.email_id)
        message_id = decision.gmail.message_id
        current = set(gmail.labels(message_id))
        new = gmail.label_id(label)
        old = gmail.find_label(before.label) if before and before.added and before.label else None
        add = [new] if new not in current else []
        remove = [old] if old and old != new and old in current else []
        gmail.modify_labels(message_id, add=add, remove=remove)
        # Still his if he added it now, or added it before and it's the same label.
        added = bool(add) or bool(before and before.added and before.label == label)
        record = Tag(email_id=decision.email_id, message_id=message_id, label=label, added=added)
        history.save_tag(record)
        return record


def gone(history: History, decision: Decision) -> None:
    """The email isn't in Gmail any more, so stop trying to label it."""
    history.save_tag(Tag(email_id=decision.email_id, message_id=decision.gmail.message_id, label=None))
