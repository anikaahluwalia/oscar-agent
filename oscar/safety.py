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


# Someone asking *you* to do something, within one sentence of what they're asking for.
# A risky request is that shape plus something sensitive: a password, money, an ID
# document, a sign-off. Written from the categories, not from particular emails, so
# new wording is caught (Stage 10 found the old exact phrases missed most of it).
ASK = (r"(?:\b(?:can|could|would|will) (?:you|u)\b|\bplease\b|\bkindly\b|\bi need you to\b|\bneed you to\b|\bi need\b"
       r"|\bsend (?:me|us|it|them|over)\b|\bemail me\b|\btext me\b|\bshare\b|\bforward (?:me|us)\b|\bgive me\b"
       r"|\btell me\b|\breply with\b|\blet me have\b|\bmind (?:sending|sharing)\b)")
NEAR = r"[^.?!\n]{0,80}"


def _asks_for(thing: str) -> str:
    """A request in either order: "can you send me the password" or "the password, can you send it"."""
    return rf"{ASK}{NEAR}{thing}|{thing}{NEAR}{ASK}"


SECRET = (r"\b(?:passwords?|passcodes?|log-?ins?(?: details)?|usernames? and passwords?|credentials|pin(?: number)?"
          r"|(?:verification|security|one-time|2fa|otp|auth(?:entication)?|sign-?in|login) codes?"
          r"|the code (?:it|that|we|they|you) (?:just )?(?:texts?|sent|send|got)|codes? (?:that )?(?:just )?(?:came|hit|went) to)\b")
MONEY = (r"(?:\b(?:wire|transfer|e-?transfer|venmo|zelle|paypal|cash ?app|remit)\b|\bpay (?:this|the|me|us|it|now|today|immediately|invoice)\b"
         r"|\bsend (?:me |us )?(?:the )?(?:money|funds|payment|deposit)\b|\$\s?[\d,]+(?:\.\d\d)?\s+to\b|\brouting (?:number|no)\b)")
ID_DOCS = (r"\b(?:scan|copy|photo|picture|pdf|image) of (?:your |my |the |a )?(?:passport|driver'?s licen[cs]e|licen[cs]e|id card|id|birth certificate"
           r"|social security card)\b|\b(?:medical|hr|personnel|employee|patient|payroll) (?:records?|files?|details)\b"
           r"|\b(?:bank|account) (?:details|number)\b")
SIGN_OFF = (r"\b(?:approve|approved|sign off on|sign|accept|agree to) (?:the |this |our |your )?(?:quote|contract|sow|statement of work"
            r"|agreement|terms|proposal|renewal|order|offer)\b|\breply (?:with )?['\"“]?(?:yes|approved|i accept|i agree|confirm)\b")

