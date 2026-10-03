"""Oscar on a real Gmail inbox, read-only (Stage 9).

sync() reads the newest emails Oscar hasn't seen, decides on each one, and logs
the decision with where it came from. Nothing is done in Gmail. Decisions are
logged before anyone reviews them, so reviews score what Oscar decided on his own.

It also notes what you did with recent emails since (still in the inbox? still
unread? deleted?), as a second opinion next to your reviews.
"""

import threading
from datetime import datetime, timedelta

import httpx
from pydantic import BaseModel, Field

from oscar.agent import decide
from oscar.review import teaching
from oscar.gmail import GmailClient, GmailError, parse_message
from oscar.history import History
from oscar.models import Action, Decision, new_id, now
from oscar.preferences import Preferences
from oscar.version import policy_version

FOLLOW_UP_DAYS = 7  # how long after a decision Oscar keeps checking what you did with the email
MAX_PAGES = 4  # how far back to look for emails that arrived since the last check

# Two checks at once would both decide the same new emails, so only one runs at a time.
_syncing = threading.Lock()


class AlreadySyncing(RuntimeError):
    pass


class FollowUp(BaseModel):
    """What an email looked like in Gmail some time after Oscar decided on it."""

    id: str = Field(default_factory=new_id)
    checked_at: datetime = Field(default_factory=now)
    decision_id: str
    in_inbox: bool
    unread: bool
    gone: bool = False  # deleted: Gmail no longer has it


class SyncResult(BaseModel):
    new: int
    skipped: int  # emails Oscar couldn't read this time; they're tried again next check


def sync(history: History, gmail: GmailClient, limit: int = 25) -> SyncResult:
    """Decide on up to `limit` inbox emails Oscar hasn't seen, oldest of them first."""
    if not _syncing.acquire(blocking=False):
        raise AlreadySyncing("I'm already checking your inbox.")
    try:
        return _sync(history, gmail, limit)
    finally:
        _syncing.release()


def _sync(history: History, gmail: GmailClient, limit: int) -> SyncResult:
    seen = {d.email_id for d in history.decisions.values()}
    # Walk back through the inbox, so emails that arrived since the last check
    # aren't missed when there are more of them than one page.
    unseen, page = [], None
    for _ in range(MAX_PAGES):
        refs, page = gmail.inbox(limit, page)
        unseen += [r for r in refs if r["id"] not in seen]
        if len(unseen) >= limit or not page:
            break
    version = policy_version()
    bulk_action = Action(history.settings["bulk_action"]) if history.settings.get("bulk_action") else None
    new = skipped = 0
    for ref in reversed(unseen[:limit]):
        try:
            email, info = _read(gmail, ref["id"])
        except (GmailError, httpx.HTTPError):
            skipped += 1
            continue
        decision = decide(email, Preferences.from_feedback(teaching(history)), read_only=True, bulk_action=bulk_action)
        history.add_decision(decision.model_copy(update={"source": "gmail", "gmail": info, "policy_version": version}))
        new += 1
    follow_up(history, gmail)
    return SyncResult(new=new, skipped=skipped)


def recheck(history: History, gmail: GmailClient, limit: int = 50) -> SyncResult:
    """Decide again on the most recent emails with the current Oscar. The old decisions are kept;
    the new ones point back at them (recheck_of) and become what the app shows."""
    if not _syncing.acquire(blocking=False):
        raise AlreadySyncing("I'm already checking your inbox.")
    try:
        latest: dict[str, Decision] = {}
        for d in sorted(history.decisions.values(), key=lambda d: d.created_at):
            if d.source == "gmail":
                latest[d.email_id] = d
        recent = sorted(latest.values(), key=lambda d: d.created_at, reverse=True)[:limit]
        version = policy_version()
        bulk_action = Action(history.settings["bulk_action"]) if history.settings.get("bulk_action") else None
        new = skipped = 0
        for old in reversed(recent):
            if old.policy_version == version:
                continue  # already decided by this version
            try:
                email, info = _read(gmail, old.email_id)
            except (GmailError, httpx.HTTPError):
                skipped += 1
                continue
            # Re-reading never uses your answer to this same email: that's what it's graded against.
            prefs = Preferences.from_feedback(teaching(history, skip_email=old.email_id))
            decision = decide(email, prefs, read_only=True, bulk_action=bulk_action)
            history.add_decision(decision.model_copy(update={"source": "gmail", "gmail": info, "policy_version": version,
                                                             "recheck_of": old.id}))
            new += 1
        return SyncResult(new=new, skipped=skipped)
    finally:
        _syncing.release()


def _read(gmail: GmailClient, message_id: str):
    email, info = parse_message(gmail.message(message_id))
    try:
        info.thread_length = gmail.thread_length(info.thread_id)
        info.emailed_before = gmail.emailed_before(email.sender) if email.sender != "unknown" else None
    except (GmailError, httpx.HTTPError):
        pass  # nice to have; the decision doesn't depend on them
    return email, info


def follow_up(history: History, gmail: GmailClient) -> None:
    """Note where recent emails are now, only when something changed since last time."""
    cutoff = now() - timedelta(days=FOLLOW_UP_DAYS)
    last = {f.decision_id: f for f in history.follow_ups}
    for decision in list(history.decisions.values()):
        if decision.source != "gmail" or decision.created_at < cutoff or not decision.gmail:
            continue
        try:
            labels = gmail.labels(decision.gmail.message_id)
            state = dict(in_inbox="INBOX" in labels, unread="UNREAD" in labels, gone=False)
        except GmailError as e:
            if e.status != 404:
                continue  # a hiccup (rate limit, outage) says nothing about what you did
            state = dict(in_inbox=False, unread=False, gone=True)
        except httpx.HTTPError:
            continue
        before = last.get(decision.id)
        if before is None or (before.in_inbox, before.unread, before.gone) != tuple(state.values()):
            history.add_follow_up(FollowUp(decision_id=decision.id, **state))
