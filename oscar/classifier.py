"""Baseline classifier: pick one proposed action from subject/body keyword patterns.

Rules are checked top to bottom and the first match wins. This is deliberately
naive — it reads the email text at face value and knows nothing about the sender.
"""

import re

from oscar.models import Action, Classification, Email

RULES: list[tuple[Action, list[str]]] = [
    (Action.MOVE_MONEY, [
        r"\bwire me\b",
        r"\bsend (the )?payment\b",
        r"\bpay this invoice\b",
        r"\btransfer \$",
    ]),
    (Action.SEND_CREDENTIALS, [
        r"\b(reply with|send (me )?|share|confirm) your (password|login|credentials|verification code)\b",
    ]),
    (Action.PERMANENTLY_DELETE, [
        r"\bpermanently delete\b",
        r"\bplease delete (this|the) (email|message)\b",
    ]),
    (Action.ACCEPT_MEETING, [
        r"^invitation:",
        r"\byou(['’]ve| have) been invited\b",
        r"\bcalendar invite\b",
    ]),
    (Action.UNSUBSCRIBE, [
        r"\bclick (here )?to unsubscribe\b",
        r"\bhaven['’]t opened\b",
    ]),
    # Signs of bulk mail, not just the word "newsletter", which colleagues use too.
    (Action.ARCHIVE, [
        r"\bweekly digest\b",
        r"\bview (it )?in (your )?browser\b",
        r"\bmanage (your )?preferences\b",
    ]),
    (Action.APPLY_LABEL, [
        r"\breceipt\b",
        r"\border confirmation\b",
        r"\binvoice\b",
        r"\bhas shipped\b",
    ]),
    (Action.FORWARD, [
        r"\bplease forward\b",
        r"\bforward this to\b",
        r"\bpass this along to\b",
    ]),
    (Action.SEND_REPLY, [
        r"\bplease confirm\b",
        r"\bjust reply\b",
        r"\blet me know if (that|this) works\b",
    ]),
    (Action.DRAFT_REPLY, [
        r"\bcan you\b",
        r"\bcould you\b",
        r"\?",
    ]),
    (Action.MARK_READ, [
        r"\bfyi\b",
        r"\bheads up\b",
        r"\bno need to reply\b",
        r"\bno action (is )?needed\b",
    ]),
]

FALLBACK = Action.MARK_READ


def classify(email: Email) -> Classification:
    text = f"{email.subject}\n{email.body}".lower()
    for action, patterns in RULES:
        for pattern in patterns:
            match = re.search(pattern, text, re.MULTILINE)
            if match:
                return Classification(action=action, matched_pattern=match.group(0))
    return Classification(action=FALLBACK, matched_pattern=None)
