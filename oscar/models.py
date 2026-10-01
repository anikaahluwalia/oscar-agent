from datetime import datetime, timezone
from enum import Enum
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


class Decision(BaseModel):
    id: str = Field(default_factory=new_id)
    created_at: datetime = Field(default_factory=now)
    email_id: str
    sender: str
    action: Action
    autonomy_level: AutonomyLevel
    matched_pattern: str | None
    explanation: str
    safety_flags: list[SafetyCategory] = Field(default_factory=list)
    learned: bool = False  # True when the level came from feedback
