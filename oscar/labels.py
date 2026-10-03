"""The Gmail labels Oscar uses, and what they're called.

Each label has a fixed job (its "role", like "needs_you" or "receipts") and a name you can change
in Settings. The code only ever works with roles. The name is looked up when he talks to Gmail,
so renaming a label never changes what it's for, and undo keeps working because Gmail keeps the
same label id when it's renamed.

There are two kinds:
- Status labels, his call on an email: Stopped, Needs you and FYI. Emails he handled on his own
  get no label, since they're already archived or read and a label would just be clutter.
- Labels for a kind of email, from the "Label it" action: Receipts, and Sorted for anything else.

Names only ever come from you, in Settings, never from an email or the model.
"""

from __future__ import annotations

import re

STATUS_ROLES = ("stopped", "needs_you", "fyi")
KIND_ROLES = ("receipts", "sorted")
ROLES = STATUS_ROLES + KIND_ROLES

DEFAULT_NAMES: dict[str, str] = {
    "stopped": "Stopped",
    "needs_you": "Needs you",
    "fyi": "FYI",
    "receipts": "Receipts",
    "sorted": "Sorted",
}

# The colour each label gets when he makes it (background, text). Gmail only accepts colours from
# its own palette, so these are picked from it.
COLOURS: dict[str, tuple[str, str]] = {
    "stopped": ("#fb4c2f", "#ffffff"),
    "needs_you": ("#ffad47", "#ffffff"),
    "fyi": ("#4a86e8", "#ffffff"),
    "receipts": ("#a479e2", "#ffffff"),
    "sorted": ("#999999", "#ffffff"),
}

# Labels he used to put on emails and doesn't any more. He still knows them, so he can take his
# old ones off, but he never makes them again.
OLD_NAMES: dict[str, str] = {"handled": "Handled"}

# Which kind label an email gets, by what kind of email it is. Anything else gets "sorted".
KIND_LABEL = {"receipt": "receipts"}

MAX_NAME = 40
# Gmail's own labels and folders. A label of yours can't be called any of these.
GMAIL_NAMES = frozenset({"inbox", "sent", "draft", "drafts", "spam", "trash", "bin", "starred", "important",
                         "unread", "chat", "chats", "snoozed", "scheduled", "all mail", "outbox"})
CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class LabelNameError(ValueError):
    pass


def kind_role(email_type: str | None) -> str:
    """Which kind label an email of this type gets."""
    return KIND_LABEL.get(email_type or "", "sorted")


def check_name(name: str) -> str:
    """A label name you typed, tidied up, or LabelNameError saying what's wrong with it."""
    name = " ".join(str(name).split())
    if not name:
        raise LabelNameError("A label needs a name.")
    if len(name) > MAX_NAME:
        raise LabelNameError(f"Keep label names under {MAX_NAME} characters.")
    if CONTROL.search(name):
        raise LabelNameError("That name has characters Gmail won't take.")
    if name.lower() in GMAIL_NAMES or name.lower().startswith("category_"):
        raise LabelNameError(f"{name} is one of Gmail's own labels, so pick another name.")
    return name


def check_names(names: dict[str, str]) -> dict[str, str]:
    """Every role's name, checked, with no two labels sharing a name (Gmail ignores case)."""
    out = {**DEFAULT_NAMES}
    for role, name in names.items():
        if role not in ROLES:
            raise LabelNameError(f"There's no label called {role}.")
        out[role] = check_name(name)
    seen: dict[str, str] = {}
    for role, name in out.items():
        if name.lower() in seen:
            raise LabelNameError(f"Two of my labels can't both be called {name}.")
        seen[name.lower()] = role
    return out
