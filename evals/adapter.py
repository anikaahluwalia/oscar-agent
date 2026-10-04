"""Run one scenario through the real Oscar, in the simulated email world, and record everything.

The same pipeline as the app: oscar.inbox.sync reads the email through Oscar's Gmail client,
oscar.agent.decide makes the call, and oscar.act does it if it's his to do. Only the world
(evals.simulated_email_provider) is pretend. Each run starts from a fresh history, so nothing
an eval does is ever written to what Oscar has learned.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from evals.graders import attempted_alone, grade
from evals.simulated_email_provider import SimulatedEmailProvider, gmail_message
from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.history import History
from oscar.inbox import sync
from oscar.models import Action, AutonomyLevel
from oscar.understand import Reader

ACTING_SINCE = datetime(2000, 1, 1, tzinfo=timezone.utc)  # every scenario email arrived after acting was turned on


class Config(str, Enum):
    """What's switched on. Safety off only ever runs in the simulated world."""

    BASELINE = "BASELINE"  # no safety rules, nothing learned
    SAFETY_ONLY = "SAFETY_ONLY"  # safety rules, nothing learned
    FULL = "FULL"  # safety rules and what you've taught him
    LEARNING_ONLY = "LEARNING_ONLY"  # what you've taught him with the safety rules off: what the floor protects against

    @property
    def safety(self) -> bool:
        return self in (Config.SAFETY_ONLY, Config.FULL)

    @property
    def learning(self) -> bool:
        return self in (Config.FULL, Config.LEARNING_ONLY)


class ScenarioEmail(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    sender: str = Field(alias="from")
    subject: str
    body: str
    bulk: bool = False
    category: str | None = None


class Taught(BaseModel):
    """Feedback the user gave before this email arrived. The default is "just handle them"
    (JUST_HANDLE_IT), because approving alone only says the action was right, not how much to ask."""

    action: Action
    feedback: FeedbackKind = FeedbackKind.JUST_HANDLE_IT
    times: int = 1
    email_type: str = "unknown"
    sender: str | None = None  # defaults to the scenario's sender


class UserContext(BaseModel):
    known_sender: bool = False  # you've emailed them before
    explicit_authorizations: list[str] = Field(default_factory=list)  # Oscar has no way to use these yet; kept for the record
    learned: list[Taught] = Field(default_factory=list)


class Expected(BaseModel):
    autonomy: AutonomyLevel
    action: Action | None = None
    world_state: dict = Field(default_factory=dict)  # archived, read, labels, unchanged, question_to_user, escalated


class Scenario(BaseModel):
    id: str
    pair_id: str | None = None
    variant: Literal["trap", "control", "single"] = "single"
    split: Literal["train", "validation", "test"] = "test"
    email: ScenarioEmail
    user_context: UserContext = Field(default_factory=UserContext)
    expected: Expected
    forbidden_effects: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class NoReader:
    """No model reading: the rules alone. Never falls back to the app's own reader (and its key)."""

    def read(self, email):  # noqa: ANN001
        return None


def address(sender: str) -> str:
    return sender.split("<")[-1].rstrip(">").strip().lower()


def taught_events(scenario: Scenario) -> list[FeedbackEvent]:
    sender = address(scenario.email.sender)
    return [FeedbackEvent(decision_id=f"taught-{scenario.id}-{i}-{j}", kind=t.feedback, action=t.action,
                          autonomy_level=AutonomyLevel.ASK_FIRST, sender=t.sender or sender, email_type=t.email_type,
                          created_at=datetime(2001, 1, 1, tzinfo=timezone.utc))
            for i, t in enumerate(scenario.user_context.learned) for j in range(t.times)]


def run_once(scenario: Scenario, config: Config, run_index: int, reader: Reader | NoReader | None = None,
             history: History | None = None) -> dict:
    """One run of one scenario. history: a learning experiment's memory, carried between rounds;
    otherwise every run starts fresh."""
    provider = SimulatedEmailProvider(
        [gmail_message(scenario.id, scenario.email.sender, scenario.email.subject, scenario.email.body,
                       bulk=scenario.email.bulk, category=scenario.email.category)],
        emailed={address(scenario.email.sender)} if scenario.user_context.known_sender else set())
    assert config.safety or isinstance(provider, SimulatedEmailProvider), "safety off only in the simulated world"

    history = history if history is not None else History()
    if config.learning and not history.feedback:
        history.feedback.extend(taught_events(scenario))
    learned_before = len(history.feedback)
    world_before = provider.world()
    sync(history, provider.client(), reader=reader or NoReader(), act_since=ACTING_SINCE, safety=config.safety)
    decision = next(d for d in history.decisions.values() if d.email_id == scenario.id)
    world_after = provider.world()
    attempts = attempted_alone(decision)
    trace = provider.trace + [{"order": len(provider.trace) + 1 + i, **a} for i, a in enumerate(attempts)]
    assert len(history.feedback) == learned_before, "an eval run must never teach Oscar anything"
    return {
        "scenario_id": scenario.id,
        "pair_id": scenario.pair_id,
        "variant": scenario.variant,
        "tags": scenario.tags,
        "run_index": run_index,
        "expected": scenario.expected.model_dump(mode="json"),
        "config": config.value,
        "decision": {"autonomy": decision.autonomy_level.value, "proposed_action": decision.action.value,
                     "confidence": decision.confidence, "level_source": decision.level_source,
                     "message": decision.message, "factors": decision.factors},
        "safety": {"floor": decision.safety_floor.value if decision.safety_floor else None,
                   "triggered_rules": [f.value for f in decision.safety_flags] + ([decision.safety_rule] if decision.safety_rule else []),
                   "blocked": any(not t["allowed"] for t in trace)},
        "preference": (decision.preference.model_dump() if decision.preference else
                       {"scope": None, "evidence": 0, "confidence": None}),
        "trace": trace,
        "world_before": world_before,
        "world_after": world_after,
        "grading": grade(scenario, decision, world_before, world_after, trace),
    }
