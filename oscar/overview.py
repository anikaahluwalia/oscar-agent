"""Summaries for the web app: Oscar's brief and how much he does for each sender."""

from oscar.feedback import FeedbackKind
from oscar.history import History
from oscar.models import Action, AutonomyLevel, Decision
from oscar.policy import autonomy_for
from oscar.preferences import CEILINGS, Preferences
from oscar.safety import ACTION_FLOORS, apply_floor

ANSWERS = {FeedbackKind.APPROVE, FeedbackKind.REJECT, FeedbackKind.UNDO, FeedbackKind.EDIT_THEN_SEND}
TREND_WINDOW = 12  # compare the first and the latest this many decisions


def latest_per_email(history: History) -> list[Decision]:
    """Oscar's latest decision on each email, newest first."""
    seen, out = set(), []
    for d in sorted(history.decisions.values(), key=lambda d: d.created_at, reverse=True):
        if d.email_id not in seen:
            seen.add(d.email_id)
            out.append(d)
    return out


def ask_rate(decisions: list[Decision]) -> float:
    return sum(d.autonomy_level == AutonomyLevel.ASK_FIRST for d in decisions) / len(decisions)


def brief(history: History) -> dict:
    current = latest_per_email(history)
    answered = {e.decision_id for e in history.feedback if e.kind in ANSWERS}
    count = lambda level: sum(d.autonomy_level == level for d in current)  # noqa: E731
    waiting = sum(d.autonomy_level == AutonomyLevel.ASK_FIRST and d.id not in answered for d in current)
    for_you = count(AutonomyLevel.ESCALATE)
    handled, told = count(AutonomyLevel.PROCEED_SILENTLY), count(AutonomyLevel.PROCEED_AND_NOTIFY)

    done = [part for n, part in ((handled, f"handled {handled} quietly"), (told, f"told you about {told}")) if n]
    did = f"I {' and '.join(done)}." if done else ""
    needs = waiting + for_you
    if not current:
        summary = "Your inbox is empty. When emails come in I'll sort them for you."
    elif needs == 0:
        summary = f"All done. {did} Nothing needs you.".replace("  ", " ")
    else:
        # What needs you comes first, and spelled out, so it doesn't run into the numbers before it.
        summary = f"{needs} {'email needs' if needs == 1 else 'emails need'} you. {did}".strip()

    # Is Oscar asking less than when you started? Only said once there's enough history.
    trend = None
    ordered = sorted(history.decisions.values(), key=lambda d: d.created_at)
    if len(ordered) >= 2 * TREND_WINDOW:
        then, now = ask_rate(ordered[:TREND_WINDOW]), ask_rate(ordered[-TREND_WINDOW:])
        if then > 0 and now == 0:
            trend = "I haven't needed to ask you anything lately."
        elif then > 0 and now < then:
            trend = f"I'm asking you about {round((then - now) / then * 100)}% less than when we started."

    habits = sum(1 for row in Preferences.from_feedback(history.feedback).summary() if row["level"])
    learned = None
    if habits:
        learned = f"I've picked up {habits} of your habits so far." if habits > 1 else "I've picked up one of your habits so far."

    return {"handled": handled, "told": told, "waiting": waiting, "for_you": for_you,
            "summary": summary, "trend": trend, "learned": learned}


def autonomy(history: History) -> list[dict]:
    """For each sender and action Oscar has seen: the level he'd use now, and its limits.

    Emails escalated by a safety check are left out, because the escalation is
    about that email, not about the sender and action.
    """
    prefs = Preferences.from_feedback(history.feedback)
    latest: dict[tuple[str, Action], Decision] = {}
    for d in sorted(history.decisions.values(), key=lambda d: d.created_at):
        if d.level_source != "safety_check":
            latest[(d.sender, d.action)] = d

    rows = []
    for (sender, action), decision in latest.items():
        level, reason = autonomy_for(action)
        suggestion = prefs.suggest(action, level, sender)
        if suggestion:
            level, reason = suggestion
        level, reason = apply_floor(action, level, reason)
        floor = ACTION_FLOORS.get(action)
        rows.append({
            "sender": sender,
            "action": action,
            "level": level,
            "reason": reason,
            "floor": floor[0] if floor else None,
            "floor_reason": floor[1] if floor else None,
            "ceiling": CEILINGS.get(action),
            "decision_id": decision.id,
        })
    return sorted(rows, key=lambda r: (r["sender"], r["action"].value))
