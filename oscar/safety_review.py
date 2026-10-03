"""Reviewing the emails a safety rule stopped.

This is a different question from a regular review. A regular review teaches Oscar whether the
action was right and how much to involve you. Here the only question is whether he read the risk
right: was this really a money request (or a password request, or instructions aimed at him)?

Your answer is recorded, and a "No, it's actually a ..." also saves what kind of email it is
(oscar/classification.py). It never teaches him that a risk is fine: the safety floor and the
checks on the email are code, not learned, and feedback on a stopped email teaches his autonomy
nothing (preferences.Preferences.add). So "this wasn't a money request" can help him read emails,
but "money requests are fine now" isn't something he can learn.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from oscar.classification import EMAIL_TYPES, ClassificationFeedback, current_type, record_classification
from oscar.models import AutonomyLevel, Decision, SafetyCategory, new_id, now

if TYPE_CHECKING:
    from oscar.history import History

# What set the level when a safety rule stopped an email: a check on the email, the model reading it
# as risky, or the floor for the action (money, passwords).
SAFETY_SOURCES = frozenset({"safety_check", "model_check", "floor"})
MAX_NOTE = 500

Verdict = Literal["RISK_CORRECT", "MISCLASSIFIED"]


class SafetyReview(BaseModel):
    id: str = Field(default_factory=new_id)
    reviewed_at: datetime = Field(default_factory=now)
    decision_id: str
    verdict: Verdict  # he read the risk right, or it wasn't what he thought
    flags: list[SafetyCategory] = Field(default_factory=list)  # what the checks found, copied from the decision
    safety_rule: str | None = None  # the rule that stopped it, copied from the decision
    corrected_type: str | None = None  # with MISCLASSIFIED: what kind of email it really is, if you said
    note: str | None = None


class SafetyReviewError(ValueError):
    pass


def is_safety_stop(decision: Decision) -> bool:
    """Stopped by a safety rule: the floor, a check on the email, or the model reading it as risky."""
    return decision.autonomy_level == AutonomyLevel.ESCALATE and (
        bool(decision.safety_flags) or decision.level_source in SAFETY_SOURCES)


def record_safety_review(history: History, decision_id: str, verdict: Verdict, corrected_type: str | None = None,
                         note: str | None = None) -> tuple[SafetyReview, ClassificationFeedback | None]:
    """Save your answer about a stopped email, and the kind of email it really is if you said."""
    decision = history.get_decision(decision_id)
    if decision is None:
        raise SafetyReviewError(f"I can't find decision {decision_id}.")
    if not is_safety_stop(decision):
        raise SafetyReviewError("A safety rule didn't stop that one, so review it the regular way.")
    note = (note or "").strip() or None
    if note and len(note) > MAX_NOTE:
        raise SafetyReviewError(f"Keep the note to {MAX_NOTE} characters or fewer.")
    if verdict == "RISK_CORRECT" and corrected_type:
        raise SafetyReviewError("If I read the risk right, there's nothing to correct.")
    if corrected_type and corrected_type not in EMAIL_TYPES:
        raise SafetyReviewError("That isn't a kind of email I know.")
    classified = None
    if corrected_type and corrected_type != current_type(history, decision.email_id, decision.email_type):
        classified = record_classification(history, decision.id, corrected_type)
    review = SafetyReview(decision_id=decision.id, verdict=verdict, flags=list(decision.safety_flags),
                          safety_rule=decision.safety_rule, corrected_type=corrected_type, note=note)
    history.add_safety_review(review)
    return review, classified
