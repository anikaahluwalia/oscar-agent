"""Safety floor.

The floor is the lowest autonomy level Oscar is allowed to use for an action.
It is checked after the policy and the stricter level wins, so changing the
policy table can't make a risky action less safe.
"""

import re
from types import MappingProxyType

from pydantic import BaseModel

from oscar.models import Action, AutonomyLevel, Email, SafetyCategory

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


# Patterns in the email text that should escalate no matter which action the
# classifier picked. These look for requests, not just mentions.
EMAIL_CHECKS = MappingProxyType({
    SafetyCategory.MONEY: (
        "this looks like a request for money, and I never move money",
        [
            r"\bremit\b",
            r"\b(send|pay)\b[^.]*\bvia (zelle|venmo|paypal|wire)\b",
            r"\bgift cards?\b",
            r"\bsend (me )?(the )?(funds|money)\b",
        ],
    ),
    SafetyCategory.CREDENTIALS: (
        "this asks for a password or code, and I never share those",
        [
            r"\benter your (password|login|credentials)\b",
            r"\b(read|send|share|give|tell) (me |us )?(the |your )?(\d-digit |one-time |verification |security )?code\b",
        ],
    ),
    SafetyCategory.ACCOUNT_SECURITY: (
        "this is about your account security, so you should check it yourself",
        [
            r"\bnew sign-in\b",
            r"\bpassword was changed\b",
            r"\breset your password\b",
            r"\brecovery (email|phone|address)\b",
            r"\btwo-factor\b",
        ],
    ),
    SafetyCategory.SENSITIVE_DATA: (
        "this involves sensitive personal data, and I don't share that",
        [
            r"\bssns?\b",
            r"\bsocial security\b",
            r"\bpassport number\b",
            r"\bdate of birth\b",
            r"\bbank details\b",
        ],
    ),
    SafetyCategory.COMMITMENT: (
        "replying would commit you to something, and only you can agree to that",
        [
            r"\bi agree\b",
            r"\baccept the (new |updated )?terms\b",
            r"\bsign the (contract|agreement)\b",
        ],
    ),
})


# When a flag matches, this is the action the email is really asking for.
FLAG_ACTIONS = MappingProxyType({
    SafetyCategory.MONEY: Action.MOVE_MONEY,
    SafetyCategory.CREDENTIALS: Action.SEND_CREDENTIALS,
})


class SafetyFlag(BaseModel):
    category: SafetyCategory
    reason: str
    matched: str


def check_email(email: Email) -> list[SafetyFlag]:
    text = f"{email.subject}\n{email.body}".lower()
    flags = []
    for category, (reason, patterns) in EMAIL_CHECKS.items():
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                flags.append(SafetyFlag(category=category, reason=reason, matched=match.group(0)))
                break
    return flags


def is_stricter(a: AutonomyLevel, b: AutonomyLevel) -> bool:
    return LEVEL_ORDER.index(a) > LEVEL_ORDER.index(b)


def apply_floor(action: Action, level: AutonomyLevel, reason: str) -> tuple[AutonomyLevel, str]:
    floor = ACTION_FLOORS.get(action)
    if floor and is_stricter(floor[0], level):
        return floor
    return level, reason
