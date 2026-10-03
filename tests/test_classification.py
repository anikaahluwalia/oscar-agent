"""Stage 13: what kind of email it is, your own categories, and reviewing what a safety rule stopped.

Kept apart from each other and from what Oscar learns about autonomy:
- correcting the kind of email never changes a preference, a level or a safety rule;
- categories are only for you, and decisions never look at them;
- a safety review can say the risk was misread, but never makes a risky email less safe.
"""

import json
from pathlib import Path

import pytest

from oscar.agent import decide
from oscar.categories import CategoryError, assign, create, delete, listing, rename
from oscar.classification import ClassificationError, record_classification, type_hints
from oscar.history import History
from oscar.models import Action, AutonomyLevel, Email
from oscar.overview import needs_you
from oscar.preferences import Preferences
from oscar.review import teaching
from oscar.safety_review import SafetyReviewError, record_safety_review

EMAILS = Path(__file__).resolve().parent.parent / "emails"


def email(name: str, **changes) -> Email:
    return Email.model_validate_json((EMAILS / f"{name}.json").read_text()).model_copy(update=changes)


def decide_in(history: History, e: Email):
    decision = decide(e, Preferences.from_feedback(teaching(history)), type_hint=type_hints(history).get(e.sender))
    history.add_decision(decision)
    return decision


def evidence(history: History) -> float:
    return sum(r.evidence for r in Preferences.from_feedback(teaching(history)).records.values())


# --- Classification ------------------------------------------------------------------------------

def test_a_correction_is_saved_apart_from_feedback(tmp_path):
    history = History(tmp_path)
    d = decide_in(history, email("newsletter"))
    assert d.email_type == "newsletter"
    saved = record_classification(history, d.id, "marketing")
    assert (saved.original_type, saved.corrected_type) == ("newsletter", "marketing")
    assert history.feedback == []  # not feedback Oscar learns his autonomy from
    assert History(tmp_path).classification_for(d.email_id).corrected_type == "marketing"  # kept on disk


def test_a_correction_never_changes_what_he_learned_about_autonomy():
    history = History()
    d = decide_in(history, email("newsletter"))
    before = (evidence(history), Preferences.from_feedback(teaching(history)).records.keys())
    record_classification(history, d.id, "job_alert")
    assert (evidence(history), Preferences.from_feedback(teaching(history)).records.keys()) == before


def test_corrections_are_checked():
    history = History()
    d = decide_in(history, email("newsletter"))
    with pytest.raises(ClassificationError):
        record_classification(history, d.id, "not_a_kind")
    with pytest.raises(ClassificationError):
        record_classification(history, d.id, "newsletter")  # already what he has it as
    with pytest.raises(ClassificationError):
        record_classification(history, "nope", "marketing")


def test_the_next_email_from_that_sender_reads_as_what_you_said_but_does_the_same():
    history = History()
    first = decide_in(history, email("newsletter"))
    record_classification(history, first.id, "receipt")
    again = decide_in(history, email("newsletter", id="newsletter-2"))
    assert again.email_type == "receipt" and again.type_from_you
    assert (again.action, again.autonomy_level) == (first.action, first.autonomy_level)
    assert "You told me what this sender's emails are" in again.factors
    other = decide_in(history, email("newsletter", id="n3", sender="digest@another.example"))
    assert other.email_type == "newsletter" and not other.type_from_you  # only that sender


def test_a_correction_never_replaces_a_risky_reading():
    history = History()
    wire = decide_in(history, email("vendor_wire"))
    assert wire.autonomy_level == AutonomyLevel.ESCALATE
    record_classification(history, wire.id, "newsletter")
    again = decide_in(history, email("vendor_wire", id="vendor_wire-2"))
    assert again.autonomy_level == AutonomyLevel.ESCALATE and again.action == Action.MOVE_MONEY
    assert not again.type_from_you


def test_risky_and_other_corrections_are_never_used_to_read_later_emails():
    history = History()
    d = decide_in(history, email("newsletter"))
    record_classification(history, d.id, "scam")
    assert type_hints(history) == {}
    record_classification(history, d.id, "other")
    assert type_hints(history) == {}
    record_classification(history, d.id, "marketing")
    assert type_hints(history) == {d.sender: "marketing"}
    assert type_hints(history, skip_email=d.email_id) == {}  # a re-read never learns its own answer


def test_api_classification_and_types(client):
    [newsletter] = [d for d in client.post("/demo/inbox").json() if d["email_id"] == "newsletter"]
    types = client.get("/email-types").json()
    assert {"type": "job_alert", "risky": False} in types and {"type": "money_request", "risky": True} in types
    response = client.post("/classifications", json={"decision_id": newsletter["id"], "email_type": "job_alert"})
    assert response.status_code == 200
    [item] = [i for i in client.get("/decisions").json() if i["decision"]["id"] == newsletter["id"]]
    assert item["classification"]["corrected_type"] == "job_alert" and item["feedback"] == []
    assert client.post("/classifications", json={"decision_id": newsletter["id"], "email_type": "zzz"}).status_code == 400


# --- Safety review -------------------------------------------------------------------------------

def test_a_safety_review_never_makes_a_risky_email_safe():
    history = History()
    wire = decide_in(history, email("vendor_wire"))
    review, classified = record_safety_review(history, wire.id, "MISCLASSIFIED", "account_update", "It's a statement")
    assert review.verdict == "MISCLASSIFIED" and classified.corrected_type == "account_update"
    assert evidence(history) == 0  # teaches his autonomy nothing
    again = decide_in(history, email("vendor_wire", id="vendor_wire-2"))
    assert again.autonomy_level == AutonomyLevel.ESCALATE and again.action == Action.MOVE_MONEY


