"""Oscar on a real Gmail inbox, read-only (Stage 9).

sync() reads the newest emails Oscar hasn't seen, decides on each one, and logs
the decision with where it came from. Nothing is done in Gmail. Decisions are
logged before anyone reviews them, so reviews score what Oscar decided on his own.

It also notes what you did with recent emails since (still in the inbox? still
unread?), as a second opinion next to your reviews.
"""

from datetime import datetime, timedelta

from pydantic import BaseModel, Field

from oscar.agent import decide
from oscar.gmail import GmailClient, GmailError, parse_message
from oscar.history import History
from oscar.models import Decision, new_id, now
from oscar.preferences import Preferences
from oscar.version import policy_version

FOLLOW_UP_DAYS = 7  # how long after a decision Oscar keeps checking what you did with the email


class FollowUp(BaseModel):
    """What an email looked like in Gmail some time after Oscar decided on it."""

    id: str = Field(default_factory=new_id)
    checked_at: datetime = Field(default_factory=now)
    decision_id: str
    in_inbox: bool
    unread: bool
    gone: bool = False  # deleted, or Oscar can't see it anymore


def sync(history: History, gmail: GmailClient, limit: int = 25) -> list[Decision]:
    """Decide on new inbox emails. Returns the new decisions, newest first."""
    seen = {d.email_id for d in history.decisions.values()}
    new = []
    for ref in gmail.inbox(limit):
        if ref["id"] in seen:
            continue
        email, info = _read(gmail, ref["id"])
        decision = decide(email, Preferences.from_feedback(history.feedback), read_only=True)
        decision = decision.model_copy(update={"source": "gmail", "gmail": info, "policy_version": policy_version()})
        history.add_decision(decision)
        new.append(decision)
    follow_up(history, gmail)
    return new


def _read(gmail: GmailClient, message_id: str):
    email, info = parse_message(gmail.message(message_id))
    info.thread_length = gmail.thread_length(info.thread_id)
    info.emailed_before = gmail.emailed_before(email.sender) if email.sender != "unknown" else None
    return email, info


def follow_up(history: History, gmail: GmailClient) -> None:
    """Note where recent emails are now, only when something changed since last time."""
    cutoff = now() - timedelta(days=FOLLOW_UP_DAYS)
    last = {f.decision_id: f for f in history.follow_ups}
    for decision in history.decisions.values():
        if decision.source != "gmail" or decision.created_at < cutoff or not decision.gmail:
            continue
        try:
            labels = gmail.labels(decision.gmail.message_id)
            state = dict(in_inbox="INBOX" in labels, unread="UNREAD" in labels, gone=False)
        except GmailError:
            state = dict(in_inbox=False, unread=False, gone=True)
        before = last.get(decision.id)
        if before is None or (before.in_inbox, before.unread, before.gone) != tuple(state.values()):
            history.add_follow_up(FollowUp(decision_id=decision.id, **state))
