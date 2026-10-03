"""What an eval case, a case result and a whole run look like.

A case is everything needed to reproduce one Oscar decision and judge it. Its
ground truth (expected_*) is written from what the user would want, before
looking at what Oscar does, with the reason in `rationale`.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from oscar.models import Action, AutonomyLevel, SafetyCategory

Suite = Literal["learning", "heldout", "safety", "regression"]
Severity = Literal["low", "medium", "high", "critical"]
ErrorType = Literal["none", "critical", "too_permissive", "too_cautious", "wrong_action"]


class EmailInput(BaseModel):
    sender: str
    subject: str
    body: str
    to: list[str] = Field(default_factory=list)
    category: str | None = None  # Gmail's tab, when it matters
    bulk: bool = False  # sent to a list


class PrefSetup(BaseModel):
    """Feedback that already exists when the case is run, e.g. the user said "always do this" before."""

    sender: str
    action: Action
    kind: Literal["APPROVE", "REJECT", "UNDO", "ALWAYS_DO_THIS", "ALWAYS_ASK_ME"]
    times: int = 1


class EvalCase(BaseModel):
    id: str
    suite: Suite
    category: str  # newsletter, scheduling, recruiting, work_request, personal, receipt, security, finance, prompt_injection...
    severity: Severity
    email: EmailInput
    sender_relationship: Literal["known", "unknown", "spoofed"] = "unknown"
    thread: list[str] = Field(default_factory=list)  # earlier messages in the thread, oldest first
    preferences: list[PrefSetup] = Field(default_factory=list)
    settings: dict = Field(default_factory=dict)  # inbox settings the case depends on, e.g. {"bulk_action": "MARK_READ"}
    # Facts Oscar doesn't use yet (a calendar, say). Cases that need them are reported apart, not faked.
    context: dict = Field(default_factory=dict)
    requires_context: bool = False
    expected_type: str
    expected_action: Action | None  # None: leave it for the user
    expected_level: AutonomyLevel
    expected_safety: list[SafetyCategory] = Field(default_factory=list)
    safety_floor_should_trigger: bool = False
    rationale: str
    source: Literal["generated", "hand_written", "from_real_review"] = "hand_written"
    template_id: str | None = None  # for the leakage check: learning and held-out never share a template


class CaseResult(BaseModel):
    case_id: str
    category: str
    severity: Severity
    sender_relationship: str
    expected_level: AutonomyLevel
    predicted_level: AutonomyLevel
    expected_action: Action | None
    predicted_action: Action
    expected_type: str
    predicted_type: str
    safety_expected: bool
    safety_detected: bool  # Oscar escalated because of a safety rule
    predicted_safety: list[SafetyCategory] = Field(default_factory=list)
    level_source: str
    confidence: float
    passed: bool
    error: ErrorType
    cost: float
    runtime_ms: float = 0.0


class RunResult(BaseModel):
    run_id: str
    created_at: datetime
    suite: str
    dataset: dict  # name, number of cases, sha256 of the file
    versions: dict  # commit, classifier version, policy name and thresholds
    learning: dict | None = None  # which learning set and how much feedback, or None for no learning
    metrics: dict
    breakdowns: dict
    confusion: dict  # {"levels": [...], "counts": [[...]]}, expected rows, predicted columns
    calibration: list[dict]
    cases: list[CaseResult]
