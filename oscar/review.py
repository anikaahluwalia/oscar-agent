"""Reviewing Oscar's decisions on a real inbox (planned for Stage 9).

Reviews are for evaluation only. They're kept apart from feedback (oscar/feedback.py),
which is what Oscar learns from, so scoring a decision never teaches him anything
about that same decision. A decision is always logged before it's reviewed.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from collections import Counter

from oscar.models import Action, AutonomyLevel, new_id, now

if TYPE_CHECKING:
    from oscar.history import History


class ReviewLabel(str, Enum):
    CORRECT = "CORRECT"  # right action and right level
    QUESTIONED_TOO_MUCH = "QUESTIONED_TOO_MUCH"  # too cautious; should have done more on his own
    NEEDED_TO_ASK = "NEEDED_TO_ASK"  # too permissive; should have asked first
    MISINTERPRETED_RISK = "MISINTERPRETED_RISK"  # got the risk of the email wrong
    UNNECESSARY_FLAGGING = "UNNECESSARY_FLAGGING"  # escalated or flagged something harmless
    INCORRECT_ACTION = "INCORRECT_ACTION"  # level may be fine, but the wrong action
    INCORRECT_TYPE = "INCORRECT_TYPE"  # wrong kind of email, e.g. a recruiter email read as a newsletter
    OTHER = "OTHER"  # wrong in a way the others don't cover; the note says how
    SKIP = "SKIP"  # not sure, or shouldn't count


# What the review screen and eval tables call each label.
REVIEW_LABEL_NAMES: dict[ReviewLabel, str] = {
    ReviewLabel.CORRECT: "Correct",
    ReviewLabel.QUESTIONED_TOO_MUCH: "Questioned too much",
    ReviewLabel.NEEDED_TO_ASK: "Needed to ask",
    ReviewLabel.MISINTERPRETED_RISK: "Misinterpreted risk",
    ReviewLabel.UNNECESSARY_FLAGGING: "Unnecessary flagging",
    ReviewLabel.INCORRECT_ACTION: "Incorrect action",
    ReviewLabel.INCORRECT_TYPE: "Incorrect type",
    ReviewLabel.OTHER: "Something else",
    ReviewLabel.SKIP: "Skip",
}


class Review(BaseModel):
    """One review of one decision. The "should have been" fields are optional, filled in when they apply."""

    id: str = Field(default_factory=new_id)
    reviewed_at: datetime = Field(default_factory=now)
    decision_id: str
    label: ReviewLabel
    should_be_level: AutonomyLevel | None = None  # for QUESTIONED_TOO_MUCH, NEEDED_TO_ASK, MISINTERPRETED_RISK
    should_be_action: Action | None = None  # for INCORRECT_ACTION
    actual_type: str | None = None  # for INCORRECT_TYPE, e.g. "recruiter"
    note: str | None = None


class ReviewError(ValueError):
    pass


def record_review(history: History, review: Review) -> Review:
    """Save a review. Only real-inbox decisions get reviewed, and only after they were logged."""
    decision = history.get_decision(review.decision_id)
    if decision is None:
        raise ReviewError(f"I can't find decision {review.decision_id}.")
    if decision.source != "gmail":
        raise ReviewError("Reviews are for decisions on your real inbox.")
    if review.reviewed_at < decision.created_at:
        raise ReviewError("A decision has to be logged before it's reviewed.")
    if review.label == ReviewLabel.OTHER and not (review.note or "").strip():
        raise ReviewError("Say what was wrong, so it can become a test.")
    history.add_review(review)
    return review


def summary(history: History) -> dict:
    """How Oscar is doing on the real inbox, from your latest review of each decision.

    Skips don't count either way. Agreement is Correct out of everything else.
    Results are also split by policy_version, so a fix can be compared with what came before.
    """
    # Re-reads by a newer Oscar are left out: some of those emails were used to write regression tests.
    real = [d for d in history.decisions.values() if d.source == "gmail" and not d.recheck_of]
    latest = {d.id: history.review_for(d.id) for d in real}
    reviewed = {i: r for i, r in latest.items() if r is not None}

    def tally(ids: set[str]) -> dict:
        counts = Counter(reviewed[i].label for i in ids if i in reviewed)
        scored = sum(n for label, n in counts.items() if label != ReviewLabel.SKIP)
        return {
            "decisions": len(ids),
            "reviewed": sum(counts.values()),
            "scored": scored,
            "agreement": counts[ReviewLabel.CORRECT] / scored if scored else None,
            "labels": {label.value: counts[label] for label in ReviewLabel},
        }

    by_version: dict[str, set[str]] = {}
    for d in real:
        by_version.setdefault(d.policy_version or "unknown", set()).add(d.id)
    return {**tally({d.id for d in real}), "by_version": {v: tally(ids) for v, ids in sorted(by_version.items())}}