def test_a_safety_review_counts_as_looking_at_it():
    history = History()
    wire = decide_in(history, email("vendor_wire"))
    assert wire in needs_you(history)[AutonomyLevel.ESCALATE]
    record_safety_review(history, wire.id, "RISK_CORRECT")
    assert wire not in needs_you(history)[AutonomyLevel.ESCALATE]


def test_safety_reviews_are_only_for_safety_stops():
    history = History()
    newsletter = decide_in(history, email("newsletter"))
    wire = decide_in(history, email("vendor_wire"))
    with pytest.raises(SafetyReviewError):
        record_safety_review(history, newsletter.id, "RISK_CORRECT")
    with pytest.raises(SafetyReviewError):
        record_safety_review(history, wire.id, "RISK_CORRECT", "newsletter")  # nothing to correct if it was right
    with pytest.raises(SafetyReviewError):
        record_safety_review(history, wire.id, "MISCLASSIFIED", "zzz")


def test_api_safety_review(client):
    [wire] = [d for d in client.post("/demo/inbox").json() if d["email_id"] == "vendor_wire"]
    response = client.post("/safety-reviews", json={"decision_id": wire["id"], "verdict": "RISK_CORRECT"})
    assert response.status_code == 200
    [item] = [i for i in client.get("/decisions").json() if i["decision"]["id"] == wire["id"]]
    assert item["safety_review"]["verdict"] == "RISK_CORRECT" and item["safety_review"]["flags"]


# --- Your categories -----------------------------------------------------------------------------

def test_categories_are_kept_and_never_change_a_decision(tmp_path):
    history = History(tmp_path)
    first = decide_in(history, email("newsletter"))
    shopping = create(history, "  Shopping ")
    assert shopping.name == "Shopping"
    assign(history, "Morning Brew <Digest@MorningBrew-weekly.example>", shopping.id)
    assert listing(history)[0]["senders"] == ["digest@morningbrew-weekly.example"]
    rename(history, shopping.id, "Reading")
    again = decide_in(history, email("newsletter", id="newsletter-2"))
    assert (again.action, again.autonomy_level, again.email_type) == (first.action, first.autonomy_level, first.email_type)
    saved = History(tmp_path)
    assert [c.name for c in saved.categories] == ["Reading"] and saved.sender_categories
    delete(saved, shopping.id)
    assert saved.categories == [] and saved.sender_categories == {}


def test_categories_are_checked():
    history = History()
    create(history, "School")
    with pytest.raises(CategoryError):
        create(history, "school")  # already have it
    with pytest.raises(CategoryError):
        create(history, "   ")
    with pytest.raises(CategoryError):
        assign(history, "a@b.example", "missing")


def test_api_categories(client):
    made = client.post("/categories", json={"name": "Family"}).json()
    assert client.post("/categories/assign", json={"sender": "mom@home.example", "category_id": made["id"]}).json() == {"ok": True}
    assert client.get("/categories").json()[0]["senders"] == ["mom@home.example"]
    assert client.post("/categories/assign", json={"sender": "mom@home.example", "category_id": None}).status_code == 200
    assert client.post(f"/categories/{made['id']}/rename", json={"name": "Home"}).json()["name"] == "Home"
    assert client.post("/categories", json={"name": "home"}).status_code == 400
    assert client.post(f"/categories/{made['id']}/delete", json={}).json() == {"ok": True}
    assert client.get("/categories").json() == []


def test_clear_forgets_the_new_records_too(tmp_path):
    history = History(tmp_path)
    d = decide_in(history, email("newsletter"))
    record_classification(history, d.id, "marketing")
    create(history, "Shopping")
    history.clear()
    reloaded = History(tmp_path)
    assert reloaded.classifications == [] and reloaded.categories == []
    assert not (tmp_path / "categories.json").exists()


# --- Patterns ------------------------------------------------------------------------------------

def test_patterns_say_what_they_rest_on(client):
    decisions = client.post("/demo/inbox").json()
    [newsletter] = [d for d in decisions if d["email_id"] == "newsletter"]
    client.post("/feedback", json={"decision_id": newsletter["id"], "kind": "ALWAYS_DO_THIS", "scope": "kind",
                                   "desired_level": "PROCEED_SILENTLY"})
    rows = client.get("/patterns").json()
    [rule] = [r for r in rows if r["scope"] == "kind" and r["action"] == "ARCHIVE"]
    assert rule["status"] == "rule" and rule["decision_id"] == newsletter["id"]
    assert json.dumps(rows)  # plain JSON for the app


def test_a_domain_with_one_sender_is_not_a_pattern():
    from oscar.feedback import FeedbackKind, record_feedback
    from oscar.overview import patterns

    history = History()
    for n, sender in enumerate(["deals@one-shop.example", "news@one-shop.example", "hi@other-shop.example"]):
        d = decide_in(history, email("newsletter", id=f"n{n}", sender=sender))
        record_feedback(history, d.id, FeedbackKind.JUST_HANDLE_IT)
    domains = {r["name"] for r in patterns(history) if r["scope"] == "domain"}
    assert domains == {"one-shop.example"}, "two senders there is a start; one is only that sender"


def test_an_approval_alone_is_not_a_pattern():
    from oscar.feedback import FeedbackKind, record_feedback
    from oscar.overview import patterns

    history = History()
    for n, sender in enumerate(["deals@a-shop.example", "deals@b-shop.example", "deals@c-shop.example"]):
        record_feedback(history, decide_in(history, email("newsletter", id=f"n{n}", sender=sender)).id, FeedbackKind.APPROVE)
    assert patterns(history) == [], "approving says the action was right, not how much to ask, so there's nothing to learn from yet"
