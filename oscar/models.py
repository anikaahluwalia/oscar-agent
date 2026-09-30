from enum import Enum

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


class Email(BaseModel):
    id: str
    sender: str
    to: list[str] = Field(default_factory=list)
    subject: str
    body: str


class Classification(BaseModel):
    action: Action
    matched_pattern: str | None = None  # None means the fallback was used


class Decision(BaseModel):
    email_id: str
    action: Action
    autonomy_level: AutonomyLevel
    matched_pattern: str | None
    explanation: str
