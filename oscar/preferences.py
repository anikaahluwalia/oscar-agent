"""What Oscar has learned from your feedback.

Only your feedback counts: the buttons in the app, your Review answers, and rules you
confirm in the chat. Email text never becomes feedback.

Each piece of feedback is evidence for one of the four levels (see feedback.normalize):
an okay says doing it on his own was fine, a no or an undo says he should have asked,
and a Review answer says the level outright. For each scope Oscar keeps a count per
level, starting at 1 each (a Dirichlet prior), so

    desired level = the level with the most evidence
    confidence    = its share of all the counts

Scopes, most specific first. The most specific one with something to say wins:

    sender + kind of email + action
    sender + action                  (any email from them)
    domain + kind of email + action  (needs 2 senders at that domain)
    kind of email + action           (needs 3 senders)

He only does more on his own with at least MIN_EVIDENCE answers and MIN_CONFIDENCE
confidence: 4 okays to do it and tell you, 8 to do it quietly. The broad scopes (domain,
kind) never go past "do it and tell you", and only for actions that are easy to undo, so
what you taught him about some senders never makes a new one quiet.

Making him more careful needs less: one no or undo stops quiet, two undos go back to asking.
"Always ask me" and "always do this" are rules from you, not evidence, and the newer one
wins. This only suggests a level: the safety floor and the email checks run after it, so
learning can't make a risky action less safe.
"""

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from typing import NamedTuple

from oscar.feedback import FeedbackEvent, FeedbackKind, Learned, normalize
from oscar.models import Action, AutonomyLevel
from oscar.policy import autonomy_for
from oscar.safety import is_stricter

S, N, A, E = (AutonomyLevel.PROCEED_SILENTLY, AutonomyLevel.PROCEED_AND_NOTIFY,
              AutonomyLevel.ASK_FIRST, AutonomyLevel.ESCALATE)
PRIOR = 1.0
EVIDENCE_FOR: dict[Learned, AutonomyLevel] = {
    Learned.SHOULD_BE_SILENT: S, Learned.SHOULD_NOTIFY: N, Learned.SHOULD_ASK: A, Learned.SHOULD_ESCALATE: E,
}
WEIGHT = {FeedbackKind.UNDO: 2.0}  # undoing something he did counts double


@dataclass(frozen=True)
class Policy:
    """How much feedback it takes for Oscar to do more on his own. Named, so runs with
    different thresholds can be compared, and recorded with every eval run."""

    name: str
    min_evidence: float = 3  # answers before learning can give him more autonomy
    min_confidence: float = 0.75
    ask_at_or_below: float = 0.25  # after a no or an undo: back to asking when okays are this share or less
    broad: bool = True  # learn across senders (domain, then kind of email), never past notify
    domain_senders: int = 2  # senders at a domain before the domain counts
    kind_senders: int = 3  # senders of a kind of email before the kind counts

    def describe(self) -> dict:
        return {"name": self.name, "min_evidence": self.min_evidence, "min_confidence": self.min_confidence,
                "ask_at_or_below": self.ask_at_or_below, "broad": self.broad, "domain_senders": self.domain_senders, "kind_senders": self.kind_senders}


DEFAULT_POLICY = Policy("default-p2")
POLICIES: dict[str, Policy] = {
    p.name: p for p in (
        DEFAULT_POLICY,
        Policy("careful-p2", min_evidence=5, min_confidence=0.85, ask_at_or_below=0.35, domain_senders=3, kind_senders=5),
        Policy("per-sender-p2", broad=False),  # learning one sender at a time only, for comparison
    )
}

# Actions a habit can carry over to other emails: easy to undo, and they never leave the
# mailbox. Replies, forwards, deletes and the rest never do.
HABIT_ACTIONS = {Action.MARK_READ, Action.ARCHIVE, Action.APPLY_LABEL}

# Kinds of email that count as the same, whoever names them (the rules or the model).
FAMILIES = {
    "newsletter": "bulk_mail", "promotion": "bulk_mail", "bulk": "bulk_mail", "marketing": "bulk_mail",
    "job_alert": "bulk_mail", "receipt": "receipt", "fyi": "fyi", "account_update": "fyi",
    "social_notification": "notification",
}

