"""Learning from your last six months of email, the first time you connect Gmail.

Without this, a new Oscar knows nothing and asks about every harmless email. So the first time an
account connects, he looks back over about six months of it, read-only, to see how you've handled
each kind of email: did you archive promotions, read and keep receipts, leave some things in your
inbox? Then he shows you the few clearest habits and asks what he should do from now on.

What you did in the past is evidence, not permission. Nothing here changes how much he does on his
own until you answer. Your answer becomes the same "for emails like this" rule the Review page and
chat make (feedback.FeedbackKind.ALWAYS_DO_THIS or ALWAYS_ASK_ME, scope "kind"), so it goes through
the existing learning (oscar/preferences.py) and every safety check still runs after it.

How it works, per account (kept in that account's folder, so accounts never mix):
1. fetching: list the ids of the last six months of mail (Gmail search, page by page), the newest
   2,000 at most. If that's fewer than 500, keep going further back until there are 500 (or no more).
2. understanding: read each one's labels, headers and preview, and let the rules (agent.decide,
   no model) say what kind of email it is. Count what you did with it from its Gmail labels:
   gone from the inbox (archived), read, starred.
3. finding: turn the counts into a few habits that are clear enough to show.
4. ready: you answer each habit, or skip. Then it's done, and never runs again for this account.

Progress is saved as it goes, so if the API stops halfway it carries on where it left off.

It only ever reads. The scan always uses a read-only Gmail client (GmailClient(read_only=True)),
which refuses every write before Gmail is asked, and nothing here calls a write anyway.
"""

from __future__ import annotations

import json
import threading
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Literal

import httpx

from oscar.agent import decide
from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.gmail import RATE_LIMITED, GmailClient, GmailError, TokenStore, parse_message
from oscar.history import History
from oscar.models import Action, AutonomyLevel
from oscar.preferences import HABIT_ACTIONS, family

QUERY = "newer_than:6m -in:chats -in:sent -in:drafts"  # about six months of mail you received
OLDER = "older_than:6m -in:chats -in:sent -in:drafts"  # further back, only to reach MIN_MESSAGES
# Which version of the counting the saved counts were made with. When the counting changes, a scan
# that isn't finished starts its counts again (keeping the list of emails it found), so old and new
# counts never mix.
COUNTING = 2
MAX_MESSAGES = 2000  # the most he looks at (the newest), so a huge inbox doesn't take all day
MIN_MESSAGES = 500  # if six months has fewer than this, he goes further back until he has this many
SAVE_EVERY = 25  # emails between saves, so a stop loses little
PACE = 0.05  # seconds between reads: about 20 a second, well under Gmail's limit per account
BACKOFF = (1, 2, 4, 8, 16)  # seconds to wait each time Gmail says to slow down, before giving up
MAX_REFUSED_IN_A_ROW = 10  # emails Gmail won't let him read, in a row, before he stops and says so
_sleep = time.sleep  # tests swap this so they don't wait

# How clear a habit has to be before he shows it.
MIN_EMAILS = 6
MIN_SENDERS = 3
MIN_SHARE = 0.8
MAX_HABITS = 6

State = Literal["not_started", "running", "ready", "complete", "skipped", "failed"]
Phase = Literal["fetching", "understanding", "finding", "ready"]
Choice = Literal["handle", "tell", "label", "ask", "reject"]

