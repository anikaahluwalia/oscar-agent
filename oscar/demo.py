"""The demo: made-up emails, decided by the real Oscar, so you can try him without Gmail.

Each browser gets a demo of its own. It makes up a session id and sends it with every call, and
its history lives only in memory here, never on disk. So nothing you teach him in the demo reaches
your real inbox, and two people trying it never see each other's.

Only where the emails come from is pretend. Every one goes through decide(), with what you've
taught him in this demo and every safety check, like an email from Gmail. The emails are in
emails/demo/: the ones that are there when you start, and the ones that arrive when you check.

    python -m oscar.demo --read    read every demo email with the model once, and save what it said

Run that again after changing a demo email, the prompt (understand.PROMPT_VERSION) or the model
(OSCAR_MODEL): the saved readings are only used for exactly the email, prompt and model they came
from. Without them, a server with no model key decides on the rules alone, and the guide's second
step stops working: Oscar only guesses what the shop emails are, and a guess never gets a rule for
every email like it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import threading
from collections import OrderedDict
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel

from oscar.agent import decide
from oscar.classification import type_hints
from oscar.history import History
from oscar.models import Decision, Email
from oscar.preferences import Preferences
from oscar.review import teaching
from oscar.understand import NoSavedReading, Reader, api_key, cache_key

FOLDER = Path(__file__).resolve().parent.parent / "emails" / "demo"
READINGS = FOLDER / "understanding.jsonl"  # the model's reading of each demo email, saved once
SESSION_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MAX_SESSIONS = 200


class DemoEmail(BaseModel):
    arrives: Literal["start", "later"]  # there when you start, or comes in when you check
    email: Email


def emails() -> list[DemoEmail]:
    return [DemoEmail.model_validate_json(path.read_text()) for path in sorted(FOLDER.glob("*.json"))]


class Sessions:
    """Each browser's demo history, in memory. The one used longest ago is forgotten once there are too many."""

    def __init__(self, limit: int = MAX_SESSIONS) -> None:
        self.limit = limit
        self.histories: OrderedDict[str, History] = OrderedDict()
        self.arrivals: dict[str, threading.Lock] = {}
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

    def _keep(self, session_id: str, history: History) -> History:
        self.histories[session_id] = history
        while len(self.histories) > self.limit:
            gone, _ = self.histories.popitem(last=False)
            self.arrivals.pop(gone, None)
        return history


SESSIONS = Sessions()


def reader(http: httpx.Client) -> Reader:
    """The model's saved readings. With a model key, an email without one is read now."""
    return Reader(http, READINGS, reads="full", saved_only=not api_key())


def arrive(history: History, email: Email, read: Reader) -> Decision:
    """One demo email comes in: Oscar decides on it exactly as he would on one from Gmail."""
    try:
        understanding = read.read(email)
    except NoSavedReading:
        understanding = None  # no saved reading: the rules alone
    decision = decide(email, Preferences.from_feedback(teaching(history)), understanding=understanding,
                      type_hint=type_hints(history).get(email.sender))
    history.add_decision(decision)
    return decision


def start(history: History) -> list[Decision]:
    """The emails that are there when you start, as if they just came in."""
    with httpx.Client(timeout=40) as http:
        read = reader(http)
        return [arrive(history, e.email, read) for e in emails() if e.arrives == "start"]


def check(history: History) -> int:
    """The emails that come in later, the first time you check. Returns how many came in."""
    seen = {d.email_id for d in history.decisions.values()}
    new = [e.email for e in emails() if e.arrives == "later" and e.email.id not in seen]
    with httpx.Client(timeout=40) as http:
        read = reader(http)
        for email in new:
            arrive(history, email, read)
    return len(new)


def content(history: History, decision_id: str) -> dict | None:
    """The whole demo email behind one of this demo's decisions, for opening it in the app. The same
    shape as a real one from Gmail (gmail.email_content), only text since the demo emails have no
    HTML. None when it isn't one of this demo's emails."""
    decision = history.get_decision(decision_id)
    if decision is None:
        return None
    email = next((e.email for e in emails() if e.email.id == decision.email_id), None)
    return {"html": None, "text": email.body} if email else None


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
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="The demo emails.")
    parser.add_argument("--read", action="store_true", help="read every demo email with the model and save it")
    if not parser.parse_args().read:
        parser.print_help()
        sys.exit(0)
    sys.exit(read_all())
