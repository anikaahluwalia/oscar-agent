"""Stage 2 baseline scenarios.

Each scenario says what Oscar should do. Scenarios Oscar gets wrong today have a
known_failure and are marked xfail(strict=True), so a later stage that fixes one
has to remove the marker.
"""

import json
from pathlib import Path

import pytest

from oscar import policy
from oscar.agent import decide
from oscar.models import Action, AutonomyLevel, Email

SCENARIOS_FILE = Path(__file__).resolve().parent.parent / "scenarios" / "baseline.json"
SCENARIOS = json.loads(SCENARIOS_FILE.read_text())
CATEGORIES = {"too_permissive", "too_cautious", "inconsistent", "control"}


def as_param(scenario):
    marks = []
    if scenario["known_failure"]:
        marks.append(pytest.mark.xfail(strict=True, reason=scenario["known_failure"]))
    return pytest.param(scenario, id=scenario["id"], marks=marks)


@pytest.mark.parametrize("scenario", [as_param(s) for s in SCENARIOS])
def test_scenario(scenario):
    email = Email(id=scenario["id"], **scenario["email"])
    decision = decide(email)
    expected = scenario["expected"]

    assert decision.autonomy_level == AutonomyLevel(expected["level"])
    if "action" in expected:
        assert decision.action == Action(expected["action"])


def test_scenario_ids_are_unique():
    ids = [s["id"] for s in SCENARIOS]
    assert len(ids) == len(set(ids))


def test_scenario_categories_are_known():
    assert {s["category"] for s in SCENARIOS} <= CATEGORIES


def test_pairs_have_two_scenarios():
    pairs = {}
    for s in SCENARIOS:
        if "pair" in s:
            pairs.setdefault(s["pair"], []).append(s["id"])
    assert all(len(ids) == 2 for ids in pairs.values()), pairs


def test_controls_are_not_known_failures():
    assert all(s["known_failure"] is None for s in SCENARIOS if s["category"] == "control")


# Nothing stops the policy table from being changed. If the table (or later,
# learning) lowers one of these actions, Oscar just does it.
@pytest.mark.xfail(strict=True, reason="No safety floor: lowering the policy table lets Oscar act on its own.")
@pytest.mark.parametrize("action", [Action.MOVE_MONEY, Action.SEND_CREDENTIALS, Action.PERMANENTLY_DELETE])
def test_risky_actions_cannot_be_lowered(monkeypatch, action):
    monkeypatch.setitem(policy.POLICY, action, (AutonomyLevel.PROCEED_SILENTLY, "test override"))
    level, _ = policy.autonomy_for(action)
    assert level in (AutonomyLevel.ASK_FIRST, AutonomyLevel.ESCALATE)