# What each answer saves, as the existing "for emails like this" rule.
ANSWERS: dict[str, tuple[FeedbackKind, AutonomyLevel | None]] = {
    "handle": (FeedbackKind.ALWAYS_DO_THIS, AutonomyLevel.PROCEED_SILENTLY),  # do it for me
    "tell": (FeedbackKind.ALWAYS_DO_THIS, AutonomyLevel.PROCEED_AND_NOTIFY),  # do it and tell me
    "label": (FeedbackKind.ALWAYS_DO_THIS, AutonomyLevel.PROCEED_SILENTLY),  # label them, keep them in the inbox
    "ask": (FeedbackKind.ALWAYS_ASK_ME, None),  # leave them to me / ask me first
}
# Kinds of list mail, where leaving it unread means you ignored it rather than kept it.
LIST_KINDS = {"bulk_mail", "notification"}
# Which version of the habit-finding the saved habits were made with. A scan that's ready but not
# answered yet gets its habits made again from its saved counts when this changes, without reading
# Gmail again.
HABITS = 2
# Feedback saved from your answers here has a decision id starting with this, since it isn't about
# one email he decided on. The What Oscar knows page uses a real email like it to change the rule.
DECISION_PREFIX = "history:"


class ColdStartError(ValueError):
    pass


def _blank() -> dict:
    return {"state": "not_started", "phase": None, "counting": COUNTING, "discovered": 0, "processed": 0, "skipped_emails": 0,
            "ids": [], "next_page": None, "listed": False, "older": False, "stats": {}, "candidates": [], "answers": {},
            "error": None, "started_at": None, "finished_at": None}


class Store:
    """The cold-start state for one account: in cold_start.json in its folder, or in memory."""

    def __init__(self, history: History) -> None:
        self.path: Path | None = history.data_dir / "cold_start.json" if history.data_dir else None
        self._memory = getattr(history, "_cold_start", None)
        if self.path is None and self._memory is None:
            history._cold_start = self._memory = _blank()

    def load(self) -> dict:
        if self.path is None:
            return self._memory
        try:
            return {**_blank(), **json.loads(self.path.read_text())}
        except (OSError, ValueError):
            return _blank()

    def save(self, data: dict) -> None:
        if self.path is None:
            if data is not self._memory:
                self._memory.clear()
                self._memory.update(data)
            return
        self.path.write_text(json.dumps(data))


def status(history: History) -> dict:
    """What the app shows: the state, how far along it is, and the habits to answer. The list of
    email ids and the raw counts stay on the server."""
    store = Store(history)
    data = store.load()
    if data["state"] == "ready" and not data["answers"] and data.get("habits") != HABITS:
        data.update(candidates=candidates(data["stats"]), habits=HABITS)
        store.save(data)
    return {key: data[key] for key in ("state", "phase", "discovered", "processed", "skipped_emails",
                                       "candidates", "answers", "error", "started_at", "finished_at")}


def is_new(history: History) -> bool:
    """A brand-new account: it hasn't done this before, and Oscar hasn't read any of its email yet."""
    return Store(history).load()["state"] == "not_started" and not history.decisions


def skip(history: History) -> dict:
    """Start fresh instead. Gmail works as normal and he learns from your answers from now on."""
    store = Store(history)
    data = store.load()
    if data["state"] == "complete":
        return status(history)
    data.update(state="skipped", finished_at=_now())
    store.save(data)
    return status(history)


def finish(history: History) -> dict:
    """You're done reviewing. Habits you didn't answer save nothing."""
    store = Store(history)
    data = store.load()
    if data["state"] != "ready":
        raise ColdStartError("There's nothing to review yet.")
    data.update(state="complete", finished_at=_now())
    store.save(data)
    return status(history)


# --- The scan ------------------------------------------------------------------------------------

