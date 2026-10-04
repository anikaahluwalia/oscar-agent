"""The demo: made-up emails, decided by the real Oscar, so you can try him without Gmail.

Each browser gets a demo of its own. It makes up a session id and sends it with every call, and
its history lives only in memory here, never on disk. So nothing you teach him in the demo reaches
your real inbox, and two people trying it never see each other's.

Only where the emails come from is pretend. Every one goes through decide(), with what you've
taught him in this demo and every safety check, like an email from Gmail. The emails are in
emails/demo/: the ones that are there when you start, and the ones that arrive when you check.

Each demo also has its own pretend Gmail (oscar/pretend_gmail.py), in memory like its history. The
emails land there, and what Oscar does goes through the same code as on a real inbox: what he does
on his own when an email comes in (inbox.act_alone), your yes, Undo, and a No in Review putting it
back (api.correct_from_review). Your real Gmail and its token are never used.

    python -m oscar.demo --read    read every demo email with the model once, and save what it said,
                                   and write the reply he'd draft for the ones he'd answer

Run that again after changing a demo email, the prompt (understand.PROMPT_VERSION) or the model
(OSCAR_MODEL): the saved readings are only used for exactly the email, prompt and model they came
from. Without them, a server with no model key decides on the rules alone, and the guide's second
step stops working: Oscar only guesses what the shop emails are, and a guess never gets a rule for
every email like it. The drafts are kept for exactly the email they were written for. The demo
only ever uses the saved ones, so it needs no model key: a demo email without one gets no draft.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import threading
import weakref
from collections import OrderedDict
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel

from oscar.act import ACTED_LEVELS, can_draft
from oscar.agent import decide
from oscar.classification import type_hints
from oscar.drafting import Drafter, fit_to_answer
from oscar.gmail import GmailClient
from oscar.history import History
from oscar.inbox import act_alone
from oscar.models import Decision, Email, GmailInfo
from oscar.preferences import Preferences
from oscar.pretend_gmail import PretendGmail, gmail_message
from oscar.review import teaching
from oscar.understand import NoSavedReading, Reader, api_key, cache_key, email_text

FOLDER = Path(__file__).resolve().parent.parent / "emails" / "demo"
READINGS = FOLDER / "understanding.jsonl"  # the model's reading of each demo email, saved once
DRAFTS = FOLDER / "drafts.jsonl"  # the reply he'd draft to each demo email he'd answer, written once
SESSION_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MAX_SESSIONS = 200


class DemoEmail(BaseModel):
    arrives: Literal["start", "later"]  # there when you start, or comes in when you check
    email: Email


def emails() -> list[DemoEmail]:
    return [DemoEmail.model_validate_json(path.read_text()) for path in sorted(FOLDER.glob("*.json"))]


def demo_email(email_id: str) -> Email | None:
    return next((e.email for e in emails() if e.email.id == email_id), None)


class Sessions:
    """Each browser's demo history and pretend Gmail, in memory. The one used longest ago is forgotten
    once there are too many."""

    def __init__(self, limit: int = MAX_SESSIONS) -> None:
        self.limit = limit
        self.histories: OrderedDict[str, History] = OrderedDict()
        self.arrivals: dict[str, threading.Lock] = {}
        # Each demo's pretend Gmail, by its history. It goes when the history does.
        self.inboxes: weakref.WeakKeyDictionary[History, PretendGmail] = weakref.WeakKeyDictionary()
        self.lock = threading.Lock()

    def arriving(self, session_id: str) -> threading.Lock:
        """Held while emails come in to this browser's demo. Two checks at once would both bring in the
        same new emails, and a check during a start could bring them into the fresh demo too early."""
        with self.lock:
            return self.arrivals.setdefault(session_id, threading.Lock())

    def get(self, session_id: str) -> History:
        with self.lock:
            history = self.histories.pop(session_id, None) or History()
            return self._keep(session_id, history)

    def fresh(self, session_id: str) -> History:
        """An empty history for this browser, in place of what it had."""
        with self.lock:
            self.histories.pop(session_id, None)
            return self._keep(session_id, History())

    def inbox(self, history: History) -> PretendGmail | None:
        """The pretend Gmail of the demo this history is, or None when it isn't a demo's."""
        with self.lock:
            return self.inboxes.get(history)

    def gmail(self, history: History) -> GmailClient | None:
        """Oscar's Gmail client for that pretend Gmail, or None when it isn't a demo's."""
        inbox = self.inbox(history)
        return inbox.client() if inbox else None

    def _keep(self, session_id: str, history: History) -> History:
        self.histories[session_id] = history
        if history not in self.inboxes:
            self.inboxes[history] = PretendGmail(drafts=True)
        while len(self.histories) > self.limit:
            gone, _ = self.histories.popitem(last=False)
            self.arrivals.pop(gone, None)
        return history


SESSIONS = Sessions()


def reader(http: httpx.Client) -> Reader:
    """The model's saved readings. With a model key, an email without one is read now."""
    return Reader(http, READINGS, reads="full", saved_only=not api_key())


