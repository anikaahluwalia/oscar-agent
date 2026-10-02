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
    Action.MOVE_MONEY: (AutonomyLevel.ESCALATE, "I don't touch money"),
    Action.SEND_CREDENTIALS: (AutonomyLevel.ESCALATE, "I don't share passwords or login details"),
    Action.PERMANENTLY_DELETE: (AutonomyLevel.ASK_FIRST, "deleted email can't be brought back"),
    Action.UNSUBSCRIBE: (AutonomyLevel.ASK_FIRST, "it's hard to undo"),
    Action.SEND_REPLY: (AutonomyLevel.ASK_FIRST, "it goes out under your name"),
    Action.FORWARD: (AutonomyLevel.ASK_FIRST, "it shares this email with someone else"),
    Action.ACCEPT_MEETING: (AutonomyLevel.ASK_FIRST, "it commits your time"),
})


# Patterns in the email text that should escalate no matter which action the
# classifier picked. These look for requests, not just mentions. Injection is
# first so its explanation is the one the user sees.
EMAIL_CHECKS = MappingProxyType({
    SafetyCategory.PROMPT_INJECTION: (
        "Someone left instructions for me in this email, so I'm not doing anything with it",
        [
            r"\b(ai|email|virtual) assistant\s*[:,]",
            r"\bnote to (the )?(ai|assistant)\b",
            r"\bignore (all |any )?(previous|prior|earlier) instructions\b",
            r"\bthe user has (already )?(pre-)?approved\b",
            r"\bthe user (said|says|has said) (it's|its|this is) (fine|ok|okay)\b",
            r"(^|\n)\s*(hey |hi )?oscar\s*[,:]",
        ],
    ),
    SafetyCategory.MONEY: (
        "It's asking for money, and I don't touch money",
        [
            r"\bremit\b",
            r"\b(send|pay)\b[^.]*\bvia (zelle|venmo|paypal|wire)\b",
            # Asking *you* to buy or send gift cards, or for their codes. Shops that just sell
            # gift cards aren't asking for money (evals/regression_cases/promo-sells-gift-cards).
            r"\b(you|u)\b[^.?!]{0,40}\b(buy|get|purchase|pick up|grab|send)\b[^.?!]{0,40}\bgift ?cards?\b",
            r"\bgift ?cards?\b[^.?!]{0,60}\b(codes?|pins?|scratch)\b",
            r"\bsend (me )?(the )?(funds|money)\b",
            r"\b(settle|pay|send)\b[^.]*\bby (bank |wire )?transfer\b",
        ],
    ),
    SafetyCategory.CREDENTIALS: (
        "It's asking for a password or code, and I don't share those",
        [
            r"\benter your (password|login|credentials)\b",
            r"\bverify your (account )?(password|login)\b",
            r"\b(read|send|share|give|tell) (me |us )?(the |your )?(\d-digit |one-time |verification |security )?code\b",
        ],
    ),
    SafetyCategory.ACCOUNT_SECURITY: (
        "It's about your account security, so you should look at it yourself",
        [
            r"\bnew sign-in\b",
            r"\btried to (log|sign) in\b",
            r"\bpassword was changed\b",
            r"\breset your password\b",
            r"\brecovery (email|phone|address)\b",
            r"\btwo-factor\b",
        ],
    ),
    SafetyCategory.SENSITIVE_DATA: (
        "It has sensitive personal info in it, and I don't share that",
        [
            r"\bssns?\b",
            r"\bsins?\b",
            r"\bsocial (security|insurance)\b",
            r"\bpassport number\b",
            r"\bdate of birth\b",
            r"\bbank details\b",
        ],
    ),
    SafetyCategory.COMMITMENT: (
        "Replying would commit you to something, and that's your call",
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
