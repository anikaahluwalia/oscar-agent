"""Summaries for the web app: Oscar's brief and how much he does for each sender."""

from oscar.classifier import TYPES
from oscar.feedback import FeedbackKind
from oscar.history import History
from oscar.models import Action, AutonomyLevel, Decision
from oscar.policy import autonomy_for
from oscar.preferences import CEILINGS, HABIT_ACTIONS, Preferences, family
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
    answered |= {r.decision_id for r in history.safety_reviews}  # you looked at what a safety rule stopped
    levels = (AutonomyLevel.ESCALATE, AutonomyLevel.ASK_FIRST, AutonomyLevel.PROCEED_AND_NOTIFY)
    current = latest_per_email(history)
    # A re-read that decided the same as before keeps the review you gave the first read.
    answered |= {d.id for d in current if d.recheck_of and history.review_carried_over(d.id)}
    # Once Oscar acts, emails he only read before are calls to check on the Review page, not things waiting on you.
    if history.settings.get("acting"):
        current = [d for d in current if d.source != "gmail" or d.acting]
    return {level: [d for d in current if d.autonomy_level == level and d.id not in answered] for level in levels}


# Asks a rule never clears for you: a safety check, the caution backstop or a floor put them on
# your list, or he couldn't tell what the email was. Those you answer one at a time.
NOT_BY_RULE = {"safety_check", "model_check", "caution", "floor", "guess"}


def waiting_for_rule(history: History, decision: Decision, scope: str = "sender") -> list[Decision]:
    """The asks still waiting on you that a yes to a rule on this decision would do for you: same
    action, from this sender (or, for a rule about emails like this, every email of its kind). Only
    the easy-to-undo actions, and never an ask a safety rule, caution or a guess made."""
    if decision.action not in HABIT_ACTIONS:
        return []
    kind = family(decision.email_type)
    covers = (lambda d: family(d.email_type) == kind) if scope == "kind" else (lambda d: d.sender == decision.sender)
    return [d for d in needs_you(history)[AutonomyLevel.ASK_FIRST]
            if d.action == decision.action and covers(d) and d.level_source not in NOT_BY_RULE and not d.caution]


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
    events = teaching(history)
    prefs = Preferences.from_feedback(events)
    learned = {(r["kind"], r["action"]): r for r in prefs.broad_summary() if r["scope"] == "kind"}
    rules = _rule_decisions(events)  # so a rule can be removed (Forget)
    rows = []
    for action, email_type in TYPES.items():
        level, reason = autonomy_for(action)
        floor = ACTION_FLOORS.get(action)
        key = (family(email_type), action)
        found = learned.get(key)
        rows.append({
            "action": action,
            "email_type": email_type,
            "level": level,
            "reason": reason,
            "floor": floor[0] if floor else None,
            "ceiling": CEILINGS.get(action),
            # What your answers (or your rule) say for a new sender of this kind. The safety rules
            # still run after it on every email.
            "learned": {"level": apply_floor(action, found["level"], "")[0], "reason": found["reason"],
                        "senders": found["senders"], "rule": key in rules, "decision_id": rules.get(key),
                        "updated_at": found["updated_at"]} if found else None,
        })
    return rows


def _rule_decisions(events: list) -> dict[tuple, str]:
    """The email each standing "emails like this" rule was set on, so it can be changed or forgotten."""
    rules: dict[tuple, str] = {}
    for e in events:
        if e.scope == "kind" and e.kind in (FeedbackKind.ALWAYS_DO_THIS, FeedbackKind.ALWAYS_ASK_ME):
            rules[(family(e.email_type), e.action)] = e.decision_id
        elif e.scope == "kind" and e.kind == FeedbackKind.FORGET:
            rules.pop((family(e.email_type), e.action), None)
    return rules


def evidence_label(row: dict, prefs: Preferences) -> str:
    """How much a pattern rests on, in words rather than a number: "rule" when you set it,
    "strong" once well past what it took to start (twice the answers and twice the senders,
    with most of them agreeing), "moderate" once it's enough to act on, "learning" before that."""
    if row["rule"]:
        return "rule"
    if row["level"] is None:
        return "learning"
    p = prefs.policy
    need = p.domain_senders if row["scope"] == "domain" else p.kind_senders
    strong = (row["evidence"] >= 2 * p.broad_min_evidence and row["senders"] >= 2 * need
              and max(row["confidence"], row["acting_share"]) >= p.quiet_confidence)
    return "strong" if strong else "moderate"


def patterns(history: History) -> list[dict]:
    """What Oscar knows across senders, for What Oscar knows: your rules for a kind of email, and what
    your answers about many senders add up to (or don't yet). Each row says what it rests on, and
    names an email it can be changed on: the one the rule was set on, or the latest one like it."""
    events = teaching(history)
    prefs = Preferences.from_feedback(events)
    rules = _rule_decisions(events)
    # The newest email of each kind and action a rule could be set on (oscar/feedback.check_kind_rule).
    examples: dict[tuple, str] = {}
    for d in latest_per_email(history):
        key = (family(d.email_type), d.action)
        if (key[0] and d.action in HABIT_ACTIONS and d.autonomy_level != AutonomyLevel.ESCALATE
                and not d.safety_flags and key not in examples):
            examples[key] = d.id
    rows = []
    for row in prefs.broad_summary(include_learning=True):
        level = apply_floor(row["action"], row["level"], "")[0] if row["level"] else None
        key = (row["kind"], row["action"])
        rows.append({**row, "level": level, "status": evidence_label(row, prefs),
                     "decision_id": rules.get(key) if row["scope"] == "kind" and row["rule"] else None,
                     "example_id": examples.get(key)})
    order = {"rule": 0, "strong": 1, "moderate": 2, "learning": 3}
    return sorted(rows, key=lambda r: (order[r["status"]], -r["evidence"]))
