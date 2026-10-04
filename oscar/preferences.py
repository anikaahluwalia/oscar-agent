"""What Oscar has learned from your feedback.

Only your feedback counts: the buttons in the app, your Review answers, and rules you
confirm in the chat. Email text never becomes feedback.

Two things are learned, and kept apart:

- Which action you want (archive, mark as read, label). Approve and "Yes" on the Review page
  say the action was right, Decline says it wasn't. Approving alone never changes how much he asks.
- How much he should do on his own. Only an answer that says so counts: Just handle them,
  Handle + tell me, Keep asking, a Review answer that picks a level, and a no or an undo
  (he'd have been wrong to do it alone; an undo counts double). Each is evidence for one of the
  four levels (see feedback.normalize). For each scope Oscar keeps a count per level, starting
  at 1 each (a Dirichlet prior), so

    desired level = the level with the most evidence
    confidence    = its share of all the counts, the starting 1s included

Scopes, most specific first. The most specific one with something to say wins:

    sender + kind of email + action
    sender + action                  (any email from them)
    domain + kind of email + action  (2 senders at that domain; never past "tell me")
    kind of email + action           (3 senders; can reach "quietly")

For one sender: "for emails like this" choices and "always do this" / "always ask me" are
rules from you, used straight away, and the newer one wins. Other evidence needs at least 3
answers (Policy.min_evidence) and a 75% share (Policy.min_confidence). Because each level starts
at 1, that takes more than 3 in practice: with only "quietly" answers, 4 get him to "do it and
tell you" and 8 to "quietly". Two undos and nothing else put him back to asking.

Across senders (domain, kind), only for actions that are easy to undo: the explicit
evidence from every sender adds up, with no sender having to earn it alone first. A domain or a
kind of email needs 6 answers (from at least 2 or 3 different senders). Then it's "do it and tell
you" once 75% of the counts say he can act, and "quietly" (kinds only) once 80% say quietly and
none of the last 5 answers about it said no. With only "quietly" answers, that's 6 and 11 answers. You
can also set a rule for every email of a kind ("always do this for emails like this"), used
straight away. What you said about one sender always beats what's true across senders, and a
no or an undo from a sender limits what the kind can give them.

This only suggests a level: the safety floor, the email checks and the caution backstop run
after it, so learning can't make a risky action or a risky email less safe.
"""

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import NamedTuple

from oscar.feedback import CHOICES, FeedbackEvent, FeedbackKind, Learned, action_verdict, normalize
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
    min_evidence: float = 3  # the fewest answers about one sender that learning acts on (a no or an undo acts sooner)
    min_confidence: float = 0.75
    ask_at_or_below: float = 0.25  # after a no or an undo: back to asking when okays are this share or less
    broad: bool = True  # learn across senders (domain, then kind of email)
    broad_min_evidence: float = 6  # answers across senders before a domain or kind counts
    domain_senders: int = 2  # different senders at a domain before the domain counts
    kind_senders: int = 3  # different senders of a kind of email before the kind counts
    quiet_confidence: float = 0.80  # share saying "quietly" before a kind of email is handled quietly
    recent: int = 5  # a no among the last this-many answers for a kind keeps it from going quiet

    def describe(self) -> dict:
        return {"name": self.name, "min_evidence": self.min_evidence, "min_confidence": self.min_confidence,
                "ask_at_or_below": self.ask_at_or_below, "broad": self.broad,
                "broad_min_evidence": self.broad_min_evidence, "domain_senders": self.domain_senders,
                "kind_senders": self.kind_senders, "quiet_confidence": self.quiet_confidence, "recent": self.recent}


