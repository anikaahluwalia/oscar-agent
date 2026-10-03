from datetime import datetime, timezone
from enum import Enum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class Action(str, Enum):
    MARK_READ = "MARK_READ"
    ARCHIVE = "ARCHIVE"
    APPLY_LABEL = "APPLY_LABEL"
    DRAFT_REPLY = "DRAFT_REPLY"
    SEND_REPLY = "SEND_REPLY"
    FORWARD = "FORWARD"
    UNSUBSCRIBE = "UNSUBSCRIBE"
    ACCEPT_MEETING = "ACCEPT_MEETING"
    PERMANENTLY_DELETE = "PERMANENTLY_DELETE"
    SEND_CREDENTIALS = "SEND_CREDENTIALS"
    MOVE_MONEY = "MOVE_MONEY"


class AutonomyLevel(str, Enum):
    PROCEED_SILENTLY = "PROCEED_SILENTLY"
    PROCEED_AND_NOTIFY = "PROCEED_AND_NOTIFY"
    ASK_FIRST = "ASK_FIRST"
    ESCALATE = "ESCALATE"


class SafetyCategory(str, Enum):
    PROMPT_INJECTION = "PROMPT_INJECTION"
    MONEY = "MONEY"
    CREDENTIALS = "CREDENTIALS"
    ACCOUNT_SECURITY = "ACCOUNT_SECURITY"
    SENSITIVE_DATA = "SENSITIVE_DATA"
    COMMITMENT = "COMMITMENT"


class Email(BaseModel):
    id: str
    sender: str
    to: list[str] = Field(default_factory=list)
    subject: str
    body: str
    # From Gmail, when the email is real: its tab (promotions, updates, social, forums,
    # primary) and whether it was sent to a list (it has an unsubscribe header).
    category: str | None = None
    bulk: bool = False


class Classification(BaseModel):
    action: Action
    matched_pattern: str | None = None  # None means the fallback was used
    email_type: str = "unknown"  # what kind of email Oscar thinks it is (see classifier.TYPES)
    rule_action: Action | None = None  # the matching rule's own action, when a setting swapped it


def new_id() -> str:
    return uuid4().hex[:8]


def now() -> datetime:
    return datetime.now(timezone.utc)


class GmailInfo(BaseModel):
    """Where a real email came from, logged with the decision so it can be reviewed later."""

    message_id: str
    thread_id: str
    received_at: datetime | None = None
    labels: list[str] = Field(default_factory=list)  # Gmail's labels when Oscar read it, e.g. INBOX, UNREAD
    category: str | None = None  # Gmail's tab: promotions, updates, social, forums, or primary
    thread_length: int = 1
    emailed_before: bool | None = None  # have you ever sent this person an email
    preview: str = ""  # Gmail's own one-line preview, for showing the email in the app


class Reminder(BaseModel):
    """Something coming up that an email mentions: an event, or a date something is due."""

    title: str = Field(max_length=80)
    date: str  # YYYY-MM-DD
    time: str | None = None  # HH:MM, when the email gives one
    kind: Literal["event", "due"]
    detail: str = Field(default="", max_length=80)


class PreferenceUsed(BaseModel):
    """What Oscar learned from you that set this decision's level."""

    scope: Literal["sender", "domain", "kind"]
    evidence: float  # how many of your answers it rests on
    confidence: float


class Decision(BaseModel):
    id: str = Field(default_factory=new_id)
    created_at: datetime = Field(default_factory=now)
    email_id: str
    sender: str
    subject: str = ""
    snippet: str = ""  # start of the body, for showing the email in the UI
    action: Action
    autonomy_level: AutonomyLevel
    matched_pattern: str | None
    explanation: str
    message: str = ""  # the explanation without the evidence, for the UI
    noticed: str | None = None  # the phrase that triggered the decision, if any
    safety_flags: list[SafetyCategory] = Field(default_factory=list)
    learned: bool = False  # True when the level came from feedback
    # Which step decided the level: the policy table, a guess (nothing matched),
    # what Oscar learned, the safety floor for the action, or a safety check on the email.
    level_source: Literal["policy", "guess", "learned", "floor", "safety_check", "caution", "model_check"] = "policy"
    steps: list[str] = Field(default_factory=list)  # Oscar's working notes, in order
    email_type: str = "unknown"  # what kind of email Oscar thinks it is
    # Stage 11: who worked out what the email is (the keyword rules, the model, or nobody: a guess),
    # and the model's one-line summary of it.
    understood_by: Literal["rules", "model"] | None = None
    # Stage 12: made while Oscar could act in Gmail. Before that, decisions on a real inbox are only
    # what he would have done.
    acting: bool = False
    summary: str = ""
    confidence: float = 0.5  # how sure Oscar is that the level is right (see agent.confidence_for)
    # For the UI, in a few words each: what mattered for this call (never his full working notes),
    # the least involvement the safety rules allow here, the rule or check that set the level if
    # one did, and what he learned from you that he used, if anything.
    factors: list[str] = Field(default_factory=list)
    safety_floor: AutonomyLevel | None = None
    safety_rule: str | None = None
    # The sensitive thing the email mentions, when the caution backstop matched it, even if the
    # level was already asking. A rule never clears these from your list for you.
    caution: str | None = None
    preference: PreferenceUsed | None = None
    reminder: Reminder | None = None  # an event or due date the email mentions (oscar/reminders.py)
    # "gmail" decisions are on a real inbox. Oscar only reads it (Stage 9), so he
    # didn't do anything; the decision is what he would have done.
    source: Literal["demo", "gmail"] = "demo"
    gmail: GmailInfo | None = None
    policy_version: str | None = None  # the git commit that made this decision
    # Set when this is a re-read of an email Oscar already decided on, with a newer version of
    # him. Re-reads are left out of real-inbox results: some of those emails helped write tests.
    recheck_of: str | None = None
