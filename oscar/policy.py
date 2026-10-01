"""Baseline policy: a fixed table mapping each action to one autonomy level.

The level depends only on the action — not the sender, the content, or the user.
"""

from oscar.models import Action, AutonomyLevel

POLICY: dict[Action, tuple[AutonomyLevel, str]] = {
    Action.MARK_READ: (AutonomyLevel.PROCEED_SILENTLY, "it didn't need anything from you"),
    Action.APPLY_LABEL: (AutonomyLevel.PROCEED_SILENTLY, "labels are easy to change"),
    Action.DRAFT_REPLY: (AutonomyLevel.PROCEED_AND_NOTIFY, "nothing gets sent until you send it"),
    Action.ARCHIVE: (AutonomyLevel.ASK_FIRST, "I don't know how you like these yet"),
    Action.SEND_REPLY: (AutonomyLevel.ASK_FIRST, "it goes out under your name"),
    Action.FORWARD: (AutonomyLevel.ASK_FIRST, "it shares this email with someone else"),
    Action.UNSUBSCRIBE: (AutonomyLevel.ASK_FIRST, "it's hard to undo"),
    Action.ACCEPT_MEETING: (AutonomyLevel.ASK_FIRST, "it commits your time"),
    Action.PERMANENTLY_DELETE: (AutonomyLevel.ASK_FIRST, "deleted email can't be brought back"),
    Action.SEND_CREDENTIALS: (AutonomyLevel.ESCALATE, "I don't share passwords or login details"),
    Action.MOVE_MONEY: (AutonomyLevel.ESCALATE, "I don't touch money"),
}


def autonomy_for(action: Action) -> tuple[AutonomyLevel, str]:
    return POLICY[action]