DEFAULT_POLICY = Policy("default-p3")
POLICIES: dict[str, Policy] = {
    p.name: p for p in (
        DEFAULT_POLICY,
        Policy("careful-p3", min_evidence=5, min_confidence=0.85, ask_at_or_below=0.35, broad_min_evidence=10,
               domain_senders=3, kind_senders=5, quiet_confidence=0.9),
        Policy("per-sender-p3", broad=False),  # learning one sender at a time only, for comparison
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


EARLIEST = datetime.min.replace(tzinfo=timezone.utc)  # for a rule with no date, so any dated one is newer


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
    senders: set[str] = field(default_factory=set)  # who the evidence about the level is from
    votes: list[AutonomyLevel] = field(default_factory=list)  # the levels you said, oldest first
    approved: float = 0  # the action was right (Approve, or "Yes" on the Review page)
    declined: float = 0  # the action was wrong (Decline, or a Review answer with another action)
    always_ask: bool = False
    told: AutonomyLevel | None = None  # a level you set as a rule (quietly, or with a heads up)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    provenance: str = "USER_FEEDBACK"

    @property
    def always_do(self) -> bool:
        return self.told is not None

    @property
    def evidence(self) -> float:
        return sum(self.counts.values()) - 4 * PRIOR

    @property
    def desired(self) -> AutonomyLevel:
        return max(self.counts, key=lambda lvl: (self.counts[lvl], -[S, N, A, E].index(lvl)))

    @property
    def confidence(self) -> float:
        return self.counts[self.desired] / sum(self.counts.values())

    def share(self, level: AutonomyLevel) -> float:
        return self.counts[level] / sum(self.counts.values())

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

    def said_no_lately(self, last: int) -> bool:
        return any(level in (A, E) for level in self.votes[-last:])

    def touch(self, event: FeedbackEvent) -> None:
        self.created_at = self.created_at or event.created_at
        self.updated_at = event.created_at
        self.kinds[event.kind] += 1

    def add(self, event: FeedbackEvent, sender: str) -> None:
        self.touch(event)
        verdict = action_verdict(event)
        self.approved += verdict == "CORRECT"
        self.declined += verdict == "INCORRECT"
        if event.kind in (FeedbackKind.REJECT, FeedbackKind.UNDO) and self.scope[0] == "sender":
            # A newer no outranks an older "always do this" for that sender. A rule you set for
            # every email like this stays; the no limits that one sender instead (Preferences._capped).
            self.told = None
        level = EVIDENCE_FOR.get(normalize(event))
        if level:
            self.counts[level] += WEIGHT.get(event.kind, 1.0)
            self.votes.append(level)
            self.senders.add(sender)

    def reason(self) -> str:
        said = self.kinds[FeedbackKind.REVIEW] + sum(self.kinds[k] for k in CHOICES)
        if self.told == S:
            return "you told me to just handle these"
        if self.told == N:
            return ("you told me you're fine with this" if self.kinds[FeedbackKind.ALWAYS_DO_THIS]
                    and not any(self.kinds[k] for k in CHOICES) else "you told me to handle these and tell you")
        return f"you told me so {said} time{'s' if said != 1 else ''}"

    def careful_reason(self) -> str:
        undos = self.kinds[FeedbackKind.UNDO]
        if undos == 1:
            return "you undid this last time"
        if undos > 1:
            return f"you undid this {undos} times"
        if self.kinds[FeedbackKind.KEEP_ASKING]:
            return "you asked me to keep checking with you on these"
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
        # Forget drops everything learned before it for that sender and action, or (for a rule about
        # a kind of email) that rule.
        kept: list[FeedbackEvent] = []
        for event in events:
            if event.kind == FeedbackKind.FORGET and event.scope == "kind":
                kind = family(event.email_type)
                kept = [e for e in kept if not (e.scope == "kind" and e.action == event.action and family(e.email_type) == kind)]
            elif event.kind == FeedbackKind.FORGET:
                kept = [e for e in kept if not (e.sender == event.sender and e.action == event.action and e.scope == "sender")]
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
        broad_ok = bool(kind) and event.action in HABIT_ACTIONS

        if event.kind in (FeedbackKind.ALWAYS_ASK_ME, FeedbackKind.ALWAYS_DO_THIS):
            if event.scope == "kind":
                if broad_ok:  # a rule from you about every email of this kind: the newer one wins
                    self._rule(("kind", kind, event.action), event)
                return
            for scope in self._mine(event, kind):  # a rule from you about this sender
                self._rule(scope, event)
            return

        scopes = self._mine(event, kind)
        if event.kind in CHOICES:
            # "For emails like this": a rule for this sender straight away, and one answer
            # towards what's true across senders.
            for scope in scopes:
                self._rule(scope, event)
        if broad_ok:
            scopes = scopes + [("kind", kind, event.action)]
            domain = domain_of(event.sender)
            if domain:
                scopes.append(("domain", domain, kind, event.action))
        for scope in scopes:
            self._record(scope).add(event, event.sender)

    @staticmethod
    def _mine(event: FeedbackEvent, kind: str | None) -> list[tuple]:
        # Also kept apart by kind, and (kind None) for emails he couldn't place, so habit() can tell
        # your answers about this kind of email from your answers about the sender's other ones.
        return [("sender", event.sender, event.action), ("sender", event.sender, kind, event.action)]

    def _rule(self, scope: tuple, event: FeedbackEvent) -> None:
        record = self._record(scope)
        asks = event.kind in (FeedbackKind.ALWAYS_ASK_ME, FeedbackKind.KEEP_ASKING)
        record.always_ask = asks
        if asks:
            record.told = None
        elif event.kind in CHOICES:
            record.told = CHOICES[event.kind]
        else:  # always do this: with a heads up for a sender; for a kind, the level you picked
            record.told = event.desired_level or N
        if scope[0] != "sender" or event.kind not in CHOICES:
            record.touch(event)

    # --- what he'd do --------------------------------------------------------------

    def _judge(self, record: Record, action: Action, level: AutonomyLevel, broad: bool) -> Suggestion | None:
        """What one scope says, or None if it has nothing to say."""
        scope = record.scope[0]
        info = (scope, round(record.evidence, 2), round(record.confidence, 3))
        if record.always_ask:
            if broad:
                return Suggestion(A, "you asked me to check with you on emails like this", *info) if is_stricter(A, level) else None
            return None if level == E else Suggestion(A, "you asked me to always check with you on these", *info)
        if record.told:
            told = N if (action in CEILINGS or (broad and scope == "domain")) and record.told == S else record.told
            reason = record.reason() if not broad else "you told me to handle emails like this"
            return Suggestion(told, reason, scope, round(record.evidence, 2), 1.0)
        return self._broad_evidence(record, action, level) if broad else self._sender_evidence(record, action, level)

    def _sender_evidence(self, record: Record, action: Action, level: AutonomyLevel) -> Suggestion | None:
        p, scope = self.policy, record.scope[0]
        info = (scope, round(record.evidence, 2), round(record.confidence, 3))
        enough = record.evidence >= p.min_evidence
        desired = record.desired if enough and record.confidence >= p.min_confidence else None
        if desired is None and enough and record.acting_share >= p.min_confidence:
            desired = N  # sure you're fine with him doing it, not yet that you don't want to hear
            info = (scope, info[1], round(record.acting_share, 3))  # and that's how sure he is
        if desired in (S, N):
            return Suggestion(N if action in CEILINGS else desired, record.reason(), *info)
        if desired in (A, E):
            return Suggestion(desired, record.careful_reason(), *info) if is_stricter(desired, level) else None
        return self._careful(record, level)

    def _careful(self, record: Record, level: AutonomyLevel) -> Suggestion | None:
        """A no or an undo he hasn't earned back: never quietly, and back to asking once okays
        are a small share (two undos do it)."""
        if record.negative <= 0:
            return None
        careful = A if record.acting_share <= self.policy.ask_at_or_below else N
        if is_stricter(careful, level):
            return Suggestion(careful, record.careful_reason(), record.scope[0], round(record.evidence, 2),
                              round(record.acting_share, 3))
        return None

    def _broad_evidence(self, record: Record, action: Action, level: AutonomyLevel) -> Suggestion | None:
        """What many senders' answers say together. Every sender's answers count, but only once
        enough different senders have answered."""
        p, scope = self.policy, record.scope[0]
        need = p.domain_senders if scope == "domain" else p.kind_senders
        if record.evidence < p.broad_min_evidence or len(record.senders) < need:
            return None
        n = len(record.senders)
        reason = (f"you told me so for {n} senders at {record.scope[1]}" if scope == "domain"
                  else f"you told me so for emails like it from {n} senders")
        quiet_ok = (scope == "kind" and action not in CEILINGS and record.share(S) >= p.quiet_confidence
                    and not record.said_no_lately(p.recent))
        if quiet_ok:
            return Suggestion(S, reason, scope, round(record.evidence, 2), round(record.share(S), 3))
        if record.acting_share >= p.min_confidence:
            return Suggestion(N, reason, scope, round(record.evidence, 2), round(record.acting_share, 3))
        if record.desired in (A, E) and record.confidence >= p.min_confidence and is_stricter(record.desired, level):
            return Suggestion(record.desired, "you've said to check with you on emails like this",
                              scope, round(record.evidence, 2), round(record.confidence, 3))
        return None

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
        return self._emails_like_it(action, level, sender, kind) if broad else None

    def _emails_like_it(self, action: Action, level: AutonomyLevel, sender: str, kind: str | None) -> Suggestion | None:
        """What other senders' answers say for emails like this one (the same domain, then the same
        kind), held back by any no from this sender."""
        if not (self.policy.broad and kind and action in HABIT_ACTIONS):
            return None
        mine = [r for r in (self.records.get(("sender", sender, kind, action)), self.records.get(("sender", sender, action))) if r]
        if any(r.always_ask for r in mine):
            return None  # what you said about this sender beats what's true across senders
        domain = domain_of(sender)
        for scope in ([("domain", domain, kind, action)] if domain else []) + [("kind", kind, action)]:
            record = self.records.get(scope)
            found = self._judge(record, action, level, broad=True) if record else None
            if found:
                return self._capped(found, mine)
        return None

    def _capped(self, found: Suggestion, mine: list[Record]) -> Suggestion:
        """A no or an undo from this sender limits what emails like it can give them: back to
        asking while the no's outweigh the yeses, and never quietly until they're earned back."""
        for record in mine:
            if record.negative > 0:
                careful = A if record.negative >= record.positive else N
                if is_stricter(careful, found.level):
                    return Suggestion(careful, record.careful_reason(), "sender", round(record.evidence, 2),
                                      round(record.acting_share, 3))
        return found

    def habit(self, sender: str, email_type: str | None = None) -> Action | None:
        """The easy-to-undo action you've clearly shown you want for this sender's email (or, with a
        kind of email, for emails like it), if there is one: approved at least twice and never
        turned down, enough answers saying he could do it on his own, or one you told him to handle.

        In this order, the first with something to say wins (found replaying the real inbox, where
        two "label it"s for one job site lost to everyone else's archived job alerts):
        1. A rule you set, for this sender or for every email of this kind. The newest one wins.
        2. Your answers for this sender about this kind of email.
        3. Your answers for this sender on emails he couldn't place yet (often the same kind,
           before he could read them).
        4. What emails like it get, from other senders.
        5. Your answers for this sender about its other kinds of email, when nothing above says
           anything: two labels on a shop's receipts don't beat what everyone's newsletters get,
           but a courier you said to mark read is still marked read when one reads as a receipt."""
        kind = family(email_type)
        # Without a kind, everything you said about the sender is about "this kind".
        own = [("sender", sender, kind), ("sender", sender, None)] if kind else [("sender", sender)]
        rules, tiers = [], [{} for _ in range(len(own) + 2)]  # own scopes, emails like it, then the sender's others
        for action in HABIT_ACTIONS:
            records = [self.records.get((*scope, action)) for scope in own]
            if any(r and (r.always_ask or r.declined) for r in records):
                continue  # you said no to this for the sender
            kind_rule = self.records.get(("kind", kind, action)) if kind else None
            for record in [*records, kind_rule]:
                if record and record.told and not record.always_ask:
                    rules.append((record.updated_at or EARLIEST, action))
            for tier, record in zip(tiers, records):
                weight = self._shown(record, action)
                if weight:
                    tier[action] = weight
            found = self._emails_like_it(action, A, sender, kind)
            if found and found.level in (S, N):
                tiers[-2][action] = found.evidence + (10 if found.confidence == 1.0 else 0)
            if kind:
                anything = self.records.get(("sender", sender, action))
                weight = self._shown(anything, action) + (10 if anything and anything.told else 0)
                if weight and not (anything.always_ask or anything.declined):
                    tiers[-1][action] = weight
        if rules:
            return max(rules, key=lambda rule: rule[0])[1]
        for tier in tiers:
            if tier:
                return max(tier, key=tier.get)
        return None

    def _shown(self, record: Record | None, action: Action) -> float:
        """How clearly one record of yours says to do this action: approved twice, or enough answers
        that he could do it on his own. 0 if it doesn't."""
        if record is None:
            return 0.0
        found = self._sender_evidence(record, action, A)
        if found and found.level in (S, N):
            return max(found.evidence, record.approved)
        return record.approved if record.approved >= 2 else 0.0

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
                "yes": record.approved + record.positive,
                "no": record.declined + record.negative,
                "approved": record.approved,
                "mean": round(record.acting_share, 2),
                "always_ask": record.always_ask,
                "told": record.told,
                "level": suggestion.level if suggestion else None,
                "reason": suggestion.reason if suggestion else "not enough feedback yet",
                "evidence": record.evidence,
                "confidence": round(record.confidence, 3),
                "desired": record.desired,
                "provenance": record.provenance,
                "updated_at": record.updated_at,
            })
        return rows

    def broad_summary(self, include_learning: bool = False) -> list[dict]:
        """What carries across senders: per domain and per kind of email, and your rules for kinds.
        include_learning also gives the ones with answers that don't add up to anything yet
        (level None), so the app can say what he's still learning."""
        rows = []
        for scope, record in self.records.items():
            if scope[0] not in ("domain", "kind"):
                continue
            found = self._judge(record, scope[-1], autonomy_for(scope[-1])[0], broad=True)
            learning = not found and not record.always_ask
            if learning and not (include_learning and record.evidence > 0):
                continue
            rows.append({"scope": scope[0], "name": scope[1], "kind": scope[-2], "action": scope[-1],
                         "senders": len(record.senders), "evidence": record.evidence,
                         "confidence": round(record.confidence, 3), "desired": record.desired,
                         "rule": "ask" if record.always_ask else record.told,
                         "acting_share": round(record.acting_share, 3),
                         "level": found.level if found else A if record.always_ask else None,
                         "reason": found.reason if found else "",
                         "updated_at": record.updated_at})
        return rows
