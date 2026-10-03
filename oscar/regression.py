"""Turning a reviewed mistake on the real inbox into a draft regression case.

The draft never contains the real email: addresses, links, phone numbers and long numbers are
taken out, the sender becomes its role ("billing", "noreply") at an example domain, and only the
start Oscar kept (160 characters) is there to work from. It's written to a drafts folder that git
ignores, marked as a draft, for you to rewrite as a synthetic email (evals/regression_cases/README.md).
Nothing is committed for you.
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

from oscar.history import History
from oscar.review import answer_for

CASES = Path(__file__).resolve().parent.parent / "evals" / "regression_cases"
DRAFTS = CASES / "drafts"
ROLES = ("noreply", "no-reply", "alerts", "notifications", "newsletter", "news", "billing", "invoices", "support",
         "security", "orders", "receipts", "hr", "payroll", "it", "calendar", "jobs", "deals", "offers")

SCRUB = [
    (re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"), "someone@example.com"),
    (re.compile(r"https?://\S+|www\.\S+"), "https://example.com"),
    (re.compile(r"\+?\d[\d\s().-]{7,}\d"), "555-0100"),
    (re.compile(r"\b\d{5,}\b"), "12345"),
]


def scrub(text: str) -> str:
    for pattern, stand_in in SCRUB:
        text = pattern.sub(stand_in, text)
    return text


def role_of(sender: str) -> str:
    local = sender.split("<")[-1].rstrip(">").split("@")[0].lower()
    return next((r for r in ROLES if r in local), "person")


def draft(history: History, decision_id: str) -> dict:
    """A draft case for one reviewed decision. Raises KeyError if there's no full review for it."""
    decision = history.get_decision(decision_id)
    found = answer_for(history, decision) if decision else None
    if decision is None or found is None:
        raise KeyError("That decision has no full review to make a case from.")
    review, right = found
    return {
        "id": f"draft-{decision.email_type.replace('_', '-')}-{decision_id[:6]}",
        "draft": True,
        "added": date.today().isoformat(),
        "found_as": review.label.value,
        "why": "TODO: one plain sentence on what Oscar got wrong, and why.",
        "twin": "TODO: the id of its opposite case (see README step 2)",
        "email": {
            "sender": f"{role_of(decision.sender)}@sender.example",
            "subject": scrub(decision.subject),
            "category": decision.gmail.category if decision.gmail else None,
            "body": "TODO: rewrite in your own words, keeping what caused the mistake. Started from: "
                    + scrub(decision.snippet),
        },
        "expect": {"level": right.level.value,
                   **({"action": right.action.value} if hasattr(right.action, "value") else {})},
        "oscar_did": {"level": decision.autonomy_level.value, "action": decision.action.value},
    }


def write_draft(history: History, decision_id: str, folder: Path = DRAFTS) -> Path:
    case = draft(history, decision_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{case['id']}.json"
    path.write_text(json.dumps(case, indent=2) + "\n")
    return path
