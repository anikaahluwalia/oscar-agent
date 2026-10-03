"""Oscar's Progress: how well his calls matched what you wanted, worked out from your own answers only.

A decision counts once you've said what you wanted for it, in one of these ways (the first one
found wins):

1. A full Review answer, graded exactly like the evals (oscar/review.py).
2. A safety review on an email a safety rule stopped: "yes, it was risky" matched, "it was
   misclassified" means he stopped something he didn't need to.
3. Feedback on the decision itself: an undo or "keep asking" says he should have asked, "just
   handle it" / "handle + tell me" say how much he should have asked, a decline says the action
   was wrong, and "looks good" on something he did and told you about says that was right.

Approving an ask says only that the action was right, never how much to ask, so on its own it
isn't graded here. Nothing is estimated or filled in: emails you haven't answered aren't counted.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta

from oscar.feedback import FeedbackKind
from oscar.grading import ACTED, CRITICAL_COST, LEVELS, A, E, N, S, grade
from oscar.history import History
from oscar.models import AutonomyLevel, Decision
from oscar.preferences import HABIT_ACTIONS, family
from oscar.review import answer_for, grade_answer

WINDOW = 20  # how many graded decisions "recent" and "earlier" each look at
MIN_GRADED = 5  # fewer answers than this say too little for a percentage
DAYS = 14  # up to two weeks of email is shown per day, longer per week
WEEKS = 26  # the trend goes back at most this many points
WRONG_ACTION = "OTHER"  # a decline: whatever the right action was, it wasn't this one


def _expected_from_feedback(history: History, d: Decision) -> tuple[AutonomyLevel, object] | None:
    """What your feedback on this decision says was right: (level, action). The latest answer wins."""
    expected = None
    for e in sorted(history.feedback_for(d.id), key=lambda e: e.created_at):
        if e.blocked_by_floor:
            continue
        if e.kind == FeedbackKind.UNDO:
            expected = (A, d.action)
        elif e.kind == FeedbackKind.REJECT:
            expected = (A, WRONG_ACTION)
        elif e.kind in (FeedbackKind.KEEP_ASKING, FeedbackKind.ALWAYS_ASK_ME):
            expected = (A, d.action)
        elif e.kind in (FeedbackKind.JUST_HANDLE_IT, FeedbackKind.HANDLE_AND_TELL_ME, FeedbackKind.ALWAYS_DO_THIS):
            default = N if e.kind == FeedbackKind.HANDLE_AND_TELL_ME else S
            expected = (e.desired_level or default, d.action)
        elif e.kind in (FeedbackKind.APPROVE, FeedbackKind.EDIT_THEN_SEND) and d.autonomy_level in ACTED:
            expected = (d.autonomy_level, d.action)  # "looks good" on something he did
    return expected


def verdict(history: History, d: Decision) -> tuple[str, float] | None:
    """(what was wrong, cost) for one decision against what you said, or None if you didn't say."""
    found = answer_for(history, d)
    if found:
        return grade_answer(found[1], d.autonomy_level, d.action)
    if d.autonomy_level == E:
        review = history.safety_review_for(d.id)
        if review is None:
            return None
        return ("none", 0.0) if review.verdict == "RISK_CORRECT" else ("too_cautious", 1.0)
    expected = _expected_from_feedback(history, d)
    if expected is None:
        return None
    level, action = expected
    return grade(level, action, d.autonomy_level, d.action)


def graded(history: History) -> list[tuple[Decision, str, float]]:
    """Every decision you've answered, oldest first. Each email counts once: its first read, since
    a re-read was made knowing your answer."""
    first = [d for d in history.decisions.values() if not d.recheck_of]
    out = []
    for d in sorted(first, key=lambda d: d.created_at):
        v = verdict(history, d)
        if v:
            out.append((d, *v))
    return out


