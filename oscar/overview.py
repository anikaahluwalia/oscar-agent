"""Summaries for the web app: Oscar's brief and how much he does for each sender."""

from oscar.classifier import TYPES
from oscar.feedback import FeedbackKind
from oscar.history import History
from oscar.models import Action, AutonomyLevel, Decision
from oscar.policy import autonomy_for
from oscar.preferences import CEILINGS, Preferences
from oscar.review import half_answered, teaching
from oscar.safety import ACTION_FLOORS, apply_floor

ANSWERS = {FeedbackKind.APPROVE, FeedbackKind.REJECT, FeedbackKind.UNDO, FeedbackKind.EDIT_THEN_SEND, FeedbackKind.SEEN}
TREND_WINDOW = 12  # compare the first and the latest this many decisions


def is_read_only(history: History) -> bool:
    """True for the real inbox while Oscar only reads it (acting is off), so nothing was done."""
    return not history.settings.get("acting") and any(d.source == "gmail" for d in history.decisions.values())


def done_in_gmail(history: History, d: Decision) -> bool:
    """Whether Oscar really did this in Gmail (and it wasn't undone). Emails read before acting was on never were."""
    record = history.action_for(d.id)
    return record is not None and record.undone_at is None


def latest_per_email(history: History) -> list[Decision]:
    """Oscar's latest decision on each email, newest first."""
    seen, out = set(), []
    for d in sorted(history.decisions.values(), key=lambda d: d.created_at, reverse=True):
        if d.email_id not in seen:
            seen.add(d.email_id)
            out.append(d)
    return out


def needs_you(history: History) -> dict[AutonomyLevel, list[Decision]]:
    """What's still on your list, newest first: emails for you, asks you haven't answered,
    and things Oscar did and told you about that you haven't checked."""
    # On the real inbox, reviewing a decision is how you deal with it.
    answered = {e.decision_id for e in history.feedback if e.kind in ANSWERS} | {r.decision_id for r in history.reviews}
    levels = (AutonomyLevel.ESCALATE, AutonomyLevel.ASK_FIRST, AutonomyLevel.PROCEED_AND_NOTIFY)
    current = latest_per_email(history)
    # A re-read that decided the same as before keeps the review you gave the first read.
    answered |= {d.id for d in current if d.recheck_of and history.review_carried_over(d.id)}
    # Once Oscar acts, emails he only read before are calls to check on the Review page, not things waiting on you.
    if history.settings.get("acting"):
        current = [d for d in current if d.source != "gmail" or d.acting]
    return {level: [d for d in current if d.autonomy_level == level and d.id not in answered] for level in levels}


def ask_rate(decisions: list[Decision]) -> float:
    return sum(d.autonomy_level == AutonomyLevel.ASK_FIRST for d in decisions) / len(decisions)


def brief(history: History) -> dict:
    current = latest_per_email(history)
    count = lambda level: sum(d.autonomy_level == level for d in current)  # noqa: E731
    # Once Oscar acts, handled means he really did it; while he only reads, it's what he would have done.
    did = lambda level: sum(d.autonomy_level == level and (d.source != "gmail" or is_read_only(history)  # noqa: E731
                                                          or done_in_gmail(history, d)) for d in current)
    open_ = needs_you(history)
    waiting, for_you = len(open_[AutonomyLevel.ASK_FIRST]), len(open_[AutonomyLevel.ESCALATE])
    handled, told = did(AutonomyLevel.PROCEED_SILENTLY), did(AutonomyLevel.PROCEED_AND_NOTIFY)

    # Things Oscar did and told you about wait for a "looks good" or an undo, so they're on your list too.
    told_unchecked = len(open_[AutonomyLevel.PROCEED_AND_NOTIFY])

    done = [part for n, part in ((handled, f"handled {handled} quietly"), (told, f"told you about {told}")) if n]
    did = f"I {' and '.join(done)}." if done else ""
    needs = waiting + for_you + told_unchecked
    if is_read_only(history):
        # Nothing was done, so say what he'd have done, and leave out the trend and habits.
        would = [part for n, part in ((handled, f"handled {handled} quietly"), (told, f"told you about {told}"),
                                      (count(AutonomyLevel.ASK_FIRST), f"asked about {count(AutonomyLevel.ASK_FIRST)}"),
                                      (count(AutonomyLevel.ESCALATE), f"stopped {count(AutonomyLevel.ESCALATE)}")) if n]
        to_review = sum(history.review_carried_over(d.id) is None for d in current)
        to_finish = sum(half_answered(history, d) for d in current)
        left = f"{to_review} left to review" + (f", {to_finish} to finish" if to_finish else "")
        summary = (f"I read {len(current)} {'email' if len(current) == 1 else 'emails'}! I'd have {', '.join(would)}. "
                   f"{left}." if current else "I haven't read anything yet.")
        return {"handled": handled, "told": told, "waiting": waiting, "for_you": for_you,
                "summary": summary, "trend": None, "learned": None}
    if not current:
        summary = "Your inbox is empty! When emails come in, I'll sort them for you."
    elif needs == 0:
        summary = f"All done! {did} Nothing needs you.".replace("  ", " ")
    else:
        # What needs you comes first, and spelled out, so it doesn't run into the numbers before it.
        summary = f"{needs} {'email needs' if needs == 1 else 'emails need'} you. {did}".strip()

    # Is Oscar asking less than when you started? Only said once there's enough history.
    trend = None
    ordered = sorted(history.decisions.values(), key=lambda d: d.created_at)
    if len(ordered) >= 2 * TREND_WINDOW:
        then, now = ask_rate(ordered[:TREND_WINDOW]), ask_rate(ordered[-TREND_WINDOW:])
        if then > 0 and now == 0:
            trend = "I haven't needed to ask you anything lately!"
        elif then > 0 and now < then:
            trend = f"I'm asking you about {round((then - now) / then * 100)}% less than when we started!"

    habits = sum(1 for row in Preferences.from_feedback(teaching(history)).summary() if row["level"])
    learned = None
    if habits:
        learned = f"I've picked up {habits} of your habits so far!" if habits > 1 else "I've picked up one of your habits so far!"

    return {"handled": handled, "told": told, "waiting": waiting, "for_you": for_you,
            "summary": summary, "trend": trend, "learned": learned}


def autonomy(history: History) -> list[dict]:
    """For each sender and action Oscar has seen: the level he'd use now, and its limits.

    Emails escalated by a safety check are left out, because the escalation is
    about that email, not about the sender and action.
    """
    prefs = Preferences.from_feedback(teaching(history))
    latest: dict[tuple[str, Action], Decision] = {}
    for d in sorted(history.decisions.values(), key=lambda d: d.created_at):
        if d.level_source != "safety_check":
            latest[(d.sender, d.action)] = d

    rows = []
    for (sender, action), decision in latest.items():
        level, reason = autonomy_for(action)
        suggestion = prefs.suggest(action, level, sender, decision.email_type)
        if suggestion:
            level, reason = suggestion.level, suggestion.reason
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


def permissions(history: History) -> list[dict]:
    """What Oscar may do on his own with each kind of email, straight from the rules: the policy level,
    the floor learning can't go below, and the ceiling it can't go above. For the Settings page, so it
    never drifts from the code."""
    rows = []
    for action, email_type in TYPES.items():
        level, reason = autonomy_for(action)
        floor = ACTION_FLOORS.get(action)
        rows.append({
            "action": action,
            "email_type": email_type,
            "level": level,
            "reason": reason,
            "floor": floor[0] if floor else None,
            "ceiling": CEILINGS.get(action),
        })
    return rows