# Free email domains: two people at gmail.com have nothing in common.
SHARED_DOMAINS = {"gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com",
                  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com"}

# The most autonomy an action can ever learn. Drafts stop at notify: a draft you don't
# know about is no use to you.
CEILINGS: dict[Action, AutonomyLevel] = {Action.DRAFT_REPLY: N}


def family(email_type: str | None) -> str | None:
    """The kind of email, for learning: a family when there is one, else the type itself."""
    if not email_type or email_type in ("unknown", "unspecified"):
        return None
    return FAMILIES.get(email_type, email_type)


def domain_of(sender: str) -> str | None:
    address = sender.split("<")[-1].rstrip(">").strip().lower()
    domain = address.rsplit("@", 1)[-1] if "@" in address else None
    return None if not domain or domain in SHARED_DOMAINS else domain


@dataclass
class Record:
    """What Oscar has learned for one scope. Every field comes from your feedback."""

    scope: tuple  # ("sender", sender, kind, action), ("sender", sender, action), ("domain", ...), ("kind", ...)
    counts: dict[AutonomyLevel, float] = field(default_factory=lambda: {lvl: PRIOR for lvl in (S, N, A, E)})
    kinds: Counter = field(default_factory=Counter)  # how many of each feedback kind
    senders: set[str] = field(default_factory=set)  # who the evidence is about
    always_ask: bool = False
    always_do: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
    provenance: str = "USER_FEEDBACK"

    @property
    def evidence(self) -> float:
        return sum(self.counts.values()) - 4 * PRIOR

    @property
    def desired(self) -> AutonomyLevel:
        return max(self.counts, key=lambda lvl: (self.counts[lvl], -[S, N, A, E].index(lvl)))

    @property
    def confidence(self) -> float:
        return self.counts[self.desired] / sum(self.counts.values())

    @property
    def acting_share(self) -> float:
        """How sure he is you're fine with him doing it on his own, quietly or not."""
        return (self.counts[S] + self.counts[N]) / sum(self.counts.values())

    @property
    def positive(self) -> float:
        return self.counts[S] + self.counts[N] - 2 * PRIOR

    @property
    def negative(self) -> float:
        return self.counts[A] + self.counts[E] - 2 * PRIOR

    def add(self, event: FeedbackEvent, sender: str) -> None:
        self.created_at = self.created_at or event.created_at
        self.updated_at = event.created_at
        self.senders.add(sender)
        self.kinds[event.kind] += 1
        if event.kind in (FeedbackKind.REJECT, FeedbackKind.UNDO):
            self.always_do = False  # a newer no outranks an older "always do this"
        level = EVIDENCE_FOR.get(normalize(event))
        if event.kind == FeedbackKind.REVIEW and normalize(event) == Learned.CORRECT and event.desired_level:
            level = event.desired_level  # "Right": the level he used was the one you wanted
        if level:
            self.counts[level] += WEIGHT.get(event.kind, 1.0)

    def reason(self) -> str:
        okays = self.kinds[FeedbackKind.APPROVE] + self.kinds[FeedbackKind.EDIT_THEN_SEND]
        if self.kinds[FeedbackKind.REVIEW] and not okays:
            n = self.kinds[FeedbackKind.REVIEW]
            return f"you told me so in {n} review{'s' if n != 1 else ''}"
        if self.always_do and not okays:
            return "you told me you're fine with this"
        return f"you've okayed this {okays} times"

    def careful_reason(self) -> str:
        undos = self.kinds[FeedbackKind.UNDO]
        if undos == 1:
            return "you undid this last time"
        if undos > 1:
            return f"you undid this {undos} times"
        return "you said no to this before"


class Suggestion(NamedTuple):
    """The level feedback says Oscar should use, and where that came from."""

    level: AutonomyLevel
    reason: str
    scope: str  # "sender", "domain" or "kind"
    evidence: float
    confidence: float


class Preferences:
    def __init__(self, policy: Policy = DEFAULT_POLICY) -> None:
        self.records: dict[tuple, Record] = {}
        self.policy = policy

    @classmethod
    def from_feedback(cls, events: list[FeedbackEvent], policy: Policy = DEFAULT_POLICY) -> "Preferences":
        # Forget drops everything learned before it for that sender and action.
        kept: list[FeedbackEvent] = []
        for event in events:
            if event.kind == FeedbackKind.FORGET:
                kept = [e for e in kept if not (e.sender == event.sender and e.action == event.action)]
            else:
                kept.append(event)
        preferences = cls(policy)
        for event in kept:
            preferences.add(event)
        return preferences

    def _record(self, scope: tuple) -> Record:
        return self.records.setdefault(scope, Record(scope))

    def add(self, event: FeedbackEvent) -> None:
        # Feedback the floor blocked, or on escalated emails, says nothing about how much
        # autonomy Oscar should have. "Got it" and Forget teach nothing here.
        if event.blocked_by_floor or event.autonomy_level == E or event.kind in (FeedbackKind.SEEN, FeedbackKind.FORGET):
            return
        if normalize(event) == Learned.SKIP:
            return
        kind = family(event.email_type)
        mine = [("sender", event.sender, event.action)] + ([("sender", event.sender, kind, event.action)] if kind else [])
        if event.kind in (FeedbackKind.ALWAYS_ASK_ME, FeedbackKind.ALWAYS_DO_THIS):
            for scope in mine:  # a rule from you, about this sender: the newer one wins
                record = self._record(scope)
                record.always_ask = event.kind == FeedbackKind.ALWAYS_ASK_ME
                record.always_do = event.kind == FeedbackKind.ALWAYS_DO_THIS
                record.kinds[event.kind] += 1
                record.created_at = record.created_at or event.created_at
                record.updated_at = event.created_at
            return
        scopes = list(mine)
        domain = domain_of(event.sender)
        if kind and event.action in HABIT_ACTIONS:
            scopes.append(("kind", kind, event.action))
            if domain:
                scopes.append(("domain", domain, kind, event.action))
        for scope in scopes:
            self._record(scope).add(event, event.sender)

    # --- what he'd do --------------------------------------------------------------

    def _judge(self, record: Record, action: Action, level: AutonomyLevel, broad: bool) -> Suggestion | None:
        """What one scope says, or None if it has nothing to say."""
        scope = record.scope[0]
        info = (scope, round(record.evidence, 2), round(record.confidence, 3))
        if record.always_ask and not broad:
            return None if level == E else Suggestion(A, "you asked me to always check with you on these", *info)
        p = self.policy
        enough = record.evidence >= p.min_evidence
        desired = record.desired if enough and record.confidence >= p.min_confidence else None
        if desired is None and enough and record.acting_share >= p.min_confidence:
            desired = N  # sure you're fine with him doing it, not yet that you don't want to hear
        if desired in (S, N):
            if broad or action in CEILINGS:
                desired = N
            reason = record.reason() if not broad else self._broad_reason(record)
            return Suggestion(desired, reason, *info)
        if record.always_do and not broad:
            return Suggestion(N, "you told me you're fine with this", *info)
        if desired in (A, E):
            return Suggestion(desired, record.careful_reason(), *info) if is_stricter(desired, level) else None
        if record.negative > 0 and not broad:
            # A no or an undo he hasn't earned back: never quietly, and back to asking once
            # okays are a small share (two undos do it).
            careful = A if record.acting_share <= p.ask_at_or_below else N
            if is_stricter(careful, level):
                return Suggestion(careful, record.careful_reason(), *info)
        return None

    def _broad_reason(self, record: Record) -> str:
        n = len(record.senders)
        if record.scope[0] == "domain":
            return f"you've okayed this for {n} senders at {record.scope[1]}"
        return f"you've okayed this for emails like it from {n} senders"

    def _trusted(self, sender: str, action: Action) -> bool | None:
        """Whether you've taught Oscar this action for this sender on its own: True (earned), False
        (you turned it down), None (not enough to say)."""
        record = self.records.get(("sender", sender, action))
        if record is None:
            return None
        if record.always_ask or (record.negative > 0 and record.acting_share <= 0.5):
            return False
        if record.evidence >= self.policy.min_evidence and record.acting_share >= self.policy.min_confidence:
            return True
        return None

    def _broad_ok(self, record: Record) -> bool:
        """A domain or a kind of email only counts once enough senders have each earned it on their
        own, and they outnumber the senders where you turned it down. One okay each from many
        senders isn't enough: a habit for some senders never makes a new one quiet, or even busy."""
        need = self.policy.domain_senders if record.scope[0] == "domain" else self.policy.kind_senders
        action = record.scope[-1]
        verdicts = [self._trusted(s, action) for s in record.senders]
        trusted, refused = verdicts.count(True), verdicts.count(False)
        return trusted >= need and trusted > refused

    def suggest(self, action: Action, level: AutonomyLevel, sender: str, email_type: str | None = None,
                broad: bool = True) -> Suggestion | None:
        """The level feedback says Oscar should use for this email, or None if feedback has nothing
        to say. broad=False keeps it to what you taught him about this sender."""
        kind = family(email_type)
        specific = ([("sender", sender, kind, action)] if kind else []) + [("sender", sender, action)]
        for scope in specific:
            record = self.records.get(scope)
            found = self._judge(record, action, level, broad=False) if record else None
            if found:
                return found
        if not (broad and self.policy.broad and kind and action in HABIT_ACTIONS):
            return None
        if any(self.records.get(s) and self.records[s].always_ask for s in specific):
            return None
        domain = domain_of(sender)
        for scope in ([("domain", domain, kind, action)] if domain else []) + [("kind", kind, action)]:
            record = self.records.get(scope)
            if record and self._broad_ok(record):
                found = self._judge(record, action, level, broad=True)
                if found:
                    return found
        return None

    def habit(self, sender: str, email_type: str | None = None) -> Action | None:
        """The easy-to-undo action you've clearly taught Oscar for this sender's email (or, with a
        kind of email, for emails like it from senders like it), if there is one. "Clearly" means
        it would be trusted at least to do and tell you. The one with the most evidence wins."""
        best: tuple[Action, float] | None = None
        for action in HABIT_ACTIONS:
            found = self.suggest(action, A, sender, email_type)
            if found and found.level in (S, N) and (best is None or found.evidence > best[1]):
                best = (action, found.evidence)
        return best[0] if best else None

    def has(self, sender: str, action: Action) -> bool:
        """Whether you've taught Oscar anything about this action for this sender."""
        return ("sender", sender, action) in self.records

    def knows(self, sender: str) -> bool:
        return any(scope[0] == "sender" and scope[1] == sender for scope in self.records)

    def summary(self) -> list[dict]:
        """What Oscar has learned, one row per sender and action with feedback."""
        rows = []
        for scope, record in self.records.items():
            if scope[0] != "sender" or len(scope) != 3:
                continue
            _, sender, action = scope
            suggestion = self.suggest(action, autonomy_for(action)[0], sender, broad=False)
            rows.append({
                "sender": sender,
                "action": action,
                "yes": record.positive,
                "no": record.negative,
                "mean": round(record.acting_share, 2),
                "always_ask": record.always_ask,
                "level": suggestion.level if suggestion else None,
                "reason": suggestion.reason if suggestion else "not enough feedback yet",
                "evidence": record.evidence,
                "confidence": round(record.confidence, 3),
                "desired": record.desired,
                "provenance": record.provenance,
                "updated_at": record.updated_at,
            })
        return rows

    def broad_summary(self) -> list[dict]:
        """What carries across senders: per domain and per kind of email, once enough senders back it."""
        rows = []
        for scope, record in self.records.items():
            if scope[0] not in ("domain", "kind") or not self._broad_ok(record):
                continue
            rows.append({"scope": scope[0], "name": scope[1], "kind": scope[-2], "action": scope[-1],
                         "senders": len(record.senders), "evidence": record.evidence,
                         "confidence": round(record.confidence, 3), "desired": record.desired})
        return rows