def _window(rows: list[tuple[Decision, str, float]]) -> dict:
    errors = Counter(e for _, e, _ in rows)
    asked = [r for r in rows if r[0].autonomy_level == A]
    acted = [r for r in rows if r[0].autonomy_level in ACTED]
    return {
        "n": len(rows),
        "from": rows[0][0].created_at.isoformat() if rows else None,
        "to": rows[-1][0].created_at.isoformat() if rows else None,
        "matched": errors["none"],
        "match_rate": errors["none"] / len(rows) if rows else None,
        # Acting on something you'd have wanted stopped: what the evals call a critical violation.
        "unsafe": sum(cost >= CRITICAL_COST for _, _, cost in rows),
        # Asked when you'd have had him just do it.
        "unnecessary_asks": sum(e == "too_cautious" for _, e, _ in asked),
        "asked": len(asked),
        # Did it when you'd have wanted to be asked (or for it to be stopped).
        "too_permissive": sum(e == "too_permissive" for _, e, _ in acted),
        "acted": len(acted),
    }


def _trend(history: History) -> dict:
    """How often he needed you, per day or per week: the share of emails he asked about or stopped,
    and the share he handled (or, while he only reads, would have)."""
    first = sorted((d for d in history.decisions.values() if not d.recheck_of), key=lambda d: d.created_at)
    if not first:
        return {"unit": None, "points": []}
    span = first[-1].created_at - first[0].created_at
    unit = "day" if span <= timedelta(days=DAYS) else "week"

    def bucket(t: datetime) -> str:
        day = t.date()
        return (day - timedelta(days=day.weekday())).isoformat() if unit == "week" else day.isoformat()

    groups: dict[str, list[Decision]] = {}
    for d in first:
        groups.setdefault(bucket(d.created_at), []).append(d)
    points = [{"start": start, "n": len(ds),
               "ask_rate": sum(d.autonomy_level == A for d in ds) / len(ds),
               "stopped_rate": sum(d.autonomy_level == E for d in ds) / len(ds),
               "handled_rate": sum(d.autonomy_level in ACTED for d in ds) / len(ds)}
              for start, ds in sorted(groups.items())]
    # What you taught him along the way, so a change in the line can be explained by something real.
    taught = [{"at": e.created_at.isoformat(), "kind": e.kind.value, "family": family(e.email_type),
               "action": e.action.value, "level": e.desired_level.value if e.desired_level else None}
              for e in sorted(history.feedback, key=lambda e: e.created_at)
              if e.scope == "kind" and e.kind in (FeedbackKind.ALWAYS_DO_THIS, FeedbackKind.ALWAYS_ASK_ME, FeedbackKind.FORGET)]
    return {"unit": unit, "points": points[-WEEKS:], "rules": taught}


def _learned_most(history: History) -> list[dict]:
    """For each kind of email and action he can learn: how much he involved you on the first email
    like it, and on the latest. Only where that changed. Emails a safety rule or check stopped are
    left out, since nothing you teach changes those."""
    by_kind: dict[tuple[str, str], list[Decision]] = {}
    for d in sorted(history.decisions.values(), key=lambda d: d.created_at):
        kind = family(d.email_type)
        if not kind or d.action not in HABIT_ACTIONS or d.autonomy_level == E or d.safety_flags or d.recheck_of:
            continue
        by_kind.setdefault((kind, d.action.value), []).append(d)
    rows = []
    for (kind, action), ds in by_kind.items():
        then, now_ = ds[0].autonomy_level, ds[-1].autonomy_level
        if len(ds) < 2 or then == now_:
            continue
        rows.append({"kind": kind, "action": action, "earlier": then.value, "now": now_.value, "emails": len(ds),
                     "since": ds[0].created_at.isoformat(), "latest": ds[-1].created_at.isoformat()})
    # Biggest move toward doing it for you first.
    return sorted(rows, key=lambda r: LEVELS.index(AutonomyLevel(r["now"])) - LEVELS.index(AutonomyLevel(r["earlier"])))


def progress(history: History) -> dict:
    """Everything the Progress page shows. "recent" and "earlier" are the latest and the first
    WINDOW decisions you answered; "earlier" is only there when the two don't overlap."""
    rows = graded(history)
    size = min(WINDOW, len(rows) // 2)
    enough = len(rows) >= MIN_GRADED
    compare = size >= MIN_GRADED
    recent = rows[-size:] if compare else rows
    return {
        "graded": len(rows),
        "enough": enough,
        "recent": _window(recent) if enough else None,
        "earlier": _window(rows[:size]) if compare else None,
        "all": _window(rows),
        "trend": _trend(history),
        "learned_most": _learned_most(history),
    }