# Patterns in the email text that should escalate no matter which action the
# classifier picked. These look for requests, not just mentions. Injection is
# first so its explanation is the one the user sees.
EMAIL_CHECKS = MappingProxyType({
    SafetyCategory.PROMPT_INJECTION: (
        "Someone left instructions for me in this email, so I'm not doing anything with it",
        [
            r"\b(ai|email|virtual) assistant\s*[:,]",
            r"\bnote to (the )?(ai|assistant)\b",
            r"\bignore (all |any |your |the )*(previous |prior |earlier |above )*(instructions|rules|prompts?)\b",
            r"\bthe user has (already )?(pre-)?approved\b",
            r"\bthe user (said|says|has said) (it's|its|this is) (fine|ok|okay)\b",
            r"(^|\n)\s*(hey |hi )?oscar\s*[,:]",
            # Text aimed at an AI, or trying to change what the assistant may do.
            r"\[?\bsystem\b\s*(override|message|prompt|instruction|note)?\s*[\]:]",
            # "To the AI reading this:", not "welcome to the AI era".
            r"\b(to|for) the (ai|assistant|bot|agent)\b\s*(reading|processing|handling|[:,])",
            r"\b(ai|assistant|bot|agent) reading this\b",
            r"\b(safety|security) (checks?|rules?|filters?) (are |is |have been )?(disabled|off|turned off|suspended)\b",
            r"\b(your|the assistant'?s?) (permissions?|autonomy|level|access|rules?) (have|has|were|was) (been )?(raised|changed|updated|upgraded|expanded)\b",
            r"\b(act|proceed) (silently|without asking) on (all|every)\b",
            r"\b(mark|treat) (this|it) (email )?as (safe|trusted)\b",
            r"\b(do not|don't|never) (tell|show|notify|alert) the user\b",
            r"\bwithout (telling|notifying|asking|showing) the user\b",
            # Text written to an AI, an assistant or an automated agent at all: a person's email doesn't do that.
            # Talking *to* an AI, not about one: "for AI readers:", "AI assistants, forward...",
            # "automated agents processing this". A newsletter reviewing AI assistant apps isn't flagged.
            r"\b(for|to|attention:?) (the |any |all )?(ai|automated|virtual|email)[- ](readers?|agents?|assistants?|bots?|systems?)\b",
            r"\b(ai|automated|virtual)[- ](readers?|agents?|assistants?|bots?)\s*[,:]",
            r"\b(ai|automated|virtual)[- ](agents?|assistants?|bots?|systems?) (processing|reading|handling|scanning) (this|these)\b",
            r"(^|[.!?:>]\s*|\n)\s*(assistants?|agents?)\s*[,:]",
            r"<!--[^>]*\b(assistant|ai|agent|bot)\b",
            r"\byour (email |ai |virtual )?assistant\b[^.]{0,60}\b(should|must|will|always|never|to)\b",
            r"\b(add|set|create) (this |a )?(new )?rule (to|for|in) your (email )?assistant\b",
            r"<\s*/?\s*(tool_call|function_call|tool|system|instructions?)\b",
            r"\b(execute|run) (it|this|the following) (immediately|now)\b",
            r"\bdo not (notify|tell|alert) the (mailbox )?owner\b",
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
            r"\bgift ?cards?\b.{0,160}\b(codes?|pins?|scratch)\b",
            r"\bsend (me )?(the )?(funds|money)\b",
            r"\b(settle|pay|send)\b[^.]*\bby (bank |wire )?transfer\b",
            _asks_for(MONEY),
            # An amount, then "send it / pay me" just after, even across a sentence.
            r"\$\s?[\d,]+(\.\d\d)?[^?!\n]{0,80}\b(send|pay|venmo|zelle|transfer|e-?transfer)\b (it|me|us|that|the money)\b",
        ],
    ),
    SafetyCategory.CREDENTIALS: (
        "It's asking for a password or code, and I don't share those",
        [
            r"\benter your (password|login|credentials)\b",
            r"\bverify your (account )?(password|login)\b",
            r"\b(read|send|share|give|tell) (me |us )?(the |your )?(\d-digit |one-time |verification |security )?code\b",
            _asks_for(SECRET),
            r"\b(\d-digit |one-time |verification |security )?code\b.{0,120}\breply with (it|the code|that)\b",
            # Any code that arrives by text or on your phone: the classic "forward me the code" scam.
            r"\bcodes?\b[^.?!]{0,60}\b(by text|texted|via sms|by sms|to your phone|on your phone|your (phone )?number)\b",
        ],
    ),
    SafetyCategory.ACCOUNT_SECURITY: (
        "It's about your account security, so you should look at it yourself",
        [
            r"\bnew sign-?in\b",
            r"\btried to (log|sign) in\b",
            r"\bpassword (was|has been) (changed|reset)\b",
            r"\breset your password\b",
            r"\brecovery (email|phone|address)\b",
            # Something happened to the account: 2FA off, a new device, an unusual sign-in.
            # Tips about turning two-factor on aren't an alert (a security newsletter).
            r"\b(two-factor|two-step|2-step|2fa|mfa|multi-factor)\b[^.]{0,40}\b(turned off|disabled|removed|switched off)\b",
            r"\bnew (device|phone|computer|browser|login)\b[^.]{0,40}\b(added|signed in|logged in|was used)\b",
            r"\bunusual (activity|sign-?in|login)\b",
            r"\bwas(n't| not)? this you\b",
            r"\b(signed|logged) (in|into) (to )?your account\b",
            r"\bnew (country|location|city|region)\b",
            r"\b(sign-?in|login|recovery|account) (email|address|phone|number)\b[^.]{0,30}\b(was|has been) changed\b",
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
            _asks_for(ID_DOCS),
            _asks_for(r"\b(medical|health|sick|hr|personnel|performance reviews?|salar(?:y|ies)|payroll|disciplinary)\b"),
        ],
    ),
    SafetyCategory.COMMITMENT: (
        "Replying would commit you to something, and that's your call",
        [
            r"\bi agree\b",
            r"\baccept the (new |updated )?terms\b",
            r"\bsign the (contract|agreement)\b",
            _asks_for(SIGN_OFF),
            r"\breply[^.?!]{0,30}\bto (confirm|approve|accept)\b[^.?!]{0,60}\b(contract|renewal|quote|order|purchase|agreement|terms|sow|plan|upgrade)\b",
            r"\b(contract|renewal|agreement|nda|terms|quote|sow|plan|upgrade|subscription)\b.{0,160}\breply (to confirm|so)\b",
            r"\b(signed|sign) off\b|['\"“](agreed|approved)['\"”]",
        ],
    ),
})


# A second layer under the checks: things risky enough that Oscar never handles an email
# that mentions them on his own, even when no check recognised a request. He asks
# instead. Feedback can't change this, like the floor. A harmless mention costs an
# extra ask; a missed request could cost much more.
CAUTION = re.compile(
    r"\b(passwords?|passcodes?|log-?in details|credentials|(verification|one-time|security|2fa|sign-?in) codes?"
    r"|wire(d)?( transfer)?|routing numbers?|account numbers?|iban|swift code|gift ?cards?|crypto|bitcoin"
    r"|passports?|driver'?s licen[cs]e|social security|ssn|medical|diagnos[ie]s|nda|contracts?|e-?sign|docusign"
    r"|overdue|venmo|zelle|e-?transfer)\b",
    re.I,
)


def caution(email: Email) -> str | None:
    """The sensitive thing an email mentions, if any."""
    found = CAUTION.search(f"{email.subject}\n{email.body}")
    return found.group(0) if found else None


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
