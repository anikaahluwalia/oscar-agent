"""Safety floor.

The floor is the lowest autonomy level Oscar is allowed to use for an action.
It is checked after the policy and the stricter level wins, so changing the
policy table can't make a risky action less safe.
"""

from types import MappingProxyType

from oscar.models import Action, AutonomyLevel

LEVEL_ORDER = [
    AutonomyLevel.PROCEED_SILENTLY,
    AutonomyLevel.PROCEED_AND_NOTIFY,
    AutonomyLevel.ASK_FIRST,
    AutonomyLevel.ESCALATE,
]

# Read-only so it can't be changed at runtime.
ACTION_FLOORS = MappingProxyType({
    Action.MOVE_MONEY: (AutonomyLevel.ESCALATE, "I never move money"),
    Action.SEND_CREDENTIALS: (AutonomyLevel.ESCALATE, "I never share passwords or login details"),
    Action.PERMANENTLY_DELETE: (AutonomyLevel.ASK_FIRST, "deleted email can't be recovered"),
    Action.UNSUBSCRIBE: (AutonomyLevel.ASK_FIRST, "unsubscribing is hard to undo"),
    Action.SEND_REPLY: (AutonomyLevel.ASK_FIRST, "a reply goes out under your name"),
    Action.FORWARD: (AutonomyLevel.ASK_FIRST, "forwarding shares this email with someone else"),
    Action.ACCEPT_MEETING: (AutonomyLevel.ASK_FIRST, "accepting commits your time"),
})


def is_stricter(a: AutonomyLevel, b: AutonomyLevel) -> bool:
    return LEVEL_ORDER.index(a) > LEVEL_ORDER.index(b)


def apply_floor(action: Action, level: AutonomyLevel, reason: str) -> tuple[AutonomyLevel, str]:
    floor = ACTION_FLOORS.get(action)
    if floor and is_stricter(floor[0], level):
        return floor
    return level, reason
