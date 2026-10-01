"""How Oscar words things. Everything the user reads about a decision comes from here."""

from oscar.models import Action, AutonomyLevel

ACTION_PHRASES: dict[Action, str] = {
    Action.MARK_READ: "mark this as read",
    Action.ARCHIVE: "archive this",
    Action.APPLY_LABEL: "label this",
    Action.DRAFT_REPLY: "draft a reply",
    Action.SEND_REPLY: "send a reply",
    Action.FORWARD: "forward this",
    Action.UNSUBSCRIBE: "unsubscribe you",
    Action.ACCEPT_MEETING: "accept this invite",
    Action.PERMANENTLY_DELETE: "permanently delete this",
    Action.SEND_CREDENTIALS: "send your credentials",
    Action.MOVE_MONEY: "move money",
}

# Past tense, for things Oscar has already done.
ACTION_DONE: dict[Action, str] = {
    Action.MARK_READ: "marked this as read",
    Action.ARCHIVE: "archived this",
    Action.APPLY_LABEL: "labelled this",
    Action.DRAFT_REPLY: "drafted a reply for you",
    Action.SEND_REPLY: "sent a reply",
    Action.FORWARD: "forwarded this",
    Action.UNSUBSCRIBE: "unsubscribed you",
    Action.ACCEPT_MEETING: "accepted this invite",
    Action.PERMANENTLY_DELETE: "permanently deleted this",
    Action.SEND_CREDENTIALS: "sent your credentials",
    Action.MOVE_MONEY: "moved money",
}

TEMPLATES: dict[AutonomyLevel, str] = {
    AutonomyLevel.PROCEED_SILENTLY: "Handled it. I {done}, since {reason}.",
    AutonomyLevel.PROCEED_AND_NOTIFY: "Heads up: I {done}. I went ahead because {reason}.",
    AutonomyLevel.ASK_FIRST: "Want me to {phrase}? I'm checking first because {reason}.",
    AutonomyLevel.ESCALATE: "This one's for you. It looks like a request to {phrase}, and {reason}.",
}


LEVEL_HABITS: dict[AutonomyLevel, str] = {
    AutonomyLevel.PROCEED_SILENTLY: "I do it without bothering you",
    AutonomyLevel.PROCEED_AND_NOTIFY: "I do it and let you know",
    AutonomyLevel.ASK_FIRST: "I check with you first",
}


def describe_learning(row: dict) -> str:
    """One line on what Oscar has learned about an action."""
    action = row["action"].value.lower().replace("_", " ")
    what = f"{action} from {row['sender']}"
    if row["level"] is None:
        return f"{what}: {row['reason']}."
    return f"{what}: {row['reason']}, so {LEVEL_HABITS[row['level']]}."


# Used when Oscar is being more careful than usual because of feedback.
CAREFUL_NOTIFY = "Heads up: I {done}. I'm telling you because {reason}."


def explain(action: Action, level: AutonomyLevel, reason: str, careful: bool = False) -> str:
    """What Oscar says about a decision, without the evidence."""
    template = CAREFUL_NOTIFY if careful and level == AutonomyLevel.PROCEED_AND_NOTIFY else TEMPLATES[level]
    return template.format(phrase=ACTION_PHRASES[action], done=ACTION_DONE[action], reason=reason)


def with_evidence(message: str, noticed: str | None) -> str:
    """The message plus the phrase that triggered it, for places that only show text (CLI, transcripts)."""
    if noticed is None:
        return f"{message} (Nothing in it stood out to me.)"
    return f'{message} (I noticed "{noticed}".)'
