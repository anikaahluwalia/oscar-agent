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


class Classification(BaseModel):
    action: Action
    matched_pattern: str | None = None  # None means the fallback was used


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
    level_source: Literal["policy", "guess", "learned", "floor", "safety_check"] = "policy"
    steps: list[str] = Field(default_factory=list)  # Oscar's working notes, in order
    # "gmail" decisions are on a real inbox. Oscar only reads it (Stage 9), so he
    # didn't do anything; the decision is what he would have done.
    source: Literal["demo", "gmail"] = "demo"
    gmail: GmailInfo | None = None
    policy_version: str | None = None  # the git commit that made this decision
