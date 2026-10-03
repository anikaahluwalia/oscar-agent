"""What kind of email it is, as you corrected it.

Oscar reads each email as one kind (classifier.TYPES from his rules, understand.KINDS from the
model). You can tell him he got the kind wrong ("this is a promotion, not a job alert"). That's
classification feedback, and it's kept apart from everything else he learns:

- classification: what kind of email is this? (here)
- action: what should he do with it? (Approve, Decline, Review's "Yes" and "No")
- autonomy: how much should he involve you? (Just handle it, Handle + tell me, Ask me)
- safety: may he do it on his own at all? (oscar/safety.py; nothing you teach changes it)

A correction never changes a preference, a level or a safety rule. Later emails from the same
sender are read as the kind you said, which only changes which "emails like this" rule applies to
them (see agent.decide). It's never used for a risky kind, and the safety checks still run on the
email itself afterwards, so a correction can't make anything less safe.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from oscar.classifier import TYPES
from oscar.models import new_id, now
from oscar.understand import KINDS, RISKY as MODEL_RISKY

if TYPE_CHECKING:
    from oscar.history import History

OTHER = "other"  # none of these: kept as feedback, never used to read later emails

# Every kind of email you can pick, from the kinds Oscar already knows. "bulk" and "unknown" mean he
# couldn't tell, so they aren't something you'd correct an email to.
EMAIL_TYPES: tuple[str, ...] = (*dict.fromkeys([*KINDS, *TYPES.values()]), OTHER)

# Kinds that mean risk, whoever names them (the rules, the model, or a safety check). A correction
# is never used to read later emails as, or instead of, one of these.
RISKY_TYPES = frozenset({*MODEL_RISKY, "money_request", "credential_request", "prompt_injection", "sensitive_request",
                         "security_alert", "commitment", "scam"})


class ClassificationFeedback(BaseModel):
    """You said an email is a different kind than Oscar took it for."""

    id: str = Field(default_factory=new_id)
    created_at: datetime = Field(default_factory=now)
    decision_id: str
    email_id: str
    sender: str
    original_type: str  # what Oscar read it as
    corrected_type: str  # what you said it is
    # Only you can teach Oscar: email text never becomes feedback.
    provenance: str = "USER_FEEDBACK"


class ClassificationError(ValueError):
    pass


def current_type(history: History, email_id: str, original: str) -> str:
    """What kind of email this is now: your latest correction of it, or what Oscar read."""
    latest = history.classification_for(email_id)
    return latest.corrected_type if latest else original


def record_classification(history: History, decision_id: str, email_type: str) -> ClassificationFeedback:
    """Save your correction of what kind of email this is. Changing it back to what Oscar read
    is saved too, so the latest answer is always the one that stands."""
    decision = history.get_decision(decision_id)
    if decision is None:
        raise ClassificationError(f"I can't find decision {decision_id}.")
    if email_type not in EMAIL_TYPES:
        raise ClassificationError("That isn't a kind of email I know.")
    if email_type == current_type(history, decision.email_id, decision.email_type):
        raise ClassificationError("That's already what I have it as.")
    feedback = ClassificationFeedback(decision_id=decision.id, email_id=decision.email_id, sender=decision.sender,
                                      original_type=decision.email_type, corrected_type=email_type)
    history.add_classification(feedback)
    return feedback


def type_hints(history: History, skip_email: str | None = None) -> dict[str, str]:
    """What you've said each sender's emails are: your latest correction for each sender, oldest
    first so the newest wins. skip_email leaves out one email, for re-reading it: Oscar mustn't learn
    the answer he's graded against. "Something else" and risky kinds are never used."""
    hints: dict[str, str] = {}
    for c in sorted(history.classifications, key=lambda c: c.created_at):
        if c.email_id == skip_email:
            continue
        if c.corrected_type == OTHER or c.corrected_type in RISKY_TYPES:
            hints.pop(c.sender, None)  # your latest word on this sender isn't one to read emails by
        else:
            hints[c.sender] = c.corrected_type
    return hints
