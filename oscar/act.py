"""Stage 12: Oscar acts on a real inbox, only in ways that can be undone.

He may mark an email as read, archive it, put one of his own labels on it, or save a
reply he wrote as a draft in its thread (draft, below). When an email asks to be deleted
and you hold to approve, he moves it to Gmail's Trash (trash, below), never on his own.
Nothing else: no sending, forwarding, unsubscribing, deleting for good or anything to do
with money. The Gmail client can't do those either (oscar/gmail.py).

Each action records exactly which labels it added and which it removed, given
what the email had at the time, so undo puts it back the way it was.

Separately, emails get his call as a coloured label (Stopped, Needs you or FYI), so you
can see it in Gmail itself, even on your phone. That's a note on the email, not the
email's action: it never reads, archives or answers anything, and an email he stopped
still gets "Stopped". Emails he handled quietly get no status label. What each label is
called is up to you (oscar/labels.py).
"""

from __future__ import annotations

import threading
from datetime import datetime
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field, model_validator

from oscar.labels import kind_role
from oscar.models import Action, AutonomyLevel, Decision, new_id, now
from oscar.safety_review import is_safety_stop

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
# The most Oscar does in Gmail in one go (one check, or the asks a yes to a rule clears), so a bug
# can't touch the whole inbox.
MAX_PER_CHECK = 25


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
    draft_id: str | None = None  # for a reply: the Gmail draft he saved, so undo can take it away
    draft_text: str | None = None  # and what it says, so the app can show it
    trashed: bool = False  # for a delete you approved: he moved it to the Trash, so undo takes it back out
    done_at: datetime = Field(default_factory=now)
    undone_at: datetime | None = None


# What the status labels used to be saved as, before they had roles.
_OLD_TAGS = {"Handled": "handled", "FYI": "fyi", "Needs you": "needs_you", "Stopped": "stopped"}


class Tag(BaseModel):
    """The status label Oscar last put on an email, by role (oscar/labels.py)."""
    email_id: str
    message_id: str
    label: str | None  # None: no status label on it (he handled it quietly, you answered, or it's gone from Gmail)
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
    """An action Oscar is allowed to take at all: one of the three undoable ones, on an email in a
    Gmail (your real one, or a demo's pretend one), and never one a safety rule stopped."""
    return (decision.gmail is not None and decision.action in CHANGES
            and decision.autonomy_level != AutonomyLevel.ESCALATE)


def can_draft(decision: Decision) -> bool:
    """A reply Oscar may write as a draft: an email in a Gmail he decided needs a reply, that no safety
    rule stopped and that mentions nothing sensitive (caution). Never sent: it waits in your Drafts."""
    return (decision.gmail is not None and decision.action == Action.DRAFT_REPLY
            and decision.autonomy_level != AutonomyLevel.ESCALATE and not decision.safety_flags and not decision.caution)


def can_trash(decision: Decision) -> bool:
    """An email that asks to be deleted, that Oscar asked you about: only your yes moves it to the
    Trash. Never one a safety rule stopped, and never on his own (he only ever asks about these)."""
    return (decision.gmail is not None and decision.action == Action.PERMANENTLY_DELETE
            and decision.autonomy_level == AutonomyLevel.ASK_FIRST)


def trash(history: History, gmail: GmailClient, decision: Decision) -> ActionRecord:
    """You held to approve deleting this email: move it to Gmail's Trash, and record it so it can be undone."""
    if not can_trash(decision):
        raise ActionError("That's not something Oscar deletes.")
    with _lock:
        done = history.action_for(decision.id)
        if done and not done.undone_at:
            raise ActionError("Oscar already did this one.")
        gmail.trash(decision.gmail.message_id)
        record = ActionRecord(decision_id=decision.id, message_id=decision.gmail.message_id,
                              action=Action.PERMANENTLY_DELETE, by="you", trashed=True)
        history.save_action(record)
        return record


def draft(history: History, gmail: GmailClient, decision: Decision, text: str, by: Literal["oscar", "you"]) -> ActionRecord:
    """Save a reply as a draft in the email's thread, and record it so it can be undone."""
    if not can_draft(decision):
        raise ActionError("That's not something Oscar drafts a reply to.")
    with _lock:
        done = history.action_for(decision.id)
        if done and not done.undone_at:
            raise ActionError("Oscar already did this one.")
        draft_id = gmail.create_draft(decision.gmail.message_id, decision.gmail.thread_id, decision.sender,
                                      decision.subject, text)
        record = ActionRecord(decision_id=decision.id, message_id=decision.gmail.message_id, action=Action.DRAFT_REPLY,
                              by=by, draft_id=draft_id, draft_text=text)
        history.save_action(record)
        return record


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
        if record.draft_id:
            gmail.delete_draft(record.draft_id)  # a reply he drafted: take the draft away
        elif record.trashed:
            gmail.untrash(record.message_id)  # an email you said to delete: back out of the Trash
        else:
            gmail.modify_labels(record.message_id, add=record.removed, remove=record.added)
        record = record.model_copy(update={"undone_at": now()})
        history.save_action(record)
        return record


def status_label(history: History, decision: Decision, waiting: set[str]) -> str:
    """Oscar's latest call on an email, in words: Stopped, Handled, Needs you or FYI. For the
    app and the extension's chips. waiting is the ids of asks still on your list. "Stopped" is
    only for what a safety rule stopped (Safety review); anything else he brings to you, like an
    urgent email or a sender you said to only tell you about, "Needs you"."""
    if decision.autonomy_level == AutonomyLevel.ESCALATE:
        return STOPPED if is_safety_stop(decision) else NEEDS_YOU
    done = history.action_for(decision.id)
    if done and not done.undone_at:
        return HANDLED
    if decision.autonomy_level == AutonomyLevel.ASK_FIRST and decision.id in waiting:
        return NEEDS_YOU
    return FYI


def gmail_label(history: History, decision: Decision, waiting: set[str]) -> str | None:
    """The status label this email should have in Gmail, by role, or None for no label:
    - stopped: a safety rule stopped it
    - needs_you: an ask still waiting for your answer, or something else he brought to you that you
      haven't dealt with (an urgent email, say): it's for you, but not risky
    - fyi: he did it (or would) and tells you, so it's worth a look
    Emails he handled quietly, and ones you've already answered, get nothing. waiting is the ids of
    everything still on your list."""
    if decision.autonomy_level == AutonomyLevel.ESCALATE:
        if is_safety_stop(decision):
            return "stopped"
        return "needs_you" if decision.id in waiting else None
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
