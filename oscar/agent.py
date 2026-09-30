"""Oscar's decision loop: classify the email, look up the policy, explain."""

from oscar.classifier import classify
from oscar.models import Action, AutonomyLevel, Decision, Email
from oscar.policy import autonomy_for

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

TEMPLATES: dict[AutonomyLevel, str] = {
    AutonomyLevel.PROCEED_SILENTLY: "I'll {phrase} quietly — {reason}.",
    AutonomyLevel.PROCEED_AND_NOTIFY: "I'll {phrase} and let you know — {reason}.",
    AutonomyLevel.ASK_FIRST: "Want me to {phrase}? I'm asking first because {reason}.",
    AutonomyLevel.ESCALATE: "This needs you: it looks like a request to {phrase}, and {reason}.",
}


def explain(action: Action, level: AutonomyLevel, reason: str, matched: str | None) -> str:
    text = TEMPLATES[level].format(phrase=ACTION_PHRASES[action], reason=reason)
    if matched is None:
        return f"{text} (Nothing specific stood out in this email.)"
    return f'{text} (I noticed "{matched}".)'


def decide(email: Email) -> Decision:
    classification = classify(email)
    level, reason = autonomy_for(classification.action)
    return Decision(
        email_id=email.id,
        action=classification.action,
        autonomy_level=level,
        matched_pattern=classification.matched_pattern,
        explanation=explain(classification.action, level, reason, classification.matched_pattern),
    )
