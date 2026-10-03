"""Oscar on a real Gmail inbox, read-only (Stage 9).

sync() reads the newest emails Oscar hasn't seen, decides on each one, and logs
the decision with where it came from. Nothing is done in Gmail. Decisions are
logged before anyone reviews them, so reviews score what Oscar decided on his own.

It also notes what you did with recent emails since (still in the inbox? still
unread? deleted?), as a second opinion next to your reviews.

Since Stage 11 a model can read each email too (oscar/understand.py), only if
OSCAR_MODEL_READS is preview or full. Its answers are kept in the account's own
folder, never in the repo.
"""

import threading
from collections.abc import Callable
from datetime import datetime, timedelta

import httpx
from pydantic import BaseModel, Field

from oscar.act import ACTED_LEVELS, MAX_PER_CHECK, TAGS_PER_CHECK, ActionError, can_do, do, gone, status_label, tag
from oscar.agent import decide
from oscar.classification import type_hints
from oscar.review import teaching
from oscar.gmail import GmailClient, GmailError, parse_message
from oscar.history import History
from oscar.models import AutonomyLevel, Decision, new_id, now
from oscar.overview import latest_per_email, needs_you
from oscar.preferences import Preferences
from oscar.reminders import ReminderReader
from oscar.understand import Reader, reads_real_email
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
    done: int = 0  # Stage 12: actions Oscar took in Gmail on his own
    labelled: int = 0  # emails whose status label he put on or changed


def reader_for(history: History) -> Reader | None:
    """The model reader for this inbox, or None when reading real email with a model is off."""
    reads = reads_real_email()
    if reads == "off":
        return None
    cache = history.data_dir / "understanding.jsonl" if history.data_dir else None
    return Reader(httpx.Client(timeout=40), cache, reads=reads)


def reminders_for(history: History) -> ReminderReader | None:
    """The reminder reader for this inbox, or None when reading real email with a model is off."""
    reads = reads_real_email()
    if reads == "off":
        return None
    cache = history.data_dir / "reminders.jsonl" if history.data_dir else None
    return ReminderReader(httpx.Client(timeout=40), cache, reads=reads)


def sync(history: History, gmail: GmailClient, limit: int = 25, reader: Reader | None = None,
         act_since: datetime | None = None, still_acting: Callable[[], bool] | None = None, *,
         safety: bool = True, reminders: ReminderReader | None = None, label: bool = False) -> SyncResult:
    """Decide on up to `limit` inbox emails Oscar hasn't seen, oldest of them first.

    With act_since (Stage 12), he also does what he decided to do on his own, if it's one of his
    undoable actions, but only for emails that arrived after acting was turned on: never the
    backlog. still_acting is asked before each action, so turning acting off stops a check midway.

    With label (the app's own check, while acting is on), he also puts his call on emails as a
    coloured label in Gmail (label_inbox). The evals leave it off: they grade the world by what changed.

    safety=False is for the evals' simulated inbox only (agent.decide), and refused for anything else.
    """
    if not safety and not getattr(gmail, "simulated", False):
        raise RuntimeError("The safety rules can only be turned off in the simulated inbox, never on a real Gmail.")
    if not _syncing.acquire(blocking=False):
        raise AlreadySyncing("I'm already checking your inbox.")
    try:
        # The app's own path (no reader passed in) also looks for reminders; evals and tests don't.
        if reminders is None and reader is None:
            reminders = reminders_for(history)
        still = still_acting or (lambda: True)
        result = _sync(history, gmail, limit, reader if reader is not None else reader_for(history), act_since,
                       still, safety, reminders)
        if label:
            result.labelled = label_inbox(history, gmail, still)
        return result
    finally:
        _syncing.release()


def _sync(history: History, gmail: GmailClient, limit: int, reader: Reader | None, act_since: datetime | None,
          still_acting: Callable[[], bool], safety: bool = True, reminders: ReminderReader | None = None) -> SyncResult:
    act = act_since is not None
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
    new = skipped = done = 0
    for ref in reversed(unseen[:limit]):
        try:
            email, info = _read(gmail, ref["id"])
        except (GmailError, httpx.HTTPError):
            skipped += 1
            continue
        understanding = reader.read(email) if reader else None
        prefs = Preferences.from_feedback(teaching(history))
        hint = type_hints(history).get(email.sender)
        decision = decide(email, prefs, read_only=not act, understanding=understanding, safety=safety, type_hint=hint)
        decision = decision.model_copy(update={"source": "gmail", "gmail": info, "policy_version": version, "acting": act})
        arrived_since = info.received_at is not None and act_since is not None and info.received_at >= act_since
        did = False
        if (act and arrived_since and decision.autonomy_level in ACTED_LEVELS and can_do(decision)
                and done < MAX_PER_CHECK and still_acting()):
            try:
                do(history, gmail, decision, by="oscar")
                done += 1
                did = True
            except (ActionError, GmailError, httpx.HTTPError):
                pass  # the decision stays logged; the app shows it wasn't done
        if act and decision.autonomy_level in ACTED_LEVELS and not did:
            # He didn't do it in Gmail (an old email, the cap, an action he doesn't do there, or Gmail
            # said no), so his note says what he would do, never "I archived this".
            would = decide(email, prefs, read_only=True, understanding=understanding, safety=safety, type_hint=hint)
            decision = decision.model_copy(update={"explanation": would.explanation, "message": would.message, "steps": would.steps})
        # Something coming up, for Today. Never from an email he stopped or flagged.
        if reminders and decision.autonomy_level != AutonomyLevel.ESCALATE and not decision.safety_flags:
            received = info.received_at.date() if info.received_at else datetime.now().date()
            decision = decision.model_copy(update={"reminder": reminders.read(email, received)})
        history.add_decision(decision)
        new += 1
    follow_up(history, gmail)
    return SyncResult(new=new, skipped=skipped, done=done)


def label_inbox(history: History, gmail: GmailClient, still_acting: Callable[[], bool],
                limit: int = TAGS_PER_CHECK) -> int:
    """Bring the status labels in Gmail up to date with Oscar's latest call on each email, newest
    first, a few at a time. Only emails whose label is missing or out of date are touched."""
    waiting = {d.id for d in needs_you(history)[AutonomyLevel.ASK_FIRST]}
    changed = 0
    for decision in latest_per_email(history):
        if changed >= limit or not still_acting():
            break
        if decision.source != "gmail" or decision.gmail is None:
            continue
        before = history.tags.get(decision.email_id)
        want = status_label(history, decision, waiting)
        if before and (before.label is None or before.label == want):
            continue  # gone from Gmail, or already right
        try:
            tag(history, gmail, decision, want)
            changed += 1
        except GmailError as e:
            if e.status == 404:
                gone(history, decision)
            elif e.status in (401, 403):
                break  # Gmail stopped letting him change labels; the app says so elsewhere
        except httpx.HTTPError:
            pass  # tried again next check
    return changed


def recheck(history: History, gmail: GmailClient, limit: int = 50, reader: Reader | None = None) -> SyncResult:
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
        reader = reader if reader is not None else reader_for(history)
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
            decision = decide(email, prefs, read_only=not old.acting,
                              understanding=reader.read(email) if reader else None,
                              type_hint=type_hints(history, skip_email=old.email_id).get(email.sender))
            history.add_decision(decision.model_copy(update={"source": "gmail", "gmail": info, "policy_version": version,
                                                             "acting": old.acting,
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
