"""Keeps Oscar's decisions and the feedback given on them.

If a data folder is given, everything is also appended to JSON Lines files
there and loaded back on startup. Without one, history only lives in memory.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING

from oscar.models import Decision

if TYPE_CHECKING:
    from oscar.feedback import FeedbackEvent
    from oscar.inbox import FollowUp
    from oscar.review import Review


def default_data_dir() -> Path:
    return Path(os.environ.get("OSCAR_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))


class History:
    def __init__(self, data_dir: Path | None = None) -> None:
        self.decisions: dict[str, Decision] = {}
        self.feedback: list[FeedbackEvent] = []
        # Real inbox only: your reviews of Oscar's decisions (kept apart from feedback,
        # which he learns from), and what you later did with each email in Gmail.
        self.reviews: list[Review] = []
        self.follow_ups: list[FollowUp] = []
        self.data_dir = data_dir
        if data_dir is not None:
            data_dir.mkdir(parents=True, exist_ok=True)
            self._load()

    def add_decision(self, decision: Decision) -> None:
        self.decisions[decision.id] = decision
        self._append("decisions.jsonl", decision.model_dump_json())

    def get_decision(self, decision_id: str) -> Decision | None:
        return self.decisions.get(decision_id)

    def add_feedback(self, event: FeedbackEvent) -> None:
        self.feedback.append(event)
        self._append("feedback.jsonl", event.model_dump_json())

    def feedback_for(self, decision_id: str) -> list[FeedbackEvent]:
        return [e for e in self.feedback if e.decision_id == decision_id]

    def add_review(self, review: Review) -> None:
        self.reviews.append(review)
        self._append("reviews.jsonl", review.model_dump_json())

    def review_for(self, decision_id: str) -> Review | None:
        """The latest review of a decision. Reviewing again replaces the earlier one."""
        return next((r for r in reversed(self.reviews) if r.decision_id == decision_id), None)

    def add_follow_up(self, follow_up: FollowUp) -> None:
        self.follow_ups.append(follow_up)
        self._append("follow_ups.jsonl", follow_up.model_dump_json())

    def clear(self) -> None:
        """Forget everything, including the saved files."""
        self.decisions.clear()
        self.feedback.clear()
        self.reviews.clear()
        self.follow_ups.clear()
        if self.data_dir is not None:
            for name in ("decisions.jsonl", "feedback.jsonl", "reviews.jsonl", "follow_ups.jsonl"):
                (self.data_dir / name).unlink(missing_ok=True)

    def _append(self, filename: str, line: str) -> None:
        if self.data_dir is None:
            return
        with open(self.data_dir / filename, "a") as f:
            f.write(line + "\n")

    def _load(self) -> None:
        from oscar.feedback import FeedbackEvent
        from oscar.inbox import FollowUp
        from oscar.review import Review

        for line in self._read_lines("decisions.jsonl"):
            decision = Decision.model_validate_json(line)
            self.decisions[decision.id] = decision
        for line in self._read_lines("feedback.jsonl"):
            self.feedback.append(FeedbackEvent.model_validate_json(line))
        for line in self._read_lines("reviews.jsonl"):
            self.reviews.append(Review.model_validate_json(line))
        for line in self._read_lines("follow_ups.jsonl"):
            self.follow_ups.append(FollowUp.model_validate_json(line))

    def _read_lines(self, filename: str) -> list[str]:
        path = self.data_dir / filename
        if not path.exists():
            return []
        return [line for line in path.read_text().splitlines() if line.strip()]
