"""Oscar's decision loop: classify the email, look up the policy, apply the safety floor, explain."""

from oscar.classifier import classify
from oscar.models import Action, AutonomyLevel, Decision, Email
from oscar.policy import autonomy_for
from oscar.safety import FLAG_ACTIONS, apply_floor, check_email

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


def explain(action: Action, level: AutonomyLevel, reason: str, matched: str | None) -> str:
    text = TEMPLATES[level].format(phrase=ACTION_PHRASES[action], done=ACTION_DONE[action], reason=reason)
    if matched is None:
        return f"{text} (Nothing in it stood out to me.)"
    return f'{text} (I noticed "{matched}".)'


def decide(email: Email) -> Decision:
    classification = classify(email)
    action = classification.action
    level, reason = autonomy_for(action)
    level, reason = apply_floor(action, level, reason)
    explanation = explain(action, level, reason, classification.matched_pattern)

    # A risky request in the email escalates, whatever the action is.
    flags = check_email(email)
    if flags:
        for flag in flags:
            if flag.category in FLAG_ACTIONS:
                action = FLAG_ACTIONS[flag.category]
                break
        level = AutonomyLevel.ESCALATE
        explanation = f'This one\'s for you. {flags[0].reason}. (I noticed "{flags[0].matched}".)'

    return Decision(
        email_id=email.id,
        action=action,
        autonomy_level=level,
        matched_pattern=classification.matched_pattern,
        explanation=explanation,
        safety_flags=[flag.category for flag in flags],
    )
