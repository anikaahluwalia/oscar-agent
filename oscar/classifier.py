"""Baseline classifier: pick one proposed action from subject/body keyword patterns.

Rules are checked top to bottom and the first match wins. It reads the email text
at face value, plus one thing about how it was sent: mail sent to a list (Gmail's
Promotions, Updates, Social or Forums tabs, an unsubscribe header, or a no-reply
address) is never something to reply to, however many question marks it has.
"""

import re

from oscar.models import Action, Classification, Email

RULES: list[tuple[Action, list[str]]] = [
    (Action.MOVE_MONEY, [
        r"\bwire me\b",
        r"\bsend (the )?payment\b",
        r"\bpay this invoice\b",
        r"\b(please |kindly |can you )transfer\b",
        r"\btransfer \$[\d,.]+ to (this|my|our|the following)\b",
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
        r"\b(payment|transfer) (is )?complete\b",
        r"\bout for delivery\b",
        r"\byour (order|package|parcel) (is|has been) (on its way|delivered|confirmed)\b",
        r"\btracking (number|info)\b",
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

# What kind of email each rule means. Safety checks can replace it (see agent.py).
TYPES: dict[Action, str] = {
    Action.MOVE_MONEY: "money_request",
    Action.SEND_CREDENTIALS: "credential_request",
    Action.PERMANENTLY_DELETE: "deletion_request",
    Action.ACCEPT_MEETING: "meeting_invite",
    Action.UNSUBSCRIBE: "promotion",
    Action.ARCHIVE: "newsletter",
    Action.APPLY_LABEL: "receipt",
    Action.FORWARD: "forward_request",
    Action.SEND_REPLY: "confirmation_request",
    Action.DRAFT_REPLY: "question",
    Action.MARK_READ: "fyi",
}

# A notice that an app now has access to your account: one you connected, or signed in to with your
# Google or Apple account. Oscar marks it read and tells you (agent.py), so you'd spot one you didn't
# connect, until you teach him otherwise. Without this the model read them as security alerts and
# stopped them (real-inbox safety reviews).
APP_ACCESS = re.compile(
    r"\byou (allowed|gave|granted)\b.{0,60}?\baccess to\b"
    r"|\b(has|now has) access to (some of )?your\b.{0,30}?\baccount\b"
    r"|\byou shared (some )?.{0,40}?\baccount data with\b"
    r"|\bsigned in to\b.{0,60}?\b(with|using) your (google|apple|microsoft) account\b",
    re.I,
)

FALLBACK = Action.MARK_READ
REPLIES = {Action.DRAFT_REPLY, Action.SEND_REPLY}

# Gmail tabs for mail sent to many people at once.
BULK_TABS = {"promotions", "updates", "social", "forums"}
NO_REPLY = re.compile(r"(^|[._+-])(no-?reply|do-?not-?reply|donotreply|notifications?|alerts?|mailer|newsletter)([._+-]|@)", re.I)


def is_bulk(email: Email) -> bool:
    """Mail sent to a list rather than written to you. Only uses how it was sent, never its words,
    so a colleague who mentions a newsletter still gets a reply."""
    return email.bulk or email.category in BULK_TABS or bool(NO_REPLY.search(email.sender))


def classify(email: Email, bulk_action: Action | None = None) -> Classification:
    """The action for an email. bulk_action replaces archive for mail sent to a list (mark as read,
    say); without it, list mail that matches nothing else is marked read. The app no longer has
    this setting (Oscar learns it from your answers instead); some regression cases and tests still set it."""
    text = f"{email.subject}\n{email.body}".lower()
    bulk = is_bulk(email)
    for action, patterns in RULES:
        if action == Action.ARCHIVE and (found := APP_ACCESS.search(text)):
            # Before the list-mail rules: these come from no-reply addresses, with footers like any notice.
            return Classification(action=Action.MARK_READ, matched_pattern=found.group(0), email_type="app_access")
        if bulk and action in REPLIES:
            continue  # nobody is waiting for a reply to a promo or a notification
        for pattern in patterns:
            match = re.search(pattern, text, re.MULTILINE)
            if match:
                email_type, rule_action = TYPES[action], None
                if bulk and bulk_action and action == Action.ARCHIVE:
                    action, rule_action = bulk_action, action
                return Classification(action=action, matched_pattern=match.group(0), email_type=email_type,
                                      rule_action=rule_action)
    if bulk:
        # Still a guess: nothing in the email said what it is, so Oscar asks before doing it.
        # Without this, list mail he didn't understand (a security alert from a no-reply
        # address, say) would be handled silently. The held-out check caught that.
        return Classification(action=bulk_action or Action.MARK_READ, matched_pattern=None, email_type="bulk")
    return Classification(action=FALLBACK, matched_pattern=None, email_type="unknown")