def draft_key(email: Email) -> str:
    return hashlib.sha256(email_text(email, "full").encode()).hexdigest()[:24]


def saved_draft(email: Email) -> str | None:
    """The reply Oscar wrote to this demo email (python -m oscar.demo --read), or None if there isn't one."""
    if not DRAFTS.exists() or not fit_to_answer(email):
        return None
    key = draft_key(email)
    rows = (json.loads(line) for line in DRAFTS.read_text().splitlines() if line.strip())
    return next((row["text"] for row in rows if row["key"] == key), None)


def draft_for(decision: Decision) -> str | None:
    """The saved reply for the demo email behind a decision, for when you say yes to one."""
    found = demo_email(decision.email_id)
    return saved_draft(found) if found else None


def arrive(history: History, email: Email, read: Reader, inbox: PretendGmail | None = None) -> Decision:
    """One demo email comes in: Oscar decides on it exactly as he would on one from Gmail. With the
    demo's pretend Gmail, the email lands there first, and what he decided to do on his own he does
    there, as on a real inbox while he acts (inbox._sync), with the saved draft for a reply."""
    try:
        understanding = read.read(email)
    except NoSavedReading:
        understanding = None  # no saved reading: the rules alone
    decision = decide(email, Preferences.from_feedback(teaching(history)), understanding=understanding,
                      type_hint=type_hints(history).get(email.sender))
    if inbox is not None:
        message = gmail_message(email.id, email.sender, email.subject, email.body, bulk=email.bulk, category=email.category)
        inbox.messages[email.id] = message
        decision.gmail = GmailInfo(message_id=email.id, thread_id=message["threadId"], labels=message["labelIds"],
                                   category=email.category)
        if decision.autonomy_level in ACTED_LEVELS:
            act_alone(history, inbox.client(), decision, lambda: saved_draft(email))
    history.add_decision(decision)
    return decision


def start(history: History) -> list[Decision]:
    """The emails that are there when you start, as if they just came in."""
    inbox = SESSIONS.inbox(history)
    with httpx.Client(timeout=40) as http:
        read = reader(http)
        return [arrive(history, e.email, read, inbox) for e in emails() if e.arrives == "start"]


def check(history: History) -> int:
    """The emails that come in later, the first time you check. Returns how many came in."""
    seen = {d.email_id for d in history.decisions.values()}
    new = [e.email for e in emails() if e.arrives == "later" and e.email.id not in seen]
    inbox = SESSIONS.inbox(history)
    with httpx.Client(timeout=40) as http:
        read = reader(http)
        for email in new:
            arrive(history, email, read, inbox)
    return len(new)


def content(history: History, decision_id: str) -> dict | None:
    """The whole demo email behind one of this demo's decisions, for opening it in the app. The same
    shape as a real one from Gmail (gmail.email_content), only text since the demo emails have no
    HTML. None when it isn't one of this demo's emails."""
    decision = history.get_decision(decision_id)
    found = demo_email(decision.email_id) if decision else None
    return {"html": None, "text": found.body} if found else None


def read_all() -> int:
    """Read every demo email with the model, and keep only the readings for the emails as they are now."""
    if not api_key():
        print("I need a model key (GEMINI_API_KEY in .env) to read the demo emails.")
        return 1
    found = [e.email for e in emails()]
    with httpx.Client(timeout=40) as http:
        read = Reader(http, READINGS, reads="full")
        for email in found:
            understanding = read.read(email)
            print(f"{email.id}: {understanding.kind if understanding else 'no answer, so the rules alone'}")
    keep = {cache_key(email, "full") for email in found}
    READINGS.write_text("".join(json.dumps({"key": key, "answer": answer}) + "\n"
                                for key, answer in read.cache.items() if key in keep))
    write_drafts(found)
    return 0


def write_drafts(found: list[Email]) -> None:
    """Write the reply Oscar would draft to each demo email he'd answer, with the real Drafter. Only
    for the ones a fresh demo decides to reply to and may (act.can_draft): never one a safety rule
    or caution word stopped. A draft already saved for the same email is kept, not written again."""
    history, inbox = History(), PretendGmail(drafts=True)
    drafts = {}
    with httpx.Client(timeout=40) as http:
        read, drafter = reader(http), Drafter(http)
        for email in found:
            decision = arrive(history, email, read, inbox)
            if can_draft(decision) and fit_to_answer(email):
                text = saved_draft(email) or drafter.write(email)
                print(f"{email.id}: {'a draft' if text else 'no draft fit to save'}")
                if text:
                    drafts[draft_key(email)] = text
    DRAFTS.write_text("".join(json.dumps({"key": key, "text": text}) + "\n" for key, text in drafts.items()))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="The demo emails.")
    parser.add_argument("--read", action="store_true", help="read every demo email with the model and save it")
    if not parser.parse_args().read:
        parser.print_help()
        sys.exit(0)
    sys.exit(read_all())
