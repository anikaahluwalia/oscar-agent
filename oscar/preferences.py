"""What Oscar has learned from feedback.

For each sender and action Oscar keeps a Beta(yes, no) count of how often the
user was fine with it, starting from Beta(1, 1). Learning is per sender because
the same action can be right for one sender and wrong for another (archiving
most newsletters, but not the one you read). The mean yes / (yes + no) is how sure he is
that the user is fine with him doing it. Once he has enough evidence he asks less:

    3 or more, mean >= 0.8  ->  PROCEED_AND_NOTIFY
    8 or more, mean >= 0.9  ->  PROCEED_SILENTLY

If the user has undone or rejected the action and Oscar hasn't earned it back,
he gets more careful instead: he won't do it silently, and if the mean is 0.2 or
less he asks first. One undo is enough to stop silent, two to go back to asking.

"Always ask me" isn't counted as evidence. It's a rule from the user, and it
keeps the action at ASK_FIRST no matter what Oscar has learned. If the user
later says "always do this", the newer one wins and the rule is cleared.

This only suggests a level. The safety floor is applied after it, so learning
can't make a risky action less safe.
"""

from collections import Counter
from dataclasses import dataclass, field

from oscar.feedback import FeedbackEvent, FeedbackKind
from oscar.models import Action, AutonomyLevel
from oscar.policy import autonomy_for
from oscar.safety import is_stricter

PRIOR_YES = 1.0
PRIOR_NO = 1.0

# How much each kind of feedback counts as (yes, no).
WEIGHTS: dict[FeedbackKind, tuple[float, float]] = {
    FeedbackKind.APPROVE: (1, 0),
    FeedbackKind.EDIT_THEN_SEND: (1, 0),
    FeedbackKind.ALWAYS_DO_THIS: (3, 0),
    FeedbackKind.REJECT: (0, 1),
    FeedbackKind.UNDO: (0, 2),
}

@dataclass(frozen=True)
class Policy:
    """How much feedback it takes for Oscar to do more on his own. Named, so runs with
    different thresholds can be compared, and recorded with every eval run."""

    name: str
    notify_at: tuple[float, float] = (0.8, 3)  # (mean, evidence) to do it and tell you
    silent_at: tuple[float, float] = (0.9, 8)  # (mean, evidence) to do it quietly
    ask_at_or_below: float = 0.2  # mean at or below which he goes back to asking

    def describe(self) -> dict:
        return {"name": self.name, "notify_at": list(self.notify_at), "silent_at": list(self.silent_at),
                "ask_at_or_below": self.ask_at_or_below}


DEFAULT_POLICY = Policy("default-p1")
POLICIES: dict[str, Policy] = {
    p.name: p for p in (
        DEFAULT_POLICY,
        Policy("careful-p1", notify_at=(0.85, 5), silent_at=(0.95, 12), ask_at_or_below=0.3),
        Policy("independent-p1", notify_at=(0.75, 2), silent_at=(0.85, 5), ask_at_or_below=0.15),
    )
}

# Kept for code that reads the default thresholds directly.
NOTIFY_AT = DEFAULT_POLICY.notify_at
SILENT_AT = DEFAULT_POLICY.silent_at
ASK_AT_OR_BELOW = DEFAULT_POLICY.ask_at_or_below

# The most autonomy an action can ever learn. Drafts stop at notify: a draft
# you don't know about is no use to you.
CEILINGS: dict[Action, AutonomyLevel] = {
    Action.DRAFT_REPLY: AutonomyLevel.PROCEED_AND_NOTIFY,
}


@dataclass
class ActionPreference:
    yes: float = PRIOR_YES
    no: float = PRIOR_NO
    counts: Counter = field(default_factory=Counter)
    always_ask: bool = False

    @property
    def mean(self) -> float:
        return self.yes / (self.yes + self.no)

    @property
    def evidence(self) -> float:
        return self.yes + self.no - PRIOR_YES - PRIOR_NO

    def reason(self) -> str:
        if self.counts[FeedbackKind.ALWAYS_DO_THIS]:
            return "you told me you're fine with this"
        okays = self.counts[FeedbackKind.APPROVE] + self.counts[FeedbackKind.EDIT_THEN_SEND]
        return f"you've okayed this {okays} times"

    def careful_reason(self) -> str:
        undos = self.counts[FeedbackKind.UNDO]
        if undos == 1:
            return "you undid this last time"
        if undos > 1:
            return f"you undid this {undos} times"
        return "you said no to this before"


Key = tuple[str, Action]  # (sender, action)


class Preferences:
    def __init__(self, policy: Policy = DEFAULT_POLICY) -> None:
        self.by_key: dict[Key, ActionPreference] = {}
        self.policy = policy

    @classmethod
    def from_feedback(cls, events: list[FeedbackEvent], policy: Policy = DEFAULT_POLICY) -> "Preferences":
        preferences = cls(policy)
        for event in events:
            preferences.add(event)
        return preferences

    def add(self, event: FeedbackEvent) -> None:
        # Feedback the floor blocked, or on escalated emails, says nothing about
        # how much autonomy Oscar should have.
        if event.blocked_by_floor or event.autonomy_level == AutonomyLevel.ESCALATE:
            return
        pref = self.by_key.setdefault((event.sender, event.action), ActionPreference())
        if event.kind == FeedbackKind.ALWAYS_ASK_ME:
            pref.always_ask = True
            return
        if event.kind not in WEIGHTS:
            return
        if event.kind == FeedbackKind.ALWAYS_DO_THIS:
            pref.always_ask = False
        yes, no = WEIGHTS[event.kind]
        pref.yes += yes
        pref.no += no
        pref.counts[event.kind] += 1

    def summary(self) -> list[dict]:
        """What Oscar has learned, one row per sender and action with feedback."""
        rows = []
        for (sender, action), pref in self.by_key.items():
            suggestion = self.suggest(action, autonomy_for(action)[0], sender)
            rows.append({
                "sender": sender,
                "action": action,
                "yes": pref.yes - PRIOR_YES,
                "no": pref.no - PRIOR_NO,
                "mean": round(pref.mean, 2),
                "always_ask": pref.always_ask,
                "level": suggestion[0] if suggestion else None,
                "reason": suggestion[1] if suggestion else "not enough feedback yet",
            })
        return rows

    def get(self, action: Action, sender: str) -> ActionPreference:
        return self.by_key.get((sender, action), ActionPreference())

    def suggest(self, action: Action, level: AutonomyLevel, sender: str) -> tuple[AutonomyLevel, str] | None:
        """The level feedback says Oscar should use, or None if feedback has nothing to say."""
        pref = self.get(action, sender)
        if pref.always_ask:
            if level == AutonomyLevel.ESCALATE:
                return None
            return AutonomyLevel.ASK_FIRST, "you asked me to always check with you on these"
        silent_at, notify_at = self.policy.silent_at, self.policy.notify_at
        if pref.mean >= silent_at[0] and pref.evidence >= silent_at[1] and action not in CEILINGS:
            return AutonomyLevel.PROCEED_SILENTLY, pref.reason()
        if pref.mean >= notify_at[0] and pref.evidence >= notify_at[1]:
            return AutonomyLevel.PROCEED_AND_NOTIFY, pref.reason()
        if pref.no > PRIOR_NO:
            careful = AutonomyLevel.ASK_FIRST if pref.mean <= self.policy.ask_at_or_below else AutonomyLevel.PROCEED_AND_NOTIFY
            if is_stricter(careful, level):
                return careful, pref.careful_reason()
        return None