def run(history: History, gmail: GmailClient, should_stop: Callable[[], bool] = lambda: False) -> dict:
    """Look back over the account's last six months, or carry on from where it stopped. Only ever
    reads: it works on a read-only copy of the Gmail client, whatever it's given."""
    reader = GmailClient(gmail.tokens, gmail.http, names=gmail.names, read_only=True)
    store = Store(history)
    data = store.load()
    if data["state"] in ("ready", "complete", "skipped"):
        return status(history)
    if len(data["ids"]) > MAX_MESSAGES:  # listed under a bigger cap: keep the newest
        data["ids"] = data["ids"][:MAX_MESSAGES]
        data.update(discovered=MAX_MESSAGES, processed=min(data["processed"], MAX_MESSAGES))
    if data.get("counting") != COUNTING:
        data.update(processed=0, skipped_emails=0, stats={}, counting=COUNTING)
    data.update(state="running", error=None, started_at=data["started_at"] or _now())
    store.save(data)
    # Emails Oscar changed in Gmail himself (on his own, or when you approved him) say what he
    # did, not what you did, so they're left out. Only matters for an account he already acts on.
    his = {record.message_id for record in history.actions.values()}
    try:
        _list(reader, store, data, should_stop)
        _understand(reader, store, data, should_stop, his)
        if should_stop():
            return status(history)
        data.update(phase="finding")
        store.save(data)
        data.update(candidates=candidates(data["stats"]), habits=HABITS, phase="ready", state="ready")
        store.save(data)
    except GmailError as e:
        why = ("Gmail asked me to slow down" if rate_limited(e)
               else "Gmail stopped letting me read your email" if e.status in (401, 403) else "Gmail stopped me")
        data.update(state="failed", error=f"{why} partway ({e}). Try again in a few minutes and I'll carry on.")
        store.save(data)
    except httpx.HTTPError as e:
        data.update(state="failed", error=f"I lost the connection to Gmail partway ({type(e).__name__}). Try again and I'll carry on.")
        store.save(data)
    except Exception as e:  # noqa: BLE001  anything else: say so, rather than leave it "running" for ever
        data.update(state="failed", error=f"Something went wrong partway ({type(e).__name__}). Try again and I'll carry on.")
        store.save(data)
    return status(history)


def _list(reader: GmailClient, store: Store, data: dict, should_stop: Callable[[], bool]) -> None:
    """Phase 1: the message ids to look at, newest first, page by page, saved after each page. The
    last six months, up to MAX_MESSAGES; if that's under MIN_MESSAGES, older mail until it isn't."""
    data.update(phase="fetching")
    while not data["listed"] and not should_stop():
        refs, page = reader.search(OLDER if data["older"] else QUERY, data["next_page"])
        known = set(data["ids"])
        # Older mail only tops the list up to the minimum; the last six months goes up to the cap.
        cap = max(MIN_MESSAGES, len(data["ids"])) if data["older"] else MAX_MESSAGES
        data["ids"] = (data["ids"] + [r["id"] for r in refs if r["id"] not in known])[:cap]
        found = len(data["ids"])
        data.update(next_page=page, discovered=found)
        if found >= MAX_MESSAGES or (data["older"] and (found >= MIN_MESSAGES or not page)):
            data["listed"] = True
        elif not page and not data["older"]:
            if found >= MIN_MESSAGES:
                data["listed"] = True
            else:
                data.update(older=True, next_page=None)  # six months wasn't enough: go further back
        store.save(data)


def rate_limited(e: GmailError) -> bool:
    return e.status == 429 or (e.status == 403 and e.reason in RATE_LIMITED)


def skippable(e: GmailError) -> bool:
    """Gmail won't show this one email (deleted since, or refused), so it's skipped rather than
    stopping. Anything else, like a revoked token or an outage, stops the whole read."""
    return not rate_limited(e) and e.status in (400, 403, 404)


def patiently(read: Callable[[], dict], waits: tuple[float, ...] = BACKOFF) -> dict:
    """One Gmail read. When Gmail says to slow down, wait and try again (1, 2, 4, 8, 16 seconds)
    before giving up. The replay (oscar/replay.py) reads the same way, with longer waits."""
    for wait in (*waits, None):
        try:
            return read()
        except GmailError as e:
            if not rate_limited(e) or wait is None:
                raise
            _sleep(wait)
    raise AssertionError("unreachable")


def _read(reader: GmailClient, message_id: str) -> dict:
    """One email's metadata."""
    return patiently(lambda: reader.metadata(message_id))


