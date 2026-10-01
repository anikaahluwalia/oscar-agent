"""Reviewing Oscar's decisions on a real inbox (planned for Stage 9).

Reviews are for evaluation only. They're kept apart from feedback (oscar/feedback.py),
which is what Oscar learns from, so scoring a decision never teaches him anything
about that same decision. A decision is always logged before it's reviewed.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from oscar.models import Action, AutonomyLevel, new_id, now


class ReviewLabel(str, Enum):
    CORRECT = "CORRECT"  # right action and right level
    QUESTIONED_TOO_MUCH = "QUESTIONED_TOO_MUCH"  # too cautious; should have done more on his own
    NEEDED_TO_ASK = "NEEDED_TO_ASK"  # too permissive; should have asked first
    MISINTERPRETED_RISK = "MISINTERPRETED_RISK"  # got the risk of the email wrong
    UNNECESSARY_FLAGGING = "UNNECESSARY_FLAGGING"  # escalated or flagged something harmless
    INCORRECT_ACTION = "INCORRECT_ACTION"  # level may be fine, but the wrong action
    INCORRECT_TYPE = "INCORRECT_TYPE"  # wrong kind of email, e.g. a recruiter email read as a newsletter
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
