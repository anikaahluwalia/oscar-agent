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
1. fetching: list the ids of the last six months of mail (Gmail search, page by page).
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
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Literal

import httpx

from oscar.agent import decide
from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.gmail import GmailClient, GmailError, TokenStore, parse_message
from oscar.history import History
from oscar.models import Action, AutonomyLevel
from oscar.preferences import HABIT_ACTIONS, family

QUERY = "newer_than:6m -in:chats -in:sent -in:drafts"  # about six months of mail you received
MAX_MESSAGES = 5000  # the most he looks at, so a huge inbox doesn't take all day
SAVE_EVERY = 25  # emails between saves, so a stop loses little

# How clear a habit has to be before he shows it.
MIN_EMAILS = 6
MIN_SENDERS = 3
MIN_SHARE = 0.8
MAX_HABITS = 6

State = Literal["not_started", "running", "ready", "complete", "skipped", "failed"]
Phase = Literal["fetching", "understanding", "finding", "ready"]
Choice = Literal["handle", "tell", "ask", "reject"]

# What each answer saves, as the existing "for emails like this" rule.
ANSWERS: dict[str, tuple[FeedbackKind, AutonomyLevel | None]] = {
    "handle": (FeedbackKind.ALWAYS_DO_THIS, AutonomyLevel.PROCEED_SILENTLY),  # Just handle them
    "tell": (FeedbackKind.ALWAYS_DO_THIS, AutonomyLevel.PROCEED_AND_NOTIFY),  # Handle + tell me
    "ask": (FeedbackKind.ALWAYS_ASK_ME, None),  # Keep asking
}
# Feedback saved from your answers here has a decision id starting with this, since it isn't about
# one email he decided on. The What Oscar knows page uses a real email like it to change the rule.
DECISION_PREFIX = "history:"


class ColdStartError(ValueError):
    pass


def _blank() -> dict:
    return {"state": "not_started", "phase": None, "discovered": 0, "processed": 0, "skipped_emails": 0,
            "ids": [], "next_page": None, "listed": False, "stats": {}, "candidates": [], "answers": {},
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
    data = Store(history).load()
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
    data.update(state="running", error=None, started_at=data["started_at"] or _now())
    store.save(data)
    try:
        _list(reader, store, data, should_stop)
        _understand(reader, store, data, should_stop)
        if should_stop():
            return status(history)
        data.update(phase="finding")
        store.save(data)
        data.update(candidates=candidates(data["stats"]), phase="ready", state="ready")
        store.save(data)
    except (GmailError, httpx.HTTPError) as e:
        data.update(state="failed", error=f"Gmail stopped me partway ({e}). Try again and I'll carry on.")
        store.save(data)
    except Exception as e:  # noqa: BLE001  anything else: say so, rather than leave it "running" for ever
        data.update(state="failed", error=f"Something went wrong partway ({type(e).__name__}). Try again and I'll carry on.")
        store.save(data)
    return status(history)


def _list(reader: GmailClient, store: Store, data: dict, should_stop: Callable[[], bool]) -> None:
    """Phase 1: every message id from the last six months, page by page, saved after each page."""
    data.update(phase="fetching")
    while not data["listed"] and not should_stop():
        refs, page = reader.search(QUERY, data["next_page"])
        known = set(data["ids"])
        data["ids"] += [r["id"] for r in refs if r["id"] not in known]
        data["ids"] = data["ids"][:MAX_MESSAGES]
        data.update(next_page=page, discovered=len(data["ids"]),
                    listed=not page or len(data["ids"]) >= MAX_MESSAGES)
        store.save(data)


def _understand(reader: GmailClient, store: Store, data: dict, should_stop: Callable[[], bool]) -> None:
    """Phase 2: what kind of email each one is, and what you did with it. Saved every few emails."""
    if not data["listed"]:
        return
    data.update(phase="understanding")
    while data["processed"] < len(data["ids"]) and not should_stop():
        message_id = data["ids"][data["processed"]]
        try:
            _count(data["stats"], reader.metadata(message_id))
        except GmailError as e:
            if e.status not in (404, 400):
                raise
            data["skipped_emails"] += 1  # deleted since it was listed
        data["processed"] += 1
        if data["processed"] % SAVE_EVERY == 0 or data["processed"] == len(data["ids"]):
            store.save(data)


def _count(stats: dict, raw: dict) -> None:
    """Add one email to the counts for its kind. Emails a safety rule would stop, and ones the
    rules couldn't read, are left out: nothing you teach changes those anyway."""
    email, info = parse_message(raw)
    decision = decide(email)  # the rules alone, no model and no learning: what kind of email is this?
    kind = family(decision.email_type)
    if (not kind or decision.autonomy_level == AutonomyLevel.ESCALATE or decision.safety_flags
            or decision.level_source in ("guess", "caution")):
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
    for the easy-to-undo actions he can learn (preferences.HABIT_ACTIONS):
    - archived: most of them left the inbox, so he'd archive them
    - read: most stayed in the inbox but were read, so he'd mark them as read
    - kept: most stayed in the inbox unread, so the only thing to say is whether he should keep asking
    """
    out = []
    for kind, row in stats.items():
        n, senders = row["emails"], len(row["senders"])
        if n < MIN_EMAILS or senders < MIN_SENDERS:
            continue
        usual = Counter(row["actions"]).most_common(1)[0][0]
        if Action(usual) not in HABIT_ACTIONS:
            continue  # he'd reply to these, or ask: a rule about archiving them would never be used
        if row["archived"] / n >= MIN_SHARE:
            habit, action, count = "archived", Action.ARCHIVE, row["archived"]
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
            # Keeping them in the inbox only says he shouldn't do it on his own.
            "options": ["ask", "reject"] if habit == "kept" else ["handle", "tell", "ask", "reject"],
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
        history.add_feedback(FeedbackEvent(
            decision_id=f"{DECISION_PREFIX}{pattern_id}", kind=kind, scope="kind", desired_level=level,
            action=Action(found["action"]), autonomy_level=AutonomyLevel.ASK_FIRST,
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
