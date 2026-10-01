"""Smoke tests: Oscar runs end to end and returns well-formed decisions."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from oscar.agent import decide, explain
from oscar.api import app
from oscar.models import Action, AutonomyLevel, Email
from oscar.policy import POLICY

EMAILS_DIR = Path(__file__).resolve().parent.parent / "emails"
EXAMPLES = sorted(EMAILS_DIR.glob("*.json"))


def load(path: Path) -> Email:
    return Email.model_validate_json(path.read_text())


def test_policy_covers_every_action():
    assert set(POLICY) == set(Action)


@pytest.mark.parametrize("path", EXAMPLES, ids=lambda p: p.stem)
def test_every_example_gets_a_decision(path):
    email = load(path)
    decision = decide(email)
    assert decision.email_id == email.id
    assert decision.autonomy_level == POLICY[decision.action][0]
    assert decision.explanation


def test_every_action_is_reachable_from_examples():
    reached = {decide(load(p)).action for p in EXAMPLES}
    assert reached == set(Action)


def test_every_level_is_reachable_from_examples():
    reached = {decide(load(p)).autonomy_level for p in EXAMPLES}
    assert reached == set(AutonomyLevel)


def test_money_mention_alone_is_not_move_money():
    decision = decide(load(EMAILS_DIR / "invoice_notice.json"))
    assert decision.action != Action.MOVE_MONEY


def test_unmatched_email_falls_back_to_mark_read():
    email = Email(id="plain", sender="a@b.example", subject="hello", body="nice to meet you")
    decision = decide(email)
    assert decision.action == Action.MARK_READ
    assert decision.matched_pattern is None


def test_post_decide():
    client = TestClient(app)
    payload = load(EMAILS_DIR / "vendor_wire.json").model_dump()
    response = client.post("/decide", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "MOVE_MONEY"
    assert body["autonomy_level"] == "ESCALATE"


def test_post_decide_rejects_malformed_email():
    client = TestClient(app)
    response = client.post("/decide", json={"id": "x"})
    assert response.status_code == 422


@pytest.mark.parametrize("level", list(AutonomyLevel))
@pytest.mark.parametrize("action", list(Action))
def test_every_action_can_be_explained_at_every_level(action, level):
    assert explain(action, level, "test reason", None)