def _understand(reader: GmailClient, store: Store, data: dict, should_stop: Callable[[], bool],
                his: set[str] = frozenset()) -> None:
    """Phase 2: what kind of email each one is, and what you did with it. Saved every few emails.
    his: emails Oscar changed himself, which aren't read at all. An email Gmail won't let him read
    (deleted since it was listed, or refused) is skipped; only many refusals in a row stop the scan."""
    if not data["listed"]:
        return
    data.update(phase="understanding")
    refused = 0
    while data["processed"] < len(data["ids"]) and not should_stop():
        message_id = data["ids"][data["processed"]]
        try:
            if message_id in his:
                data["skipped_emails"] += 1
            else:
                _count(data["stats"], _read(reader, message_id))
                refused = 0
                _sleep(PACE)
        except GmailError as e:
            if not skippable(e):
                raise
            refused = refused + 1 if e.status == 403 else 0
            if refused >= MAX_REFUSED_IN_A_ROW:
                raise
            data["skipped_emails"] += 1
        data["processed"] += 1
        if data["processed"] % SAVE_EVERY == 0 or data["processed"] == len(data["ids"]):
            store.save(data)


def _count(stats: dict, raw: dict) -> None:
    """Add one email to the counts for its kind. Emails a safety rule would stop, and ones the
    rules couldn't read, are left out: nothing you teach changes those anyway."""
    email, info = parse_message(raw)
    decision = decide(email)  # the rules alone, no model and no learning: what kind of email is this?
    kind = family(decision.email_type)
    # Without the body the keyword rules often can't say more than "this was sent to a list". That's a
    # guess when he decides on a new email, so he asks; as evidence of what you did with list mail it's
    # reliable, so it counts here. Only on Gmail's list headers or its Promotions, Social and Forums
    # tabs, not Updates, which also holds account alerts.
    list_mail = decision.email_type == "bulk" and (email.bulk or email.category in ("promotions", "social", "forums"))
    if (not kind or decision.autonomy_level == AutonomyLevel.ESCALATE or decision.safety_flags
            or decision.level_source == "caution" or (decision.level_source == "guess" and not list_mail)):
        return
    labels = set(info.labels)
    kept, read = "INBOX" in labels, "UNREAD" not in labels
    row = stats.setdefault(kind, {"emails": 0, "archived": 0, "read": 0, "kept": 0, "kept_read": 0, "starred": 0,
                                  "senders": [], "types": {}, "actions": {}})
    row["emails"] += 1
    row["archived"] += not kept
    row["read"] += read
    row["kept"] += kept
    row["kept_read"] += kept and read
    row["starred"] += "STARRED" in labels
    if email.sender not in row["senders"]:
        row["senders"].append(email.sender)
    row["types"][decision.email_type] = row["types"].get(decision.email_type, 0) + 1
    row["actions"][decision.action.value] = row["actions"].get(decision.action.value, 0) + 1


# --- Habits --------------------------------------------------------------------------------------

