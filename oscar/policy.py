"""Baseline policy: a fixed table mapping each action to one autonomy level.

The level depends only on the action — not the sender, the content, or the user.
"""

from oscar.models import Action, AutonomyLevel

POLICY: dict[Action, tuple[AutonomyLevel, str]] = {
    Action.MARK_READ: (AutonomyLevel.PROCEED_SILENTLY, "it's low-stakes and easy to undo"),
    Action.APPLY_LABEL: (AutonomyLevel.PROCEED_SILENTLY, "labels are easy to undo"),
    Action.DRAFT_REPLY: (AutonomyLevel.PROCEED_AND_NOTIFY, "a draft isn't sent until you send it"),
    Action.ARCHIVE: (AutonomyLevel.ASK_FIRST, "I don't know your preferences for this kind of email yet"),
    Action.SEND_REPLY: (AutonomyLevel.ASK_FIRST, "a reply goes out under your name"),
    Action.FORWARD: (AutonomyLevel.ASK_FIRST, "forwarding shares this email with someone else"),
    Action.UNSUBSCRIBE: (AutonomyLevel.ASK_FIRST, "unsubscribing is hard to undo"),
    Action.ACCEPT_MEETING: (AutonomyLevel.ASK_FIRST, "accepting commits your time"),
    Action.PERMANENTLY_DELETE: (AutonomyLevel.ASK_FIRST, "deleted email can't be recovered"),
    Action.SEND_CREDENTIALS: (AutonomyLevel.ESCALATE, "I never share passwords or login details"),
    Action.MOVE_MONEY: (AutonomyLevel.ESCALATE, "I never move money"),
}


def autonomy_for(action: Action) -> tuple[AutonomyLevel, str]:
    return POLICY[action]
