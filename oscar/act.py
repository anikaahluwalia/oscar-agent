"""Stage 12: Oscar acts on a real inbox, only in ways that can be undone.

He may mark an email as read, archive it, or put one of his own labels on it.
Nothing else: no sending, forwarding, unsubscribing, deleting or anything to do
with money. The Gmail client can't do those either (oscar/gmail.py).

Each action records exactly which labels it added and which it removed, given
what the email had at the time, so undo puts it back the way it was.

Separately, emails get his call as a coloured label (Stopped, Needs you or FYI), so you
can see it in Gmail itself, even on your phone. That's a note on the email, not the
email's action: it never reads, archives or answers anything, and an email he stopped
still gets "Stopped". Emails he handled on his own get no status label. What each label
is called is up to you (oscar/labels.py).
"""

from __future__ import annotations

import threading
from datetime import datetime
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field, model_validator

from oscar.labels import kind_role
from oscar.models import Action, AutonomyLevel, Decision, new_id, now

if TYPE_CHECKING:
    from oscar.gmail import GmailClient
    from oscar.history import History

# What each action does to Gmail's labels: (labels to add, labels to remove).
# APPLY_LABEL adds one of Oscar's own labels, picked by the kind of email (labels.kind_role).
CHANGES: dict[Action, tuple[list[str], list[str]]] = {
    Action.MARK_READ: ([], ["UNREAD"]),
    Action.ARCHIVE: ([], ["INBOX"]),
    Action.APPLY_LABEL: ([], []),
}
ACTED_LEVELS = frozenset({AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY})
MAX_PER_CHECK = 25  # the most Oscar does on his own in one check, so a bug can't touch the whole inbox


# Oscar's call on an email, in the words the app and the Gmail extension show. "Handled" only
# once he really did it.
HANDLED, FYI, NEEDS_YOU, STOPPED = "Handled", "FYI", "Needs you", "Stopped"
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
    label: str | None = None  # for "Label it": which of his labels he used, by role (oscar/labels.py)
    done_at: datetime = Field(default_factory=now)
    undone_at: datetime | None = None


# What the status labels used to be saved as, before they had roles.
_OLD_TAGS = {"Handled": "handled", "FYI": "fyi", "Needs you": "needs_you", "Stopped": "stopped"}


class Tag(BaseModel):
    """The status label Oscar last put on an email, by role (oscar/labels.py)."""
    email_id: str
    message_id: str
    label: str | None  # None: no status label on it (he handled it, or it's gone from Gmail)
    gone: bool = False  # the email isn't in Gmail any more, so he stops trying to label it
    added: bool = False  # he put it on (it wasn't already there), so it's his to take off later
    at: datetime = Field(default_factory=now)

    @model_validator(mode="before")
    @classmethod
    def _from_before_roles(cls, data):
        """Tags saved before labels had roles stored the name, and None meant the email was gone."""
        if isinstance(data, dict) and "gone" not in data:
            data = {**data, "label": _OLD_TAGS.get(data.get("label"), data.get("label")), "gone": data.get("label") is None}
        return data


def can_do(decision: Decision) -> bool:
    """An action Oscar is allowed to take at all: one of the three undoable ones, on a real email,
    and never one a safety rule stopped."""
    return (decision.source == "gmail" and decision.gmail is not None and decision.action in CHANGES
            and decision.autonomy_level != AutonomyLevel.ESCALATE)


def label_role(decision: Decision) -> str:
    """Which of his labels "Label it" uses for this email, by role."""
    return kind_role(decision.email_type)


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
    label = label_role(decision) if decision.action == Action.APPLY_LABEL else None
    if label:
        add = [gmail.label_id(label)]
    message_id = decision.gmail.message_id
    current = set(gmail.labels(message_id))
    # Only what really changes, so undo puts back exactly what was there.
    added = [label for label in add if label not in current]
    removed = [label for label in remove if label in current]
    gmail.modify_labels(message_id, add=added, remove=removed)
    record = ActionRecord(decision_id=decision.id, message_id=message_id, action=decision.action, by=by,
                          added=added, removed=removed, label=label)
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
    """Oscar's latest call on an email, in words: Stopped, Handled, Needs you or FYI. For the
    app and the extension's chips. waiting is the ids of asks still on your list."""
    if decision.autonomy_level == AutonomyLevel.ESCALATE:
        return STOPPED
    done = history.action_for(decision.id)
    if done and not done.undone_at:
        return HANDLED
    if decision.autonomy_level == AutonomyLevel.ASK_FIRST and decision.id in waiting:
        return NEEDS_YOU
    return FYI


def gmail_label(history: History, decision: Decision, waiting: set[str]) -> str | None:
    """The status label this email should have in Gmail, by role, or None for no label:
    - stopped: a safety rule stopped it
    - needs_you: an ask still waiting for your answer
    - fyi: he did it (or would) and tells you, so it's worth a look
    Emails he handled quietly, and asks you've already answered, get nothing."""
    if decision.autonomy_level == AutonomyLevel.ESCALATE:
        return "stopped"
    if decision.autonomy_level == AutonomyLevel.ASK_FIRST:
        return "needs_you" if decision.id in waiting else None
    if decision.autonomy_level == AutonomyLevel.PROCEED_AND_NOTIFY:
        return "fyi"
    return None


def tag(history: History, gmail: GmailClient, decision: Decision, label: str | None) -> Tag:
    """Put one status label on the email (by role), taking off the one Oscar put there before.
    None just takes his old one off. Nothing else on the email changes, and a label you put
    there yourself is never taken off."""
    with _lock:
        before = history.tags.get(decision.email_id)
        message_id = decision.gmail.message_id
        current = set(gmail.labels(message_id))
        new = gmail.label_id(label) if label else None
        old = gmail.find_label(before.label) if before and before.added and before.label else None
        add = [new] if new and new not in current else []
        remove = [old] if old and old != new and old in current else []
        gmail.modify_labels(message_id, add=add, remove=remove)
        # Still his if he added it now, or added it before and it's the same label.
        added = bool(add) or bool(before and before.added and before.label == label)
        record = Tag(email_id=decision.email_id, message_id=message_id, label=label, added=added)
        history.save_tag(record)
        return record


def gone(history: History, decision: Decision) -> None:
    """The email isn't in Gmail any more, so stop trying to label it."""
    history.save_tag(Tag(email_id=decision.email_id, message_id=decision.gmail.message_id, label=None, gone=True))
