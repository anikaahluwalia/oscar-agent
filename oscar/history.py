"""Keeps Oscar's decisions so feedback can point back to them."""

from oscar.models import Decision


class History:
    def __init__(self) -> None:
        self.decisions: dict[str, Decision] = {}

    def add_decision(self, decision: Decision) -> None:
        self.decisions[decision.id] = decision

    def get_decision(self, decision_id: str) -> Decision | None:
        return self.decisions.get(decision_id)