def candidates(stats: dict) -> list[dict]:
    """The clearest habits, at most MAX_HABITS, biggest first. Each is about a kind of email (not a
    sender), so a shop's password-change notice never picks up how you treat its promotions. Only
    for the easy-to-undo actions he can learn (preferences.HABIT_ACTIONS). The first that fits:
    - archived: most of them left the inbox, so he'd archive them
    - ignored: list mail you mostly never opened, even if it's still in the inbox, so he'd archive it
    - read: most stayed in the inbox but were read, so he'd mark them as read
    - kept: most stayed in the inbox, so he could label them and leave them there, or leave them to you
    Each says which answer fits your history best (suggested), but nothing is chosen for you.
    """
    out = []
    for kind, row in stats.items():
        n, senders = row["emails"], len(row["senders"])
        if n < MIN_EMAILS or senders < MIN_SENDERS:
            continue
        usual = Counter(row["actions"]).most_common(1)[0][0]
        if Action(usual) not in HABIT_ACTIONS:
            continue  # he'd reply to these, or ask: a rule about archiving them would never be used
        unread = n - row["read"]
        if row["archived"] / n >= MIN_SHARE:
            habit, action, count = "archived", Action.ARCHIVE, row["archived"]
        elif kind in LIST_KINDS and unread / n >= MIN_SHARE:
            habit, action, count = "ignored", Action.ARCHIVE, unread
        elif row["kept_read"] / n >= MIN_SHARE:
            habit, action, count = "read", Action.MARK_READ, row["kept_read"]
        elif row["kept"] / n >= MIN_SHARE:
            habit, action, count = "kept", Action(usual), row["kept"]
        else:
            continue
        out.append({
            "id": f"{kind}:{habit}",
            "kind": kind,
            "habit": habit,
            "action": action.value,
            "email_type": Counter(row["types"]).most_common(1)[0][0],
            "sender": row["senders"][0],
            "emails": n,
            "count": count,
            "senders": senders,
            "read": row["read"],
            "share": round(count / n, 3),
            "examples": row["senders"][:3],  # a few of the senders, newest first, so it's clear which emails
            # Keeping them in the inbox: label them and leave them there, or leave them to you.
            "options": ["label", "ask", "reject"] if habit == "kept" else ["handle", "tell", "ask", "reject"],
            # What fits your history best. Doing it without telling you only when it's nearly always so.
            "suggested": "label" if habit == "kept" else "handle" if count / n >= 0.95 else "tell",
        })
    return sorted(out, key=lambda c: (-c["emails"], c["id"]))[:MAX_HABITS]


def answer(history: History, pattern_id: str, choice: str) -> dict:
    """Save your answer to one habit. "reject" (not a useful pattern) saves nothing. Anything else
    becomes the existing "for emails like this" rule, made by you, and only you: nothing in an
    email can call this."""
    store = Store(history)
    data = store.load()
    if data["state"] != "ready":
        raise ColdStartError("There's nothing to review yet.")
    found = next((c for c in data["candidates"] if c["id"] == pattern_id), None)
    if found is None:
        raise ColdStartError("I don't know that habit.")
    if choice not in found["options"]:
        raise ColdStartError("That isn't one of the answers for this habit.")
    if choice in ANSWERS:
        kind, level = ANSWERS[choice]
        # "label" is about labelling these, whatever he'd usually do with them.
        action = Action.APPLY_LABEL if choice == "label" else Action(found["action"])
        history.add_feedback(FeedbackEvent(
            decision_id=f"{DECISION_PREFIX}{pattern_id}", kind=kind, scope="kind", desired_level=level,
            action=action, autonomy_level=AutonomyLevel.ASK_FIRST,
            sender=found["sender"], email_type=found["email_type"]))
    data["answers"][pattern_id] = choice
    if all(c["id"] in data["answers"] for c in data["candidates"]):
        data.update(state="complete", finished_at=_now())
    store.save(data)
    return status(history)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- Running it in the background, once per account at a time ------------------------------------

_running: dict[str, threading.Thread] = {}
_lock = threading.Lock()


def start(history: History, tokens: TokenStore, http: httpx.Client) -> bool:
    """Start (or carry on) the scan for this account in the background. False if it's already
    running, or there's nothing left to do."""
    key = str(history.data_dir or id(history))
    with _lock:
        if key in _running and _running[key].is_alive():
            return False
        if Store(history).load()["state"] in ("ready", "complete", "skipped"):
            return False

        def work() -> None:
            run(history, GmailClient(tokens, http))

        thread = threading.Thread(target=work, daemon=True, name="oscar-cold-start")
        _running[key] = thread
        thread.start()
        return True


def is_running(history: History) -> bool:
    thread = _running.get(str(history.data_dir or id(history)))
    return bool(thread and thread.is_alive())


def wait(history: History, timeout: float | None = None) -> None:
    """Wait for this account's scan to stop. For tests."""
    thread = _running.get(str(history.data_dir or id(history)))
    if thread:
        thread.join(timeout)
