"""Keeps Oscar's decisions and the feedback given on them."""

from __future__ import annotations

from typing import TYPE_CHECKING

from oscar.models import Decision

if TYPE_CHECKING:
    from oscar.feedback import FeedbackEvent


class History:
    def __init__(self) -> None:
        self.decisions: dict[str, Decision] = {}
        self.feedback: list[FeedbackEvent] = []

    def add_decision(self, decision: Decision) -> None:
        self.decisions[decision.id] = decision

    def get_decision(self, decision_id: str) -> Decision | None:
        return self.decisions.get(decision_id)

    def add_feedback(self, event: FeedbackEvent) -> None:
        self.feedback.append(event)

    def feedback_for(self, decision_id: str) -> list[FeedbackEvent]:
        return [e for e in self.feedback if e.decision_id == decision_id]
