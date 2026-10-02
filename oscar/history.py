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


def real_inbox_dir(data_dir: Path | None = None) -> Path:
    """Where the real inbox's history is kept: one folder per Gmail account, for the last one connected."""
    gmail = (data_dir or default_data_dir()) / "gmail"
    account = gmail / "account.txt"
    address = account.read_text().strip() if account.exists() else "none"
    return gmail / "accounts" / address.replace("/", "_")


class History:
    def __init__(self, data_dir: Path | None = None) -> None:
        self.decisions: dict[str, Decision] = {}
        self.feedback: list[FeedbackEvent] = []
        # Real inbox only: your reviews of Oscar's decisions (kept apart from feedback,
        # which he learns from), and what you later did with each email in Gmail.
        self.reviews: list[Review] = []
        self.follow_ups: list[FollowUp] = []
        self.settings: dict = {}  # this inbox's preferences, e.g. {"bulk_action": "MARK_READ"}
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

    def reviews_for_email(self, email_id: str) -> list[tuple[Decision, Review]]:
        """Your latest review of each read of one email, oldest first."""
        out = [(d, r) for d in self.decisions.values() if d.email_id == email_id and (r := self.review_for(d.id))]
        return sorted(out, key=lambda pair: pair[1].reviewed_at)

    def answer_for_email(self, email_id: str) -> tuple[Decision, Review] | None:
        """Your latest full answer (what Oscar should have done) for an email, on whichever read of it."""
        full = [(d, r) for d, r in self.reviews_for_email(email_id) if r.has_answer]
        return full[-1] if full else None

    def review_carried_over(self, decision_id: str) -> Review | None:
        """The review that stands for a decision. A full answer (what Oscar should have done) is about
        the email, so it stands for every read of it, and each read is graded against it. An old
        half-answer only carries over to a re-read that decided the same thing; one that changed
        its mind goes back to review."""
        decision = self.decisions.get(decision_id)
        if decision is None:
            return None
        full = self.answer_for_email(decision.email_id)
        if full:
            return full[1]
        same = True
        while decision is not None:
            review = self.review_for(decision.id)
            if review:
                return review if same else None
            earlier = self.decisions.get(decision.recheck_of) if decision.recheck_of else None
            if earlier is None:
                return None
            same = same and (earlier.action, earlier.autonomy_level) == (decision.action, decision.autonomy_level)
            decision = earlier
        return None

    def add_follow_up(self, follow_up: FollowUp) -> None:
        self.follow_ups.append(follow_up)
        self._append("follow_ups.jsonl", follow_up.model_dump_json())

    def set_setting(self, name: str, value) -> None:
        self.settings[name] = value
        if self.data_dir is not None:
            import json

            (self.data_dir / "settings.json").write_text(json.dumps(self.settings))

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
        settings = self.data_dir / "settings.json"
        if settings.exists():
            import json

            self.settings = json.loads(settings.read_text())

    def _read_lines(self, filename: str) -> list[str]:
        path = self.data_dir / filename
        if not path.exists():
            return []
        return [line for line in path.read_text().splitlines() if line.strip()]
